// supabase/functions/enrich-opportunity/index.ts
//
// Opportunity Intelligence for one SLED opportunity (signal x OIP).
//
//   1. Find the solicitation document   source doc_url if it is a PDF, else a
//                                       Tavily search preferring PDFs on the
//                                       agency's own site.
//   2. Read it                          Haiku reads the PDF directly and
//                                       extracts contacts, timeline, gates,
//                                       restricted period, award method and
//                                       criteria, commercials, tenant signals.
//                                       No document -> extract from search
//                                       results (aggregator listings) instead.
//   3. Fill gaps                        decision-maker search (query template
//                                       per sentinel), and after the award
//                                       date the winner lookup (NYC City
//                                       Record award by PIN, else web search).
//   4. Synthesize for the tenant        stage, angle, dated next steps,
//                                       compliance notes (restricted period).
//   5. Save                             opportunity_intel, with sources and a
//                                       next_refresh_at taken from the
//                                       opportunity's own timeline.
//
// Board-meeting mode (agenda / minutes signals from municipal boards):
//   There is no solicitation to find. The signal's own meeting text (stored
//   in signals-fulltext) is read for what the board discussed or decided,
//   the stage of any initiative, amounts, named officials and dated next
//   events. Web search is used only for corroborating context and
//   decision-makers. Stored in the same opportunity_intel shape, with
//   facts.mode = "board".
//
// Regulatory mode (PUC / DPU docket signals):
//   Starts from the verified docket facts in puc_docket_enrichment (summary,
//   proposal, key dates read from the notice / filing). Web search adds what
//   filings don't have: utility announcements, billing / customer-system
//   vendor news or RFPs tied to the program, and decision-makers at the
//   utility itself. Stored with facts.mode = "regulatory".
//
// Request body:
//   { signal_id, oip_id, cache_only?, force?, also_signal_ids? }
//   cache_only -> return the stored record (or {status:"none"}); never spends.
//   force      -> re-run even if the stored record is not due for refresh.
//   also_signal_ids -> other signal ids for the SAME notice (captured by more
//                      than one feed); the record is copied to them.
//
// v3 (2026-11-09) procurement path — guardrails after the WMCHealth/SeenThis
// review (wrong due date, reversed scope, invented compliance rules):
//   * Facts are extracted ONCE per notice, tenant-blind, into notice_facts and
//     shared by every OIP on the notice. No tenant profile and no listing due
//     date in the extraction prompt.
//   * Every fact carries a verbatim quote + page; code checks each quote
//     against the PDF text layer (unpdf). Unverified facts are never shown.
//   * The document outranks the listing; listing/document conflicts are kept.
//   * Stage is computed from every milestone (due, award, contract start,
//     tentative flags, award evidence). Restricted periods stay active until
//     their stated condition (e.g. award approval) is evidenced.
//   * Per-OIP synthesis must cite fact ids or mark a claim as inference; a
//     code validator drops uncited facts, unsupported dates/dollars, open-bid
//     wording after the due date, absence claims on partial coverage, and
//     staff contact during an active restricted period.
//   * Compliance is rendered by code from cited facts, never by the LLM.
// Board-meeting and regulatory modes are unchanged.
//
// Secrets: TAVILY_API_KEY, ANTHROPIC_API_KEY (+ SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY provided by Supabase).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAVILY_KEY    = Deno.env.get("TAVILY_API_KEY") ?? "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const MODEL         = "claude-haiku-4-5-20251001";
// Version of this function's enrichment logic, stamped on every row as
// opportunity_intel.intel_version. Bump it when a guard or prompt change makes
// older briefs untrustworthy; score_handler re-enriches rows below the
// sentinel's pull_config.enrichment_min_version (per OIP, metered, opt-in).
//   1 (implicit, rows written before 2026-10-28)
//   2  computed stage, tenant sales plays, incumbent lookup
//   3  shared tenant-blind notice_facts, quote verification, cited synthesis,
//      code-rendered compliance, milestone stage
const INTEL_VERSION = 3;
// notice_facts.facts_version: bump when the extraction schema changes.
const FACTS_VERSION = 3;
const CROL_URL      = "https://data.cityofnewyork.us/resource/tfbu-zbd2.json";
const MAX_PDF_BYTES = 12 * 1024 * 1024;
const NO_WINNER_RETRY_DAYS = 14;
// Recency guard: a document whose own dates are more than this many days
// older than the notice is an earlier procurement (agencies reuse titles like
// "Digital Marketing Services" every few years) or an archive — reject it.
const MAX_DOC_AGE_DAYS = 365;

// Contact-scraper / people-directory sites: never used as a source.
const BLOCKED_HOSTS = [
  "rocketreach.co", "zoominfo.com", "signalhire.com", "contactout.com",
  "apollo.io", "lusha.com", "leadiq.com", "seamless.ai", "spokeo.com",
];

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const clean = (s: unknown) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const blocked = (u: string) => BLOCKED_HOSTS.some(h => hostOf(u).endsWith(h));
const isPdfUrl = (u: string) => /\.pdf(\?|#|$)/i.test(u);

// NYC City Record lists agencies by short names that are too generic to
// search on ("City University" matched the University of Maine). Expand them
// to the full name + acronym used in the agencies' own documents.
const AGENCY_ALIASES: Record<string, string> = {
  "city university": "City University of New York (CUNY)",
  "economic development corporation": "NYC Economic Development Corporation (NYCEDC)",
  "nyc health + hospitals": "NYC Health + Hospitals (H+H)",
  "housing authority": "New York City Housing Authority (NYCHA)",
  "school construction authority": "NYC School Construction Authority (SCA)",
  "education": "NYC Department of Education (DOE)",
  "campaign finance board": "NYC Campaign Finance Board (CFB)",
  "parks and recreation": "NYC Department of Parks and Recreation (NYC Parks)",
  "transportation": "NYC Department of Transportation (NYC DOT)",
  "environmental protection": "NYC Department of Environmental Protection (DEP)",
  "design and construction": "NYC Department of Design and Construction (DDC)",
  "citywide administrative services": "NYC Department of Citywide Administrative Services (DCAS)",
  "health and mental hygiene": "NYC Department of Health and Mental Hygiene (DOHMH)",
  "small business services": "NYC Department of Small Business Services (SBS)",
};
const expandAgency = (a: string) => AGENCY_ALIASES[a.trim().toLowerCase()] ?? a;

// Distinctive words of the agency name, for relevance checks on search hits
// and PDF candidates. "Campaign Finance Board" -> ["campaign","finance","board"].
const STOP = new Set(["of","the","and","for","new","york","state","city","department","office","nys","nyc","authority","division","services"]);
function agencyTokens(agency: string): string[] {
  return agency.toLowerCase().replace(/[()]/g, " ").split(/[^a-z0-9]+/)
    .filter(w => w.length >= 4 && !STOP.has(w));
}
function mentionsAgency(text: string, tokens: string[], acronym: string): boolean {
  const t = text.toLowerCase();
  if (acronym && acronym.length >= 3 && new RegExp(`\\b${acronym.toLowerCase()}\\b`).test(t)) return true;
  if (!tokens.length) return true;
  const hits = tokens.filter(w => t.includes(w)).length;
  return hits >= Math.min(2, tokens.length);
}

// ── Tavily ────────────────────────────────────────────────────────────────
type Hit = { title: string; url: string; content: string; raw?: string };

async function tavily(query: string, opts: { raw?: boolean; max?: number } = {}): Promise<Hit[]> {
  if (!TAVILY_KEY) return [];
  try {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${TAVILY_KEY}` },
      body: JSON.stringify({
        query, search_depth: "basic", max_results: opts.max ?? 5,
        include_answer: false, include_raw_content: !!opts.raw,
      }),
    });
    if (!r.ok) { console.error("tavily", r.status, await r.text()); return []; }
    const d = await r.json();
    return (d.results ?? [])
      .map((x: Record<string, unknown>) => ({
        title: clean(x.title), url: String(x.url ?? ""),
        content: clean(x.content).slice(0, 1500),
        raw: x.raw_content ? String(x.raw_content).slice(0, 6000) : undefined,
      }))
      .filter((h: Hit) => h.url && !blocked(h.url));
  } catch (e) { console.error("tavily error", e); return []; }
}

// ── Claude ────────────────────────────────────────────────────────────────
async function claudeJSON(content: unknown[], maxTokens = 2000): Promise<Record<string, unknown> | null> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: maxTokens, temperature: 0,
      messages: [{ role: "user", content }],
    }),
  });
  if (!r.ok) { console.error("anthropic", r.status, await r.text()); return null; }
  const d = await r.json();
  const text = (d.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a === -1 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}

// ── Winner (post-award) ───────────────────────────────────────────────────
async function cityRecordAward(pin: string) {
  if (!pin) return null;
  try {
    const p = new URLSearchParams({ "$where": `pin = '${pin.replace(/'/g, "''")}'`, "$limit": "25" });
    const r = await fetch(`${CROL_URL}?${p}`);
    if (!r.ok) return null;
    const rows: Record<string, unknown>[] = await r.json();
    const award = rows.find(x => /award/i.test(String(x.type_of_notice_description ?? "")));
    if (!award) return null;
    const keep: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(award)) {
      if (v == null || v === "") continue;
      if (/vendor|amount|award|contract|start_date|end_date|request_id|pin|short_title|agency_name/i.test(k)) {
        keep[k] = typeof v === "string" ? clean(v) : v;
      }
    }
    return keep;
  } catch { return null; }
}

async function findWinner(agency: string, title: string, pin: string, year: string) {
  const award = await cityRecordAward(pin);
  if (award) return { method: "city_record_award", award, candidates: [], note: "Award notice published in the NYC City Record." };
  const queries = [`"${agency}" "${title}" awarded contract`, `${agency} ${title} agency selected ${year}`];
  const hits: Hit[] = [];
  const seen = new Set<string>();
  for (const q of queries) for (const h of await tavily(q)) if (!seen.has(h.url)) { seen.add(h.url); hits.push(h); }
  if (!hits.length) return { method: "none", award: null, candidates: [], note: "No web results." };
  const src = hits.slice(0, 10).map((h, i) => `[${i + 1}] ${h.title}\nURL: ${h.url}\n${h.content}`).join("\n\n");
  const out = await claudeJSON([{ type: "text", text:
`A public procurement has closed. Identify the vendor(s) that WON it, using ONLY these search results.
Agency: ${agency}\nTitle: ${title}\nSolicitation #: ${pin || "unknown"}
Name a vendor ONLY if a result explicitly says it was awarded/selected/contracted for THIS procurement. Do not guess.
confidence: high = directly stated; medium = strong but indirect; low = plausible with ambiguity. evidence: max 25 words.

${src}

Return ONLY JSON: {"candidates":[{"vendor":"","confidence":"high|medium|low","evidence":"","source_url":""}],"note":""}` }], 700);
  const urls = new Set(hits.map(h => h.url));
  const candidates = ((out?.candidates as Record<string, unknown>[]) ?? [])
    .filter(c => c && c.vendor && urls.has(String(c.source_url ?? "")));
  return { method: candidates.length ? "web_search" : "none", award: null, candidates, note: String(out?.note ?? "") };
}

