// Edge function: agents-triage-flag-run
// Trigger: HTTP POST { flag_id } when a new customer_flag is inserted
//          (DB webhook or manual call from an admin tool).
//
// Reads the flag + recent open tech_issues; classifies via LLM (or substring
// fallback when LLM_PROVIDER=stub) into either:
//   • existing issue → UPDATE customer_flags.linked_issue_id
//   • new issue      → INSERT a new tech_issues row + link the flag
//
// Either path stamps triaged_at + triaged_by = 'triage_agent:v1' on the flag.
// PRD: docs/PRD-product-view.* §17.4

import { admin } from "../_shared/supabase.ts";
import { complete } from "../_shared/llm.ts";

interface FlagRow {
  id: string;
  company_id: string;
  title: string;
  body: string | null;
  severity: string;
}
interface IssueRow {
  id: string;
  title: string;
  description: string | null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

// Substring/keyword similarity in [0, 1] — used when LLM is the stub provider.
function similarity(a: string, b: string): number {
  const aw = new Set(normalize(a).split(" ").filter((w) => w.length > 3));
  const bw = new Set(normalize(b).split(" ").filter((w) => w.length > 3));
  if (aw.size === 0 || bw.size === 0) return 0;
  let inter = 0;
  for (const w of aw) if (bw.has(w)) inter++;
  return inter / Math.max(aw.size, bw.size);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  let body: { flag_id?: string };
  try { body = await req.json(); } catch { return new Response("invalid json", { status: 400 }); }
  const flagId = body.flag_id;
  if (!flagId) return new Response("missing flag_id", { status: 400 });

  const sb = admin();
  const { data: flag, error: flagErr } = await sb
    .from("customer_flags")
    .select("id, company_id, title, body, severity")
    .eq("id", flagId)
    .maybeSingle();
  if (flagErr || !flag) return new Response("flag not found", { status: 404 });
  const f = flag as FlagRow;

  // Pull recent open issues to consider for linking.
  const { data: openIssues } = await sb
    .from("tech_issues")
    .select("id, title, description")
    .in("status", ["open", "in_progress", "blocked"])
    .order("created_at", { ascending: false })
    .limit(50);
  const issues = (openIssues ?? []) as IssueRow[];

  // Attempt LLM classification; fall back to similarity matcher.
  let linkedIssueId: string | null = null;
  let classifierProvider = "substring";

  if (Deno.env.get("LLM_PROVIDER") && Deno.env.get("LLM_PROVIDER") !== "stub" && issues.length > 0) {
    try {
      const summary = issues.map((i, idx) => `${idx}. [${i.id}] ${i.title}`).join("\n");
      const llm = await complete({
        system:
          "You triage customer complaints into engineering issues. Reply with ONLY the issue id that matches, or the literal token NEW if no existing issue is a fit. No prose.",
        user: `Flag title: ${f.title}\nFlag body: ${f.body ?? "(no body)"}\n\nOpen issues:\n${summary}\n\nReply with one issue id from the list, or NEW.`,
        max_tokens: 64,
      });
      const reply = llm.text.trim();
      classifierProvider = `llm:${llm.provider}`;
      if (reply !== "NEW") {
        const match = issues.find((i) => reply.includes(i.id));
        if (match) linkedIssueId = match.id;
      }
    } catch {
      // fall through to substring matcher
    }
  }

  if (!linkedIssueId) {
    let bestScore = 0;
    let bestId: string | null = null;
    for (const i of issues) {
      const sc = similarity(`${f.title} ${f.body ?? ""}`, `${i.title} ${i.description ?? ""}`);
      if (sc > bestScore) { bestScore = sc; bestId = i.id; }
    }
    if (bestScore >= 0.4) linkedIssueId = bestId;
  }

  // No suitable existing issue — create a new tech_issues row.
  let createdNew = false;
  if (!linkedIssueId) {
    const { data: pm } = await sb
      .from("ops_users")
      .select("user_id")
      .eq("role", "product_manager")
      .limit(1)
      .maybeSingle();
    const raisedBy = (pm as { user_id: string } | null)?.user_id;
    if (!raisedBy) {
      return new Response("no product_manager to attribute new issue to", { status: 412 });
    }
    const sev = f.severity === "critical" ? "critical" : f.severity === "high" ? "high" : "medium";
    const pri = f.severity === "critical" ? "urgent" : f.severity === "high" ? "high" : "normal";
    const { data: created, error: insErr } = await sb
      .from("tech_issues")
      .insert({
        company_id: f.company_id,
        raised_by: raisedBy,
        title: f.title,
        description: f.body ?? null,
        severity: sev,
        priority: pri,
        status: "open",
      })
      .select("id")
      .single();
    if (insErr || !created) return new Response(`insert failed: ${insErr?.message}`, { status: 500 });
    linkedIssueId = (created as { id: string }).id;
    createdNew = true;
  }

  // Link the flag.
  await sb
    .from("customer_flags")
    .update({
      linked_issue_id: linkedIssueId,
      triaged_at: new Date().toISOString(),
      triaged_by: `triage_agent:v1:${classifierProvider}`,
    })
    .eq("id", f.id);

  return new Response(
    JSON.stringify({
      ok: true,
      flag_id: f.id,
      linked_issue_id: linkedIssueId,
      created_new: createdNew,
      classifier: classifierProvider,
    }),
    { headers: { "content-type": "application/json" } },
  );
});
