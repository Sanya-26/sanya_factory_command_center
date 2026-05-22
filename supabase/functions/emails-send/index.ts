// Edge function: emails-send
// Picks up outbound_emails rows with status='queued' and dispatches them.
// Supports three providers (selected via EMAIL_PROVIDER env var):
//   - "aubosmail" — in-house AUBOSmail platform. Default.
//                   Required secrets: AUBOSMAIL_API_KEY, AUBOSMAIL_BASE_URL
//                   (default https://mail.aubos.ai), AUBOSMAIL_FROM_ADDRESS
//                   (must be a verified domain on the tenant — verify via
//                   GET /v1/domains).
//                   The /v1/send contract (verified against the live API on
//                   2026-05-22 Phase 8) requires:
//                     recipient_email, subject, message_type, from_address,
//                     sender_name. document is the BlockDocument shape:
//                     { version:1, blocks:[{id, type:'text', markdown}] }
//   - "resend"    — Resend.com fallback (RESEND_API_KEY required)
//   - "stub"      — no external call; marks rows sent for local testing
//
// Trigger options:
//   - HTTP POST { row_id } to send a specific row
//   - HTTP POST {} or scheduled invocation to drain the queue (LIMIT 25)
//
// Per PRD §8.1 every send keeps a row in outbound_emails (audit trail).
// This function INSERTs the row IF a direct send is requested via
// { row_id: 'inline', to, template, payload } — otherwise it just drains
// the existing queue.
//
// replyTo / threadKey: the AUBOSmail SendRequest schema (apps/api/routes/send.py)
// has no field for either. They're accepted on the outbound_emails row for
// audit but not forwarded to AUBOSmail. Logged as a follow-up if/when needed.

import { admin } from "../_shared/supabase.ts";

const PROVIDER = (Deno.env.get("EMAIL_PROVIDER") ?? "aubosmail").toLowerCase();
const FROM_ADDR = Deno.env.get("AUBOSMAIL_FROM_ADDRESS")
  ?? Deno.env.get("EMAIL_FROM")
  ?? "hello@mail.aubos.ai";
const SENDER_NAME = Deno.env.get("AUBOSMAIL_SENDER_NAME") ?? "AUBOSmail";
// AUBOSMAIL_BASE_URL is the canonical env name (Phase 8). AUBOSMAIL_API_BASE
// is the legacy name from Phase 6 — kept for back-compat with any prior set.
const AUBOSMAIL_BASE = (
  Deno.env.get("AUBOSMAIL_BASE_URL")
  ?? Deno.env.get("AUBOSMAIL_API_BASE")
  ?? "https://mail.aubos.ai"
).replace(/\/$/, "");

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
  const preheader = preheaderFor(row.template, row.payload);
  const markdown = bodyFor(row.template, row.payload);

  if (PROVIDER === "aubosmail") {
    const key = Deno.env.get("AUBOSMAIL_API_KEY");
    if (!key) return { status: "failed", provider: "aubosmail", error: "AUBOSMAIL_API_KEY missing — set via supabase secrets set" };

    // Minimal BlockDocument: one text block holding the markdown body.
    // Matches packages/schemas/blocks.py BlockDocument(version=1, blocks=[TextBlock(...)])
    const document = {
      version: 1,
      blocks: [
        { id: "body", type: "text", markdown },
      ],
      merge_keys: [],
    };

    const sendBody: Record<string, unknown> = {
      recipient_email: row.recipient_email,
      subject,
      message_type: "transactional",
      from_address: FROM_ADDR,
      sender_name: SENDER_NAME,
      document,
    };
    if (preheader) sendBody.preheader = preheader;

    const res = await fetch(`${AUBOSMAIL_BASE}/v1/send`, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(sendBody),
    });
    if (!res.ok) {
      let errText = await res.text();
      if (errText.length > 600) errText = errText.slice(0, 600) + "…";
      return { status: "failed", provider: "aubosmail", error: `HTTP ${res.status}: ${errText}` };
    }
    let json: { ok?: boolean; send_id?: string; proof_url?: string } = {};
    try { json = await res.json(); } catch { /* ignore */ }
    return {
      status: "sent",
      provider: "aubosmail",
      provider_message_id: json.send_id ?? `aubosmail-${row.id}`,
    };
  }

  if (PROVIDER === "resend") {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return { status: "failed", provider: "resend", error: "RESEND_API_KEY missing" };
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDR, to: row.recipient_email, subject, text: markdown }),
    });
    if (!res.ok) return { status: "failed", provider: "resend", error: await res.text() };
    const json = await res.json();
    return { status: "sent", provider: "resend", provider_message_id: json.id };
  }

  // Stub provider — just records "sent" without external call.
  return { status: "sent", provider: "stub", provider_message_id: `stub-${row.id}` };
}

