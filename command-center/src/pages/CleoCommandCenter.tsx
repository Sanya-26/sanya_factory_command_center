import { useCallback, useEffect, useMemo, useState } from "react";

// Full Cleo-funnel lifecycle (from migration 0008 cleo_packages.status check).
// Legacy filesystem store used a smaller subset (approved/deployed) which no
// longer appears in DB mode; kept in the type union for forward compat.
type PkgStatus =
  | "queued"
  | "in-review"
  | "planning"
  | "proposing"
  | "awaiting-approval"
  | "building"
  | "testing"
  | "live"
  | "rejected"
  | "needs-info"
  | "approved"   // legacy
  | "deployed";  // legacy

interface PackageSummary {
  id: string;
  companyId: string;
  companySlug: string;
  receivedAt: string;
  priority: "p0" | "p1" | "p2";
  status: PkgStatus;
  customerName: string;
  businessType: string;
  preview: string;
}

interface NodeLineItem {
  glyph?: string;
  text: string;
  meta?: string;
  status?: "ok" | "partial" | "missing";
}
interface CanvasNode {
  id: string;
  kind: string;
  label: string;
  subLabel?: string;
  lineItems?: NodeLineItem[];
  footer?: { left?: string; right?: string };
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
}
interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  kind?: string;
  label?: string;
}

interface WebsiteIntelligence {
  url: string;
  scrapedAt: string;
  brand: { name: string; tagline?: string; summary: string; tone?: string; colors?: string[]; fonts?: string[]; logoUrl?: string };
  socialPresence: Array<{ platform: string; handle: string; url: string; followers?: number; cadencePerWeek?: number; lastPostAt?: string }>;
  techStack: Array<{ category: string; name: string; confidence: "high" | "medium" | "low"; detail?: string }>;
  pages: Array<{ kind: string; url: string; title?: string }>;
  contacts: { emails: string[]; phones: string[]; addresses?: string[] };
  productsOrServices: Array<{ name: string; description?: string; price?: string }>;
  signals: { isEcommerce: boolean; hasNewsletterSignup: boolean; hasLiveChat: boolean; hasBlog: boolean; hasCareersPage: boolean; hasReviews: boolean; estimatedTeamSize?: number };
}

interface CleoPackage extends PackageSummary {
  customer: { name: string; email: string; website: string };
  scrape: {
    businessType: string;
    brand?: { tone?: string; colors?: string[]; summary?: string };
    integrationsDetected: string[];
    intelligence?: WebsiteIntelligence;
    metadata?: Record<string, unknown>;
  };
  canvas: { nodes: CanvasNode[]; edges: CanvasEdge[]; businessType: string };
  chatHistory: Array<{ role: string; content: string; toolCalls?: unknown[]; at?: string }>;
  notes?: string;
  opsLog?: Array<{ at: string; actor: string; action: string; note?: string }>;
}

