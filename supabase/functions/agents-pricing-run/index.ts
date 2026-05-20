// Edge function: agents-pricing-run
// Trigger: HTTP POST { company_id }. Generates a financial section for the
//          proposal (MSRP, recurring, ROI projection) based on company,
//          niche template, and cleo_packages price book.

import { admin } from "../_shared/supabase.ts";
import { complete } from "../_shared/llm.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const { company_id } = await req.json();
  if (!company_id) return new Response("missing company_id", { status: 400 });

  const sb = admin();
  const [{ data: company }, { data: pkgs }] = await Promise.all([
    sb.from("companies").select("id, name, niche, products, target_audience").eq("id", company_id).maybeSingle(),
    sb.from("cleo_packages").select("*"),
  ]);
  if (!company) return new Response("company not found", { status: 404 });

  const { data: niche } = await sb
    .from("niche_templates")
    .select("display_name, template")
    .eq("niche_slug", (company as { niche: string | null }).niche ?? "")
    .maybeSingle();

  const llm = await complete({
    system:
      "You are a SaaS pricing analyst. Output a markdown financial section for a CLEO proposal: pricing tiers, expected ROI, payback period. Use the price book (cleo_packages) and niche template. ~300 words.",
    user: `Company: ${JSON.stringify(company).slice(0, 1500)}\n\nNiche template: ${JSON.stringify(niche ?? {}).slice(0, 1500)}\n\nPrice book: ${JSON.stringify(pkgs ?? []).slice(0, 2000)}`,
    max_tokens: 1024,
  });

  const storagePath = `proposal-financial/${company_id}/${Date.now()}.md`;
  await sb.from("proposal_artifacts").insert({
    company_id,
    kind: "financial",
    version: 1,
    storage_path: storagePath,
    generated_by: `pricing_agent:${llm.provider}`,
  });

  return new Response(JSON.stringify({ ok: true, preview: llm.text.slice(0, 200), provider: llm.provider }), {
    headers: { "content-type": "application/json" },
  });
});
