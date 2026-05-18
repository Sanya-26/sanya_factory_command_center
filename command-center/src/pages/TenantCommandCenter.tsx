import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Status = "healthy" | "warning" | "error" | "deploying" | "unknown";

interface RuntimeAgent {
  id: string;
  persona: string;
  role: string;
  systemdActive: boolean;
  lastActionAt?: string;
  lastActionLabel?: string;
  lastError?: string;
  cronSchedule?: string;
  port?: number;
}
interface BuildAgent {
  id: string;
  role: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "passed" | "failed";
  costUsd?: number;
}
interface BuildRun {
  id: string;
  kind: "initial" | "polish" | "deploy" | "audit";
  startedAt: string;
  completedAt?: string;
  totalCostUsd: number;
  durationMs?: number;
  status: "running" | "passed" | "failed";
  agents: BuildAgent[];
  artifactPath?: string;
}
interface IntegrationHealth {
  provider: string;
  status: "ok" | "warn" | "error" | "untested";
  lastCheckedAt?: string;
  lastResultLabel?: string;
  scope?: string;
}
interface RuntimeError {
  at: string;
  agentId?: string;
  service?: string;
  level: "warn" | "error" | "fatal";
  message: string;
}
interface DbState {
  supabaseRef: string;
  url: string;
  sizeMb?: number;
  tableCount?: number;
  rlsCoveragePct?: number;
  migrationVersion?: string;
  lastMigratedAt?: string;
  recentEvents?: Array<{ at: string; kind: string; message: string }>;
}
interface DailyCost {
  day: string;
  promptTokens: number;
  completionTokens: number;
  costUsdAnthropic: number;
  costUsdOpenai?: number;
  byRole?: Record<string, number>;
}
interface TenantAction {
  id: string;
  at: string;
  actor: string;
  kind: string;
  payload?: Record<string, unknown>;
  reason?: string;
  result?: "queued" | "ok" | "error";
  message?: string;
}
interface TenantState {
  slug: string;
  companyId: string;
  customer: { name: string; email: string; website: string };
  vps: { name: string; ip: string; region: string; sizeSlug: string; sshConfigured: boolean; lastReachableAt?: string };
  github?: { fullName: string; url: string };
  status: Status;
  flags?: { deploying?: boolean; needsAttention?: boolean };
  runtimeAgents: RuntimeAgent[];
  builds: BuildRun[];
  integrations: IntegrationHealth[];
  recentErrors: RuntimeError[];
  db?: DbState;
  dailyCosts?: DailyCost[];
  actions?: TenantAction[];
  updatedAt: string;
}
interface TenantSummary {
  slug: string;
  status: Status;
  customerName: string;
  region: string;
  agentCount: number;
  errorCount24h: number;
  brokenIntegrations: number;
  updatedAt: string;
}
interface FleetCounts { total: number; healthy: number; warning: number; error: number; deploying: number; }

type TabId = "overview" | "runtime" | "builds" | "integrations" | "db" | "errors" | "controls";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
interface Props { baseUrl: string; fetcher: Fetcher; onClose?: () => void; }

interface ControlOpts {
  agentId?: string;
  reason?: string;
  payload?: Record<string, unknown>;
}

// ─── Page shell ────────────────────────────────────────────────────────────