// ── Helpers ───────────────────────────────────────────────────────────────
function toDate(s: unknown): Date | null {
  if (!s) return null;
  const d = new Date(String(s));
  return isNaN(d.getTime()) ? null : d;
}

function findEvent(timeline: { event?: string; date?: string }[], re: RegExp): Date | null {
  for (const t of timeline ?? []) if (re.test(String(t.event ?? ""))) { const d = toDate(t.date); if (d) return d; }
  return null;
}

function addDays(d: Date, n: number) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }

// ── Sales plays (tenant-configured) ───────────────────────────────────────
// Stage computed by rule from the source record, BEFORE the model sees it.
// The model may not override it: a closed RFP never gets a pre-award play,
// and a sole-source / proprietary buy never gets a "help bidders" play.
//   locked   sole source, proprietary, exempt, noncompetitive, emergency
//   closed   authoritative due date has passed
//   closing  due within CLOSING_WINDOW_DAYS
//   open     due later than that
//   unknown  no due date on the record
const CLOSING_WINDOW_DAYS = 7;
const LOCKED_RE = /sole[\s-]?source|single[\s-]?source|proprietary|exempt from (?:advertis|compet)|non-?competitive|emergency (?:purchase|procurement)/i;

type ComputedStage = { code: "locked" | "closed" | "closing" | "open" | "unknown"; days_to_due: number | null; basis: string };

function computeStage(meta: Record<string, unknown>, title: string, due: Date | null, now: Date): ComputedStage {
  const lockText = [meta.selection_method_description, meta.ad_type, meta.notice_type,
                    meta.type_of_notice_description, title].map(v => String(v ?? "")).join(" | ");
  const days = due ? Math.ceil((due.getTime() - now.getTime()) / 86400000) : null;
  const m = lockText.match(LOCKED_RE);
  if (m) return { code: "locked", days_to_due: days, basis: `source record says "${m[0]}"` };
  if (days === null) return { code: "unknown", days_to_due: null, basis: "no due date on the source record" };
  if (days < 0) return { code: "closed", days_to_due: days, basis: `due date passed ${-days} day(s) ago` };
  if (days <= CLOSING_WINDOW_DAYS) return { code: "closing", days_to_due: days, basis: `due in ${days} day(s)` };
  return { code: "open", days_to_due: days, basis: `due in ${days} day(s)` };
}

type SalesPlay = { name: string; definition: string; stages: string[] };

// pull_config.sales_plays: [{name, definition, stages:[locked|closed|closing|open|unknown]}]
function salesPlaysFor(pc: Record<string, unknown>): SalesPlay[] {
  const raw = Array.isArray(pc.sales_plays) ? pc.sales_plays as Record<string, unknown>[] : [];
  return raw.filter(p => p && p.name && p.definition).map(p => ({
    name: String(p.name), definition: String(p.definition),
    stages: Array.isArray(p.stages) ? (p.stages as unknown[]).map(String) : [],
  }));
}

// Incumbent: who held this agency's PREVIOUS contract for the same services.
// For open opportunities it is the strongest lead among likely bidders.
async function findIncumbent(agency: string, title: string, year: number) {
  const queries = [
    `"${agency}" "${title}" contract awarded ${year - 1} OR ${year - 2} OR ${year - 3}`,
    `${agency} ${title} agency of record OR incumbent vendor`,
  ];
  const hits: Hit[] = [];
  const seen = new Set<string>();
  for (const q of queries) for (const h of await tavily(q, { max: 5 })) if (!seen.has(h.url)) { seen.add(h.url); hits.push(h); }
  if (!hits.length) return { vendor: "", confidence: "", evidence: "", source_url: "", queries };
  const src = hits.slice(0, 8).map((h, i) => `[${i + 1}] ${h.title}\nURL: ${h.url}\n${h.content}`).join("\n\n");
  const out = await claudeJSON([{ type: "text", text:
`Identify the vendor that held ${agency}'s PREVIOUS contract for the same services as: ${title}.
Use ONLY these search results. Name a vendor ONLY if a result explicitly says it was awarded, selected, or
is the agency of record for ${agency} for these services. A different agency's vendor does not count. Do not guess.
evidence: max 25 words.

${src}

Return ONLY JSON: {"vendor":"","confidence":"high|medium|low","evidence":"","source_url":""}` }], 400);
  const urls = new Set(hits.map(h => h.url));
  const ok = out && out.vendor && urls.has(String(out.source_url ?? ""));
  return {
    vendor: ok ? String(out!.vendor) : "", confidence: ok ? String(out!.confidence ?? "") : "",
    evidence: ok ? String(out!.evidence ?? "") : "", source_url: ok ? String(out!.source_url) : "", queries,
  };
}


// ── v3 extraction: tenant-blind, every field carries a verbatim quote ──────
// The model reads the document with NO tenant profile and NO listing due date
// (both biased v2: the tenant pulled scope toward what the tenant sells, and
// the listing's "due" primed the timeline). Quotes are checked in code
// against the document's own text layer before anything is rendered.
const EXTRACT_SPEC_V3 = `Return ONLY JSON, no preamble. Every field object has "quote" (copied VERBATIM from the document, max 40 words, no paraphrase, no added words) and "page" (1-based page number where the quote appears).
{
 "same_procurement": {"match": false, "reason": ""},
 "identity": {"issuing_agency": {"value":"","quote":"","page":0}, "buyer": {"value":"","quote":"","page":0}, "solicitation_number": {"value":"","quote":"","page":0}, "title": {"value":"","quote":"","page":0}},
 "dates": [{"event_type":"issued|intent_due|questions_due|answers_issued|proposal_due|finalists_notified|presentations|award|contract_start|other","label":"","date":"YYYY-MM-DD","time":"","tentative":false,"quote":"","page":0}],
 "dates_tentative": {"value": false, "quote":"", "page":0},
 "scope_included": [{"value":"","quote":"","page":0}],
 "scope_excluded": [{"value":"","quote":"","page":0}],
 "buyer_role": {"direct": [{"value":"","quote":"","page":0}], "via_partners": [{"value":"","quote":"","page":0}]},
 "contract": {"term": {"value":"","quote":"","page":0}, "renewals": {"value":"","quote":"","page":0}, "value": {"value":"","quote":"","page":0}, "pricing": {"value":"","quote":"","page":0}},
 "gates": [{"value":"","quote":"","page":0}],
 "submission_requirements": [{"value":"","quote":"","page":0}],
 "insurance": [{"value":"","quote":"","page":0}],
 "restricted_period": {"applies": false, "end_event": "", "end_date": "", "condition": "", "designated_contacts": [""], "quote":"", "page":0},
 "contacts": [{"name":"","title":"","organization":"","email":"","phone":"","role":"designated|administrative|subject_matter|consultant|listed","quote":"","page":0}],
 "criteria": [{"value":"","quote":"","page":0}],
 "award_method": {"value":"","quote":"","page":0},
 "summary": ""
}
Rules:
FIRST decide same_procurement: match=true ONLY if the document is about THIS procurement — same issuing agency (or its parent) AND the same scope/title or solicitation number. If match=false, leave every other field empty.
Use only what the document states. If something is not in the document, leave the field empty ("" / [] / null) — never guess, never infer, never fill from general knowledge.
quote: exact characters from the document so it can be found by text search. Never combine sentences. Never quote a sentence that does not exist.
dates: EVERY dated event in the schedule, each with its own event_type. "proposal_due" is ONLY the deadline for submitting proposals/bids/responses — never the finalist notice, award or ad end. tentative=true if the document calls that date tentative/estimated/subject to change.
dates_tentative: true if the document says the schedule as a whole is tentative or may change.
scope_included: what the selected vendor will do. scope_excluded: work the document says is performed by OTHERS (other agencies, partner firms, in-house staff), or explicitly not part of this contract. Capture those statements carefully.
buyer_role.direct: categories this buyer purchases under THIS contract. via_partners: categories the document says the buyer purchases through other partners/agencies.
contract: term (base period), renewals/options, value (dollar amount or budget), pricing structure — only as stated.
gates: requirements to participate (letter of intent, NDA, mandatory meeting, registration, eligibility).
submission_requirements: every distinct item the proposal must contain or include (forms, statements, references, financials, fee proposal, staffing, case studies, certifications). One entry per item, no duplicates, max 30.
insurance: each required coverage with its limit, max 12.
restricted_period: lobbying / restricted-communication rules (e.g. NY State Finance Law 139-j/139-k). end_event: what ends it, in the document's words (e.g. "tentative award and approval of contract"). end_date: ONLY if the document gives a specific end date for the restriction itself; otherwise "". condition: the full ending condition. designated_contacts: the named persons vendors may contact.
contacts: only people/offices named as contacts for THIS procurement. Max 8.
criteria: evaluation criteria, max 12.
summary: 2 plain sentences on what is being bought.`;

type LLMOut = { json: Record<string, unknown> | null; truncated: boolean };

async function claudeJSONx(content: unknown[], maxTokens: number): Promise<LLMOut> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: maxTokens, temperature: 0,
      messages: [{ role: "user", content }],
    }),
  });
  if (!r.ok) { console.error("anthropic", r.status, await r.text()); return { json: null, truncated: false }; }
  const d = await r.json();
  const truncated = d.stop_reason === "max_tokens";
  const text = (d.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a === -1 || b <= a) return { json: null, truncated };
  try { return { json: JSON.parse(text.slice(a, b + 1)), truncated }; } catch { return { json: null, truncated }; }
}

async function extractV3FromPdf(pdfB64: string, identity: string): Promise<LLMOut> {
  return await claudeJSONx([
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfB64 } },
    { type: "text", text: `This document is believed to be the solicitation for: ${identity}\n\n${EXTRACT_SPEC_V3}` },
  ], 8000);
}

async function extractV3FromText(material: string, identity: string): Promise<LLMOut> {
  return await claudeJSONx([
    { type: "text", text: `Web search results about this procurement: ${identity}\nTreat the text between the markers as the "document"; page = the [n] result number.\n<<<\n${material}\n>>>\n\n${EXTRACT_SPEC_V3}` },
  ], 6000);
}

// ── Text layer + quote verification (no LLM) ─────────────────────────────
type TextLayer = { pages: string[]; status: "ok" | "scanned" | "none" };

async function pdfTextLayer(buf: Uint8Array): Promise<TextLayer> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = (Array.isArray(text) ? text : [String(text ?? "")]).map(t => String(t ?? ""));
    const chars = pages.reduce((n, p) => n + p.replace(/\s/g, "").length, 0);
    return { pages, status: pages.length && chars / pages.length >= 100 ? "ok" : "scanned" };
  } catch (e) {
    console.error("pdf text layer failed", e);
    return { pages: [], status: "none" };
  }
}

