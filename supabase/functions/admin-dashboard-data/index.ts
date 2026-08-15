// supabase/functions/admin-dashboard-data/index.ts
//
// Returns the cross-tenant owner-dashboard rollup (every tenant, every
// OIP, entity-level score distribution, latest score job status).
//
// This is the ONLY place admin_dashboard_rollup() should ever be called
// from -- that RPC is SECURITY DEFINER and bypasses RLS by design, so
// the auth check below is the real security boundary, not a formality.
// The RPC itself has anon/authenticated EXECUTE revoked at the DB level
// (belt-and-suspenders: even if this check were somehow skipped, a
// direct client call to the RPC would still be rejected by Postgres).
//
// Auth flow:
//   1. Extract the caller's JWT from the Authorization header (the
//      browser's normal Supabase session token -- same one used for
//      every other authenticated request in the app).
//   2. Resolve it to a user via supabase-js's own JWT verification
//      (auth.getUser(jwt) -- works regardless of which key the client
//      was constructed with, since it's just validating the token).
//   3. Check platform_admins for that user_id. Reject with 403 if
//      absent -- this happens BEFORE the service-role client ever
//      touches tenant data.
//   4. Only after that check passes does this call
//      admin_dashboard_rollup() using the service-role key.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Must match supabase-js's actual required header set, not just the
// ones this function reads directly. supabase-js automatically attaches
// apikey and x-client-info to every functions.invoke() call -- omitting
// them here (as the first version did) doesn't cause a server error, it
// causes the BROWSER to silently refuse to send the real request after
// a successful-looking preflight. Confirmed via Edge Function logs: every
// invocation was OPTIONS/200, zero POSTs ever arrived, which is exactly
// this failure mode -- the preflight itself succeeds, but the browser's
// own CORS check then blocks the real request client-side.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "missing Authorization header" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }
    const jwt = authHeader.replace(/^Bearer\s+/i, "");

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // Step 1: resolve the caller's identity from their own session JWT.
    const { data: userData, error: userErr } = await sb.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "invalid or expired session" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }
    const callerId = userData.user.id;

    // Step 2: check the allowlist. This is the actual authorization
    // check -- everything before this point only established WHO is
    // calling, not whether they're allowed to see cross-tenant data.
    const { data: adminRow, error: adminErr } = await sb
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", callerId)
      .maybeSingle();

    if (adminErr) {
      console.error("admin-dashboard-data: platform_admins lookup failed:", adminErr);
      return new Response(
        JSON.stringify({ error: "authorization check failed" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }
    if (!adminRow) {
      // Deliberately vague message -- don't confirm/deny whether the
      // user exists elsewhere in the system, just that this endpoint
      // isn't for them.
      return new Response(
        JSON.stringify({ error: "not authorized" }),
        { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Step 3: caller is confirmed admin. Fetch the real cross-tenant
    // rollup via the service-role-only RPC.
    const { data: rollup, error: rpcErr } = await sb.rpc("admin_dashboard_rollup");
    if (rpcErr) {
      console.error("admin-dashboard-data: rollup RPC failed:", rpcErr);
      return new Response(
        JSON.stringify({ error: "failed to load dashboard data" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify(rollup),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("admin-dashboard-data error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
