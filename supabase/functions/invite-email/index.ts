// supabase/functions/invite-email/index.ts
//
// Sends a tenant-invitation email via Resend.
//
// Invocation: from the frontend after create_tenant_invite RPC returns an
// invite id, the frontend calls supabase.functions.invoke('invite-email',
// { body: { invite_id } }). This function fetches the invite, generates
// a magic-link reset URL using Supabase admin auth, and emails it via
// Resend.
//
// Required env (set in Supabase dashboard → Edge Functions → Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-set)
//   RESEND_API_KEY
//   OPS_EMAIL_FROM   e.g. "WinQuest OIP <invites@biq-i.com>"
//   APP_URL          e.g. "https://oip.biq-i.com"
//
// Deploy: supabase functions deploy invite-email --no-verify-jwt=false

// @ts-ignore: Deno types
import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
// @ts-ignore: Deno types
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0"

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const RESEND_API_KEY            = Deno.env.get("RESEND_API_KEY")!
const OPS_EMAIL_FROM            = Deno.env.get("OPS_EMAIL_FROM") || "WinQuest OIP <invites@biq-i.com>"
const APP_URL                   = Deno.env.get("APP_URL") || "http://localhost:5173"

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  try {
    const { invite_id } = await req.json()
    if (!invite_id) throw new Error("missing invite_id")

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Fetch invite + tenant
    const { data: invite, error: invErr } = await sb
      .from("tenant_invites")
      .select("id, tenant_id, email, role, token, expires_at, tenants:tenant_id(name)")
      .eq("id", invite_id)
      .single()
    if (invErr || !invite) throw new Error(`invite not found: ${invErr?.message}`)
    if (invite.accepted_at) throw new Error("invite already accepted")

    // Generate a magic link for the invitee. The link will sign them in
    // and redirect to /accept-invite?token=... where they finish setup.
    const { data: linkRes, error: linkErr } = await sb.auth.admin.generateLink({
      type:    "magiclink",
      email:   invite.email,
      options: { redirectTo: `${APP_URL}/accept-invite?token=${encodeURIComponent(invite.token)}` },
    })
    if (linkErr) throw new Error(`magic link gen failed: ${linkErr.message}`)
    const actionUrl = linkRes?.properties?.action_link
    if (!actionUrl) throw new Error("no action_link returned")

    const tenantName = (invite.tenants as any)?.name || "your team"
    const subject    = `You're invited to ${tenantName} on WinQuest OIP`
    const expiresStr = new Date(invite.expires_at).toLocaleDateString("en-US",
      { weekday: "long", month: "short", day: "numeric" })

    const text = [
      `You've been invited to join ${tenantName} on WinQuest OIP as a ${invite.role}.`,
      ``,
      `Click the link below to set up your account:`,
      actionUrl,
      ``,
      `This invitation expires on ${expiresStr}.`,
      ``,
      `If you weren't expecting this email, you can ignore it.`,
    ].join("\n")

    const html = `<!doctype html><html><body style="font-family:-apple-system,sans-serif;color:#1f2329;max-width:560px;margin:40px auto;padding:0 20px;">
      <div style="border-bottom:1px solid #c9c5b8;padding-bottom:12px;margin-bottom:24px;">
        <strong style="font-size:18px;">WinQuest OIP</strong>
      </div>
      <h1 style="font-family:Georgia,serif;font-size:24px;margin-bottom:16px;color:#0a0c10;">You're invited to ${tenantName}</h1>
      <p style="line-height:1.5;font-size:15px;color:#3a3f48;">
        You've been invited to join <strong>${tenantName}</strong> on WinQuest OIP as a <strong>${invite.role}</strong>.
      </p>
      <p style="margin:32px 0;">
        <a href="${actionUrl}" style="display:inline-block;background:#4580F8;color:white;padding:12px 24px;border-radius:3px;font-weight:600;text-decoration:none;">
          Set up your account →
        </a>
      </p>
      <p style="font-size:13px;color:#6b7280;line-height:1.5;">
        This invitation expires on ${expiresStr}.<br>
        If you weren't expecting this email, you can ignore it.
      </p>
    </body></html>`

    // Send via Resend
    const r = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    OPS_EMAIL_FROM,
        to:      [invite.email],
        subject,
        text,
        html,
      }),
    })
    if (!r.ok) {
      const errBody = await r.text()
      throw new Error(`resend rejected: ${r.status} ${errBody}`)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "content-type": "application/json" },
    })
  } catch (e) {
    console.error("invite-email error:", e)
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...cors, "content-type": "application/json" },
    })
  }
})