const normText = (s: string) => s.toLowerCase()
  .replace(/[\u2018\u2019\u201a\u201b]/g, "'").replace(/[\u201c\u201d\u201e]/g, '"')
  .replace(/[\u2013\u2014]/g, "-").replace(/-\s+/g, "-")
  .replace(/[^a-z0-9$%.,'"\-\s]/g, " ").replace(/\s+/g, " ").trim();

// A quote passes when every ellipsis-separated segment of 3+ words occurs, in
// order, on the cited page (or anywhere when the page is missing/out of range).
function quoteFound(quote: string, page: number, layer: TextLayer, normPages: string[]): boolean {
  const q = String(quote ?? "").trim();
  if (q.split(/\s+/).length < 3) return false;
  const segs = q.split(/\.{3}|\u2026/).map(normText).filter(s => s.split(" ").length >= 3);
  if (!segs.length) return false;
  const pool = page >= 1 && page <= normPages.length
    ? [normPages[page - 1], (normPages[page - 2] ?? "") + " " + normPages[page - 1] + " " + (normPages[page] ?? "")]
    : [normPages.join(" ")];
  return pool.some(hay => {
    let at = 0;
    for (const s of segs) { const i = hay.indexOf(s, at); if (i === -1) return false; at = i + s.length; }
    return true;
  });
}

// Walks the extracted facts and stamps every quoted node with verified:
//   true   quote found in the text layer
//   false  quote missing or not found -> kept for audit, never rendered
//   null   no usable text layer (scanned) -> unverifiable, rendered labeled
function verifyFacts(facts: Record<string, unknown>, layer: TextLayer): { checked: number; passed: number } {
  const normPages = layer.pages.map(normText);
  let checked = 0, passed = 0;
  const visit = (node: unknown) => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    if ("quote" in o) {
      const hasValue = ["value", "date", "name", "applies"].some(k => {
        const v = o[k]; return v !== undefined && v !== null && v !== "" && v !== false && v !== 0;
      });
      if (hasValue) {
        if (layer.status !== "ok") o.verified = null;
        else { checked++; o.verified = quoteFound(String(o.quote ?? ""), Number(o.page) || 0, layer, normPages); if (o.verified) passed++; }
      } else o.verified = false;
    }
    for (const [k, v] of Object.entries(o)) if (k !== "quote") visit(v);
  };
  visit(facts);
  return { checked, passed };
}

const shown = (n: unknown) => !!n && typeof n === "object" && (n as Record<string, unknown>).verified !== false;
const valOf = (n: unknown) => n && typeof n === "object" ? String((n as Record<string, unknown>).value ?? "") : "";

function dedupeList(list: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const it of Array.isArray(list) ? list as Record<string, unknown>[] : []) {
    if (!it) continue;
    const key = normText(String(it.value ?? it.name ?? it.quote ?? "")).replace(/\b(the|a|an|and|of)\b/g, "").replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key); out.push(it);
  }
  return out;
}

const isoDay = (s: unknown) => { const d = toDate(s); return d ? d.toISOString().slice(0, 10) : ""; };

function factDate(facts: Record<string, unknown>, type: string): Date | null {
  for (const d of (facts.dates as Record<string, unknown>[]) ?? []) {
    if (d && d.event_type === type && shown(d)) { const t = toDate(d.date); if (t) return t; }
  }
  return null;
}

// ── v3 stage: from every milestone, by rule ───────────────────────────────
type StageV3 = { code: "locked" | "open" | "closing" | "proposals_in" | "award_pending" | "awarded" | "contract_live" | "unknown";
                 basis: string; days_to_due: number | null; computed_at: string };

function awardEvidence(winner: Record<string, unknown> | null): boolean {
  if (!winner) return false;
  if (winner.award) return true;
  return ((winner.candidates as Record<string, unknown>[]) ?? [])
    .some(c => c && (c.confidence === "high" || c.confidence === "medium"));
}

function computeStageV3(meta: Record<string, unknown>, title: string, facts: Record<string, unknown>,
                        due: Date | null, winner: Record<string, unknown> | null, now: Date): StageV3 {
  const at = now.toISOString();
  const lockText = [meta.selection_method_description, meta.ad_type, meta.notice_type,
                    meta.type_of_notice_description, title].map(v => String(v ?? "")).join(" | ");
  const days = due ? Math.ceil((due.getTime() - now.getTime()) / 86400000) : null;
  const m = lockText.match(LOCKED_RE);
  if (m) return { code: "locked", days_to_due: days, basis: `source record says "${m[0]}"`, computed_at: at };
  if (days === null) return { code: "unknown", days_to_due: null, basis: "no proposal due date in the document or listing", computed_at: at };
  if (days >= 0) return { code: days <= CLOSING_WINDOW_DAYS ? "closing" : "open", days_to_due: days, basis: `proposals due in ${days} day(s)`, computed_at: at };
  const award = factDate(facts, "award");
  const start = factDate(facts, "contract_start");
  const evidenced = awardEvidence(winner);
  if (evidenced && start && now >= start) return { code: "contract_live", days_to_due: days, basis: `award evidenced; contract start ${isoDay(start)} reached`, computed_at: at };
  if (evidenced) return { code: "awarded", days_to_due: days, basis: "award evidenced by an award notice or source naming the winner", computed_at: at };
  if (award && now >= award) return { code: "award_pending", days_to_due: days, basis: `tentative award date ${isoDay(award)} passed; no award notice found`, computed_at: at };
  return { code: "proposals_in", days_to_due: days, basis: `proposals were due ${-days} day(s) ago; award not yet due`, computed_at: at };
}

// Sales plays are configured against the v2 stage codes.
const playStageOf = (c: StageV3["code"]) =>
  c === "open" || c === "closing" || c === "locked" || c === "unknown" ? c : "closed";

// Legacy opportunity_intel.stage values the current UI understands.
const legacyStageOf = (c: StageV3["code"]) => ({
  locked: "closed", open: "open", closing: "open", proposals_in: "proposals_in",
  award_pending: "proposals_in", awarded: "awarded", contract_live: "contract_live", unknown: "",
} as Record<string, string>)[c];

function restrictedStatus(facts: Record<string, unknown>, winner: Record<string, unknown> | null, now: Date) {
  const rp = (facts.restricted_period ?? {}) as Record<string, unknown>;
  if (!rp.applies || !shown(rp)) return { applies: false, active: false, basis: "" };
  const end = toDate(rp.end_date);
  const condition = String(rp.condition || rp.end_event || "").replace(/^\s*until\s+/i, "");
  const needsApproval = /approv/i.test(condition);
  const evidenced = awardEvidence(winner);
  let active = true, basis = "no end date stated; treated as active";
  if (end && now > end && (!needsApproval || evidenced)) { active = false; basis = `ended ${isoDay(end)}`; }
  else if (end && now > end && needsApproval) basis = `stated date ${isoDay(end)} passed but the period runs until "${condition}", which is not yet confirmed`;
  else if (!end && needsApproval && evidenced) { active = false; basis = "award evidenced; confirm contract approval before contacting staff"; }
  else if (end) basis = `active until ${isoDay(end)}`;
  return { applies: true, active, basis, condition,
           designated: ((rp.designated_contacts as unknown[]) ?? []).map(String).filter(Boolean) };
}

// Compliance is rendered by code from cited facts — never written by the LLM.
function renderCompliance(facts: Record<string, unknown>, stage: StageV3, rs: ReturnType<typeof restrictedStatus>): string[] {
  const out: string[] = [];
  const rp = (facts.restricted_period ?? {}) as Record<string, unknown>;
  if (stage.code === "locked") out.push(`Not a competitive opportunity: ${stage.basis}.`);
  if (rs.applies) {
    const cite = rp.page ? ` (solicitation p.${rp.page})` : "";
    const who = rs.designated && rs.designated.length ? ` Designated contacts: ${rs.designated.join(", ")}.` : "";
    out.push(rs.active
      ? `Restricted communication period in effect — ${rs.basis}. It runs until: ${rs.condition || "the end stated in the solicitation"}${cite}. Contact only the designated contacts about this procurement.${who}`
      : `Restricted communication period: ${rs.basis}${cite}.`);
  }
  if (stage.code === "open" || stage.code === "closing") {
    for (const g of dedupeList(facts.gates).filter(shown).slice(0, 6)) out.push(`Participation requirement: ${valOf(g)}${g.page ? ` (p.${g.page})` : ""}.`);
  }
  return out;
}

// ── v3 per-OIP synthesis: claims must cite verified facts ─────────────────
type FactRef = { id: string; text: string; quote?: string };

function factCatalog(facts: Record<string, unknown>, decision_makers: Record<string, unknown>[],
                     winner: Record<string, unknown> | null, incumbent: Record<string, unknown> | null): FactRef[] {
  const out: FactRef[] = [];
  const add = (id: string, text: string, node?: Record<string, unknown>) => {
    if (!text.trim()) return;
    const flag = node && node.verified === null ? " [unverified: scanned document]" : "";
    out.push({ id, text: text + flag, quote: node ? String(node.quote ?? "") : "" });
  };
  const idn = (facts.identity ?? {}) as Record<string, Record<string, unknown>>;
  for (const k of ["issuing_agency", "buyer", "solicitation_number", "title"]) if (shown(idn[k]) && valOf(idn[k])) add(`identity.${k}`, `${k.replace("_", " ")}: ${valOf(idn[k])}`, idn[k]);
  const seenType: Record<string, number> = {};
  for (const d of ((facts.dates as Record<string, unknown>[]) ?? []).filter(shown)) {
    const t = String(d.event_type || "other"); const n = seenType[t] = (seenType[t] ?? -1) + 1;
    add(`date.${t}${n ? `.${n}` : ""}`, `${d.label || t.replace(/_/g, " ")}: ${d.date}${d.time ? ` ${d.time}` : ""}${d.tentative ? " (tentative)" : ""}`, d);
  }
  if (shown(facts.dates_tentative) && (facts.dates_tentative as Record<string, unknown>).value) add("dates_tentative", "the solicitation says its schedule is tentative / subject to change", facts.dates_tentative as Record<string, unknown>);
  const lists: [string, unknown][] = [["scope_included", facts.scope_included], ["scope_excluded", facts.scope_excluded],
    ["buyer_role.direct", (facts.buyer_role as Record<string, unknown>)?.direct], ["buyer_role.via_partners", (facts.buyer_role as Record<string, unknown>)?.via_partners],
    ["gates", facts.gates], ["submission_requirements", facts.submission_requirements], ["insurance", facts.insurance], ["criteria", facts.criteria]];
  const label: Record<string, string> = { scope_included: "in scope", scope_excluded: "performed by others / excluded",
    "buyer_role.direct": "buyer purchases directly under this contract", "buyer_role.via_partners": "buyer obtains through partner agencies",
    gates: "participation requirement", submission_requirements: "proposal must include", insurance: "insurance required", criteria: "evaluation criterion" };
  for (const [key, list] of lists) dedupeList(list).filter(shown).forEach((it, i) => add(`${key}.${i}`, `${label[key]}: ${valOf(it)}`, it));
  const c = (facts.contract ?? {}) as Record<string, Record<string, unknown>>;
  for (const k of ["term", "renewals", "value", "pricing"]) if (shown(c[k]) && valOf(c[k])) add(`contract.${k}`, `contract ${k}: ${valOf(c[k])}`, c[k]);
  if (shown(facts.award_method) && valOf(facts.award_method)) add("award_method", `award method: ${valOf(facts.award_method)}`, facts.award_method as Record<string, unknown>);
  const rp = (facts.restricted_period ?? {}) as Record<string, unknown>;
  if (rp.applies && shown(rp)) add("restricted_period", `restricted communication period: ends on "${rp.condition || rp.end_event || "not stated"}"${rp.end_date ? `, stated date ${rp.end_date}` : ""}; designated contacts: ${((rp.designated_contacts as unknown[]) ?? []).join(", ") || "none named"}`, rp);
  ((facts.contacts as Record<string, unknown>[]) ?? []).filter(shown).forEach((p, i) => add(`contact.${i}`, `procurement contact: ${p.name}${p.title ? `, ${p.title}` : ""} (${p.role || "listed"})`, p));
  decision_makers.forEach((p, i) => add(`dm.${i}`, `decision-maker (web, ${hostOf(String(p.source_url ?? ""))}): ${p.name}${p.title ? `, ${p.title}` : ""}`));
  if (winner && awardEvidence(winner)) add("winner", `winner: ${JSON.stringify(winner.award ?? winner.candidates).slice(0, 400)}`);
  if (incumbent && incumbent.vendor) add("incumbent", `previous contract holder (${incumbent.confidence}): ${incumbent.vendor}`);
  if (facts.summary) add("summary", `summary (narrative, not quoted): ${facts.summary}`);
  return out;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad2 = (n: number) => String(n).padStart(2, "0");

// Every date a claim mentions must be one of the facts' dates (or today).
function datesOk(text: string, allowedIso: Set<string>, allowedMd: Set<string>): boolean {
  for (const m of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) if (!allowedIso.has(m[0])) return false;
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g)) if (!allowedIso.has(`${m[3]}-${pad2(+m[1])}-${pad2(+m[2])}`)) return false;
  for (const m of text.matchAll(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?![a-z])\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/gi)) {
    const md = `${pad2(MONTHS[m[1].toLowerCase().slice(0, 3)])}-${pad2(+m[2])}`;
    if (m[3] ? !allowedIso.has(`${m[3]}-${md}`) : !allowedMd.has(md)) return false;
  }
  return true;
}

