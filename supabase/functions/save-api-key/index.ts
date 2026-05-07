// =============================================================================
// save-api-key — Supabase Edge Function (Deno)
// =============================================================================
// Receives a tenant's API key for a given vertical, encrypts it via pgcrypto,
// and upserts a row in tenant_api_keys.
//
// Request (POST, authenticated):
//   { "vertical_slug": "sam", "key": "SAM-87df..." }
//
// Response:
//   { "hint": "SAM-87df...acd", "expires_at": "2026-08-05T..." }
//   Never echoes the plaintext key back.
//
// Called by: /settings Integrations UI in App.jsx
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Days until expiry per vertical — extend this map as new verticals are added
const EXPIRY_DAYS: Record<string, number> = {
  sam: 90,
};

function maskKey(key: string): string {
  // Returns e.g. "SAM-87df...acd" — first 8 chars + last 3
  const clean = key.trim();
  if (clean.length <= 11) return clean; // too short to mask meaningfully
  return `${clean.slice(0, 8)}...${clean.slice(-3)}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    // ------------------------------------------------------------------
    // 1. Parse and validate request body
    // ------------------------------------------------------------------
    const { vertical_slug, key } = await req.json();

    if (!vertical_slug || typeof vertical_slug !== "string") {
      return new Response(JSON.stringify({ error: "vertical_slug is required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!key || typeof key !== "string" || key.trim().length < 10) {
      return new Response(JSON.stringify({ error: "key is required and must be at least 10 characters" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const trimmedKey = key.trim();

    // ------------------------------------------------------------------
    // 2. Authenticate caller — extract tenant_id from JWT
    // ------------------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // User client — respects RLS, used to resolve tenant_id
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Service client — bypasses RLS, used for the privileged upsert
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Resolve the calling user's tenant and role
    const { data: memberRows, error: memberErr } = await userClient
      .from("tenant_members")
      .select("tenant_id, role")
      .in("role", ["owner", "admin"])
      .limit(1)
      .single();

    if (memberErr || !memberRows) {
      return new Response(JSON.stringify({ error: "Not authorized — owner or admin role required" }), {
        status: 403,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { tenant_id, role: _role } = memberRows;

    // ------------------------------------------------------------------
    // 3. Resolve vertical_id from slug
    // ------------------------------------------------------------------
    const { data: vertical, error: verticalErr } = await serviceClient
      .from("verticals")
      .select("id")
      .eq("slug", vertical_slug)
      .single();

    if (verticalErr || !vertical) {
      return new Response(JSON.stringify({ error: `Unknown vertical: ${vertical_slug}` }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const vertical_id = vertical.id;

    // ------------------------------------------------------------------
    // 4. Encrypt the key via pgcrypto (encrypt_api_key SQL function)
    // ------------------------------------------------------------------
    const encryptionKey = Deno.env.get("OIP_ENCRYPTION_KEY");
    if (!encryptionKey) {
      console.error("OIP_ENCRYPTION_KEY secret is not set");
      return new Response(JSON.stringify({ error: "Encryption not configured" }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: encryptResult, error: encryptErr } = await serviceClient
      .rpc("encrypt_api_key", { plaintext: trimmedKey, passphrase: encryptionKey });

    if (encryptErr || !encryptResult) {
      console.error("encrypt_api_key failed:", encryptErr);
      return new Response(JSON.stringify({ error: "Encryption failed" }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const key_encrypted = encryptResult as string;

    // ------------------------------------------------------------------
    // 5. Build hint and expiry
    // ------------------------------------------------------------------
    const key_hint = maskKey(trimmedKey);
    const expiryDays = EXPIRY_DAYS[vertical_slug] ?? 365;
    const expires_at = addDays(new Date(), expiryDays).toISOString();

    // ------------------------------------------------------------------
    // 6. Upsert tenant_api_keys
    //    ON CONFLICT (tenant_id, vertical_id) → replace the existing key
    // ------------------------------------------------------------------
    const { error: upsertErr } = await serviceClient
      .from("tenant_api_keys")
      .upsert(
        { tenant_id, vertical_id, key_encrypted, key_hint, expires_at, updated_at: new Date().toISOString() },
        { onConflict: "tenant_id,vertical_id" }
      );

    if (upsertErr) {
      console.error("upsert failed:", upsertErr);
      return new Response(JSON.stringify({ error: "Failed to save key" }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ------------------------------------------------------------------
    // 7. Return hint + expiry only — never the plaintext key
    // ------------------------------------------------------------------
    return new Response(
      JSON.stringify({ hint: key_hint, expires_at }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