// Lite mirror of the AubosBuildPlan from scripts/cleo-funnel-planner.ts.
// Kept here to avoid importing planner code into the browser bundle.
interface AubosBuildPlanLite {
  packageId: string;
  generatedAt: string;
  generatedByPlanner: { agentId: string; costUsd: number; durationMs: number; model: string };
  topLevelSummary: string;
  capabilities: Array<{
    canvasNodeId: string;
    customerOutcomeLabel: string;
    autonomyLevel: "full" | "human-in-loop" | "human-only";
    moduleId: string;
    rationale: string;
    requiredEndpoints?: string[];
    requiredTables?: string[];
    requiredIntegrations?: Array<{ provider: string; scope: string; why?: string }>;
    devAgentSlot: string;
    estimatedSetupMinutes?: number;
  }>;
  ui?: { designSystemBase: string; brandTokens?: { colors?: string[]; fonts?: string[]; logoUrl?: string; tone?: string }; perVerticalDefaults?: { vertical: string; defaultRoute: string; dashboardLayout: string } };
  vps?: { tier: string; region: string };
  database?: { mode: string; rationale?: string };
  estimatedCost: { buildUsd: number; monthlyRuntimeUsd: number };
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

interface CleoCommandCenterProps {
  baseUrl: string;
  fetcher: Fetcher;
  onClose?: () => void;
  onSendToTenantBuilder?: (pkg: CleoPackage) => void;
}

export function CleoCommandCenter({ baseUrl, fetcher, onClose, onSendToTenantBuilder }: CleoCommandCenterProps): JSX.Element {
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CleoPackage | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [filter, setFilter] = useState<"all" | PkgStatus>("all");
  const [plan, setPlan] = useState<AubosBuildPlanLite | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetcher(`${baseUrl}/api/cleo/packages`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json() as { packages: PackageSummary[] };
      setPackages(data.packages);
      if (!selectedId && data.packages.length > 0) {
        setSelectedId(data.packages[0]!.id);
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [baseUrl, fetcher, selectedId]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); setPlan(null); return; }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetcher(`${baseUrl}/api/cleo/package/${encodeURIComponent(selectedId)}`);
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json() as { package: CleoPackage };
        if (!cancelled) setDetail(data.package);
        // Best-effort plan fetch (404 / no plan yet is OK).
        try {
          const pres = await fetcher(`${baseUrl}/api/cleo/package/${encodeURIComponent(selectedId)}/plan`);
          if (pres.ok) {
            const pd = await pres.json() as { plan: AubosBuildPlanLite | null };
            if (!cancelled) setPlan(pd.plan);
          } else if (!cancelled) {
            setPlan(null);
          }
        } catch { /* no plan yet — ignore */ }
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, baseUrl, fetcher]);

  const runPlanner = useCallback(async () => {
    if (!selectedId) return;
    setBusy("planning");
    try {
      const res = await fetcher(`${baseUrl}/api/cleo/package/${encodeURIComponent(selectedId)}/plan`, { method: "POST" });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      // Planner runs async — poll the plan endpoint until populated, max ~90s.
      const startedAt = Date.now();
      const poll = async (): Promise<void> => {
        if (Date.now() - startedAt > 90_000) { setBusy(""); return; }
        const pres = await fetcher(`${baseUrl}/api/cleo/package/${encodeURIComponent(selectedId)}/plan`);
        if (pres.ok) {
          const pd = await pres.json() as { plan: AubosBuildPlanLite | null };
          if (pd.plan) {
            setPlan(pd.plan);
            await refresh();
            // Refresh detail to pick up new status.
            const dres = await fetcher(`${baseUrl}/api/cleo/package/${encodeURIComponent(selectedId)}`);
            if (dres.ok) setDetail((await dres.json() as { package: CleoPackage }).package);
            setBusy("");
            return;
          }
        }
        setTimeout(() => void poll(), 4000);
      };
      void poll();
    } catch (e) {
      setErr((e as Error).message);
      setBusy("");
    }
  }, [selectedId, baseUrl, fetcher, refresh]);

  const setStatus = useCallback(async (status: CleoPackage["status"], note?: string) => {
    if (!selectedId) return;
    setBusy(status);
    try {
      const res = await fetcher(`${baseUrl}/api/cleo/package/${encodeURIComponent(selectedId)}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, note })
      });
      if (!res.ok) throw new Error(`${res.status}`);
      await refresh();
      const data = await res.json() as { package: CleoPackage };
      setDetail(data.package);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }, [selectedId, baseUrl, fetcher, refresh]);

  const filtered = useMemo(() => {
    if (filter === "all") return packages;
    return packages.filter((p) => p.status === filter);
  }, [packages, filter]);

  const counts = useMemo(() => {
    const out = { p0: 0, p1: 0, p2: 0, total: packages.length };
    for (const p of packages) out[p.priority] += 1;
    return out;
  }, [packages]);

  return (
    <div className="aubos-cleo">
      <header className="aubos-cleo-header">
        <strong>Cleo Command Center</strong>
        <small>queue · {counts.p0} p0 · {counts.p1} p1 · {counts.p2} p2 · {counts.total} total</small>
        <span className="aubos-cleo-spacer" />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="aubos-cleo-select"
        >
          <option value="all">all</option>
          <option value="queued">queued</option>
          <option value="in-review">in-review</option>
          <option value="planning">planning</option>
          <option value="proposing">proposing</option>
          <option value="awaiting-approval">awaiting-approval</option>
          <option value="building">building</option>
          <option value="testing">testing</option>
          <option value="live">live</option>
          <option value="rejected">rejected</option>
          <option value="needs-info">needs-info</option>
        </select>
        <button onClick={() => void refresh()}>refresh</button>
        <button onClick={onClose}>close</button>
      </header>

      <div className="aubos-cleo-body">
        <aside className="aubos-cleo-rail">
          {filtered.length === 0 ? (
            <div className="aubos-cleo-empty">no packages yet — customers send them from /onboarding in white_ui.</div>
          ) : null}
          {filtered.map((p) => (
            <button
              key={p.id}
              className={`aubos-cleo-card ${selectedId === p.id ? "is-selected" : ""} pri-${p.priority}`}
              onClick={() => setSelectedId(p.id)}
            >
              <div className="aubos-cleo-card-head">
                <strong>{p.companySlug}</strong>
                <span className={`aubos-cleo-pill pri-${p.priority}`}>{p.priority}</span>
              </div>
              <small className="aubos-cleo-bt">{p.businessType}</small>
              <small className="aubos-cleo-preview">{p.preview}</small>
              <div className="aubos-cleo-card-foot">
                <span className={`aubos-cleo-status status-${p.status}`}>{p.status}</span>
                <small>{ago(p.receivedAt)}</small>
              </div>
            </button>
          ))}
        </aside>

        <section className="aubos-cleo-detail">
          {err ? <div className="aubos-cleo-error">{err}</div> : null}
          {detail ? (
            <PackageDetailView
              pkg={detail}
              plan={plan}
              busy={busy}
              onStatus={(s, n) => void setStatus(s, n)}
              onRunPlanner={() => void runPlanner()}
              onSendToTenantBuilder={onSendToTenantBuilder ? () => onSendToTenantBuilder(detail) : undefined}
            />
          ) : (
            <div className="aubos-cleo-empty-detail">select a package on the left to review</div>
          )}
        </section>
      </div>
    </div>
  );
}

function PackageDetailView({ pkg, plan, busy, onStatus, onRunPlanner, onSendToTenantBuilder }: {
  pkg: CleoPackage;
  plan: AubosBuildPlanLite | null;
  busy: string;
  onStatus: (status: CleoPackage["status"], note?: string) => void;
  onRunPlanner: () => void;
  onSendToTenantBuilder?: () => void;
}): JSX.Element {
  return (
    <div className="aubos-cleo-detail-wrap">
      <div className="aubos-cleo-detail-head">
        <div>
          <h2>{pkg.companySlug}</h2>
          <small>{pkg.customer.name} · {pkg.customer.email} · <a href={pkg.customer.website} target="_blank" rel="noreferrer">{pkg.customer.website}</a></small>
        </div>
        <div className="aubos-cleo-detail-pills">
          <span className={`aubos-cleo-pill pri-${pkg.priority}`}>{pkg.priority}</span>
          <span className={`aubos-cleo-status status-${pkg.status}`}>{pkg.status}</span>
        </div>
      </div>

      <Section title="Brand summary">
        <div className="aubos-cleo-brand">
          <strong>{pkg.scrape.businessType}</strong>
          {pkg.scrape.brand?.tone ? <small> · tone: {pkg.scrape.brand.tone}</small> : null}
          <p>{pkg.scrape.brand?.summary ?? "no summary captured"}</p>
          {pkg.scrape.brand?.colors && pkg.scrape.brand.colors.length > 0 ? (
            <div className="aubos-cleo-colors">
              {pkg.scrape.brand.colors.map((c) => (
                <span key={c} title={c} style={{ background: c }} />
              ))}
            </div>
          ) : null}
        </div>
      </Section>

      <Section title="Integrations detected">
        {pkg.scrape.integrationsDetected.length === 0 ? (
          <small>none auto-detected from the scrape</small>
        ) : (
          <div className="aubos-cleo-tags">
            {pkg.scrape.integrationsDetected.map((i) => <span key={i} className="aubos-cleo-tag">{i}</span>)}
          </div>
        )}
      </Section>

      {pkg.scrape.intelligence ? (
        <Section title="Website intelligence (auto-scraped)">
          <WebsiteIntelligenceView intel={pkg.scrape.intelligence} />
        </Section>
      ) : null}

      <Section title={`Canvas (${pkg.canvas.nodes.length} nodes · ${pkg.canvas.edges.length} edges)`}>
        <CanvasReadOnly canvas={pkg.canvas} />
      </Section>

      <Section title={`Chat history (${pkg.chatHistory.length} messages)`} collapsible>
        <div className="aubos-cleo-chat">
          {pkg.chatHistory.map((m, idx) => (
            <div key={idx} className={`aubos-cleo-chat-msg is-${m.role}`}>
              <span className="role">{m.role}</span>
              <span className="content">{m.content}</span>
              {m.toolCalls && Array.isArray(m.toolCalls) && m.toolCalls.length > 0 ? (
                <small className="tools">{(m.toolCalls as unknown[]).length} tool call(s)</small>
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      <Section title={plan ? `Automation plan · ${plan.capabilities.length} capabilities · est $${plan.estimatedCost.buildUsd.toFixed(2)} build · $${plan.estimatedCost.monthlyRuntimeUsd.toFixed(2)}/mo` : "Automation plan"}>
        {plan ? (
          <PlanView plan={plan} />
        ) : (
          <div className="aubos-cleo-empty-detail">
            <small>no plan yet · click "run planner" below to have the factory's planner read this canvas + the AUBOS reference book and emit an AubosBuildPlan</small>
          </div>
        )}
      </Section>

      {pkg.opsLog && pkg.opsLog.length > 0 ? (
        <Section title="Ops log" collapsible>
          <ul className="aubos-cleo-opslog">
            {pkg.opsLog.map((e, idx) => (
              <li key={idx}><small>{e.at.slice(11, 19)} · {e.actor}:</small> {e.action}{e.note ? ` — ${e.note}` : ""}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div className="aubos-cleo-actions">
        <button
          className="primary"
          disabled={!!busy || pkg.status === "planning"}
          onClick={onRunPlanner}
        >{busy === "planning" ? "planning… (~30-60s)" : plan ? "re-run planner" : "run planner"}</button>
        {onSendToTenantBuilder ? (
          <button disabled={!!busy} onClick={onSendToTenantBuilder}>open in tenant-builder canvas →</button>
        ) : null}
        <button disabled={busy === "awaiting-approval"} onClick={() => onStatus("awaiting-approval")}>{busy === "awaiting-approval" ? "…" : "send proposal to customer"}</button>
        <button disabled={busy === "needs-info"} onClick={() => {
          const note = window.prompt("What info do you need from the customer?", "");
          if (note !== null) onStatus("needs-info", note);
        }}>ask for more info</button>
        <button disabled={busy === "rejected"} className="reject" onClick={() => {
          const note = window.prompt("Reject reason?", "");
          if (note !== null) onStatus("rejected", note);
        }}>reject</button>
      </div>
    </div>
  );
}

function PlanView({ plan }: { plan: AubosBuildPlanLite }): JSX.Element {
  return (
    <div className="aubos-cleo-plan">
      <p className="aubos-cleo-plan-summary">{plan.topLevelSummary}</p>
      <div className="aubos-cleo-plan-meta">
        <small>generated {new Date(plan.generatedAt).toLocaleString()} · {plan.generatedByPlanner.model} · {(plan.generatedByPlanner.durationMs / 1000).toFixed(0)}s · ${plan.generatedByPlanner.costUsd.toFixed(3)}</small>
        {plan.database ? <small>db: {plan.database.mode}</small> : null}
        {plan.vps ? <small>vps: {plan.vps.tier} · {plan.vps.region}</small> : null}
        {plan.ui?.perVerticalDefaults ? <small>ui-vertical: {plan.ui.perVerticalDefaults.vertical}</small> : null}
      </div>
      <table className="aubos-cleo-plan-table">
        <thead>
          <tr>
            <th>outcome (customer-facing)</th>
            <th>autonomy</th>
            <th>module</th>
            <th>integrations</th>
            <th>slot</th>
          </tr>
        </thead>
        <tbody>
          {plan.capabilities.map((c) => (
            <tr key={c.canvasNodeId} className={`is-${c.autonomyLevel}`}>
              <td>
                <strong>{c.customerOutcomeLabel}</strong>
                <br/><small>{c.rationale}</small>
              </td>
              <td>
                <span className={`aubos-cleo-autonomy is-${c.autonomyLevel}`}>{
                  c.autonomyLevel === "full" ? "✓ full" :
                  c.autonomyLevel === "human-in-loop" ? "⚙ human-in-loop" :
                  "☖ human-only"
                }</span>
              </td>
              <td><code>{c.moduleId}</code></td>
              <td>
                {(c.requiredIntegrations ?? []).map((i) => (
                  <span key={i.provider} className="aubos-cleo-tag" title={i.scope}>{i.provider}</span>
                ))}
              </td>
              <td><small>{c.devAgentSlot}</small></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children, collapsible = false }: { title: string; children: React.ReactNode; collapsible?: boolean }): JSX.Element {
  const [open, setOpen] = useState(!collapsible);
  return (
    <div className="aubos-cleo-section">
      <button className="aubos-cleo-section-head" onClick={() => collapsible && setOpen(!open)}>
        <strong>{title}</strong>
        {collapsible ? <span>{open ? "−" : "+"}</span> : null}
      </button>
      {open ? <div className="aubos-cleo-section-body">{children}</div> : null}
    </div>
  );
}

/**
 * Read-only canvas preview. Each node is an HTML card (NOT raw SVG rect)
 * so we get rich line items inside the box. Edges are an SVG overlay
 * absolutely-positioned beneath the cards.
 */
const NODE_W = 280;
const NODE_HEADER_H = 56;
const NODE_LINE_H = 22;
const NODE_FOOTER_H = 30;

function CanvasReadOnly({ canvas }: { canvas: CleoPackage["canvas"] }): JSX.Element {
  // Auto-position nodes that have no explicit position.
  const positioned = useMemo(() => {
    const cols = Math.ceil(Math.sqrt(canvas.nodes.length));
    return canvas.nodes.map((n, idx) => {
      if (n.position) return { ...n, position: n.position };
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      return { ...n, position: { x: col * (NODE_W + 40) + 40, y: row * 280 + 40 } };
    });
  }, [canvas.nodes]);

  // Compute node heights so edges anchor correctly.
  const nodeHeights = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of positioned) {
      const lines = n.lineItems?.length ?? 0;
      const footer = n.footer ? NODE_FOOTER_H : 0;
      map.set(n.id, NODE_HEADER_H + lines * NODE_LINE_H + footer + 16);
    }
    return map;
  }, [positioned]);

  const w = Math.max(900, ...positioned.map((n) => n.position.x + NODE_W + 40));
  const h = Math.max(560, ...positioned.map((n) => n.position.y + (nodeHeights.get(n.id) ?? 120) + 40));

  return (
    <div className="aubos-cleo-canvas-wrap" style={{ position: "relative", width: "100%", minHeight: h, height: h, overflow: "auto" }}>
      <svg
        className="aubos-cleo-edges-overlay"
        style={{ position: "absolute", inset: 0, pointerEvents: "none", width: w, height: h }}
        viewBox={`0 0 ${w} ${h}`}
      >
        <defs>
          <marker id="cleo-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 8 4 L 0 8 z" fill="#3a3a3a" />
          </marker>
        </defs>
        {canvas.edges.map((e) => {
          const s = positioned.find((n) => n.id === e.source);
          const t = positioned.find((n) => n.id === e.target);
          if (!s || !t) return null;
          const sh = nodeHeights.get(s.id) ?? 100;
          const th = nodeHeights.get(t.id) ?? 100;
          const x1 = s.position.x + NODE_W / 2;
          const y1 = s.position.y + sh / 2;
          const x2 = t.position.x + NODE_W / 2;
          const y2 = t.position.y + th / 2;
          // Bezier-ish curve for visual polish.
          const dx = (x2 - x1) * 0.4;
          const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
          return (
            <g key={e.id}>
              <path d={path} className="aubos-cleo-edge" markerEnd="url(#cleo-arrow)" />
              {e.label ? (
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 4} className="aubos-cleo-edge-label" textAnchor="middle">
                  {e.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {positioned.map((n) => (
        <CanvasNodeCard key={n.id} node={n} />
      ))}
    </div>
  );
}

function CanvasNodeCard({ node }: { node: CanvasNode }): JSX.Element {
  return (
    <div
      className={`aubos-cleo-card-node kind-${node.kind ?? "default"}`}
      style={{
        position: "absolute",
        left: node.position?.x ?? 0,
        top: node.position?.y ?? 0,
        width: NODE_W
      }}
    >
      <div className="aubos-cleo-card-node-head">
        <div className="aubos-cleo-card-node-title">
          <strong>{node.label}</strong>
          {node.subLabel ? <small>{node.subLabel}</small> : null}
        </div>
        <span className={`aubos-cleo-card-node-kind kind-${node.kind}`}>{kindLabel(node.kind)}</span>
      </div>

      {node.lineItems && node.lineItems.length > 0 ? (
        <ul className="aubos-cleo-card-node-items">
          {node.lineItems.map((it, i) => (
            <li key={i} className={`aubos-cleo-card-node-item ${it.status ? `is-${it.status}` : ""}`}>
              {it.glyph ? <span className="g">{it.glyph}</span> : <span className="g">·</span>}
              <span className="t">{it.text}</span>
              {it.meta ? <span className="m">{it.meta}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {node.footer ? (
        <div className="aubos-cleo-card-node-footer">
          <span>{node.footer.left ?? ""}</span>
          <span>{node.footer.right ?? ""}</span>
        </div>
      ) : null}
    </div>
  );
}

function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    "business-area": "AREA",
    "process": "PROCESS",
    "data-source": "DATA",
    "integration": "INTEGRATION",
    "pain-point": "PAIN",
    "cleo": "CLEO"
  };
  return map[kind] ?? kind?.toUpperCase() ?? "?";
}

const PLATFORM_GLYPH: Record<string, string> = {
  instagram: "📷", tiktok: "▣", youtube: "▶", linkedin: "💼",
  x: "𝕏", threads: "𝙏", facebook: "📘", pinterest: "📌", snapchat: "👻"
};

function WebsiteIntelligenceView({ intel }: { intel: WebsiteIntelligence }): JSX.Element {
  return (
    <div className="aubos-cleo-intel">
      <div className="aubos-cleo-intel-grid">
        <div className="aubos-cleo-intel-block">
          <h4>Brand</h4>
          <div className="row"><strong>{intel.brand.name}</strong></div>
          {intel.brand.tagline ? <div className="row"><em>"{intel.brand.tagline}"</em></div> : null}
          <p>{intel.brand.summary}</p>
          {intel.brand.tone ? <div className="row"><small>tone:</small> {intel.brand.tone}</div> : null}
          {intel.brand.colors && intel.brand.colors.length > 0 ? (
            <div className="row aubos-cleo-colors">
              {intel.brand.colors.map((c) => <span key={c} title={c} style={{ background: c }} />)}
            </div>
          ) : null}
          {intel.brand.fonts && intel.brand.fonts.length > 0 ? (
            <div className="row"><small>fonts:</small> {intel.brand.fonts.join(", ")}</div>
          ) : null}
        </div>

        <div className="aubos-cleo-intel-block">
          <h4>Social presence ({intel.socialPresence.length})</h4>
          {intel.socialPresence.length === 0 ? <small>none detected</small> : null}
          {intel.socialPresence.map((s) => (
            <a key={s.platform} className="aubos-cleo-intel-row" href={s.url} target="_blank" rel="noreferrer">
              <span className="g">{PLATFORM_GLYPH[s.platform] ?? "•"}</span>
              <span className="t"><strong>{s.platform}</strong> · {s.handle}</span>
              <span className="m">
                {s.followers ? `${formatCount(s.followers)} followers` : "no count"}
                {s.cadencePerWeek ? ` · ${s.cadencePerWeek}/wk` : ""}
              </span>
            </a>
          ))}
        </div>

        <div className="aubos-cleo-intel-block">
          <h4>Tech stack ({intel.techStack.length})</h4>
          {intel.techStack.map((t, i) => (
            <div key={i} className="aubos-cleo-intel-row">
              <span className={`aubos-cleo-conf is-${t.confidence}`}>{t.confidence[0]}</span>
              <span className="t"><strong>{t.name}</strong></span>
              <span className="m">{t.category}{t.detail ? ` · ${t.detail}` : ""}</span>
            </div>
          ))}
        </div>

        <div className="aubos-cleo-intel-block">
          <h4>Pages discovered ({intel.pages.length})</h4>
          {intel.pages.map((p, i) => (
            <a key={i} className="aubos-cleo-intel-row" href={p.url} target="_blank" rel="noreferrer">
              <span className="g">▤</span>
              <span className="t">{p.title ?? p.url}</span>
              <span className="m">{p.kind}</span>
            </a>
          ))}
        </div>

        <div className="aubos-cleo-intel-block">
          <h4>Contacts</h4>
          {intel.contacts.emails.map((e) => (
            <div key={e} className="aubos-cleo-intel-row">
              <span className="g">✉</span>
              <span className="t">{e}</span>
            </div>
          ))}
          {intel.contacts.phones.map((p) => (
            <div key={p} className="aubos-cleo-intel-row">
              <span className="g">📞</span>
              <span className="t">{p}</span>
            </div>
          ))}
          {intel.contacts.addresses?.map((a) => (
            <div key={a} className="aubos-cleo-intel-row">
              <span className="g">📍</span>
              <span className="t">{a}</span>
            </div>
          ))}
        </div>

        <div className="aubos-cleo-intel-block">
          <h4>Products / services ({intel.productsOrServices.length})</h4>
          {intel.productsOrServices.map((p, i) => (
            <div key={i} className="aubos-cleo-intel-row">
              <span className="g">●</span>
              <span className="t"><strong>{p.name}</strong>{p.description ? ` · ${p.description}` : ""}</span>
              {p.price ? <span className="m">{p.price}</span> : null}
            </div>
          ))}
        </div>

        <div className="aubos-cleo-intel-block aubos-cleo-intel-signals">
          <h4>Signals</h4>
          <SignalPill on={intel.signals.isEcommerce} label="ecommerce" />
          <SignalPill on={intel.signals.hasNewsletterSignup} label="newsletter signup" />
          <SignalPill on={intel.signals.hasLiveChat} label="live chat" />
          <SignalPill on={intel.signals.hasBlog} label="blog" />
          <SignalPill on={intel.signals.hasCareersPage} label="careers" />
          <SignalPill on={intel.signals.hasReviews} label="reviews" />
          {intel.signals.estimatedTeamSize ? (
            <SignalPill on={true} label={`team ~${intel.signals.estimatedTeamSize}`} />
          ) : null}
        </div>
      </div>
      <div className="aubos-cleo-intel-foot">
        <small>scraped {ago(intel.scrapedAt)} from <a href={intel.url} target="_blank" rel="noreferrer">{intel.url}</a></small>
      </div>
    </div>
  );
}

function SignalPill({ on, label }: { on: boolean; label: string }): JSX.Element {
  return <span className={`aubos-cleo-signal ${on ? "is-on" : "is-off"}`}>{on ? "✓" : "·"} {label}</span>;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
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
