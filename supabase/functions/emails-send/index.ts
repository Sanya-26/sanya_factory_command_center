// Edge function: emails-send
// Picks up outbound_emails rows with status='queued' and dispatches them via
// the configured provider. Provider TBD; falls back to "stub" which only
// records sent_at + provider='stub' without making an external call.
//
// Trigger options:
//   - HTTP POST { row_id } to send a specific row
//   - HTTP POST {} or scheduled invocation to drain the queue (LIMIT 25)

import { admin } from "../_shared/supabase.ts";

const PROVIDER = (Deno.env.get("EMAIL_PROVIDER") ?? "stub").toLowerCase();
const FROM_ADDR = Deno.env.get("EMAIL_FROM") ?? "noreply@aubos.local";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  let body: { row_id?: string } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const sb = admin();

  let q = sb.from("outbound_emails").select("*").eq("status", "queued").limit(25);
  if (body.row_id) q = sb.from("outbound_emails").select("*").eq("id", body.row_id);
  const { data, error } = await q;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const results: Array<{ id: string; status: string; provider: string; error?: string }> = [];
  for (const row of data ?? []) {
    const r = await sendOne(row as EmailRow);
    await sb.from("outbound_emails")
      .update({
        status: r.status,
        provider: r.provider,
        provider_message_id: r.provider_message_id ?? null,
        error: r.error ?? null,
        sent_at: r.status === "sent" ? new Date().toISOString() : null,
      })
      .eq("id", (row as EmailRow).id);
    results.push({ id: (row as EmailRow).id, status: r.status, provider: r.provider, error: r.error });
  }
  return new Response(JSON.stringify({ results }), {
    headers: { "content-type": "application/json" },
  });
});

interface EmailRow {
  id: string;
  recipient_email: string;
  template: string;
  payload: Record<string, unknown>;
}

interface SendResult {
  status: "sent" | "failed";
  provider: string;
  provider_message_id?: string;
  error?: string;
}

async function sendOne(row: EmailRow): Promise<SendResult> {
  const subject = subjectFor(row.template, row.payload);
  const body = bodyFor(row.template, row.payload);
  if (PROVIDER === "resend") {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return { status: "failed", provider: "resend", error: "RESEND_API_KEY missing" };
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDR, to: row.recipient_email, subject, text: body }),
    });
    if (!res.ok) return { status: "failed", provider: "resend", error: await res.text() };
    const json = await res.json();
    return { status: "sent", provider: "resend", provider_message_id: json.id };
  }
  // Stub provider — just records "sent" without external call.
  return { status: "sent", provider: "stub", provider_message_id: `stub-${row.id}` };
}

function subjectFor(template: string, payload: Record<string, unknown>): string {
  switch (template) {
    case "schedule_call": return "Let's schedule your CLEO onboarding call";
    case "proposal_send": return `Your proposal — ${payload.company_name ?? "AUBOS"}`;
    case "contract_send": return `Your contract — ${payload.company_name ?? "AUBOS"}`;
    case "credentials_send": return `Your account credentials — ${payload.company_name ?? "AUBOS"}`;
    case "audit_invite": return "Test invitation — your CLEO tenant is ready for review";
    default: return `AUBOS · ${template}`;
  }
}

function bodyFor(template: string, payload: Record<string, unknown>): string {
  switch (template) {
    case "schedule_call": return `Hi,\n\nReady to schedule your onboarding call.\n\nPick a time: ${payload.calendar_url ?? "[calendar url]"}\n\n— AUBOS`;
    case "proposal_send": return `Hi,\n\nYour personalized proposal is attached.\n\n${payload.proposal_url ?? ""}\n\n— AUBOS`;
    case "contract_send": return `Hi,\n\nPlease review and sign the contract: ${payload.contract_url ?? "[signature url]"}\n\n— AUBOS`;
    case "credentials_send": return `Hi,\n\nYour account credentials are below. Keep them secure.\n\n${payload.credentials_text ?? ""}\n\n— AUBOS`;
    case "audit_invite": return `Hi,\n\nYour CLEO tenant is ready: ${payload.tenant_url ?? ""}\n\n— AUBOS`;
    default: return JSON.stringify(payload, null, 2);
  }
}