function preheaderFor(template: string, payload: Record<string, unknown>): string | null {
  switch (template) {
    case "schedule_call":         return "Quick onboarding call — pick a time that works for you.";
    case "schedule_call_offer":   return `Agenda: ${String(payload.agenda ?? "CLEO walkthrough")}.`;
    case "schedule_call_confirm": return "Confirmed — join link inside.";
    case "proposal_send":         return `Personalized proposal for ${String(payload.company_name ?? "your team")}.`;
    case "contract_send":         return "Review + sign when ready.";
    case "credentials_send":      return "Your login details — keep them safe.";
    case "audit_invite":          return "Walk through your CLEO tenant before launch.";
    default:                      return null;
  }
}

function subjectFor(template: string, payload: Record<string, unknown>): string {
  switch (template) {
    case "schedule_call":          return "Let's schedule your CLEO onboarding call";
    case "schedule_call_offer":    return "Pick a time for your CLEO walkthrough";
    case "schedule_call_confirm":  return `Your CLEO call is confirmed — ${payload.company_name ?? ""}`;
    case "proposal_send":          return `Your proposal — ${payload.company_name ?? "AUBOS"}`;
    case "contract_send":          return `Your contract — ${payload.company_name ?? "AUBOS"}`;
    case "credentials_send":       return `Your account credentials — ${payload.company_name ?? "AUBOS"}`;
    case "audit_invite":           return "Test invitation — your CLEO tenant is ready for review";
    default:                       return `AUBOS · ${template}`;
  }
}

function bodyFor(template: string, payload: Record<string, unknown>): string {
  // Markdown body. aubosmail's text block renders via markdown-it-py.
  switch (template) {
    case "schedule_call":
      return `Hi,\n\nReady to schedule your onboarding call.\n\nPick a time: ${payload.calendar_url ?? "[calendar url]"}\n\n— AUBOS`;
    case "schedule_call_offer":
      return `Hi,\n\nLet's get a quick call on the calendar.\n\nPick a slot here: ${payload.picker_url ?? "[picker url]"}\n\nAgenda: ${payload.agenda ?? "CLEO onboarding walkthrough"}\n\n— AUBOS`;
    case "schedule_call_confirm":
      return `Hi,\n\nYour call is confirmed.\n\n**When:** ${payload.slot_start ?? "[time]"}\n**Join:** ${payload.meet_url ?? "[meet url]"}\n**Agenda:** ${payload.agenda ?? "CLEO walkthrough"}\n\nSee you then.\n\n— AUBOS`;
    case "proposal_send":
      return `Hi,\n\nYour personalized proposal is attached.\n\n${payload.proposal_url ?? ""}\n\n— AUBOS`;
    case "contract_send":
      return `Hi,\n\nPlease review and sign the contract: ${payload.contract_url ?? "[signature url]"}\n\n— AUBOS`;
    case "credentials_send":
      return `Hi,\n\nYour account credentials are below. Keep them secure.\n\n${payload.credentials_text ?? ""}\n\n— AUBOS`;
    case "audit_invite":
      return `Hi,\n\nYour CLEO tenant is ready: ${payload.tenant_url ?? ""}\n\n— AUBOS`;
    default:
      return "```\n" + JSON.stringify(payload, null, 2) + "\n```";
  }
}
