// supabase/functions/support-email/index.ts
//
// Reads a support_requests row by id and emails the operator (Peter)
// via Resend. Called by the frontend right after the row is inserted.
//
// Required env (set in Supabase dashboard → Edge Functions → Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-set)
//   RESEND_API_KEY
//   OPS_EMAIL_FROM   e.g. "WinQuest OIP <support@biq-i.com>"
//   OPS_EMAIL_TO     e.g. "peter@biq-i.com"
//
// Deploy: supabase functions deploy support-email

// @ts-ignore: Deno
import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
// @ts-ignore: Deno
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0"

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const RESEND_API_KEY            = Deno.env.get("RESEND_API_KEY")!
const OPS_EMAIL_FROM            = Deno.env.get("OPS_EMAIL_FROM") || "WinQuest OIP <support@biq-i.com>"
const OPS_EMAIL_TO              = Deno.env.get("OPS_EMAIL_TO")   || "peter@biq-i.com"

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  try {
    const { request_id } = await req.json()
    if (!request_id) throw new Error("missing request_id")

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: r, error } = await sb
      .from("support_requests")
      .select("id, user_email, tenant_name, oip_name, page_url, message, created_at")
      .eq("id", request_id)
      .single()
    if (error || !r) throw new Error(`request not found: ${error?.message}`)

    const subject = `[OIP support] ${r.tenant_name || "unknown"} — ${(r.message || "").slice(0, 60)}`

    const text = [
      `New support request from ${r.user_email || "(unknown)"}`,
      ``,
      `Tenant:  ${r.tenant_name || "—"}`,
      `OIP:     ${r.oip_name || "—"}`,
      `Page:    ${r.page_url || "—"}`,
      `Time:    ${r.created_at}`,
      ``,
      `Message:`,
      r.message,
      ``,
      `---`,
      `Reply directly to ${r.user_email}.`,
      `Update status in Supabase: support_requests row id ${r.id}`,
    ].join("\n")

    const html = `<!doctype html><html><body style="font-family:-apple-system,sans-serif;color:#1f2329;max-width:640px;margin:32px auto;padding:0 20px;">
      <div style="border-bottom:1px solid #c9c5b8;padding-bottom:12px;margin-bottom:20px;">
        <strong>WinQuest OIP — Support request</strong>
      </div>

      <table style="border-collapse:collapse;font-size:14px;margin-bottom:20px;">
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">From</td><td style="padding:4px 0;"><a href="mailto:${r.user_email}">${r.user_email || "—"}</a></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Tenant</td><td style="padding:4px 0;"><strong>${r.tenant_name || "—"}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">OIP</td><td style="padding:4px 0;">${r.oip_name || "—"}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Page</td><td style="padding:4px 0;font-family:monospace;font-size:12px;">${r.page_url || "—"}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Time</td><td style="padding:4px 0;font-size:12px;">${r.created_at}</td></tr>
      </table>

      <div style="background:#f7f5ee;border-left:3px solid #4580F8;padding:14px 16px;font-size:14px;line-height:1.55;white-space:pre-wrap;">${escapeHtml(r.message)}</div>

      <p style="font-size:12px;color:#6b7280;margin-top:24px;">
        Request id: <code>${r.id}</code><br>
        Reply directly to ${r.user_email} or update status in Supabase.
      </p>
    </body></html>`

    const send = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:     OPS_EMAIL_FROM,
        to:       [OPS_EMAIL_TO],
        reply_to: r.user_email || undefined,
        subject,
        text,
        html,
      }),
    })
    if (!send.ok) {
      const errBody = await send.text()
      throw new Error(`resend rejected: ${send.status} ${errBody}`)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "content-type": "application/json" },
    })
  } catch (e) {
    console.error("support-email error:", e)
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...cors, "content-type": "application/json" },
    })
  }
})

function escapeHtml(s: string): string {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}
