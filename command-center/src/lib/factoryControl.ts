import type { SupabaseClient } from "@supabase/supabase-js";

export type FactoryControlAction =
  | "pause-build"
  | "resume-build"
  | "refire-build"
  | "rollback-deploy"
  | "disable-module"
  | "enable-module"
  | "shutdown-worker"
  | "freeze-automation"
  | "shutdown-client-system"
  | "uplift-client-system"
  | "rotate-config"
  | "redeploy-ui"
  | "mark-incident"
  | "open-fix-ticket";

export interface FactoryControlInput {
  action: FactoryControlAction;
  reason: string;
  company_id?: string | null;
  tenant_slug?: string | null;
  build_run_id?: string | null;
  target_kind: string;
  target_id?: string | null;
  risk_level?: "low" | "medium" | "high" | "critical";
  rollback_plan?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

export async function runFactoryControlAction(
  supabase: SupabaseClient,
  input: FactoryControlInput,
): Promise<Record<string, unknown>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Sign in required");

  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!baseUrl) throw new Error("Missing VITE_SUPABASE_URL");

  const res = await fetch(`${baseUrl}/functions/v1/factory-control-action`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(body.error ?? body.detail ?? res.statusText));
  }
  return body as Record<string, unknown>;
}
