// Edge function: agents-contract-run
// Trigger: HTTP POST { company_id, action: 'create'|'review' }. Produces a
//          contract_drafts row (or reviews an existing one for red-flag clauses).

import { admin } from "../_shared/supabase.ts";
import { complete } from "../_shared/llm.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const { company_id, action } = await req.json();
  if (!company_id) return new Response("missing company_id", { status: 400 });

  const sb = admin();
  const { data: company } = await sb.from("companies").select("*").eq("id", company_id).maybeSingle();
  if (!company) return new Response("company not found", { status: 404 });

  if (action === "review") {
    const { data: existing } = await sb
      .from("contract_drafts")
      .select("*")
      .eq("company_id", company_id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!existing) return new Response("no draft to review", { status: 404 });
    const llm = await complete({
      system: "You are contract review counsel. Read the draft and return a JSON list of red-flag clauses (id, clause_text, severity, suggested_fix). Output JSON only.",
      user: (existing as { contract_md: string }).contract_md ?? "",
      max_tokens: 1024,
    });
    return new Response(JSON.stringify({ ok: true, review: llm.text, provider: llm.provider }), {
      headers: { "content-type": "application/json" },
    });
  }

  // Default action: create
  const { data: niche } = await sb
    .from("niche_templates")
    .select("template")
    .eq("niche_slug", (company as { niche: string | null }).niche ?? "")
    .maybeSingle();
  const llm = await complete({
    system:
      "You are a contract drafter. Produce a markdown SaaS contract draft for the customer. Include: scope, fees, term, IP, confidentiality, warranties, termination. Use neutral US default jurisdiction unless stated. ~800 words.",
    user: `Customer: ${JSON.stringify(company).slice(0, 1500)}\n\nNiche template: ${JSON.stringify(niche ?? {}).slice(0, 1500)}`,
    max_tokens: 3000,
  });

  const { data: inserted, error: insErr } = await sb.from("contract_drafts").insert({
    company_id,
    contract_md: llm.text,
    status: "draft",
    monthly_usd: 0,
    cost_usd: 0,
  }).select("id").single();
  if (insErr) return new Response(JSON.stringify({ error: insErr.message }), { status: 500 });

  return new Response(JSON.stringify({ ok: true, contract_id: inserted?.id, provider: llm.provider }), {
    headers: { "content-type": "application/json" },
  });
});