export function TenantCommandCenter({ baseUrl, fetcher, onClose }: Props): JSX.Element {
  const [list, setList] = useState<TenantSummary[]>([]);
  const [counts, setCounts] = useState<FleetCounts>({ total: 0, healthy: 0, warning: 0, error: 0, deploying: 0 });
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<TenantState | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [tab, setTab] = useState<TabId>("overview");

  const refresh = useCallback(async () => {
    try {
      const res = await fetcher(`${baseUrl}/api/tenants`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json() as { tenants: TenantSummary[]; counts: FleetCounts };
      setList(data.tenants);
      setCounts(data.counts);
      if (!selectedSlug && data.tenants.length > 0) setSelectedSlug(data.tenants[0]!.slug);
    } catch (e) { setErr((e as Error).message); }
  }, [baseUrl, fetcher, selectedSlug]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 8_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const refreshDetail = useCallback(async () => {
    if (!selectedSlug) { setDetail(null); return; }
    try {
      const res = await fetcher(`${baseUrl}/api/tenants/${encodeURIComponent(selectedSlug)}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json() as { tenant: TenantState };
      setDetail(data.tenant);
    } catch (e) { setErr((e as Error).message); }
  }, [selectedSlug, baseUrl, fetcher]);

  useEffect(() => { void refreshDetail(); }, [refreshDetail]);
  useEffect(() => {
    if (!selectedSlug) return;
    const id = window.setInterval(() => void refreshDetail(), 8_000);
    return () => window.clearInterval(id);
  }, [selectedSlug, refreshDetail]);

  const control = useCallback(async (kind: string, opts: ControlOpts = {}) => {
    if (!selectedSlug) return;
    setBusy(kind + (opts.agentId ?? ""));
    try {
      const res = await fetcher(`${baseUrl}/api/tenants/${encodeURIComponent(selectedSlug)}/control`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, ...opts })
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`${res.status} · ${txt}`);
      }
      await refreshDetail();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(""); }
  }, [selectedSlug, baseUrl, fetcher, refreshDetail]);

  return (
    <div className="aubos-tenants">
      <header className="aubos-tenants-header">
        <strong>Tenant Command Center</strong>
        <small>
          {counts.total} tenants · {" "}
          <span className="aubos-tenants-pill is-error">{counts.error} error</span> · {" "}
          <span className="aubos-tenants-pill is-warning">{counts.warning} warning</span> · {" "}
          <span className="aubos-tenants-pill is-healthy">{counts.healthy} healthy</span>
          {counts.deploying > 0 ? <> · <span className="aubos-tenants-pill is-deploying">{counts.deploying} deploying</span></> : null}
        </small>
        <span className="aubos-tenants-spacer" />
        <button onClick={() => void refresh()}>refresh</button>
        <button onClick={onClose}>close</button>
      </header>

      <div className="aubos-tenants-body">
        <aside className="aubos-tenants-rail">
          {list.length === 0 ? (
            <div className="aubos-tenants-empty">no tenants yet — provision one via the tenant builder.</div>
          ) : null}
          {list.map((t) => (
            <button
              key={t.slug}
              className={`aubos-tenants-card status-${t.status} ${selectedSlug === t.slug ? "is-selected" : ""}`}
              onClick={() => setSelectedSlug(t.slug)}
            >
              <div className="aubos-tenants-card-head">
                <span className={`aubos-tenants-dot is-${t.status}`} />
                <strong>{t.slug}</strong>
                <small>{t.region}</small>
              </div>
              <div className="aubos-tenants-card-body">
                <small>{t.customerName}</small>
              </div>
              <div className="aubos-tenants-card-foot">
                <small>{t.agentCount} agents</small>
                {t.errorCount24h > 0 ? <small className="is-error">{t.errorCount24h} errs/24h</small> : null}
                {t.brokenIntegrations > 0 ? <small className="is-error">{t.brokenIntegrations} integration(s)</small> : null}
              </div>
            </button>
          ))}
        </aside>

        <section className="aubos-tenants-detail">
          {err ? <div className="aubos-tenants-error">{err} <button onClick={() => setErr("")}>×</button></div> : null}
          {detail ? (
            <TenantDetailView
              tenant={detail}
              tab={tab}
              onTab={setTab}
              busy={busy}
              onControl={(k, opts) => void control(k, opts)}
            />
          ) : (
            <div className="aubos-tenants-empty-detail">select a tenant on the left</div>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── Detail (tabbed) ───────────────────────────────────────────────────────

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: "overview",     label: "overview" },
  { id: "runtime",      label: "runtime" },
  { id: "builds",       label: "builds" },
  { id: "integrations", label: "integrations" },
  { id: "db",           label: "db" },
  { id: "errors",       label: "errors" },
  { id: "controls",     label: "controls" }
];

function TenantDetailView({
  tenant, tab, onTab, busy, onControl
}: {
  tenant: TenantState;
  tab: TabId;
  onTab: (t: TabId) => void;
  busy: string;
  onControl: (kind: string, opts?: ControlOpts) => void;
}): JSX.Element {
  return (
    <div className="aubos-tenants-detail-wrap">
      <div className="aubos-tenants-detail-head">
        <div>
          <h2>{tenant.slug}</h2>
          <small>
            {tenant.customer.name} · <a href={`mailto:${tenant.customer.email}`}>{tenant.customer.email}</a> · <a href={tenant.customer.website} target="_blank" rel="noreferrer">{tenant.customer.website}</a>
          </small>
          <div className="aubos-tenants-meta">
            <span><b>VPS</b> {tenant.vps.name} · {tenant.vps.ip} · {tenant.vps.region} · {tenant.vps.sizeSlug}</span>
            {tenant.github ? <span><b>repo</b> <a href={tenant.github.url} target="_blank" rel="noreferrer">{tenant.github.fullName}</a></span> : null}
            {tenant.db ? <span><b>db</b> {tenant.db.supabaseRef}</span> : null}
          </div>
        </div>
        <span className={`aubos-tenants-status status-${tenant.status}`}>{tenant.status}</span>
      </div>

      <nav className="aubos-tenants-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`aubos-tenants-tab ${tab === t.id ? "is-active" : ""}`}
            onClick={() => onTab(t.id)}
          >
            {t.label}
            {t.id === "errors" && tenant.recentErrors.length > 0 ? <span className="aubos-tenants-tab-count">{tenant.recentErrors.length}</span> : null}
            {t.id === "runtime" ? <span className="aubos-tenants-tab-count">{tenant.runtimeAgents.length}</span> : null}
            {t.id === "builds" ? <span className="aubos-tenants-tab-count">{tenant.builds.length}</span> : null}
          </button>
        ))}
      </nav>

      <div className="aubos-tenants-tab-body" role="tabpanel">
        {tab === "overview"     ? <OverviewTab tenant={tenant} /> : null}
        {tab === "runtime"      ? <RuntimeTab tenant={tenant} busy={busy} onControl={onControl} /> : null}
        {tab === "builds"       ? <BuildsTab tenant={tenant} /> : null}
        {tab === "integrations" ? <IntegrationsTab tenant={tenant} busy={busy} onControl={onControl} /> : null}
        {tab === "db"           ? <DbTab tenant={tenant} /> : null}
        {tab === "errors"       ? <ErrorsTab tenant={tenant} /> : null}
        {tab === "controls"     ? <ControlsTab tenant={tenant} busy={busy} onControl={onControl} /> : null}
      </div>

      <DailyCostRibbon costs={tenant.dailyCosts ?? []} />
    </div>
  );
}

// ─── Tabs ──────────────────────────────────────────────────────────────────

function OverviewTab({ tenant }: { tenant: TenantState }): JSX.Element {
  const runtimeOk = tenant.runtimeAgents.filter((a) => a.systemdActive && !a.lastError).length;
  const integOk   = tenant.integrations.filter((i) => i.status === "ok").length;
  const errs24    = tenant.recentErrors.filter((e) => Date.now() - new Date(e.at).getTime() < 86_400_000).length;
  const lastBuild = tenant.builds[0];
  return (
    <div className="aubos-tenants-overview">
      <div className="aubos-tenants-stat-grid">
        <Stat label="runtime agents" value={`${runtimeOk}/${tenant.runtimeAgents.length}`} kind={runtimeOk === tenant.runtimeAgents.length ? "ok" : "warn"} />
        <Stat label="integrations"   value={`${integOk}/${tenant.integrations.length}`}   kind={integOk === tenant.integrations.length ? "ok" : "warn"} />
        <Stat label="errors / 24h"   value={errs24} kind={errs24 === 0 ? "ok" : errs24 > 5 ? "err" : "warn"} />
        <Stat label="last build"     value={lastBuild ? lastBuild.status : "—"}           kind={lastBuild?.status === "passed" ? "ok" : lastBuild?.status === "failed" ? "err" : "warn"} />
      </div>
      <div className="aubos-tenants-overview-cols">
        <div>
          <h3>top runtime signals</h3>
          <ul className="aubos-tenants-bullets">
            {tenant.runtimeAgents.slice(0, 6).map((a) => (
              <li key={a.id}>
                <span className={a.lastError ? "err" : a.systemdActive ? "ok" : "warn"}>
                  {a.lastError ? "✗" : a.systemdActive ? "✓" : "⏸"}
                </span>{" "}
                <code>{a.id}</code>
                {a.lastActionLabel ? <small> · {a.lastActionLabel}</small> : null}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>recent activity</h3>
          <ul className="aubos-tenants-bullets">
            {tenant.recentErrors.slice(-6).reverse().map((e, i) => (
              <li key={i}>
                <span className={e.level === "error" || e.level === "fatal" ? "err" : "warn"}>
                  {e.level === "error" || e.level === "fatal" ? "✗" : "!"}
                </span>{" "}
                <small className="muted">{e.at.slice(11, 19)}</small> {e.message}
              </li>
            ))}
            {tenant.recentErrors.length === 0 ? <li className="muted">— no recent activity</li> : null}
          </ul>
        </div>
      </div>
    </div>
  );
}

function RuntimeTab({ tenant, busy, onControl }: { tenant: TenantState; busy: string; onControl: (k: string, o?: ControlOpts) => void }): JSX.Element {
  return (
    <table className="aubos-tenants-table">
      <thead><tr><th>agent</th><th>persona / role</th><th>schedule</th><th>last action</th><th></th></tr></thead>
      <tbody>
        {tenant.runtimeAgents.map((a) => (
          <tr key={a.id} className={a.lastError ? "is-error" : a.systemdActive ? "is-ok" : "is-warn"}>
            <td><code>{a.id}</code> {a.port ? <small>:{a.port}</small> : null}</td>
            <td>{a.persona} <small>· {a.role}</small></td>
            <td>{a.cronSchedule ?? "—"}</td>
            <td>
              {a.lastActionAt ? (
                <>
                  <span className={a.systemdActive && !a.lastError ? "ok" : "warn"}>
                    {a.systemdActive ? "✓" : "⏸"} {ago(a.lastActionAt)}
                  </span>
                  {a.lastActionLabel ? <small className="muted"> · {a.lastActionLabel}</small> : null}
                  {a.lastError ? <small className="err"> · {a.lastError}</small> : null}
                </>
              ) : <small className="muted">never run</small>}
            </td>
            <td>
              <button disabled={!!busy} onClick={() => onControl("restart-agent", { agentId: a.id })}>
                {busy === "restart-agent" + a.id ? "…" : "restart"}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BuildsTab({ tenant }: { tenant: TenantState }): JSX.Element {
  return (
    <table className="aubos-tenants-table">
      <thead><tr><th>run</th><th>kind</th><th>agents</th><th>duration</th><th>cost</th><th>status</th></tr></thead>
      <tbody>
        {tenant.builds.map((b) => (
          <tr key={b.id}>
            <td><code>{b.id}</code><br /><small>{ago(b.startedAt)}</small></td>
            <td>{b.kind}</td>
            <td>
              <details>
                <summary>{b.agents.length} agents</summary>
                <ul>
                  {b.agents.map((a) => (
                    <li key={a.id}>
                      <code>{a.id}</code>
                      <small> · {a.role} · {a.status}{a.costUsd ? ` · $${a.costUsd.toFixed(2)}` : ""}</small>
                    </li>
                  ))}
                </ul>
              </details>
            </td>
            <td>{b.durationMs ? `${(b.durationMs / 1000).toFixed(0)}s` : "—"}</td>
            <td>${b.totalCostUsd.toFixed(2)}</td>
            <td><span className={`aubos-tenants-pill is-${b.status === "passed" ? "healthy" : b.status === "failed" ? "error" : "warning"}`}>{b.status}</span></td>
          </tr>
        ))}
        {tenant.builds.length === 0 ? <tr><td colSpan={6}><small className="muted">no builds yet</small></td></tr> : null}
      </tbody>
    </table>
  );
}

function IntegrationsTab({ tenant, busy, onControl }: { tenant: TenantState; busy: string; onControl: (k: string, o?: ControlOpts) => void }): JSX.Element {
  return (
    <div className="aubos-tenants-integrations">
      {tenant.integrations.map((i) => (
        <div key={i.provider} className={`aubos-tenants-integration is-${i.status}`}>
          <div className="row">
            <strong>{i.provider}</strong>
            <span className={`aubos-tenants-pill is-${i.status === "ok" ? "healthy" : i.status === "warn" ? "warning" : i.status === "error" ? "error" : "muted"}`}>{i.status}</span>
          </div>
          <small>{i.lastResultLabel ?? "—"}</small>
          {i.lastCheckedAt ? <small className="muted">{ago(i.lastCheckedAt)}</small> : null}
          {i.scope ? <small className="muted">scope: {i.scope}</small> : null}
          {i.status !== "ok" ? (
            <button
              disabled={!!busy}
              onClick={() => {
                const reason = window.prompt(`Reason for rotating ${i.provider} token?`);
                if (reason && reason.length >= 4) onControl("rotate-token", { reason, payload: { provider: i.provider } });
              }}
            >rotate token</button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DbTab({ tenant }: { tenant: TenantState }): JSX.Element {
  if (!tenant.db) return <div className="muted">no per-tenant database recorded</div>;
  return (
    <div className="aubos-tenants-db">
      <div><strong>{tenant.db.supabaseRef}</strong> · <a href={tenant.db.url} target="_blank" rel="noreferrer">open in Supabase →</a></div>
      <div className="aubos-tenants-db-grid">
        <div><small>size</small><strong>{tenant.db.sizeMb ?? 0} MB</strong></div>
        <div><small>tables</small><strong>{tenant.db.tableCount ?? 0}</strong></div>
        <div><small>RLS</small><strong>{tenant.db.rlsCoveragePct ?? 0}%</strong></div>
        <div><small>migration</small><strong>{tenant.db.migrationVersion ?? "—"}</strong></div>
      </div>
      {tenant.db.recentEvents && tenant.db.recentEvents.length > 0 ? (
        <ul className="aubos-tenants-events">
          {tenant.db.recentEvents.map((e, i) => (
            <li key={i}><small className="muted">{e.at.slice(11, 19)}</small> · <small>{e.kind}</small> {e.message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ErrorsTab({ tenant }: { tenant: TenantState }): JSX.Element {
  return (
    <ul className="aubos-tenants-errors">
      {tenant.recentErrors.slice(-60).reverse().map((e, i) => (
        <li key={i} className={`is-${e.level}`}>
          <small className="muted">{e.at.slice(11, 19)}</small> {" "}
          {e.agentId || e.service ? <small className="muted">[{e.agentId ?? e.service}]</small> : null} {" "}
          <span>{e.message}</span>
        </li>
      ))}
      {tenant.recentErrors.length === 0 ? <li className="muted">— no errors in window</li> : null}
    </ul>
  );
}

// ─── Controls (full catalog + danger gate) ─────────────────────────────────

function ControlsTab({ tenant, busy, onControl }: { tenant: TenantState; busy: string; onControl: (k: string, o?: ControlOpts) => void }): JSX.Element {
  const [danger, setDanger] = useState(false);
  const expiry = useRef<number | null>(null);

  // Auto-clear dangerous mode every 15 min.
  useEffect(() => {
    if (!danger) return;
    expiry.current = window.setTimeout(() => setDanger(false), 15 * 60 * 1000);
    return () => { if (expiry.current) window.clearTimeout(expiry.current); };
  }, [danger]);

  const safe   = (kind: string) => () => onControl(kind);
  const audit  = (kind: string, prompt: string, payload?: Record<string, unknown>) => () => {
    const reason = window.prompt(`Reason for "${kind}"?\n\n${prompt}`);
    if (reason && reason.trim().length >= 4) onControl(kind, { reason: reason.trim(), payload });
  };

  return (
    <div className="aubos-tenants-controls-panel">
      <h3>safe actions</h3>
      <div className="aubos-tenants-controls">
        <button disabled={!!busy} onClick={safe("smoke")}>{busy === "smoke" ? "running…" : "run smoke test"}</button>
        <button disabled={!!busy} onClick={safe("snapshot")}>snapshot tenant</button>
        <button disabled={!!busy} onClick={safe("tail-logs")}>tail logs (live)</button>
      </div>

      <h3 style={{ marginTop: 24 }}>medium-risk (audit + reason required)</h3>
      <div className="aubos-tenants-controls">
        <button disabled={!!busy} onClick={audit("restart-all", "All systemd units on the VPS will be restarted.")}>restart all agents</button>
        <button disabled={!!busy} onClick={audit("deploy",      "Deploy the latest commit on main.")}>deploy latest</button>
        <button disabled={!!busy} onClick={audit("resume",      "Re-enable all systemd units (after a previous pause).")}>resume tenant</button>
        <button
          disabled={!!busy}
          onClick={() => {
            const provider = window.prompt("Which integration to rotate? (provider name)");
            if (!provider) return;
            const reason = window.prompt(`Reason for rotating ${provider}?`);
            if (reason && reason.trim().length >= 4) onControl("rotate-token", { reason: reason.trim(), payload: { provider } });
          }}
        >rotate integration token</button>
      </div>

      <h3 style={{ marginTop: 24 }}>
        critical · ops only
        <label className="aubos-tenants-danger-toggle">
          <input type="checkbox" checked={danger} onChange={(e) => setDanger(e.target.checked)} />
          <span>{danger ? "approve dangerous actions (auto-clears in 15 min)" : "approve dangerous actions"}</span>
        </label>
      </h3>

      <div className={`aubos-tenants-controls is-danger ${danger ? "is-armed" : ""}`}>
        <button
          disabled={!danger || !!busy}
          onClick={() => {
            const buildId = window.prompt("Roll back to which build run id?");
            if (!buildId) return;
            const reason = window.prompt(`Reason for rolling back to ${buildId}?`);
            if (reason && reason.trim().length >= 4) onControl("rollback", { reason: reason.trim(), payload: { buildRunId: buildId } });
          }}
        >rollback to build</button>

        <button
          disabled={!danger || !!busy}
          onClick={audit("pause", "All systemd units will stop. Customer-facing surfaces go offline.")}
        >pause tenant</button>

        <SshTerminal tenant={tenant} disabled={!danger || !!busy} onControl={onControl} />
        <SqlRunner   tenant={tenant} disabled={!danger || !!busy} onControl={onControl} />
      </div>

      <ActionAuditLog tenant={tenant} />
    </div>
  );
}

function ActionAuditLog({ tenant }: { tenant: TenantState }): JSX.Element {
  const items = (tenant.actions ?? []).slice(-15).reverse();
  return (
    <details className="aubos-tenants-audit">
      <summary>action audit ({tenant.actions?.length ?? 0})</summary>
      <ul>
        {items.map((a) => (
          <li key={a.id}>
            <small className="muted">{a.at.slice(11, 19)}</small>{" "}
            <code>{a.kind}</code>{" "}
            {a.payload && Object.keys(a.payload).length ? <small className="muted">· {JSON.stringify(a.payload)}</small> : null}
            {a.reason ? <small> · "{a.reason}"</small> : null}
            <small className={`pill is-${a.result === "ok" ? "ok" : a.result === "error" ? "err" : "warn"}`}>{a.result ?? "queued"}</small>
          </li>
        ))}
        {items.length === 0 ? <li className="muted">— no actions yet</li> : null}
      </ul>
    </details>
  );
}

function SshTerminal({ tenant, disabled, onControl }: { tenant: TenantState; disabled: boolean; onControl: (k: string, o?: ControlOpts) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [cmd, setCmd] = useState("");
  const [history, setHistory] = useState<Array<{ at: string; cmd: string }>>([]);
  return (
    <>
      <button disabled={disabled} onClick={() => setOpen(true)}>open SSH terminal</button>
      {open ? (
        <div className="aubos-tenants-modal" role="dialog">
          <div className="aubos-tenants-modal-inner">
            <header>
              <strong>SSH · {tenant.vps.name}</strong>
              <small>{tenant.vps.ip} · {tenant.vps.region}</small>
              <button onClick={() => setOpen(false)}>close</button>
            </header>
            <div className="aubos-tenants-terminal">
              {history.map((h, i) => (
                <div key={i}><small className="muted">{h.at.slice(11, 19)}</small> $ {h.cmd}</div>
              ))}
              {history.length === 0 ? <div className="muted">// every command is logged to the action audit. type a command + ⏎</div> : null}
            </div>
            <form
              className="aubos-tenants-terminal-input"
              onSubmit={(e) => {
                e.preventDefault();
                if (!cmd.trim()) return;
                const reason = window.prompt(`Reason for running:\n  $ ${cmd}`);
                if (!reason || reason.trim().length < 4) return;
                onControl("ssh-exec", { reason: reason.trim(), payload: { command: cmd.trim() } });
                setHistory((h) => [...h, { at: new Date().toISOString(), cmd: cmd.trim() }]);
                setCmd("");
              }}
            >
              <span>$</span>
              <input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="systemctl status aubos-cleo" />
              <button type="submit">run</button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SqlRunner({ tenant, disabled, onControl }: { tenant: TenantState; disabled: boolean; onControl: (k: string, o?: ControlOpts) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  return (
    <>
      <button disabled={disabled} onClick={() => setOpen(true)}>run ad-hoc SQL</button>
      {open ? (
        <div className="aubos-tenants-modal" role="dialog">
          <div className="aubos-tenants-modal-inner">
            <header>
              <strong>SQL · {tenant.db?.supabaseRef ?? "—"}</strong>
              <small>per-tenant Supabase</small>
              <button onClick={() => setOpen(false)}>close</button>
            </header>
            <textarea
              className="aubos-tenants-sql"
              rows={8}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="select count(*) from public.appointments where created_at > now() - interval '7 days';"
            />
            <div className="aubos-tenants-sql-actions">
              <small className="muted">// query + actor + row-count are logged to the audit trail.</small>
              <button
                onClick={() => {
                  if (!query.trim()) return;
                  const reason = window.prompt(`Reason for ad-hoc SQL on ${tenant.slug}?`);
                  if (!reason || reason.trim().length < 4) return;
                  onControl("sql", { reason: reason.trim(), payload: { query: query.trim() } });
                  setQuery("");
                }}
              >execute</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ─── Daily cost ribbon (sticky, per tab) ───────────────────────────────────

function DailyCostRibbon({ costs }: { costs: DailyCost[] }): JSX.Element {
  const last7 = useMemo(() => costs.slice(-7), [costs]);
  if (last7.length === 0) {
    return (
      <div className="aubos-tenants-cost-ribbon is-empty">
        <small>no cost data yet — agent ticks haven't reported</small>
      </div>
    );
  }
  const total      = last7.reduce((s, d) => s + d.costUsdAnthropic + (d.costUsdOpenai ?? 0), 0);
  const promptTok  = last7.reduce((s, d) => s + d.promptTokens, 0);
  const complTok   = last7.reduce((s, d) => s + d.completionTokens, 0);
  const max        = Math.max(...last7.map((d) => d.costUsdAnthropic + (d.costUsdOpenai ?? 0)), 0.01);
  return (
    <div className="aubos-tenants-cost-ribbon">
      <div className="aubos-tenants-cost-bars">
        {last7.map((d) => {
          const v = d.costUsdAnthropic + (d.costUsdOpenai ?? 0);
          const pct = Math.max(2, Math.round((v / max) * 100));
          return (
            <div key={d.day} className="aubos-tenants-cost-bar" title={`$${v.toFixed(2)} · ${d.promptTokens.toLocaleString()} prompt · ${d.completionTokens.toLocaleString()} completion`}>
              <span className="bar" style={{ height: `${pct}%` }} />
              <small className="day">{d.day.slice(5)}</small>
              <small className="amt">${v.toFixed(2)}</small>
            </div>
          );
        })}
      </div>
      <div className="aubos-tenants-cost-totals">
        <strong>last 7 days</strong>
        <span>total <b>${total.toFixed(2)}</b></span>
        <span>{promptTok.toLocaleString()} prompt</span>
        <span>{complTok.toLocaleString()} completion</span>
        <span>~${(total / Math.max(1, last7.length)).toFixed(2)}/day avg</span>
      </div>
    </div>
  );
}

// ─── Bits ──────────────────────────────────────────────────────────────────

function Stat({ label, value, kind }: { label: string; value: string | number; kind: "ok" | "warn" | "err" }): JSX.Element {
  return (
    <div className={`aubos-tenants-stat is-${kind}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function ago(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60_000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  } catch { return iso; }
}
