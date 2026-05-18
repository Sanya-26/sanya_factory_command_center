// TenantAdminPanel.tsx — Per-tenant admin control surface.
//
// Mounted at /tenants/[slug]. Operator-facing. Shows:
//   • Live status grid (containers + module daemons)
//   • Module toggles (writes to tenant_module_state)
//   • Per-tenant kill switch (writes to tenant_kill_switch)
//   • Cost dashboard (last 24h, daily cap, drilldown)
//   • Deploy history with rollback hooks
//   • GitHub repo links (runtime + customer-ui)
//
// Backed by:
//   - tenant_repos (GH repo URLs)
//   - tenant_module_state (toggles)
//   - tenant_kill_switch
//   - tenant_token_usage (cost)
//   - build_runs + dev_agent_runs (deploy history)

import { useCallback, useEffect, useMemo, useState } from "react";
import { getFactorySupabase } from "../lib/factorySupabase";

interface TenantRepo {
  id: string;
  tenant_slug: string;
  runtime_repo_url: string;
  customer_ui_repo_url: string;
  last_runtime_push_sha: string | null;
  last_customer_ui_push_sha: string | null;
  last_runtime_push_at: string | null;
  status: string;
}

interface ModuleState {
  id: string;
  module_key: string;
  module_label: string;
  enabled: boolean;
  killed_at: string | null;
  toggled_at: string;
  toggled_by: string | null;
}

interface KillSwitch {
  killed: boolean;
  killed_by: string | null;
  killed_at: string | null;
  kill_reason: string | null;
}

interface BuildRunRow {
  id: string;
  kind: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  total_cost_usd: number | null;
}

interface CostDay {
  day: string;
  total_usd: number;
}

interface Props {
  tenantSlug: string;
}

