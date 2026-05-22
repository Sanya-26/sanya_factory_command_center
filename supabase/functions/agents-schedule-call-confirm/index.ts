// Edge function: agents-schedule-call-confirm
//
// PHASE 9 REFACTOR (2026-05-22): this function is now a thin compatibility
// shim that delegates to calendar-book-slot. All booking logic lives in
// calendar-book-slot/index.ts (the in-house calendar v1).
//
// Why keep the old endpoint at all? Existing callers (the customer-facing
// picker URL at welcome.aubos.ai/pick/<token>, plus any cached frontend
// code) still POST to /functions/v1/agents-schedule-call-confirm. This
// shim preserves that URL and translates the request shape (1:1, since the
// two functions accept the same body) and forwards on.
//
// Deployed with --no-verify-jwt — customers picking slots aren't logged in.
// Security is enforced by calendar-book-slot's own picker_token check.
//
// Backward-compat field translation:
//   • old: { token, slot_index }  →  new: { picker_token, picked_slot_index }
//   • new shape ({ picker_token, picked_slot_index }) is passed through unchanged.

const PROJECT_REF = "jzppqxiprjsuvuyulbyj";
const TARGET_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/calendar-book-slot`;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return new Response("invalid json", { status: 400 }); }

  // Field translation for legacy callers.
  const out: Record<string, unknown> = { ...body };
  if (typeof body.token === "string" && typeof out.picker_token !== "string") {
    out.picker_token = body.token;
    delete out.token;
  }
  if (typeof body.slot_index === "number" && typeof out.picked_slot_index !== "number") {
    out.picked_slot_index = body.slot_index;
    delete out.slot_index;
  }

  // Forward Authorization header if any (so calendar-book-slot can also be
  // called from authenticated clients via this shim).
  const fwdHeaders: Record<string, string> = { "content-type": "application/json" };
  const incomingAuth = req.headers.get("authorization");
  if (incomingAuth) fwdHeaders["authorization"] = incomingAuth;

  const res = await fetch(TARGET_URL, {
    method: "POST",
    headers: fwdHeaders,
    body: JSON.stringify(out),
  });

  // Pass through status + body verbatim.
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
});
