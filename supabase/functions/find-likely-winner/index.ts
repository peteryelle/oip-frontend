// supabase/functions/find-likely-winner/index.ts
//
// "Find likely winner" for a recently closed SLED notice.
//
//   1. Cache      — signal_winner_intel row for (signal, OIP) is returned as-is.
//                   { cache_only: true } returns the cache or { status: "none" }
//                   and never spends — the drawer calls this on open.
//   2. Award      — NYC City Record award notice with the same PIN (free,
//                   authoritative). Found -> saved and returned, no web search.
//   3. Web search — Tavily (2-3 targeted queries), then Haiku extracts vendors
//                   that the results explicitly say were awarded/selected.
//                   Every candidate carries its source URL; nothing unsourced.
//
// Spend happens only on an explicit click (cache_only false) for a notice
// whose due date has passed. Roughly 2-3 cents per lookup.
//
// Secrets: TAVILY_API_KEY, ANTHROPIC_API_KEY, SUPABASE_URL,
//          SUPABASE_SERVICE_ROLE_KEY (the last two are provided by Supabase).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TAVILY_KEY   = Deno.env.get("TAVILY_API_KEY") ?? "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const CROL_URL = "https://data.cityofnewyork.us/resource/tfbu-zbd2.json";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function clean(s: unknown): string {
  return String(s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// ── Step 2: City Record award notice by PIN ────────────────────────────────
async function findCityRecordAward(pin: string): Promise<Record<string, unknown> | null> {
  if (!pin) return null;
  const params = new URLSearchParams({
    "$where": `pin = '${pin.replace(/'/g, "''")}'`,
    "$limit": "25",
  });
  try {
    const r = await fetch(`${CROL_URL}?${params}`);
    if (!r.ok) return null;
    const rows: Record<string, unknown>[] = await r.json();
    const award = rows.find(row =>
      /award/i.test(String(row.type_of_notice_description ?? "")));
    if (!award) return null;
    // Award notices carry vendor/amount under varying field names; keep any
    // field that looks like vendor, amount, or date, plus the identifiers.
    const keep: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(award)) {
      if (v == null || v === "") continue;
      if (/vendor|amount|award|contract|start_date|end_date|request_id|pin|short_title|agency_name/i.test(k)) {
        keep[k] = typeof v === "string" ? clean(v) : v;
      }
    }
    return keep;
  } catch {
    return null;
  }
}

// ── Step 3a: Tavily search ─────────────────────────────────────────────────
type SearchHit = { title: string; url: string; content: string };

