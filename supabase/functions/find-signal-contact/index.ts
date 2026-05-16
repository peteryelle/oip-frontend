// supabase/functions/find-signal-contact/index.ts

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }

  try {
    const { signal_id, oip_id } = await req.json();
    if (!signal_id || !oip_id) {
      return new Response(
        JSON.stringify({ error: "signal_id and oip_id required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

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
        { headers: { "Content-Type": "application/json" } },
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
        { status: 404, headers: { "Content-Type": "application/json" } },
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
      { headers: { "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("find-signal-contact error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
