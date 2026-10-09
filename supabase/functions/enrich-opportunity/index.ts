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
// Request body:
//   { signal_id, oip_id, cache_only?, force?, also_signal_ids? }
//   cache_only -> return the stored record (or {status:"none"}); never spends.
//   force      -> re-run even if the stored record is not due for refresh.
//   also_signal_ids -> other signal ids for the SAME notice (captured by more
//                      than one feed); the record is copied to them.
//
// Secrets: TAVILY_API_KEY, ANTHROPIC_API_KEY (+ SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY provided by Supabase).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAVILY_KEY    = Deno.env.get("TAVILY_API_KEY") ?? "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const MODEL         = "claude-haiku-4-5-20251001";
const CROL_URL      = "https://data.cityofnewyork.us/resource/tfbu-zbd2.json";
const MAX_PDF_BYTES = 12 * 1024 * 1024;
const NO_WINNER_RETRY_DAYS = 14;

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

const EXTRACT_SPEC = `Return ONLY JSON, no preamble:
{
 "same_procurement": {"match": false, "reason": ""},
 "contacts": [{"name":"","title":"","organization":"","email":"","phone":"","role":"designated|administrative|subject_matter|consultant|listed"}],
 "timeline": [{"event":"","date":"YYYY-MM-DD","time":""}],
 "gates": [""],
 "restricted_period": {"applies": false, "basis": "", "until": ""},
 "award_method": "",
 "criteria": [""],
 "commercials": {"term":"","budget":"","goals":"","subcontracting":""},
 "tenant_signals": [{"quote":"","why":""}],
 "summary": ""
}
Rules: FIRST decide same_procurement: match=true ONLY if the material is about THIS procurement — same issuing agency (or its parent) AND the same scope/title or solicitation number. A different organization's RFP on a similar topic is match=false. If match=false, leave every other field empty.
Use only what the material states; leave fields empty rather than guessing.
contacts: only people/offices named as contacts for THIS procurement.
timeline: every dated event (intent to propose, questions due, answers, proposals due, finalists, presentations, award, contract start).
gates: requirements to participate (letter of intent, NDA, mandatory meeting, registration, eligibility).
restricted_period: lobbying / restricted-communication rules (e.g. NY State Finance Law 139-j/139-k), and when they end.
tenant_signals: up to 5 short quotes (max 30 words each) that relate to the TENANT described below, with why each matters.
summary: 2 sentences on what is being bought.`;

async function extractFromPdf(pdfB64: string, notice: string, tenant: string) {
  return await claudeJSON([
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfB64 } },
    { type: "text", text: `This is the solicitation document for: ${notice}\n\nTENANT: ${tenant}\n\n${EXTRACT_SPEC}` },
  ], 2500);
}

