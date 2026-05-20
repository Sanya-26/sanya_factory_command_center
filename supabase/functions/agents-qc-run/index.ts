// Edge function: agents-qc-run
// Trigger: HTTP POST { company_id }. Generates an audit checklist tailored to
//          this account's niche + features and persists it in audit_checklists.
//          Marks any existing checklist for this company as is_current=false.

import { admin } from "../_shared/supabase.ts";
import { complete } from "../_shared/llm.ts";

interface ChecklistItem {
  id: string;
  label: string;
  expected: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const { company_id } = await req.json();
  if (!company_id) return new Response("missing company_id", { status: 400 });

  const sb = admin();
  const { data: company } = await sb
    .from("companies")
    .select("id, name, niche, products")
    .eq("id", company_id)
    .maybeSingle();
  if (!company) return new Response("company not found", { status: 404 });

  const { data: niche } = await sb
    .from("niche_templates")
    .select("template, completeness_checklist")
    .eq("niche_slug", (company as { niche: string | null }).niche ?? "")
    .maybeSingle();

  const llm = await complete({
    system:
      "You are a QA engineer. Produce a JSON array of audit checklist items for a human tester to run against a freshly deployed CLEO tenant. Each item: {id, label, expected}. 10-15 items, specific to the niche and the customer's features. JSON only.",
    user: `Company: ${JSON.stringify(company).slice(0, 1200)}\n\nNiche template: ${JSON.stringify(niche ?? {}).slice(0, 1500)}`,
    max_tokens: 2048,
  });

  // Try to parse JSON out of the LLM response.
  let items: ChecklistItem[] = [];
  try {
    const m = llm.text.match(/\[[\s\S]*\]/);
    if (m) items = JSON.parse(m[0]);
  } catch {/* fall through */}
  if (items.length === 0) {
    items = [
      { id: "smoke-home", label: "Home page loads without errors", expected: "200 + branded layout" },
      { id: "smoke-signup", label: "Customer signup flow works", expected: "Lands on /onboarding" },
      { id: "smoke-checkout", label: "Checkout flow completes", expected: "Order confirmation" },
    ];
  }
  // Add stable ids and pending status
  items = items.map((it, i) => ({
    ...it,
    id: it.id ?? `chk-${i}`,
  }));

  // Mark old checklists as not current
  await sb.from("audit_checklists").update({ is_current: false }).eq("company_id", company_id);
  const { data: inserted, error } = await sb.from("audit_checklists").insert({
    company_id,
    items: items.map((it) => ({ ...it, status: "pending" })),
    generated_by: `qc_agent:${llm.provider}`,
    is_current: true,
  }).select("id").single();
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  return new Response(JSON.stringify({ ok: true, checklist_id: inserted?.id, item_count: items.length, provider: llm.provider }), {
    headers: { "content-type": "application/json" },
  });
});