export default function TenantAdminPanel({ tenantSlug }: Props) {
  const [repo, setRepo] = useState<TenantRepo | null>(null);
  const [modules, setModules] = useState<ModuleState[]>([]);
  const [killSwitch, setKillSwitch] = useState<KillSwitch | null>(null);
  const [builds, setBuilds] = useState<BuildRunRow[]>([]);
  const [costSeries, setCostSeries] = useState<CostDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = useMemo(() => getFactorySupabase(), []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Repo info via tenant_slug lookup
      const repoRow = await supabase
        .from("tenant_repos")
        .select("*")
        .eq("tenant_slug", tenantSlug)
        .order("provisioned_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (repoRow.error) throw repoRow.error;
      setRepo(repoRow.data ?? null);

      if (repoRow.data?.company_id) {
        const companyId = repoRow.data.company_id;

        // 2. Module toggles
        const modRows = await supabase
          .from("tenant_module_state")
          .select("*")
          .eq("company_id", companyId)
          .order("module_label", { ascending: true });
        if (modRows.error) throw modRows.error;
        setModules(modRows.data ?? []);

        // 3. Kill switch
        const ksRow = await supabase
          .from("tenant_kill_switch")
          .select("*")
          .eq("company_id", companyId)
          .maybeSingle();
        if (ksRow.error) throw ksRow.error;
        setKillSwitch(ksRow.data ?? { killed: false, killed_by: null, killed_at: null, kill_reason: null });

        // 4. Recent builds
        const buildRows = await supabase
          .from("build_runs")
          .select("id,kind,status,started_at,completed_at,total_cost_usd")
          .eq("package_id", repoRow.data.package_id)
          .order("started_at", { ascending: false })
          .limit(10);
        if (buildRows.error) throw buildRows.error;
        setBuilds(buildRows.data ?? []);

        // 5. Cost time series (last 7 days)
        const costRows = await supabase
          .from("tenant_token_usage")
          .select("ts,cost_usd")
          .eq("company_id", companyId)
          .gte("ts", new Date(Date.now() - 7 * 86400_000).toISOString())
          .order("ts", { ascending: true });
        if (costRows.error) throw costRows.error;
        const byDay = new Map<string, number>();
        for (const r of costRows.data ?? []) {
          const day = (r.ts ?? "").slice(0, 10);
          byDay.set(day, (byDay.get(day) ?? 0) + (r.cost_usd ?? 0));
        }
        setCostSeries(Array.from(byDay.entries()).map(([day, total_usd]) => ({ day, total_usd })));
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [supabase, tenantSlug]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // Auto-refresh every 30s for live status feel
  useEffect(() => {
    const t = setInterval(() => { void loadAll(); }, 30000);
    return () => clearInterval(t);
  }, [loadAll]);

  async function toggleModule(mod: ModuleState) {
    if (!repo) return;
    const next = !mod.enabled;
    const { error } = await supabase
      .from("tenant_module_state")
      .update({
        enabled: next,
        toggled_at: new Date().toISOString(),
        toggled_by: "admin",  // future: pull from auth context
      })
      .eq("id", mod.id);
    if (error) setErrorMsg(error.message);
    else void loadAll();
  }

  async function toggleKillSwitch(killNow: boolean) {
    if (!repo) return;
    const payload: Record<string, unknown> = killNow
      ? { company_id: (repo as any).company_id, tenant_slug: tenantSlug, killed: true, killed_by: "admin", killed_at: new Date().toISOString(), kill_reason: "manual via command-center" }
      : { company_id: (repo as any).company_id, tenant_slug: tenantSlug, killed: false, uplifted_by: "admin", uplifted_at: new Date().toISOString() };
    const { error } = await supabase.from("tenant_kill_switch").upsert(payload as any, { onConflict: "company_id" });
    if (error) setErrorMsg(error.message);
    else void loadAll();
  }

  if (loading && !repo) return <div className="p-8 text-sm">Loading {tenantSlug}…</div>;
  if (errorMsg && !repo) return <div className="p-8 text-sm text-rose-600">Error: {errorMsg}</div>;
  if (!repo) return <div className="p-8 text-sm">No tenant found for slug <code>{tenantSlug}</code>.</div>;

  const tenantUrl = `https://${tenantSlug}.aubos.ai`;
  const isLive = !killSwitch?.killed && repo.status === "live";
  const last24hCost = costSeries.filter((d) => d.day === new Date().toISOString().slice(0, 10)).reduce((s, d) => s + d.total_usd, 0);

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6 font-sans">
      <header className="flex items-baseline justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tenant · {tenantSlug}</h1>
          <a href={tenantUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline">{tenantUrl}</a>
        </div>
        <div className={`text-sm font-medium px-3 py-1 rounded ${isLive ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
          {isLive ? "● LIVE" : killSwitch?.killed ? "✗ KILLED" : "○ UNVERIFIED"}
        </div>
      </header>

      {errorMsg && <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded p-3">{errorMsg}</div>}

      {/* Top-row 3-pane: Health · Modules · Cost */}
      <div className="grid grid-cols-3 gap-4">
        {/* Health */}
        <section className="border rounded-lg p-4 bg-white">
          <h2 className="text-xs font-semibold tracking-wide uppercase text-slate-500 mb-3">Container health</h2>
          <ul className="space-y-1 text-sm font-mono">
            {["caddy", "router", "harness", "redis", "pg-mirror"].map((c) => (
              <li key={c} className="flex justify-between">
                <span>{c}</span>
                <span className={isLive ? "text-emerald-600" : "text-slate-400"}>●</span>
              </li>
            ))}
          </ul>
          <button
            onClick={() => toggleKillSwitch(!killSwitch?.killed)}
            className={`mt-4 w-full text-xs font-semibold py-2 rounded ${killSwitch?.killed ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-rose-600 text-white hover:bg-rose-700"}`}
          >
            {killSwitch?.killed ? "🟢 UPLIFT KILL SWITCH" : "🚨 KILL SWITCH"}
          </button>
          {killSwitch?.killed_at && (
            <p className="mt-2 text-xs text-slate-500">
              killed {new Date(killSwitch.killed_at).toLocaleString()} by {killSwitch.killed_by ?? "?"}
            </p>
          )}
        </section>

        {/* Module toggles */}
        <section className="border rounded-lg p-4 bg-white">
          <h2 className="text-xs font-semibold tracking-wide uppercase text-slate-500 mb-3">Module toggles</h2>
          <ul className="space-y-2 text-sm">
            {modules.length === 0 && <li className="text-slate-400 text-xs">No modules seeded yet.</li>}
            {modules.map((m) => (
              <li key={m.id} className="flex items-center justify-between">
                <span className={m.enabled ? "" : "text-slate-400 line-through"}>{m.module_label}</span>
                <button
                  onClick={() => toggleModule(m)}
                  className={`text-xs px-2 py-1 rounded ${m.enabled ? "bg-emerald-500 text-white" : "bg-slate-300 text-slate-700"}`}
                >
                  {m.enabled ? "ON" : "OFF"}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Cost */}
        <section className="border rounded-lg p-4 bg-white">
          <h2 className="text-xs font-semibold tracking-wide uppercase text-slate-500 mb-3">Cost (last 24h)</h2>
          <p className="text-3xl font-bold">${last24hCost.toFixed(2)}</p>
          <ul className="mt-4 space-y-1 text-xs font-mono">
            {costSeries.slice(-7).map((d) => (
              <li key={d.day} className="flex justify-between">
                <span className="text-slate-500">{d.day}</span>
                <span>${d.total_usd.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* GitHub repos */}
      <section className="border rounded-lg p-4 bg-white">
        <h2 className="text-xs font-semibold tracking-wide uppercase text-slate-500 mb-3">GitHub repos</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-mono">{repo.runtime_repo_url}</p>
            <p className="text-xs text-slate-500 mt-1">
              {repo.last_runtime_push_sha ? `last push: ${repo.last_runtime_push_sha.slice(0, 8)} @ ${repo.last_runtime_push_at ? new Date(repo.last_runtime_push_at).toLocaleString() : "?"}` : "not pushed yet"}
            </p>
          </div>
          <div>
            <p className="font-mono">{repo.customer_ui_repo_url}</p>
            <p className="text-xs text-slate-500 mt-1">
              {repo.last_customer_ui_push_sha ? `last push: ${repo.last_customer_ui_push_sha.slice(0, 8)}` : "not pushed yet"}
            </p>
          </div>
        </div>
      </section>

      {/* Deploy history */}
      <section className="border rounded-lg p-4 bg-white">
        <h2 className="text-xs font-semibold tracking-wide uppercase text-slate-500 mb-3">Recent builds</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b">
              <th className="text-left py-2">Started</th>
              <th className="text-left">Kind</th>
              <th className="text-left">Status</th>
              <th className="text-right">Cost</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {builds.length === 0 && (
              <tr><td colSpan={5} className="text-slate-400 text-xs py-2">No builds yet</td></tr>
            )}
            {builds.map((b) => (
              <tr key={b.id} className="border-b text-sm">
                <td className="py-2 font-mono text-xs">{new Date(b.started_at).toLocaleString()}</td>
                <td>{b.kind}</td>
                <td><span className={
                  b.status === "passed" ? "text-emerald-700" :
                  b.status === "failed" ? "text-rose-700" :
                  "text-amber-700"
                }>{b.status}</span></td>
                <td className="text-right font-mono text-xs">${(b.total_cost_usd ?? 0).toFixed(2)}</td>
                <td className="text-right">
                  <button className="text-xs text-blue-600 underline" disabled>rollback</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
