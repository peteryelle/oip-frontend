// supabase/functions/find-signal-contact/index.ts

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
// New secret key first; legacy service_role only as a fallback until legacy keys are disabled.
const SERVICE_KEY  = Deno.env.get("WQ_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

// ── Caller check ─────────────────────────────────────────────────────────────
// Allowed: the server's own key (worker/admin scripts), or a signed-in user who
// is a tenant_members row for the OIP's tenant (or a platform admin) AND the
// signal is actually in that OIP (an oip_signals row). The public anon key
// carries no user id, so it is rejected. Returns null when allowed.
const SERVER_KEYS = [
  Deno.env.get("WQ_SECRET_KEY"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
].filter((k): k is string => !!k);

async function authorizeCaller(
  req: Request, sb: ReturnType<typeof createClient>, oipId: string, signalId: string,
  respond: (body: unknown, status: number) => Response,
): Promise<Response | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return respond({ error: "unauthorized" }, 401);
  if (SERVER_KEYS.includes(token)) return null;

  const { data: claimsData, error: claimsErr } = await sb.auth.getClaims(token);
  const uid = claimsData?.claims?.sub as string | undefined;
  if (claimsErr || !uid) return respond({ error: "unauthorized" }, 401);

  const { data: own } = await sb.from("oips").select("tenant_id").eq("id", oipId).maybeSingle();
  if (!own) return respond({ error: "oip not found" }, 404);

  const [{ data: mem }, { data: adm }, { data: link }] = await Promise.all([
    sb.from("tenant_members").select("user_id").eq("user_id", uid).eq("tenant_id", own.tenant_id).limit(1),
    sb.from("platform_admins").select("user_id").eq("user_id", uid).limit(1),
    sb.from("oip_signals").select("signal_id").eq("oip_id", oipId).eq("signal_id", signalId).limit(1),
  ]);
  if (!(mem ?? []).length && !(adm ?? []).length) return respond({ error: "forbidden" }, 403);
  if (!(link ?? []).length) return respond({ error: "signal not in this OIP" }, 403);
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  try {
    const { signal_id, oip_id } = await req.json();
    if (!signal_id || !oip_id) {
      return new Response(
        JSON.stringify({ error: "signal_id and oip_id required" }),
        { status: 400, headers: JSON_HEADERS },
      );
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const denied = await authorizeCaller(req, sb, String(oip_id), String(signal_id), respond);
    if (denied) return denied;

    // Check cache — only for named contacts (inferred are always re-derived)
    const { data: cached } = await sb
      .from("signal_contacts")
      .select("*")
      .eq("signal_id", signal_id)
      .eq("oip_id", oip_id)
      .eq("contact_mode", "named")
      .eq("enrichment_status", "enriched");

    if (cached?.length) {
      return new Response(
        JSON.stringify({ contacts: cached, mode: "cached" }),
        { headers: JSON_HEADERS },
      );
    }

    // Load signal
    const { data: signal } = await sb
      .from("signals")
      .select("source_name, state, vertical_data, title")
      .eq("id", signal_id)
      .single();

    if (!signal) {
      return new Response(
        JSON.stringify({ error: "signal not found" }),
        { status: 404, headers: JSON_HEADERS },
      );
    }

    const vertical_data = signal.vertical_data ?? {};
    const named_contact = vertical_data.contact ?? null;
    const entity_name   = signal.source_name ?? signal.title ?? "";

    // Load OIP trigger map for ideal_contact_title
    const { data: profile } = await sb
      .from("profiles")
      .select("signal_intelligence")
      .eq("oip_id", oip_id)
      .eq("is_active", true)
      .single();

    const top_triggers =
      profile?.signal_intelligence?.enterprise_trigger_profile?.top_triggers ?? [];
    const best_trigger    = top_triggers[0] ?? null;
    const ideal_title     = best_trigger?.ideal_contact_title ?? "Finance Director";
    const trigger_type    = best_trigger?.type ?? null;
    const buying_window   = best_trigger?.buying_window_days ?? null;
    const finding_pattern = best_trigger?.key_finding_pattern ?? null;

    let contacts: Record<string, unknown>[] = [];
    let mode: string;

    if (named_contact?.name) {
      // Named — contact is in the signal, write to cache
      mode = "named";
      const contact = {
        signal_id,
        oip_id,
        contact_mode:      "named",
        full_name:         named_contact.name,
        title:             named_contact.title ?? null,
        email:             named_contact.email ?? null,
        phone:             named_contact.phone ?? null,
        linkedin_url:      null,
        source:            named_contact.source ?? "signal",
        confidence:        "named",
        enrichment_status: "enriched",
        enriched_at:       new Date().toISOString(),
      };
      // Safe to upsert — full_name is not null
      await sb.from("signal_contacts")
        .upsert([contact], { onConflict: "signal_id,oip_id,full_name" });
      contacts = [contact];
    } else {
      // Inferred — derive from trigger map, do NOT write to DB
      mode = "inferred";
      contacts = [{
        contact_mode:      "inferred",
        full_name:         null,
        title:             ideal_title,
        email:             null,
        phone:             null,
        linkedin_url:      null,
        source:            "trigger_map",
        confidence:        "inferred",
        enrichment_status: "pending",
        enriched_at:       null,
        raw_data: {
          entity_name,
          trigger_type,
          ideal_contact_title: ideal_title,
          buying_window_days:  buying_window,
          key_finding_pattern: finding_pattern,
          note:                "Enrich via Vibe Prospecting to get name and email",
        },
      }];
    }

    return new Response(
      JSON.stringify({ contacts, mode }),
      { headers: JSON_HEADERS },
    );

  } catch (err) {
    console.error("find-signal-contact error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: JSON_HEADERS },
    );
  }
});