async function tavily(query: string): Promise<SearchHit[]> {
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${TAVILY_KEY}`,
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: 5,
      include_answer: false,
    }),
  });
  if (!r.ok) {
    console.error("tavily error", r.status, await r.text());
    return [];
  }
  const d = await r.json();
  return (d.results ?? []).map((x: Record<string, unknown>) => ({
    title: clean(x.title),
    url: String(x.url ?? ""),
    content: clean(x.content).slice(0, 1200),
  }));
}

// ── Step 3b: Haiku extracts winners named in the results ───────────────────
async function extractWinners(
  notice: { agency: string; title: string; pin: string; due: string },
  hits: SearchHit[],
): Promise<{ candidates: unknown[]; note: string }> {
  if (!hits.length) return { candidates: [], note: "No web results." };

  const sources = hits.map((h, i) =>
    `[${i + 1}] ${h.title}\nURL: ${h.url}\n${h.content}`).join("\n\n");

  const prompt = `A public procurement closed. Identify the vendor(s) that WON it, using ONLY the search results below.

PROCUREMENT
Agency: ${notice.agency}
Title: ${notice.title}
PIN / solicitation #: ${notice.pin || "unknown"}
Due date: ${notice.due || "unknown"}

RULES
- Name a vendor ONLY if a result explicitly says that vendor was awarded, selected, or contracted for THIS procurement (same agency and matching scope).
- Do not guess. A vendor merely mentioned, bidding, or working for the agency on something else is NOT a winner.
- confidence: "high" = result directly states the award for this procurement; "medium" = strong but indirect (e.g. agency announces the vendor for this scope); "low" = plausible match with some ambiguity.
- evidence: a short phrase from the result (max 25 words) supporting the claim.
- If no result supports a winner, return an empty candidates list.

SEARCH RESULTS
${sources}

Respond ONLY with JSON, no preamble:
{"candidates":[{"vendor":"...","confidence":"high|medium|low","evidence":"...","source_url":"..."}],"note":"one sentence on what was or was not found"}`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!r.ok) {
    console.error("anthropic error", r.status, await r.text());
    return { candidates: [], note: "Winner extraction failed." };
  }
  const d = await r.json();
  const text = (d.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return { candidates: [], note: "Unparseable extraction." };
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    const urls = new Set(hits.map(h => h.url));
    // Keep only candidates whose source_url is one of the searched results.
    const candidates = (parsed.candidates ?? []).filter((c: Record<string, unknown>) =>
      c && c.vendor && urls.has(String(c.source_url ?? "")));
    return { candidates, note: String(parsed.note ?? "") };
  } catch {
    return { candidates: [], note: "Unparseable extraction." };
  }
}

// ── Handler ────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { signal_id, oip_id, cache_only = false, force = false } = await req.json();
    if (!signal_id || !oip_id) return json({ error: "signal_id and oip_id required" }, 400);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Cache
    if (!force) {
      const { data: cached } = await sb.from("signal_winner_intel")
        .select("*").eq("signal_id", signal_id).eq("oip_id", oip_id).maybeSingle();
      if (cached) return json({ status: "cached", ...cached });
    }
    if (cache_only) return json({ status: "none" });

    // Load the notice
    const { data: sig } = await sb.from("signals")
      .select("title, source_name, metadata").eq("id", signal_id).single();
    if (!sig) return json({ error: "signal not found" }, 404);

    const meta = (sig.metadata ?? {}) as Record<string, string>;
    const due = meta.response_deadline || meta.due_date || "";
    if (!due || new Date(due) > new Date()) {
      return json({ status: "open", note: "Notice is not closed — winner lookup runs after the due date." });
    }
    const agency = meta.agency_name || sig.source_name || "";
    const title  = meta.short_title || String(sig.title ?? "").split(" — ").slice(-1)[0];
    const pin    = meta.pin || "";

    // 2. City Record award notice
    const award = await findCityRecordAward(pin);
    if (award) {
      const row = {
        signal_id, oip_id, method: "city_record_award", award,
        candidates: [], sources: [], queries: [],
        note: "Award notice published in the NYC City Record.",
        searched_at: new Date().toISOString(),
      };
      await sb.from("signal_winner_intel").upsert(row, { onConflict: "signal_id,oip_id" });
      return json({ status: "found", ...row });
    }

    // 3. Web search
    if (!TAVILY_KEY) return json({ error: "TAVILY_API_KEY not set" }, 500);
    const year = String(new Date(due).getFullYear());
    const queries = [
      `"${agency}" "${title}" awarded contract`,
      `${agency} ${title} vendor selected ${year}`,
      ...(pin ? [`"${pin}"`] : []),
    ];
    const seen = new Set<string>();
    const hits: SearchHit[] = [];
    for (const q of queries) {
      for (const h of await tavily(q)) {
        if (h.url && !seen.has(h.url)) { seen.add(h.url); hits.push(h); }
      }
    }
    const { candidates, note } = await extractWinners({ agency, title, pin, due }, hits.slice(0, 12));

    const row = {
      signal_id, oip_id,
      method: candidates.length ? "web_search" : "none",
      award: null, candidates,
      sources: hits.slice(0, 12).map(h => ({ title: h.title, url: h.url })),
      queries, note,
      searched_at: new Date().toISOString(),
    };
    await sb.from("signal_winner_intel").upsert(row, { onConflict: "signal_id,oip_id" });
    return json({ status: candidates.length ? "found" : "not_found", ...row });

  } catch (err) {
    console.error("find-likely-winner error:", err);
    return json({ error: String(err) }, 500);
  }
});