async function extractFromText(material: string, notice: string, tenant: string) {
  return await claudeJSON([
    { type: "text", text: `Web search results about this procurement: ${notice}\n\n${material}\n\nTENANT: ${tenant}\n\n${EXTRACT_SPEC}` },
  ], 2000);
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
      .select("title, source_name, doc_url, metadata").eq("id", signal_id).single();
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

    // ── 1. Find the solicitation document ──
    let docUrl = "";
    let docTitle = "";
    const srcUrl = String(sig.doc_url ?? "");
    if (srcUrl && isPdfUrl(srcUrl)) { docUrl = srcUrl; docTitle = "Solicitation document (source)"; }
    let searchHits: Hit[] = [];
    if (!docUrl) {
      const buyer = (descLead.match(/^([A-Z][\w&.,' -]{3,80}?) (is|are) (seeking|requesting|soliciting)/) || [])[1] || "";
      const q = `"${agency}"${buyer ? ` "${buyer}"` : ""} "${title}" RFP${ident ? ` ${ident}` : ""}`;
      queries.push(q);
      searchHits = (await tavily(q, { raw: true, max: 8 }))
        .filter(h => mentionsAgency(`${h.title} ${h.url} ${h.content} ${h.raw ?? ""}`, aTokens, acronym));
      const pdf = searchHits.find(h => isPdfUrl(h.url));
      if (pdf) { docUrl = pdf.url; docTitle = pdf.title; }
    }

    // ── 2. Read it (PDF) or extract from search results ──
    let facts: Record<string, unknown> | null = null;
    let document: Record<string, string> | null = null;
    if (docUrl) {
      try {
        const r = await fetch(docUrl, { headers: { "User-Agent": "Mozilla/5.0 (WinQuest opportunity intelligence)" } });
        const buf = r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
        if (buf && buf.byteLength > 0 && buf.byteLength <= MAX_PDF_BYTES) {
          facts = await extractFromPdf(encodeBase64(buf), notice, tenant);
          const sp = (facts?.same_procurement ?? {}) as Record<string, unknown>;
          if (facts && sp.match !== true) {
            console.log("document rejected (not this procurement):", docUrl, sp.reason);
            sources.push({ title: `Rejected: ${docTitle || docUrl}`, url: docUrl, used_for: `rejected — ${String(sp.reason ?? "not this procurement").slice(0, 120)}` });
            facts = null;
          }
          if (facts) {
            document = { url: docUrl, title: docTitle, source: hostOf(docUrl) };
            sources.push({ title: docTitle || "Solicitation document", url: docUrl, used_for: "document" });
          }
        }
      } catch (e) { console.error("pdf fetch/read failed", docUrl, e); }
    }
    if (!facts && searchHits.length) {
      const material = searchHits.map((h, i) =>
        `[${i + 1}] ${h.title}\nURL: ${h.url}\n${h.raw || h.content}`).join("\n\n").slice(0, 18000);
      facts = await extractFromText(material, notice, tenant);
      const sp = (facts?.same_procurement ?? {}) as Record<string, unknown>;
      if (facts && sp.match !== true) facts = null;
      else for (const h of searchHits) sources.push({ title: h.title, url: h.url, used_for: "listing" });
    }
    facts = facts ?? {};

    // ── 3a. Decision-makers ──
    const dmQuery = dmTemplate.replaceAll("{agency}", agency);
    queries.push(dmQuery);
    const dmHits = await tavily(dmQuery, { max: 5 });
    let decision_makers: unknown[] = [];
    if (dmHits.length) {
      const src = dmHits.map((h, i) => `[${i + 1}] ${h.title}\nURL: ${h.url}\n${h.content}`).join("\n\n");
      const out = await claudeJSON([{ type: "text", text:
`From these results, list people at ${agency} who would own or influence a purchase like: ${title}.
Use ONLY names and titles stated in the results. Note departures or new appointments if stated.
TENANT (for relevance): ${tenant.slice(0, 1200)}

${src}

Return ONLY JSON: {"people":[{"name":"","title":"","note":"","source_url":""}]}` }], 800);
      const urls = new Set(dmHits.map(h => h.url));
      decision_makers = ((out?.people as Record<string, unknown>[]) ?? [])
        .filter(p => p && p.name && urls.has(String(p.source_url ?? ""))).slice(0, 6);
      for (const h of dmHits) sources.push({ title: h.title, url: h.url, used_for: "decision_makers" });
    }

    // ── 3b. Winner, once the award date has passed (or due date when no award date) ──
    const timeline = (facts.timeline as { event?: string; date?: string }[]) ?? [];
    const now = new Date();
    const dueDate   = toDate(dueStr) ?? findEvent(timeline, /proposal|bid|response|due/i);
    const awardDate = findEvent(timeline, /award/i);
    let winner = cached?.winner ?? null;
    const winnerTime = awardDate ? now >= awardDate : (dueDate ? now >= dueDate : false);
    const winnerStale = !winner || (winner.method === "none" && winner.searched_at &&
      (now.getTime() - new Date(winner.searched_at).getTime()) > NO_WINNER_RETRY_DAYS * 86400000);
    if (winnerTime && (winnerStale || force)) {
      winner = { ...(await findWinner(agency, title, String(meta.pin || ""), String((awardDate ?? dueDate ?? now).getFullYear()))),
                 searched_at: now.toISOString() };
    }

    // ── 4. Synthesize for the tenant ──
    const synth = await claudeJSON([{ type: "text", text:
`You advise ${oip?.name ?? "the tenant"} on a public-sector opportunity. Today is ${now.toISOString().slice(0, 10)}.

TENANT PROFILE: ${tenant}

OPPORTUNITY: ${notice}
AUTHORITATIVE FACTS (from the official source record — these override anything below): ${JSON.stringify(authoritative)}
FACTS (from the solicitation document or listings): ${JSON.stringify(facts).slice(0, 9000)}
DECISION-MAKERS: ${JSON.stringify(decision_makers)}
WINNER: ${JSON.stringify(winner)}

How the tenant wins business here: if the tenant cannot or would not bid as prime, the play is to partner with likely bidders before the award and with the WINNING vendor after it (derived demand: the winner may need the tenant's offering to deliver).

Return ONLY JSON:
{
 "stage": "open|intent_closed|questions_closed|proposals_in|finalists|awarded|contract_live|closed",
 "angle": "2-3 sentences: why this matters to the tenant, citing the solicitation's own words where possible",
 "next_steps": [{"when":"YYYY-MM-DD or a window","action":"","why":""}],
 "compliance": [""]
}
Rules: stage must be consistent with the authoritative due date — a procurement whose due date has passed is NOT open. If the source record says sole source / exempt from advertising / noncompetitive, say so in angle and do not suggest bidding.
next_steps in date order, 3-6 items, concrete and dated from the timeline. If a restricted communication period applies, NEVER suggest contacting agency staff other than the designated contacts before it ends, and list that in compliance. Do not invent names, dates, or facts not present above.` }], 1500);

    // Stage guard: never "open"-type once the authoritative due date passed.
    let stage = String(synth?.stage ?? "");
    const preDue = new Set(["open", "intent_closed", "questions_closed", ""]);
    if (dueDate && now > dueDate && preDue.has(stage)) {
      const w = winner as Record<string, unknown> | null;
      stage = (w && (w.award || ((w.candidates as unknown[]) ?? []).length)) ? "awarded" : "proposals_in";
    }

    // ── 5. Next refresh, from the opportunity's own milestones ──
    const milestones = [findEvent(timeline, /finalist/i), awardDate, findEvent(timeline, /contract start|start date/i), dueDate]
      .filter((d): d is Date => !!d && d > now).sort((a, b) => a.getTime() - b.getTime());
    let next_refresh_at: string | null = milestones.length ? addDays(milestones[0], 1).toISOString() : null;
    if (!next_refresh_at && winnerTime && (!winner || winner.method === "none")) {
      next_refresh_at = addDays(now, NO_WINNER_RETRY_DAYS).toISOString();
    }

    const row = {
      signal_id, oip_id,
      status: (document || Object.keys(facts).length) ? "ok" : "partial",
      stage,
      document, facts, decision_makers, winner,
      angle: String(synth?.angle ?? ""),
      next_steps: (synth?.next_steps as unknown[]) ?? [],
      compliance: (synth?.compliance as unknown[]) ?? [],
      sources, queries, error: null,
      enriched_at: now.toISOString(),
      next_refresh_at,
      refresh_count: (cached?.refresh_count ?? -1) + 1,
    };
    const rows = [row, ...(also_signal_ids as string[]).filter(id => id && id !== signal_id)
      .map(id => ({ ...row, signal_id: id }))];
    const { error } = await sb.from("opportunity_intel").upsert(rows, { onConflict: "signal_id,oip_id" });
    if (error) console.error("upsert opportunity_intel", error);
    return json({ status: "enriched", ...row });

  } catch (err) {
    console.error("enrich-opportunity error:", err);
    return json({ error: String(err) }, 500);
  }
});
