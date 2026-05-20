// Client wrapper around the v_account_health view.
// See docs/PRD-product-view.md §9.
import { getFactorySupabase } from "./factorySupabase";

export type HealthStatus = "green" | "yellow" | "red";

export interface AccountHealth {
  company_id: string;
  company_name: string;
  niche: string | null;
  status: HealthStatus;
  is_override: boolean;
  override_expires_at: string | null;
}

export async function fetchAccountHealth(companyIds?: string[]): Promise<AccountHealth[]> {
  const sb = getFactorySupabase();
  let q = sb.from("v_account_health").select("*");
  if (companyIds && companyIds.length > 0) {
    q = q.in("company_id", companyIds);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AccountHealth[];
}

export async function setHealthOverride(args: {
  company_id: string;
  override_status: HealthStatus;
  reason?: string;
  expires_at?: string | null;
  set_by_user_id: string;
}): Promise<void> {
  const sb = getFactorySupabase();
  const { error } = await sb.from("tenant_health_snapshots").insert({
    company_id: args.company_id,
    window_start: new Date().toISOString(),
    override_status: args.override_status,
    override_by: args.set_by_user_id,
    override_set_at: new Date().toISOString(),
    override_expires_at: args.expires_at ?? null,
  });
  if (error) throw error;
}

export function worstStatus(
  statuses: HealthStatus[],
): HealthStatus {
  if (statuses.includes("red")) return "red";
  if (statuses.includes("yellow")) return "yellow";
  return "green";
}

export const STATUS_COLOR: Record<HealthStatus, string> = {
  green: "#10b981",
  yellow: "#f59e0b",
  red: "#ef4444",
};

export const STATUS_LABEL: Record<HealthStatus, string> = {
  green: "Green",
  yellow: "Yellow",
  red: "Red",
};
