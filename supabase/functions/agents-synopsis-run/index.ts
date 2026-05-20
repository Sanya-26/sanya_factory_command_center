// Edge function: agents-synopsis-run
// Trigger: HTTP POST { company_id } or DB webhook on onboarding_canvas_states
//          status='complete'. Generates a markdown synopsis from the canvas
//          and notifies the product_manager.

import { admin } from "../_shared/supabase.ts";
import { complete } from "../_shared/llm.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const { company_id } = await req.json();
  if (!company_id) return new Response("missing company_id", { status: 400 });

  const sb = admin();
  const { data: company } = await sb.from("companies").select("id, name, niche").eq("id", company_id).maybeSingle();
  if (!company) return new Response("company not found", { status: 404 });

  const { data: canvas } = await sb
    .from("onboarding_canvas_states")
    .select("canvas")
    .eq("company_id", company_id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const canvasJson = canvas?.canvas ?? {};

  const llm = await complete({
    system:
      "You are a concise business analyst. Read the customer's onboarding canvas and produce a one-page synopsis: what their business is, the before-state, the proposed after-state with CLEO, and 3 key opportunities. Markdown only. ~300 words max.",
    user: `Company: ${(company as { name: string }).name}\nNiche: ${(company as { niche: string | null }).niche ?? "unknown"}\n\nCanvas JSON:\n${JSON.stringify(canvasJson).slice(0, 8000)}`,
    max_tokens: 1024,
  });

  // Persist synopsis as a proposal_artifacts row (kind='synopsis').
  const storagePath = `synopsis/${company_id}/${Date.now()}.md`;
  await sb.from("proposal_artifacts").insert({
    company_id,
    kind: "synopsis",
    version: 1,
    storage_path: storagePath,
    generated_by: `synopsis_agent:${llm.provider}`,
  });

  // Find a product_manager to notify.
  const { data: pm } = await sb
    .from("ops_users")
    .select("user_id")
    .eq("role", "product_manager")
    .limit(1)
    .maybeSingle();
  if (pm) {
    await sb.from("notifications").insert({
      recipient_user_id: (pm as { user_id: string }).user_id,
      kind: "map-ready",
      severity: "info",
      title: `Map ready for ${(company as { name: string }).name}`,
      body: llm.text.slice(0, 500),
      related_company_id: company_id,
    });
  }

  return new Response(JSON.stringify({ ok: true, synopsis_preview: llm.text.slice(0, 200), provider: llm.provider }), {
    headers: { "content-type": "application/json" },
  });
});
