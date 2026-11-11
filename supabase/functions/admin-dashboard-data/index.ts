// supabase/functions/admin-dashboard-data/index.ts
//
// Returns the cross-tenant owner-dashboard rollup (every tenant, every
// OIP, entity-level score distribution, latest score job status).
//
// This is the ONLY place admin_dashboard_rollup() should ever be called
// from -- that RPC is SECURITY DEFINER and bypasses RLS by design, so
// the auth check below is the real security boundary, not a formality.
// The RPC itself has anon/authenticated EXECUTE revoked at the DB level.
//
// Auth flow:
//   1. Extract the caller's JWT from the Authorization header.
//   2. Verify it with auth.getClaims(jwt). With the project's ES256
//      (asymmetric) signing keys this checks the signature locally
//      against the project's public JWKS -- it does NOT depend on any
//      API key being valid. (The previous version used auth.getUser(jwt),
//      which round-trips to the Auth server authenticated by the
//      service key; when that key was rejected, every valid session
//      came back as "invalid or expired session".)
//   3. Check platform_admins for the token's sub (user id). Reject with
//      403 if absent -- BEFORE any tenant data is touched.
//   4. Only then call admin_dashboard_rollup() with the server key.
//
// Server key: prefers SB_SECRET_KEY (new-style sb_secret_... key, set
// via `supabase secrets set`), falls back to the auto-injected legacy
// SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVER_KEY =
  Deno.env.get("SB_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const KEY_SOURCE = Deno.env.get("SB_SECRET_KEY")
  ? "SB_SECRET_KEY"
  : "SUPABASE_SERVICE_ROLE_KEY";

// Must include apikey and x-client-info: supabase-js attaches them to
// every functions.invoke(), and omitting them makes the browser block
// the real POST after a successful-looking preflight.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "missing Authorization header" }, 401);
    }
    const jwt = authHeader.replace(/^Bearer\s+/i, "");

    if (!SUPABASE_URL || !SERVER_KEY) {
      console.error("admin-dashboard-data: missing SUPABASE_URL or server key");
      return json({ error: "server misconfigured" }, 500);
    }

    const sb = createClient(SUPABASE_URL, SERVER_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Step 1: verify the caller's JWT signature and read its claims.
    const { data: claimsData, error: claimsErr } = await sb.auth.getClaims(jwt);
    const callerId = claimsData?.claims?.sub as string | undefined;
    if (claimsErr || !callerId) {
      console.error("admin-dashboard-data: JWT verification failed:", claimsErr);
      return json({ error: "invalid or expired session" }, 401);
    }

    // Step 2: allowlist check -- the actual authorization boundary.
    const { data: adminRow, error: adminErr } = await sb
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", callerId)
      .maybeSingle();

    if (adminErr) {
      console.error(
        `admin-dashboard-data: platform_admins lookup failed (key: ${KEY_SOURCE}):`,
        adminErr,
      );
      return json({ error: "authorization check failed", key_source: KEY_SOURCE }, 500);
    }
    if (!adminRow) {
      return json({ error: "not authorized" }, 403);
    }

    // Step 3: confirmed admin -- fetch the cross-tenant rollup.
    const { data: rollup, error: rpcErr } = await sb.rpc("admin_dashboard_rollup");
    if (rpcErr) {
      console.error(
        `admin-dashboard-data: rollup RPC failed (key: ${KEY_SOURCE}):`,
        rpcErr,
      );
      return json({ error: "failed to load dashboard data" }, 500);
    }

    return json(rollup);

  } catch (err) {
    console.error("admin-dashboard-data error:", err);
    return json({ error: String(err) }, 500);
  }
});
