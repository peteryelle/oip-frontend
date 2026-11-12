// supabase/functions/entity-briefing/index.ts
//
// Generates (or returns the cached) Intelligence Briefing for one entity in
// one OIP. Replaces the old open ai-proxy, which accepted any prompt, model
// and max_tokens from anyone holding the public anon key.
//
// Security boundary:
//   1. Caller's JWT verified with auth.getClaims() (same pattern as
//      admin-dashboard-data). The anon key carries no user id -> 401.
//   2. Caller must be a tenant_members row for the OIP's tenant, or a
//      platform_admins row -> otherwise 403.
//   3. The client sends only ids. Titles, tiers, match reasons, lifecycle
//      stages and the tenant profile are read from the database here, and
//      the prompt is built here. Model and max_tokens are fixed constants.
//
// Output cap: MAX_TOKENS = 3000. If a reply still hits it (stop_reason
// "max_tokens"), the briefing is returned as-is, the row is marked
// truncated = true, and an email goes to OPS_EMAIL_TO. Users see no warning.
//
// Cost control:
//   The briefing is stored in entity_briefings keyed by (oip_id, entity_key)
//   with signal_fp = sha256(model + prompt). A view whose prompt is unchanged
//   returns the stored text with no Anthropic call. It regenerates only when
//   the entity's signals or the tenant profile change, or on force=true
//   (rate-limited to once per FORCE_COOLDOWN_SECONDS per entity).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVER_KEY =
  Deno.env.get("SB_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const OPS_EMAIL_FROM = Deno.env.get("OPS_EMAIL_FROM") || "WinQuest OIP <support@biq-i.com>";
const OPS_EMAIL_TO   = Deno.env.get("OPS_EMAIL_TO")   || "peter@biq-i.com";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 3000;
const MAX_SIGNAL_IDS = 300;
const PROMPT_SIGNALS = 12;
const FORCE_COOLDOWN_SECONDS = 60;

const LIFECYCLE_STAGE_ORDER = [
  "assessment", "planning", "pre_bond", "authorization",
  "design", "procurement", "oversight", "execution",
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Admin-only warning when a briefing hits the token cap. The user still gets
// the (cut-off) briefing; nothing is shown to them. Same Resend setup and
// OPS_EMAIL_* env vars as support-email. Never throws.
async function warnAdminTruncated(info: Record<string, unknown>): Promise<void> {
  console.warn("entity-briefing: briefing truncated at max_tokens", info);
  if (!RESEND_API_KEY) return;
  try {
    const rows = Object.entries(info)
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">${k}</td><td>${String(v ?? "—")}</td></tr>`)
      .join("");
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: OPS_EMAIL_FROM,
        to: [OPS_EMAIL_TO],
        subject: `[OIP] Entity briefing truncated at ${MAX_TOKENS} tokens`,
        html: `<p>An Intelligence Briefing hit the output cap and was cut off.</p><table>${rows}</table>`,
      }),
    });
    if (!r.ok) console.error("entity-briefing: truncation email failed", r.status, (await r.text()).slice(0, 200));
  } catch (e) {
    console.error("entity-briefing: truncation email error", e);
  }
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    if (!SUPABASE_URL || !SERVER_KEY || !ANTHROPIC_KEY) {
      console.error("entity-briefing: missing SUPABASE_URL, server key or ANTHROPIC_API_KEY");
      return json({ error: "server misconfigured" }, 500);
    }

    // ── 1. Authenticate ────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "missing Authorization header" }, 401);
    const jwt = authHeader.replace(/^Bearer\s+/i, "");

    const sb = createClient(SUPABASE_URL, SERVER_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: claimsData, error: claimsErr } = await sb.auth.getClaims(jwt);
    const callerId = claimsData?.claims?.sub as string | undefined;
    if (claimsErr || !callerId) return json({ error: "invalid or expired session" }, 401);

    // ── 2. Validate input ──────────────────────────────────────────────
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }

    const oipId      = String(body.oip_id ?? "");
    const entityKey  = String(body.entity_key ?? "").slice(0, 300);
    const entityName = String(body.entity_name ?? "").slice(0, 200);
    const force      = body.force === true;
    const signalIds  = Array.isArray(body.signal_ids)
      ? (body.signal_ids as unknown[]).map(String).filter(s => UUID_RE.test(s)).slice(0, MAX_SIGNAL_IDS)
      : [];

    if (!UUID_RE.test(oipId) || !entityKey || !entityName) {
      return json({ error: "oip_id, entity_key and entity_name are required" }, 400);
    }
    if (signalIds.length === 0) return json({ briefing: "", cached: false, generated_at: null });

    // ── 3. Authorize: tenant member of this OIP's tenant, or platform admin
    const { data: oip, error: oipErr } = await sb
      .from("oips").select("id, tenant_id").eq("id", oipId).maybeSingle();
    if (oipErr) { console.error("entity-briefing: oip lookup failed:", oipErr); return json({ error: "lookup failed" }, 500); }
    if (!oip) return json({ error: "not found" }, 404);

    const [{ data: member }, { data: admin }] = await Promise.all([
      sb.from("tenant_members").select("user_id")
        .eq("tenant_id", oip.tenant_id).eq("user_id", callerId).maybeSingle(),
      sb.from("platform_admins").select("user_id").eq("user_id", callerId).maybeSingle(),
    ]);
    if (!member && !admin) return json({ error: "not authorized" }, 403);

    // ── 4. Load signal facts from the DB (never from the client) ────────
    const { data: rows, error: rowsErr } = await sb
      .from("oip_signals")
      .select("signal_id, signal_tier, match_reason, lifecycle_stage, signals(title, meeting_date)")
      .eq("oip_id", oipId)
      .in("signal_id", signalIds);
    if (rowsErr) { console.error("entity-briefing: signals lookup failed:", rowsErr); return json({ error: "lookup failed" }, 500); }

    // Keep the client's ordering (same order the drawer showed), drop unknown ids.
    const byId = new Map((rows ?? []).map((r: any) => [r.signal_id, r]));
    const signals = signalIds.map(id => byId.get(id)).filter(Boolean) as any[];
    if (signals.length === 0) return json({ briefing: "", cached: false, generated_at: null });

    const summaries = signals.slice(0, PROMPT_SIGNALS).map((s, i) =>
      `${i + 1}. [${s.signal_tier}] ${s.signals?.title || ""}\n   ${s.match_reason || ""}`
    ).join("\n");

    const stageSummary = LIFECYCLE_STAGE_ORDER
      .map(stage => ({ stage, n: signals.filter(s => s.lifecycle_stage === stage).length }))
      .filter(g => g.n > 0)
      .map(g => `${g.stage}×${g.n}`)
      .join(", ") || "none staged";
    const unstagedCount = signals.filter(s => !s.lifecycle_stage).length;
    const unstagedNote = unstagedCount > 0 ? ` (${unstagedCount} unstaged)` : "";

    let profileBlock = "No profile on file.";
    try {
      const { data: profileData } = await sb.rpc("get_canonical_profile", { p_oip_id: oipId });
      if (profileData) {
        const desc = profileData.description || "";
        const drivers = (profileData.key_funding_programs || []).join("; ");
        profileBlock = `${desc}\nKey funding/compliance drivers: ${drivers}`;
      }
    } catch (_e) { /* fall through to default profileBlock */ }

    const prompt = `You are a senior BD analyst. Based on these ${signals.length} procurement signals about ${entityName}, write an intelligence briefing.

ORGANIZATION PROFILE:
${profileBlock}

LIFECYCLE STAGE MIX: ${stageSummary}${unstagedNote}

GROUND RULES — do not violate these:
- State only what the signal data directly supports. Never invent a reason for why
  something is absent ("suggesting it's embedded in documents you haven't seen" is a
  guess, not a fact) — either state the absence neutrally, or explain it using the
  profile's compliance drivers if genuinely relevant (see rule below).
- Opportunity is not limited to early lifecycle stages. A board actively bringing items
  forward — at ANY stage — demonstrates real, live activity. Never declare a window
  "closed." A later-stage signal still gets an actionable next step; the action changes
  (request the scope directly), not whether one exists.
- Any signal naming a specific facility AND specific scope matching the profile's focus
  areas is the highest-value output this brief can produce. Always end it with: contact
  the district directly and request the full specification.
- Any signal describing a new standing governance or financing vehicle (authority,
  corporation, master financing structure) always gets exactly two actions: (1) flag for
  ongoing monitoring, (2) recommend requesting vendor-notification-list registration.
- New construction or major renovation items that do NOT name a scope matching the
  profile's compliance drivers are not a gap to speculate about — they are the highest-
  value outreach target. Code-driven requirements are routinely not itemized at board
  level; state that pattern once, factually, then recommend direct outreach to confirm
  applicability and offer scoping help.

SIGNALS:
${summaries}

Write three sections: EXECUTIVE SUMMARY, WHAT'S HAPPENING, WHERE TO ENGAGE.
EXECUTIVE SUMMARY: 2-3 bullets — the single most decision-relevant facts only (total
active dollar value, headline stage mix, count of concrete engagement opportunities below).
No paragraph.
WHAT'S HAPPENING: one bullet per distinct fact — stage counts, dollar figures, named
facilities, financing vehicles. Use as many bullets as there are real facts. Do not
compress into a paragraph and do not cap at 3.
WHERE TO ENGAGE: one bullet per actionable item, each ending in a concrete
instruction, ordered by concreteness (named facility + named scope first). Use as many
bullets as there are real actionable items. Do not cap at 3.
Every bullet is one line, specific, no filler — but not a teaser either, since
there is no paragraph after it to supply the missing detail. No paragraphs anywhere
in this brief; bullets carry the full content.

Format: plain text, section headers in caps followed by a colon, bullets prefixed
with •. No markdown, no word-count padding, no filler bullets to hit a count.`;

    // ── 5. Cache check ─────────────────────────────────────────────────
    const fp = await sha256(MODEL + "\n" + prompt);
    const { data: cached } = await sb
      .from("entity_briefings")
      .select("briefing, signal_fp, generated_at")
      .eq("oip_id", oipId).eq("entity_key", entityKey)
      .maybeSingle();

    if (cached) {
      const ageSec = (Date.now() - new Date(cached.generated_at).getTime()) / 1000;
      const unchanged = cached.signal_fp === fp;
      if ((unchanged && !force) || (force && ageSec < FORCE_COOLDOWN_SECONDS)) {
        return json({ briefing: cached.briefing, cached: true, generated_at: cached.generated_at });
      }
    }

    // ── 6. Generate (fixed model, fixed cap) ───────────────────────────
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      console.error("entity-briefing: Anthropic error", res.status, (await res.text()).slice(0, 300));
      if (cached) return json({ briefing: cached.briefing, cached: true, generated_at: cached.generated_at, stale: true });
      return json({ error: "generation failed" }, 502);
    }

    const data = await res.json();
    const briefing = (data.content ?? [])
      .filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
    if (!briefing) return json({ error: "empty response" }, 502);

    const truncated = data.stop_reason === "max_tokens";
    if (truncated) {
      await warnAdminTruncated({
        oip_id:        oipId,
        entity_name:   entityName,
        entity_key:    entityKey,
        signals:       signals.length,
        output_tokens: data.usage?.output_tokens,
        requested_by:  callerId,
      });
    }

    const generatedAt = new Date().toISOString();
    const { error: upErr } = await sb.from("entity_briefings").upsert({
      oip_id:        oipId,
      entity_key:    entityKey,
      signal_fp:     fp,
      briefing,
      model:         MODEL,
      input_tokens:  data.usage?.input_tokens ?? null,
      output_tokens: data.usage?.output_tokens ?? null,
      truncated,
      generated_by:  callerId,
      generated_at:  generatedAt,
    }, { onConflict: "oip_id,entity_key" });
    if (upErr) console.error("entity-briefing: cache write failed:", upErr);

    return json({ briefing, cached: false, generated_at: generatedAt });
  } catch (err) {
    console.error("entity-briefing: unhandled", err);
    return json({ error: "internal error" }, 500);
  }
});