const ABSENCE_RE = /\b(no|not|never|without)\b[^.]{0,40}\b(stated|specified|provided|disclosed|listed|mentioned|given|included)\b|\bdoes not (state|specify|mention|include|list)\b/i;
const ACTIVE_RE  = /\bactively (procuring|evaluating|soliciting|seeking|accepting)\b|\bcurrently (accepting|open|soliciting)\b|\bstill open\b|\bsubmit (a|your) (proposal|bid|response)\b|\brespond to (the|this) (rfp|solicitation)\b/i;
const CONTACT_RE = /\b(contact|call|email|e-mail|reach out|meet|meeting|schedule|introduc|pitch|approach)\w*/i;

type Claim = Record<string, unknown>;
type ValidateCtx = {
  ids: Set<string>; catalog: FactRef[]; allowedIso: Set<string>; allowedMd: Set<string>; factText: string;
  stageCode: string; coverageComplete: boolean; rs: ReturnType<typeof restrictedStatus>;
  staffNames: string[]; tenantName: string; profileText: string; todayIso: string; dropped: { text: string; reason: string }[];
};

function fixTenantName(s: string, name: string): string {
  if (!name) return s;
  return s.replace(/\b(SLED|SAM|OIP)'s\b/g, `${name}'s`).replace(/\bthe tenant('s)?\b/gi, (_m, p) => `${name}${p ?? ""}`);
}

function violatesRestricted(text: string, flagged: boolean, ctx: ValidateCtx): boolean {
  if (!ctx.rs.active) return false;
  const t = text.toLowerCase();
  const namesStaff = ctx.staffNames.some(n => n && t.includes(n.toLowerCase()));
  const procurementStaff = /\b(procurement|purchasing|contracting) (staff|office|officer|team|department)\b/i.test(text);
  if (!(flagged || ((namesStaff || procurementStaff) && CONTACT_RE.test(text)))) return false;
  const designatedOnly = (ctx.rs.designated ?? []).some(n => n && t.includes(n.toLowerCase()));
  return !designatedOnly;
}

function validateClaim(c: Claim, ctx: ValidateCtx, kind: string): Claim | null {
  const drop = (reason: string) => { ctx.dropped.push({ text: String(c?.text ?? c?.action ?? "").slice(0, 200), reason: `${kind}: ${reason}` }); return null; };
  if (!c || typeof c !== "object") return null;
  const body = String(c.text ?? c.action ?? "").trim();
  if (!body) return null;
  const refs = ((c.refs as unknown[]) ?? []).map(String).filter(r => ctx.ids.has(r));
  const inference = c.inference === true && !refs.length;
  if (!refs.length && !inference) return drop("no valid fact reference and not marked inference");
  const all = [body, String(c.why ?? "")].join(" ");
  if (!datesOk(all, ctx.allowedIso, ctx.allowedMd)) return drop("mentions a date not in the facts");
  for (const m of all.matchAll(/\$\s?[\d,]+(?:\.\d+)?\s?(?:k|m|million|billion)?/gi)) {
    if (!ctx.factText.includes(normText(m[0]).replace(/\s/g, ""))) return drop(`dollar figure ${m[0]} not in the facts`);
  }
  if (!["open", "closing"].includes(ctx.stageCode) && ACTIVE_RE.test(all)) return drop(`open-bid wording at stage ${ctx.stageCode}`);
  if (ABSENCE_RE.test(all) && !ctx.coverageComplete) return drop("claims absence while document coverage is partial");
  if (ABSENCE_RE.test(all) && refs.some(r => ctx.catalog.find(f => f.id === r)?.text)) {
    // an absence claim may not cite a populated fact
    if (!/\b(other|partner|separately)\b/i.test(all)) return drop("absence claim cites a populated fact");
  }
  if (inference && /\b(case stud|client|portfolio|work (with|for)|brands? like)\w*/i.test(all)) {
    const m = all.match(/\b(?:such as|including|like|e\.g\.,?)\s+([^.;:]+)/i);
    if (m) {
      const names = m[1].split(/,|\band\b|\bor\b/).map(s => s.trim()).filter(s => /^[A-Z]/.test(s) && s.length >= 3);
      if (names.some(n => !ctx.profileText.includes(n.toLowerCase()))) return drop("names tenant assets not in the profile");
    }
  }
  const out: Claim = { ...c, refs, inference };
  if (c.text !== undefined) out.text = fixTenantName(String(c.text), ctx.tenantName);
  if (c.action !== undefined) out.action = fixTenantName(String(c.action), ctx.tenantName);
  if (c.why !== undefined) out.why = fixTenantName(String(c.why), ctx.tenantName);
  return out;
}

function validateStep(s: Claim, ctx: ValidateCtx): Claim | null {
  const when = String(s?.when ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(when) && when < ctx.todayIso) {
    ctx.dropped.push({ text: String(s.action ?? "").slice(0, 200), reason: `next_step: dated ${when}, before today` }); return null;
  }
  if (violatesRestricted(`${s?.action ?? ""} ${s?.why ?? ""}`, s?.contacts_agency_staff === true, ctx)) {
    ctx.dropped.push({ text: String(s.action ?? "").slice(0, 200), reason: "next_step: contacts agency staff during the restricted period" }); return null;
  }
  return validateClaim(s, ctx, "next_step");
}

// ── Board-meeting mode ────────────────────────────────────────────────────
const FULLTEXT_BUCKET = "signals-fulltext";
const BOARD_TEXT_LIMIT = 30000;

// deno-lint-ignore no-explicit-any
function isBoardSignal(sig: any): boolean {
  const dt = String(sig?.doc_type ?? "");
  return /agenda|minutes|board_agenda_item|council/i.test(dt);
}

// "Hull Municipal Light Board (Sub-Committee) 10/13/2026 *CANCELED*" -> "Hull Municipal Light Board"
function boardName(title: string, sourceName: string): string {
  const t = String(title || "").split(" — ")[0]
    .replace(/\*?canceled\*?/ig, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b.*$/, "")
    .replace(/\s+/g, " ").trim();
  return t.length > String(sourceName || "").length ? t : String(sourceName || t);
}

// deno-lint-ignore no-explicit-any
async function loadSignalText(sb: any, sig: any): Promise<string> {
  const path = String(sig?.full_text_storage_path ?? "");
  if (path) {
    try {
      const { data, error } = await sb.storage.from(FULLTEXT_BUCKET).download(path);
      if (!error && data) return (await data.text()).slice(0, BOARD_TEXT_LIMIT);
      console.error("fulltext download", path, error);
    } catch (e) { console.error("fulltext download failed", path, e); }
  }
  const vd = (sig?.vertical_data ?? {}) as Record<string, unknown>;
  return String(vd.full_text ?? "").slice(0, BOARD_TEXT_LIMIT);
}

const BOARD_SPEC = `Return ONLY JSON, no preamble:
{
 "meeting": {"type": "agenda|minutes", "date": "YYYY-MM-DD", "canceled": false},
 "relevant_items": [{"item": "", "discussion": "", "decision": "", "amount": "", "status": "discussion|planning|budgeted|procurement_authorized|procurement_open|awarded|implementation"}],
 "contacts": [{"name": "", "title": "", "organization": "", "email": "", "phone": "", "role": "listed"}],
 "timeline": [{"event": "", "date": "YYYY-MM-DD", "time": ""}],
 "tenant_signals": [{"quote": "", "why": ""}],
 "summary": ""
}
Rules: use ONLY what the meeting text states; leave fields empty rather than guessing.
relevant_items: agenda / minutes items that relate to the TENANT (e.g. rates, rate studies, billing or customer systems, metering / AMI, utility software, consultants, budgets for these). Max 6. "decision" only if the minutes record one (vote, approval, award, direction to staff).
contacts: officials and staff NAMED in the text (general manager, commissioners, consultants) with their stated titles.
timeline: dated events stated in the text — next meeting, effective dates, deadlines, scheduled presentations. Never compute dates.
tenant_signals: up to 5 short quotes (max 30 words) from the text that matter to the TENANT, with why.
summary: 2 sentences on what this meeting covered that is relevant to the TENANT; say plainly if nothing relevant was on it.`;

// Keep a step if any date in its "when" is today or later, or it has no date.
function futureSteps(steps: { when?: string }[], now: Date) {
  const today = now.toISOString().slice(0, 10);
  return steps.filter(s => {
    const ds = String(s?.when ?? "").match(/\d{4}-\d{2}-\d{2}/g);
    return !ds || ds.some(d => d >= today);
  });
}

// deno-lint-ignore no-explicit-any
async function enrichBoardSignal(ctx: any) {
  const { sb, sig, signal_id, oip_id, tenant, oipName, dmTemplate, cached } = ctx;
  const now = new Date();
  const board = boardName(String(sig.title ?? ""), String(sig.source_name ?? ""));
  const meetingDate = toDate(sig.meeting_date);
  const meetingStr = meetingDate ? meetingDate.toISOString().slice(0, 10) : "unknown date";
  const canceled = /canceled|cancelled/i.test(String(sig.title ?? ""));
  const docType = String(sig.doc_type ?? "agenda").toLowerCase().includes("minute") ? "minutes" : "agenda";
  const sources: { title: string; url: string; used_for: string }[] = [];
  const queries: string[] = [];

  // 1. The meeting's own text
  const text = await loadSignalText(sb, sig);
  let facts: Record<string, unknown> = {};
  if (text && !canceled) {
    facts = (await claudeJSON([{ type: "text", text:
      `Municipal board meeting ${docType}: ${board}, ${meetingStr}.\n\nMEETING TEXT:\n${text}\n\nTENANT: ${tenant}\n\n${BOARD_SPEC}` }], 2500)) ?? {};
  }
  facts.mode = "board";
  facts.meeting_type = docType;
  if (canceled) facts.summary = "This meeting was canceled.";
  const docUrl = String(sig.doc_url ?? "");
  const document = docUrl
    ? { url: docUrl, title: `${board} ${docType} (${meetingStr})`, source: hostOf(docUrl), kind: "meeting" }
    : null;
  if (document) sources.push({ title: document.title, url: docUrl, used_for: "meeting document" });

  // 1b. The same board's other captured meetings (e.g. the next agenda is
  // already posted) — so next steps point at real, current documents.
  let otherMeetings: { date: string; title: string; type: string }[] = [];
  try {
    const { data: sibs } = await sb.from("signals")
      .select("meeting_date, title, doc_type")
      .eq("source_name", sig.source_name)
      .neq("id", signal_id)
      .gte("meeting_date", addDays(meetingDate ?? now, -60).toISOString().slice(0, 10))
      .order("meeting_date", { ascending: true }).limit(12);
    otherMeetings = ((sibs ?? []) as { meeting_date?: string; title?: string; doc_type?: string }[])
      .filter(m => m.meeting_date)
      .map(m => ({ date: String(m.meeting_date).slice(0, 10), title: String(m.title ?? ""), type: String(m.doc_type ?? "") }));
  } catch (e) { console.error("sibling meetings lookup failed", e); }

  // 2. Web context (corroboration only) + decision-makers
  const items = (facts.relevant_items as { item?: string }[]) ?? [];
  const topic = items.map(i => String(i.item ?? "")).filter(Boolean).slice(0, 2).join(" ").slice(0, 120);
  let webContext: { title: string; url: string; snippet: string }[] = [];
  if (topic && !canceled) {
    const q = `"${board}" ${topic}`;
    queries.push(q);
    const toks = agencyTokens(board);
    const hits = (await tavily(q, { max: 5 })).filter(h => mentionsAgency(`${h.title} ${h.url} ${h.content}`, toks, ""));
    webContext = hits.slice(0, 4).map(h => ({ title: h.title, url: h.url, snippet: String(h.content ?? "").slice(0, 400) }));
    for (const h of hits.slice(0, 4)) sources.push({ title: h.title, url: h.url, used_for: "context" });
  }

  // Canceled meetings: nothing happened, so no web searches at all.
  const dmQuery = String(dmTemplate).replaceAll("{agency}", board);
  if (!canceled) queries.push(dmQuery);
  const dmHits = canceled ? [] : await tavily(dmQuery, { max: 5 });
  let decision_makers: unknown[] = [];
  if (dmHits.length) {
    const src = dmHits.map((h, i) => `[${i + 1}] ${h.title}\nURL: ${h.url}\n${h.content}`).join("\n\n");
    const out = await claudeJSON([{ type: "text", text:
`From these results, list people at ${board} (a municipal utility / public board) who would own or influence a purchase relevant to this tenant.
Use ONLY names and titles stated in the results. Note departures or new appointments if stated.
TENANT (for relevance): ${String(tenant).slice(0, 1200)}

${src}

Return ONLY JSON: {"people":[{"name":"","title":"","note":"","source_url":""}]}` }], 800);
    const urls = new Set(dmHits.map(h => h.url));
    decision_makers = ((out?.people as Record<string, unknown>[]) ?? [])
      .filter(p => p && p.name && urls.has(String(p.source_url ?? ""))).slice(0, 6);
    for (const h of dmHits) sources.push({ title: h.title, url: h.url, used_for: "decision_makers" });
  }

  // 3. Synthesize (board frame — no RFP / award assumptions)
  let synth: Record<string, unknown> | null = null;
  if (!canceled) {
    synth = await claudeJSON([{ type: "text", text:
`You advise ${oipName || "the tenant"} on a signal from a municipal board meeting. Today is ${now.toISOString().slice(0, 10)}.

TENANT PROFILE: ${tenant}

BOARD: ${board}
MEETING: ${docType} for ${meetingStr}${meetingDate && meetingDate > now ? " (upcoming)" : ""}
FACTS FROM THE MEETING TEXT: ${JSON.stringify(facts).slice(0, 9000)}
WEB CONTEXT (corroboration only; ignore anything not about this board): ${JSON.stringify(webContext)}
DECISION-MAKERS: ${JSON.stringify(decision_makers)}
OTHER MEETINGS OF THIS BOARD ALREADY ON FILE (agendas/minutes we hold): ${JSON.stringify(otherMeetings)}

This is a board meeting, NOT a procurement. The meeting date is when the board met (or will meet) — it is not a deadline, and a past meeting date does not make the signal stale. A municipal utility typically moves from discussion -> study/consultant -> budget -> procurement authorized -> RFP issued -> award -> implementation; place this signal on that path from what the text says.

Return ONLY JSON:
{
 "stage": "no_activity|discussion|planning|budgeted|procurement_authorized|procurement_open|awarded|implementation",
 "angle": "2-3 sentences: what the board is doing that matters to the tenant, citing the meeting's own words where possible; say plainly if nothing relevant was discussed",
 "next_steps": [{"when":"YYYY-MM-DD or a window","action":"","why":""}],
 "compliance": [""]
}
Rules: next_steps 2-5 items, concrete (e.g. review a later agenda that is already on file, request the minutes or the rate study, contact an official named in the text). Every "when" must be today or later — never schedule a step on a date that has passed; if a later meeting of this board is already on file, point to it by date instead of saying "monitor". Use dates only from the facts above. Label any estimate (e.g. time to procurement) as an estimate. compliance only for rules actually stated (e.g. an open procurement's communication restrictions); otherwise []. Do not invent names, dates, amounts, or procurements.` }], 1300);
  }

  const stage = canceled ? "no_activity" : String(synth?.stage ?? (Object.keys(facts).length > 2 ? "discussion" : "no_activity"));
  const timeline = (facts.timeline as { event?: string; date?: string }[]) ?? [];
  const future = [meetingDate, ...timeline.map(t => toDate(t.date))]
    .filter((d): d is Date => !!d && d > now).sort((a, b) => a.getTime() - b.getTime());
  // Upcoming agenda: refresh the day after the meeting (minutes / outcomes).
  const next_refresh_at = future.length ? addDays(future[0], 1).toISOString() : null;

  return {
    signal_id, oip_id,
    status: text ? "ok" : "partial",
    stage,
    document, facts, decision_makers, winner: null,
    angle: canceled ? "This meeting was canceled; nothing to act on." :
      String(synth?.angle ?? (text ? "" : "The meeting text was not available to review.")),
    next_steps: futureSteps((synth?.next_steps as { when?: string }[]) ?? [], now),
    compliance: ((synth?.compliance as unknown[]) ?? []).filter(c => String(c ?? "").trim()),
    sources, queries, error: null,
    enriched_at: now.toISOString(),
    next_refresh_at,
    refresh_count: (cached?.refresh_count ?? -1) + 1,
  };
}

// ── Regulatory mode ───────────────────────────────────────────────────────
const REG_DM_TEMPLATE = '"{agency}" director OR manager OR "vice president" "rate design" OR pricing OR billing OR "customer information system" OR "customer systems"';
// Brands that stand for every utility at once — no single company to research.
const COMMISSION_WIDE = /^all ma\b/i;

// deno-lint-ignore no-explicit-any
async function enrichRegulatorySignal(ctx: any) {
  const { sb, sig, signal_id, oip_id, tenant, oipName, dmTemplate, cached } = ctx;
  const now = new Date();
  const meta = (sig.metadata ?? {}) as Record<string, unknown>;
  const docketNo = String(meta.proceeding_number ?? "").trim().toUpperCase();
  const brand = String(meta.utility_brand ?? "").trim();
  const utilityType = String(meta.utility_type ?? "");
  const commissionWide = !brand || COMMISSION_WIDE.test(brand) || utilityType === "commission_proceeding";
  const sources: { title: string; url: string; used_for: string }[] = [];
  const queries: string[] = [];

  // 1. Verified docket facts (shared across tenants; written by the worker)
  let dk: Record<string, unknown> | null = null;
  if (docketNo) {
    const { data } = await sb.from("puc_docket_enrichment")
      .select("docket_number, docket_title, status, summary, key_dates, extracted, source_filings")
      .eq("state", String(sig.state ?? "MA")).eq("docket_number", docketNo).maybeSingle();
    if (data && data.status === "ok") dk = data as Record<string, unknown>;
  }
  const ex = ((dk?.extracted ?? {}) as Record<string, unknown>);
  const keyDates = ((dk?.key_dates ?? {}) as Record<string, { date?: string; time?: string; format?: string; phrase?: string }>);
  const LABEL: Record<string, string> = {
    filed: "Filed", public_hearing: "Public hearing", comment_deadline: "Comments due",
    intervention_deadline: "Petitions to intervene due", evidentiary_hearing: "Evidentiary hearing",
    effective_date: "Proposed effective date", implementation_date: "Implementation",
  };
  const timeline = Object.entries(keyDates)
    .filter(([k, v]) => v && v.date && LABEL[k])
    .map(([k, v]) => ({ event: LABEL[k], date: String(v.date), time: String(v.time ?? "") }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const docketTitle = String(dk?.docket_title ?? sig.title ?? "");
  const programs = ((ex.rates_or_programs as string[]) ?? []).slice(0, 4);

  const facts: Record<string, unknown> = {
    mode: "regulatory",
    docket_number: docketNo,
    utility: brand,
    summary: String(dk?.summary ?? ""),
    proposal: String(ex.proposal ?? ""),
    timeline,
    contacts: ex.hearing_officer
      ? [{ name: String(ex.hearing_officer), title: "Hearing Officer", organization: "Massachusetts DPU", role: "listed" }]
      : [],
    related_dockets: (ex.related_dockets as string[]) ?? [],
    rates_or_programs: programs,
  };

  const firstDoc = ((dk?.source_filings as { url?: string; type?: string }[]) ?? []).find(d => d.url);
  const docUrl = String(firstDoc?.url ?? sig.doc_url ?? "");
  const document = docUrl
    ? { url: docUrl, title: `D.P.U. ${docketNo} — ${String(firstDoc?.type ?? "filing")}`, source: hostOf(docUrl), kind: "regulatory" }
    : null;
  if (document) sources.push({ title: document.title, url: docUrl, used_for: "docket filing" });

  // 2. Web context the filings don't have (utility-specific dockets only)
  let webContext: { title: string; url: string; snippet: string }[] = [];
  let decision_makers: unknown[] = [];
  if (!commissionWide) {
    const topic = (programs[0] || docketTitle).replace(/\s+/g, " ").slice(0, 90);
    const q = `"${brand}" ${topic} ${now.getFullYear()}`;
    queries.push(q);
    const hits = (await tavily(q, { max: 6 }))
      .filter(h => `${h.title} ${h.url} ${h.content}`.toLowerCase().includes(brand.toLowerCase()));
    webContext = hits.slice(0, 5).map(h => ({ title: h.title, url: h.url, snippet: String(h.content ?? "").slice(0, 500) }));
    for (const h of hits.slice(0, 5)) sources.push({ title: h.title, url: h.url, used_for: "context" });

    const dmQuery = String(dmTemplate).replaceAll("{agency}", brand);
    queries.push(dmQuery);
    const dmHits = await tavily(dmQuery, { max: 5 });
    if (dmHits.length) {
      const src = dmHits.map((h, i) => `[${i + 1}] ${h.title}\nURL: ${h.url}\n${h.content}`).join("\n\n");
      const out = await claudeJSON([{ type: "text", text:
`From these results, list people at ${brand} (a Massachusetts investor-owned utility) who would own or influence a purchase relevant to this tenant — e.g. rate design, pricing, billing, customer information systems, customer programs.
Use ONLY names and titles stated in the results. Note departures or new appointments if stated.
TENANT (for relevance): ${String(tenant).slice(0, 1200)}

${src}

Return ONLY JSON: {"people":[{"name":"","title":"","note":"","source_url":""}]}` }], 800);
      const urls = new Set(dmHits.map(h => h.url));
      decision_makers = ((out?.people as Record<string, unknown>[]) ?? [])
        .filter(p => p && p.name && urls.has(String(p.source_url ?? ""))).slice(0, 6);
      for (const h of dmHits) sources.push({ title: h.title, url: h.url, used_for: "decision_makers" });
    }
  }

  // 3. Synthesize (regulatory frame)
  const synth = await claudeJSON([{ type: "text", text:
`You advise ${oipName || "the tenant"} on a utility regulatory proceeding before the Massachusetts DPU. Today is ${now.toISOString().slice(0, 10)}.

TENANT PROFILE: ${tenant}

DOCKET: D.P.U. ${docketNo} — ${docketTitle}
UTILITY: ${commissionWide ? "Commission-wide proceeding (applies to Massachusetts investor-owned utilities)" : brand}
VERIFIED DOCKET FACTS (read from the notice / filing): ${JSON.stringify(facts).slice(0, 7000)}
WEB CONTEXT (utility announcements, vendor news, RFPs — corroboration only; ignore anything not about this utility and program): ${JSON.stringify(webContext)}
DECISION-MAKERS AT THE UTILITY: ${JSON.stringify(decision_makers)}

A regulatory proceeding is NOT a procurement. It tells the tenant what a utility must build, change, or implement — and when. The tenant sells to the UTILITY, not to the DPU. Typical path: filed -> comment_period -> hearing/discovery -> decided -> compliance -> implementation.

Return ONLY JSON:
{
 "stage": "filed|comment_period|hearing|discovery|decided|compliance|implementation",
 "angle": "2-3 sentences: what the utility must do or change because of this proceeding, why it creates need for the tenant now, and the timing that matters",
 "next_steps": [{"when":"YYYY-MM-DD or a window","action":"","why":""}],
 "compliance": [""]
}
Rules: next_steps 2-5 items, concrete (e.g. reach the utility's rate design or billing lead before the effective date, file comments by the stated deadline if the tenant has a public view, track the order). Every "when" must be today or later. Use dates only from the verified facts. Label estimates as estimates. compliance only for rules actually stated in the facts; otherwise []. Do not invent names, dates, amounts, or procurements.` }], 1300);

  const future = timeline.map(t => toDate(t.date)).filter((d): d is Date => !!d && d > now)
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    signal_id, oip_id,
    status: dk ? "ok" : "partial",
    stage: String(synth?.stage ?? (dk ? "filed" : "filed")),
    document, facts, decision_makers, winner: null,
    angle: String(synth?.angle ?? ""),
    next_steps: futureSteps((synth?.next_steps as { when?: string }[]) ?? [], now),
    compliance: ((synth?.compliance as unknown[]) ?? []).filter(c => String(c ?? "").trim()),
    sources, queries, error: null,
    enriched_at: now.toISOString(),
    // Re-brief the day after the next dated event (comment deadline, hearing, effective date).
    next_refresh_at: future.length ? addDays(future[0], 1).toISOString() : null,
    refresh_count: (cached?.refresh_count ?? -1) + 1,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { signal_id, oip_id, cache_only = false, force = false, also_signal_ids = [] } = await req.json();
    if (!signal_id || !oip_id) return json({ error: "signal_id and oip_id required" }, 400);
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: cached } = await sb.from("opportunity_intel")
      .select("*").eq("signal_id", signal_id).eq("oip_id", oip_id).maybeSingle();
    if (cache_only) return json(cached ? { status: "cached", ...cached } : { status: "none" });
    const due = !cached || !cached.next_refresh_at || new Date(cached.next_refresh_at) <= new Date();
    if (cached && !force && !due) return json({ status: "cached", ...cached });

    // ── Load notice, tenant profile, sentinel settings ──
    const { data: sig } = await sb.from("signals")
      .select("title, source, source_name, state, doc_url, metadata, meeting_date, doc_type, full_text_storage_path, vertical_data").eq("id", signal_id).single();
    if (!sig) return json({ error: "signal not found" }, 404);
    const meta  = (sig.metadata ?? {}) as Record<string, unknown>;
    const agency = expandAgency(String(meta.agency_name || sig.source_name || ""));
    // First sentence of the notice's own description: names the actual buyer
    // (e.g. "LaGuardia Community College, CUNY is seeking...").
    const descLead = String(meta.additional_description_1 || meta.note || "")
      .split(/(?<=[.!?])\s/)[0].slice(0, 220);
    const title  = String(meta.short_title || String(sig.title ?? "").split(" — ").slice(-1)[0]);
    const ident  = String(meta.pin || meta.cr_number || meta.request_id || "");
    const dueStr = String(meta.response_deadline || meta.due_date || "");
    const notice = `${agency} — ${title}${ident ? ` (#${ident})` : ""}${dueStr ? `, due ${dueStr}` : ""}`
      + (descLead ? `. Description: ${descLead}` : "");
    const acronym = (agency.match(/\(([A-Z]{3,})\)/) || [])[1] || "";
    const aTokens = agencyTokens(agency);
    // Facts from the source record itself. These outrank anything found online.
    const authoritative: Record<string, unknown> = {};
    for (const k of ["response_deadline", "due_date", "ad_end_date", "issue_date", "pin", "cr_number",
                     "selection_method_description", "ad_type", "notice_type", "category_description",
                     "contact_name", "contact_phone", "email", "address_to_request", "goals"]) {
      if (meta[k] != null && meta[k] !== "") authoritative[k] = meta[k];
    }

    // Reference date for the recency guard: the notice's own dates.
    const refDate = toDate(meta.response_deadline) ?? toDate(meta.due_date) ?? toDate(meta.issue_date)
      ?? toDate(meta.start_date) ?? toDate(sig.meeting_date) ?? new Date();
    const oldestOk = addDays(refDate, -MAX_DOC_AGE_DAYS);
    // Upload paths often carry a year/month (e.g. /wp-content/uploads/2017/06/).
    const urlTooOld = (u: string) => {
      const m = u.match(/\/((?:19|20)\d{2})\/(0[1-9]|1[0-2])\//);
      if (!m) return false;
      // Uploaded at the end of that month at the latest.
      return new Date(Date.UTC(+m[1], +m[2], 0)) < oldestOk;
    };
    // Latest date the extracted material itself mentions.
    const latestDocDate = (f: Record<string, unknown> | null): Date | null => {
      const ds = ((f?.timeline as { date?: string }[]) ?? []).map(t => toDate(t.date)).filter((d): d is Date => !!d);
      return ds.length ? new Date(Math.max(...ds.map(d => d.getTime()))) : null;
    };

    const { data: oip } = await sb.from("oips").select("name, slug").eq("id", oip_id).single();
    const { data: profile } = await sb.rpc("get_canonical_profile", { p_oip_id: oip_id });
    const tenant = `${oip?.name ?? ""}: ${JSON.stringify(profile ?? {}).slice(0, 3500)}`;

    const { data: sen } = await sb.from("sentinels").select("pull_config")
      .eq("oip_id", oip_id).eq("is_active", true).limit(1).maybeSingle();
    const pc = (sen?.pull_config ?? {}) as Record<string, unknown>;
    const dmTemplate = String(pc.enrichment_decision_maker_query
      || "\"{agency}\" marketing communications director OR \"chief marketing officer\" OR \"vice president marketing\"");

    const sources: { title: string; url: string; used_for: string }[] = [];
    const queries: string[] = [];

    // ── Regulatory mode: utility proceedings before the DPU ──
    if (String(sig.source ?? "") === "puc") {
      const row = await enrichRegulatorySignal({
        sb, sig, signal_id, oip_id, tenant, oipName: String(oip?.name ?? ""),
        dmTemplate: pc.enrichment_decision_maker_query ? dmTemplate : REG_DM_TEMPLATE, cached,
      });
      const stamped = { ...row, intel_version: INTEL_VERSION };
      const rows = [stamped, ...(also_signal_ids as string[]).filter(id => id && id !== signal_id)
        .map(id => ({ ...stamped, signal_id: id }))];
      const { error } = await sb.from("opportunity_intel").upsert(rows, { onConflict: "signal_id,oip_id" });
      if (error) console.error("upsert opportunity_intel (regulatory)", error);
      return json({ status: "enriched", ...row });
    }

    // ── Board-meeting mode: agendas / minutes are not procurements ──
    if (isBoardSignal(sig)) {
      const row = await enrichBoardSignal({
        sb, sig, signal_id, oip_id, tenant, oipName: String(oip?.name ?? ""),
        dmTemplate, cached,
      });
      const stamped = { ...row, intel_version: INTEL_VERSION };
      const rows = [stamped, ...(also_signal_ids as string[]).filter(id => id && id !== signal_id)
        .map(id => ({ ...stamped, signal_id: id }))];
      const { error } = await sb.from("opportunity_intel").upsert(rows, { onConflict: "signal_id,oip_id" });
      if (error) console.error("upsert opportunity_intel (board)", error);
      return json({ status: "enriched", ...row });
    }

    // ══ v3 procurement path ═══════════════════════════════════════════════
    // Notice-level facts are tenant-blind and shared by every OIP on the
    // notice (notice_facts). Only the synthesis below is per OIP.
    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    const identity = `${agency} — ${title}${ident ? ` (#${ident})` : ""}` + (descLead ? `. Description: ${descLead}` : "");
    const latestFactDate = (f: Record<string, unknown> | null): Date | null => {
      const ds = ((f?.dates as { date?: string }[]) ?? []).map(t => toDate(t.date)).filter((d): d is Date => !!d);
      return ds.length ? new Date(Math.max(...ds.map(d => d.getTime()))) : null;
    };

    const { data: nfCached } = await sb.from("notice_facts").select("*").eq("signal_id", signal_id).maybeSingle();
    const nfFresh = !!nfCached && nfCached.facts_version === FACTS_VERSION && !force &&
      (!nfCached.next_refresh_at || new Date(nfCached.next_refresh_at) > now);

    let nf: Record<string, unknown>;
    if (nfFresh) {
      nf = nfCached as Record<string, unknown>;
    } else {
      const nSources: { title: string; url: string; used_for: string }[] = [];
      const nQueries: string[] = [];

      // ── 1. Find the solicitation document (unchanged search + guards) ──
      let docUrl = "", docTitle = "";
      const srcUrl = String(sig.doc_url ?? "");
      if (srcUrl && isPdfUrl(srcUrl)) { docUrl = srcUrl; docTitle = "Solicitation document (source)"; }
      let searchHits: Hit[] = [];
      if (!docUrl) {
        const buyer = (descLead.match(/^([A-Z][\w&.,' -]{3,80}?) (is|are) (seeking|requesting|soliciting)/) || [])[1] || "";
        const q = `"${agency}"${buyer ? ` "${buyer}"` : ""} "${title}" RFP${ident ? ` ${ident}` : ""}`;
        nQueries.push(q);
        searchHits = (await tavily(q, { raw: true, max: 8 }))
          .filter(h => mentionsAgency(`${h.title} ${h.url} ${h.content} ${h.raw ?? ""}`, aTokens, acronym));
        for (const h of searchHits) if (isPdfUrl(h.url) && urlTooOld(h.url))
          nSources.push({ title: `Rejected: ${h.title || h.url}`, url: h.url, used_for: "rejected — outdated (upload date in URL)" });
        searchHits = searchHits.filter(h => !(isPdfUrl(h.url) && urlTooOld(h.url)));
        const pdf = searchHits.find(h => isPdfUrl(h.url));
        if (pdf) { docUrl = pdf.url; docTitle = pdf.title; }
      }

      // ── 2-4. Text layer, blind extraction, quote verification ──
      let facts: Record<string, unknown> | null = null;
      let layer: TextLayer = { pages: [], status: "none" };
      let truncated = false, docHash = "", usedDoc = false, fromListings = false;
      if (docUrl) {
        try {
          const r = await fetch(docUrl, { headers: { "User-Agent": "Mozilla/5.0 (WinQuest opportunity intelligence)" } });
          const buf = r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
          if (buf && buf.byteLength > 0 && buf.byteLength <= MAX_PDF_BYTES) {
            docHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buf)))
              .map(b => b.toString(16).padStart(2, "0")).join("");
            layer = await pdfTextLayer(buf);
            const ex = await extractV3FromPdf(encodeBase64(buf), identity);
            facts = ex.json; truncated = ex.truncated;
            const sp = (facts?.same_procurement ?? {}) as Record<string, unknown>;
            if (facts && sp.match !== true) {
              nSources.push({ title: `Rejected: ${docTitle || docUrl}`, url: docUrl, used_for: `rejected — ${String(sp.reason ?? "not this procurement").slice(0, 120)}` });
              facts = null;
            }
            const latest = latestFactDate(facts);
            if (facts && latest && latest < oldestOk) {
              nSources.push({ title: `Rejected: ${docTitle || docUrl}`, url: docUrl, used_for: `rejected — outdated (latest date in document ${latest.toISOString().slice(0, 10)})` });
              facts = null;
            }
            if (facts) { usedDoc = true; nSources.push({ title: docTitle || "Solicitation document", url: docUrl, used_for: "document" }); }
          }
        } catch (e) { console.error("pdf fetch/read failed", docUrl, e); }
      }
      if (!facts && searchHits.length) {
        const material = searchHits.map((h, i) => `[${i + 1}] ${h.title}\nURL: ${h.url}\n${h.raw || h.content}`).join("\n\n").slice(0, 18000);
        const ex = await extractV3FromText(material, identity);
        facts = ex.json; truncated = ex.truncated;
        const sp = (facts?.same_procurement ?? {}) as Record<string, unknown>;
        const latestT = latestFactDate(facts);
        if (facts && (sp.match !== true || (latestT && latestT < oldestOk))) facts = null;
        else if (facts) {
          fromListings = true;
          // page = result number; the text layer is the results themselves.
          layer = { pages: searchHits.map(h => `${h.title}\n${h.raw || h.content}`), status: "ok" };
          for (const h of searchHits) nSources.push({ title: h.title, url: h.url, used_for: "listing" });
        }
      }
      facts = facts ?? {};
      const check = verifyFacts(facts, layer);
      for (const k of ["scope_included", "scope_excluded", "gates", "submission_requirements", "insurance", "criteria"])
        facts[k] = dedupeList(facts[k]);
      const pagesTotal = usedDoc ? layer.pages.length || null : null;
      const coverageComplete = usedDoc && layer.status === "ok" && !truncated && (pagesTotal ?? 0) > 0 && (pagesTotal ?? 0) <= 100;

      // ── 5. Resolve listing vs document: the document wins, conflicts kept ──
      const conflicts: Record<string, unknown>[] = [];
      const docDue = factDate(facts, "proposal_due");
      const listDue = toDate(dueStr);
      if (docDue && listDue && isoDay(docDue) !== isoDay(listDue))
        conflicts.push({ field: "proposal_due", listing_value: isoDay(listDue), document_value: isoDay(docDue), resolved_to: "document" });
      const docIssued = factDate(facts, "issued");
      const listIssued = toDate(meta.issue_date);
      if (docIssued && listIssued && isoDay(docIssued) !== isoDay(listIssued))
        conflicts.push({ field: "issued", listing_value: isoDay(listIssued), document_value: isoDay(docIssued), resolved_to: "document" });
      const resolvedDue = docDue ?? listDue;
      facts.resolved = {
        proposal_due: resolvedDue ? isoDay(resolvedDue) : "", proposal_due_source: docDue ? "document" : (listDue ? "listing" : ""),
        issued: (docIssued ?? listIssued) ? isoDay(docIssued ?? listIssued) : "", issued_source: docIssued ? "document" : (listIssued ? "listing" : ""),
      };

      // ── Winner, once the award (or due) date has passed — notice level ──
      const awardDate = factDate(facts, "award");
      let winner = (nfCached?.winner ?? cached?.winner ?? null) as Record<string, unknown> | null;
      const winnerTime = awardDate ? now >= awardDate : (resolvedDue ? now >= resolvedDue : false);
      const winnerStale = !winner || (winner.method === "none" && winner.searched_at &&
        (now.getTime() - new Date(String(winner.searched_at)).getTime()) > NO_WINNER_RETRY_DAYS * 86400000);
      if (winnerTime && (winnerStale || force)) {
        winner = { ...(await findWinner(agency, title, String(meta.pin || ""), String((awardDate ?? resolvedDue ?? now).getFullYear()))),
                   searched_at: now.toISOString() };
      }

      const milestones = [factDate(facts, "finalists_notified"), awardDate, factDate(facts, "contract_start"), resolvedDue]
        .filter((d): d is Date => !!d && d > now).sort((a, b) => a.getTime() - b.getTime());
      let nRefresh: string | null = milestones.length ? addDays(milestones[0], 1).toISOString() : null;
      if (!nRefresh && winnerTime && !awardEvidence(winner)) nRefresh = addDays(now, NO_WINNER_RETRY_DAYS).toISOString();

      nf = {
        signal_id, facts_version: FACTS_VERSION,
        status: usedDoc ? "ok" : (fromListings ? "partial" : "no_document"),
        doc_url: usedDoc ? docUrl : null, doc_title: usedDoc ? (docTitle || null) : null, doc_hash: docHash || null,
        pages_total: pagesTotal, pages_read: usedDoc ? Math.min(pagesTotal ?? 0, 100) : null,
        text_layer: usedDoc ? layer.status : (fromListings ? "listing" : "none"),
        coverage_complete: coverageComplete,
        facts: { ...facts, verification: { ...check, truncated } },
        conflicts, winner, sources: nSources, queries: nQueries, error: null,
        extracted_at: now.toISOString(), next_refresh_at: nRefresh,
        refresh_count: ((nfCached?.refresh_count as number) ?? -1) + 1,
      };
    }

    // Stage is recomputed on every call (cheap, date-dependent), cached or not.
    const facts = (nf.facts ?? {}) as Record<string, unknown>;
    const resolved = (facts.resolved ?? {}) as Record<string, unknown>;
    const dueDate = toDate(resolved.proposal_due);
    const winner = (nf.winner ?? null) as Record<string, unknown> | null;
    const stage = computeStageV3(meta, String(sig.title ?? ""), facts, dueDate, winner, now);
    nf.stage = stage;
    {
      const nfRows = [nf, ...(also_signal_ids as string[]).filter(id => id && id !== signal_id).map(id => ({ ...nf, signal_id: id }))];
      const { error } = await sb.from("notice_facts").upsert(nfRows, { onConflict: "signal_id" });
      if (error) console.error("upsert notice_facts", error);
    }
    const rs = restrictedStatus(facts, winner, now);

    // ── 6. Per-OIP: decision-makers (sentinel template) ──
    const dmQuery = dmTemplate.replaceAll("{agency}", agency);
    queries.push(dmQuery);
    const dmHits = await tavily(dmQuery, { max: 5 });
    let decision_makers: Record<string, unknown>[] = [];
    if (dmHits.length) {
      const src = dmHits.map((h, i) => `[${i + 1}] ${h.title}\nURL: ${h.url}\n${h.content}`).join("\n\n");
      const out = await claudeJSON([{ type: "text", text:
`From these results, list people at ${agency} who would own or influence a purchase like: ${title}.
Use ONLY names and titles stated in the results. Note departures or new appointments if stated.

${src}

Return ONLY JSON: {"people":[{"name":"","title":"","note":"","source_url":""}]}` }], 800);
      const urls = new Set(dmHits.map(h => h.url));
      decision_makers = ((out?.people as Record<string, unknown>[]) ?? [])
        .filter(p => p && p.name && urls.has(String(p.source_url ?? ""))).slice(0, 6);
      for (const h of dmHits) sources.push({ title: h.title, url: h.url, used_for: "decision_makers" });
    }

    // ── Plays + incumbent (per OIP, as v2) ──
    const playStage = playStageOf(stage.code);
    const plays = salesPlaysFor(pc);
    const allowedPlays = plays.filter(p => p.stages.includes(playStage));
    const guidance = String(pc.sales_play_guidance ?? "").trim();
    const cachedPlay = (cached?.play ?? null) as Record<string, unknown> | null;
    let incumbent = (cachedPlay?.incumbent ?? null) as Record<string, unknown> | null;
    if (plays.length && (stage.code === "open" || stage.code === "closing")
        && pc.enrichment_incumbent_lookup !== false && !(incumbent && incumbent.vendor)) {
      const inc = await findIncumbent(agency, title, (dueDate ?? now).getUTCFullYear());
      queries.push(...inc.queries);
      incumbent = { vendor: inc.vendor, confidence: inc.confidence, evidence: inc.evidence,
                    source_url: inc.source_url, searched_at: now.toISOString() };
      if (inc.source_url) sources.push({ title: "Incumbent evidence", url: inc.source_url, used_for: "incumbent" });
    }

    // ── 7. Synthesize for the tenant: cite fact ids or mark inference ──
    const tenantName = String(oip?.name ?? "the tenant");
    const catalog = factCatalog(facts, decision_makers, winner, incumbent);
    const designatedLine = rs.applies && rs.designated && rs.designated.length ? ` Designated contacts: ${rs.designated.join(", ")}.` : "";
    const playBlock = plays.length
      ? `\nSALES PLAYS ALLOWED AT THIS STAGE — choose exactly one by name:\n${(allowedPlays.length ? allowedPlays : plays).map(p => `- ${p.name}: ${p.definition}`).join("\n")}`
      : "";
    const howTenantWins = guidance
      ? `How ${tenantName} wins business here: ${guidance}`
      : `How ${tenantName} wins business here: if it cannot or would not bid as prime, the play is to partner with likely bidders before the award and with the WINNING vendor after it (derived demand: the winner may need ${tenantName}'s offering to deliver).`;
    const playSchema = plays.length
      ? `,\n "play": {"play":"<one allowed play name>","who":"who to approach — named only if a fact names them, otherwise the role","next_step":"one concrete action","teaming":"M/WBE / SDVOB or partnering angle, or empty","timing":"when to act, tied to fact dates","refs":[""]}`
      : "";
    const synthOut = await claudeJSONx([{ type: "text", text:
`You advise ${tenantName} on a public-sector opportunity. Today is ${todayIso}.

TENANT PROFILE: ${tenant}

OPPORTUNITY: ${identity}
COMPUTED STAGE (by rule, authoritative — do not override): ${stage.code} — ${stage.basis}
RESTRICTED COMMUNICATION: ${rs.applies ? (rs.active ? `ACTIVE — ${rs.basis}.` : `ended — ${rs.basis}.`) : "none stated in the solicitation."}${designatedLine}
DOCUMENT COVERAGE: ${nf.coverage_complete ? "complete" : "PARTIAL — never claim the solicitation lacks something"}

VERIFIED FACTS (cite by id in refs):
${catalog.map(f => `[${f.id}] ${f.text}`).join("\n") || "(none — the solicitation document was not found or could not be read)"}
${playBlock}

${howTenantWins}

Return ONLY JSON:
{
 "angle": [{"text":"","refs":[""],"inference":false}],
 "tenant_signals": [{"text":"why this fact matters to ${tenantName}","refs":[""]}],
 "next_steps": [{"when":"YYYY-MM-DD or a window","action":"","why":"","refs":[""],"inference":false,"contacts_agency_staff":false}]${playSchema}
}
Rules:
- Every claim lists the fact ids it rests on in refs. A claim that no fact id supports must set inference=true and read as a judgment ("likely", "may"), never as something the solicitation says.
- Never state a date, dollar amount, term or requirement that is not in a cited fact. Never put words in quotation marks.
- angle: 1-3 claims on why this matters to ${tenantName}. If what ${tenantName} sells appears under "performed by others / excluded" or "buyer obtains through partner agencies", say plainly the buyer obtains it through those partners and point ${tenantName} at them; never claim the solicitation requires it.
- tenant_signals: up to 5 facts that most bear on ${tenantName}, each with why.
- next_steps: 3-6, in date order, carrying out the play. Set contacts_agency_staff=true for any step that contacts staff of the issuing agency. While restricted communication is ACTIVE, the only permitted agency contact is a designated contact, about the procurement itself.
- Stage is ${stage.code}: unless it is open or closing, do not suggest bidding and do not describe the buyer as actively procuring or evaluating.
- Refer to the tenant as ${tenantName}. Name only clients, case studies or products of ${tenantName} that appear in the TENANT PROFILE.` }], 2500);
    const synth = (synthOut.json ?? {}) as Record<string, unknown>;

    // ── 8. Validate before saving (code) ──
    const allowedIso = new Set<string>([todayIso]);
    for (const d of ((facts.dates as Record<string, unknown>[]) ?? []).filter(shown)) { const x = isoDay(d.date); if (x) allowedIso.add(x); }
    for (const v of Object.values(resolved)) if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) allowedIso.add(String(v));
    const rpEnd = isoDay(((facts.restricted_period ?? {}) as Record<string, unknown>).end_date);
    if (rpEnd) allowedIso.add(rpEnd);
    const ctx: ValidateCtx = {
      ids: new Set(catalog.map(f => f.id)), catalog, allowedIso,
      allowedMd: new Set([...allowedIso].map(d => d.slice(5))),
      factText: normText(catalog.map(f => `${f.text} ${f.quote ?? ""}`).join(" ")).replace(/\s/g, ""),
      stageCode: stage.code, coverageComplete: !!nf.coverage_complete, rs,
      staffNames: [...decision_makers.map(p => String(p.name ?? "")),
                   ...((facts.contacts as Record<string, unknown>[]) ?? []).map(p => String(p.name ?? ""))].filter(Boolean),
      tenantName, profileText: JSON.stringify(profile ?? {}).toLowerCase(), todayIso, dropped: [],
    };
    const angle = ((synth.angle as Claim[]) ?? []).map(c => validateClaim(c, ctx, "angle")).filter((c): c is Claim => !!c);
    const tenant_signals = ((synth.tenant_signals as Claim[]) ?? []).map(c => validateClaim(c, ctx, "tenant_signal")).filter((c): c is Claim => !!c).slice(0, 5);
    const next_steps = ((synth.next_steps as Claim[]) ?? []).map(s => validateStep(s, ctx)).filter((c): c is Claim => !!c)
      .sort((a, b) => String(a.when ?? "").localeCompare(String(b.when ?? ""))).slice(0, 6);

    let play: Record<string, unknown> | null = null;
    if (plays.length) {
      const sp = (synth.play ?? {}) as Record<string, unknown>;
      const allowedNames = new Set((allowedPlays.length ? allowedPlays : plays).map(p => p.name));
      const name = String(sp.play ?? "");
      if (!allowedNames.has(name)) console.log("play rejected (not allowed at stage)", stage.code, name);
      let nextStep = fixTenantName(String(sp.next_step ?? ""), tenantName);
      let who = fixTenantName(String(sp.who ?? ""), tenantName);
      if (violatesRestricted(`${who} ${nextStep}`, false, ctx) || !datesOk(`${nextStep} ${sp.timing ?? ""}`, ctx.allowedIso, ctx.allowedMd)) {
        ctx.dropped.push({ text: nextStep.slice(0, 200), reason: "play: restricted-period contact or unsupported date" });
        nextStep = ""; who = "";
      }
      play = {
        play: allowedNames.has(name) ? name : null, who, next_step: nextStep,
        teaming: String(sp.teaming ?? ""), timing: String(sp.timing ?? ""),
        computed_stage: playStage, stage_code: stage.code, stage_basis: stage.basis, days_to_due: stage.days_to_due,
        incumbent,
      };
    }

    // ── 9. Code-rendered compliance + legacy shapes for the current UI ──
    const compliance = renderCompliance(facts, stage, rs);
    const quoteOf = (id: string) => catalog.find(f => f.id === id)?.quote ?? "";
    const pretty = (t: string) => t.replace(/_/g, " ").replace(/\b\w/g, m => m.toUpperCase());
    const c = (facts.contract ?? {}) as Record<string, Record<string, unknown>>;
    const rp = (facts.restricted_period ?? {}) as Record<string, unknown>;
    const legacyFacts = {
      mode: "procurement", facts_version: FACTS_VERSION,
      coverage: { complete: !!nf.coverage_complete, pages_total: nf.pages_total, text_layer: nf.text_layer, status: nf.status },
      conflicts: nf.conflicts ?? [],
      contacts: ((facts.contacts as Record<string, unknown>[]) ?? []).filter(shown)
        .map(p => ({ name: p.name, title: p.title, organization: p.organization, email: p.email, phone: p.phone, role: p.role })),
      timeline: ((facts.dates as Record<string, unknown>[]) ?? []).filter(shown)
        .map(d => ({ event: String(d.label || pretty(String(d.event_type ?? ""))), date: d.date, time: d.time ?? "", tentative: !!d.tentative }))
        .sort((a, b) => String(a.date).localeCompare(String(b.date))),
      gates: dedupeList(facts.gates).filter(shown).map(valOf),
      submission_requirements: dedupeList(facts.submission_requirements).filter(shown).map(valOf),
      insurance: dedupeList(facts.insurance).filter(shown).map(valOf),
      scope_included: dedupeList(facts.scope_included).filter(shown).map(valOf),
      scope_excluded: dedupeList(facts.scope_excluded).filter(shown).map(valOf),
      restricted_period: rs.applies ? { applies: true, basis: String(rp.condition || rp.end_event || ""), until: String(rp.end_date ?? ""), active: rs.active, status: rs.basis } : { applies: false },
      award_method: shown(facts.award_method) ? valOf(facts.award_method) : "",
      criteria: dedupeList(facts.criteria).filter(shown).map(valOf),
      commercials: {
        term: [shown(c.term) ? valOf(c.term) : "", shown(c.renewals) && valOf(c.renewals) ? `renewals: ${valOf(c.renewals)}` : ""].filter(Boolean).join("; "),
        budget: shown(c.value) ? valOf(c.value) : "", goals: "", subcontracting: "",
      },
      tenant_signals: tenant_signals.map(t => ({ quote: quoteOf(String(((t.refs as string[]) ?? [])[0] ?? "")), why: String(t.text ?? "") })),
      summary: String(facts.summary ?? ""),
    };
    const angleText = angle.map(a => `${a.inference ? "(Assessment) " : ""}${a.text}`).join(" ");
    const docRow = nf.doc_url ? { url: String(nf.doc_url), title: String(nf.doc_title ?? ""), source: hostOf(String(nf.doc_url)) } : null;
    if (ctx.dropped.length) console.log("v3 validator dropped", JSON.stringify(ctx.dropped));

    // ── 10. Save (per OIP), copied to also_signal_ids ──
    const row = {
      signal_id, oip_id,
      status: nf.status === "ok" ? "ok" : "partial",
      stage: legacyStageOf(stage.code),
      document: docRow, facts: legacyFacts, decision_makers, winner,
      angle: angleText,
      next_steps: next_steps.map(s => ({ when: s.when ?? "", action: s.action ?? "", why: s.why ?? "", refs: s.refs, inference: s.inference })),
      compliance,
      sources: [...((nf.sources as unknown[]) ?? []), ...sources], queries: [...((nf.queries as unknown[]) ?? []), ...queries],
      error: null, enriched_at: now.toISOString(),
      next_refresh_at: nf.next_refresh_at ?? null,
      refresh_count: (cached?.refresh_count ?? -1) + 1,
      play, intel_version: INTEL_VERSION, notice_facts_version: FACTS_VERSION,
      synthesis: { angle, tenant_signals, next_steps, dropped: ctx.dropped, truncated: synthOut.truncated },
    };
    const rows = [row, ...(also_signal_ids as string[]).filter(id => id && id !== signal_id)
      .map(id => ({ ...row, signal_id: id }))];
    const { error } = await sb.from("opportunity_intel").upsert(rows, { onConflict: "signal_id,oip_id" });
    if (error) console.error("upsert opportunity_intel", error);
    return json({ ...row, stage_v3: stage, notice_status: nf.status });
  } catch (err) {
    console.error("enrich-opportunity error:", err);
    return json({ error: String(err) }, 500);
  }
});
