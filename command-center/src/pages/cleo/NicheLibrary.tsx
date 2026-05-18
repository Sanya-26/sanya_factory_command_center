// Cleo · Niche library — Template B accumulator + per-niche detail page.
// Every card on the index opens a real detail page at #cleo/niche-library/<slug>.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { navigate, type Route } from "../../shell/route";
import { BusinessMap } from "../../components/BusinessMap";

interface NicheRow {
  niche_slug: string;
  display_name: string;
  refined_count: number;
  source_company_ids: string[];
  template: any;
  created_at: string;
  updated_at: string;
}

export function NicheLibraryPage({ route }: { route: Route }): JSX.Element {
  if (route.id) {
    return <NicheDetail slug={route.id} />;
  }
  return <NicheIndex />;
}

// ─── Index ──────────────────────────────────────────────────────────────

function NicheIndex(): JSX.Element {
  const [rows, setRows] = useState<NicheRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      const { data, error } = await sb
        .from("niche_templates")
        .select("*")
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows((data ?? []) as NicheRow[]);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="shell-content-wide">
      <div className="page-header">
        <h1 className="page-title">Niche library</h1>
        <p className="page-subtitle">
          Reusable scaffolds harvested from approved customer proposals. Each
          niche compounds: every new customer in the same vertical refines its
          template instead of building from scratch.
        </p>
      </div>

      {error ? (
        <div className="empty">{error}</div>
      ) : rows === null ? (
        <div className="empty">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <strong>No niches yet</strong>
          <p>Niche templates appear here once an approved Architect proposal is generalized into a reusable scaffold.</p>
        </div>
      ) : (
        <div className="niche-grid">
          {rows.map((r) => {
            const nodes = (r.template?.nodes ?? []).length as number;
            const ints = (r.template?.required_integrations ?? []).length as number;
            return (
              <button
                key={r.niche_slug}
                type="button"
                className="niche-card niche-card-clickable"
                onClick={() => navigate({ dept: "cleo", section: "niche-library", id: r.niche_slug })}
              >
                <div className="niche-card-name">{r.display_name}</div>
                <div className="niche-card-slug">{r.niche_slug}</div>
                <div className="niche-card-stats">
                  <div className="niche-card-stat">
                    <strong>{nodes}</strong>
                    <span>nodes</span>
                  </div>
                  <div className="niche-card-stat">
                    <strong>{ints}</strong>
                    <span>integrations</span>
                  </div>
                  <div className="niche-card-stat">
                    <strong>{r.refined_count}</strong>
                    <span>refines</span>
                  </div>
                  <div className="niche-card-stat">
                    <strong>{r.source_company_ids.length}</strong>
                    <span>sources</span>
                  </div>
                </div>
                <div className="niche-card-foot">open template →</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Detail ─────────────────────────────────────────────────────────────

function NicheDetail({ slug }: { slug: string }): JSX.Element {
  const [niche, setNiche] = useState<NicheRow | null>(null);
  const [sources, setSources] = useState<Array<{ id: string; name: string; home_website: string | null }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      const { data, error } = await sb
        .from("niche_templates")
        .select("*")
        .eq("niche_slug", slug)
        .maybeSingle();
      if (cancelled) return;
      if (error) { setError(error.message); return; }
      if (!data) { setError("Niche template not found."); return; }
      const row = data as NicheRow;
      setNiche(row);
      const ids = row.source_company_ids ?? [];
      if (ids.length) {
        const { data: companies } = await sb
          .from("companies")
          .select("id, name, home_website")
          .in("id", ids);
        if (!cancelled) setSources((companies ?? []) as any);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (error) {
    return (
      <div className="shell-content-narrow">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => navigate({ dept: "cleo", section: "niche-library" })}
          style={{ marginBottom: 16 }}
        >
          ← All niches
        </button>
        <div className="empty">{error}</div>
      </div>
    );
  }
  if (!niche) {
    return <div className="empty">Loading niche…</div>;
  }

  const t = niche.template ?? {};
  const nodes = (t.nodes ?? []) as Array<any>;
  const edges = (t.edges ?? []) as Array<any>;
  const required = (t.required_integrations ?? []) as string[];
  const aiNodes = nodes.filter((n) => n.data?.automation === "ai").length;
  const userNodes = nodes.filter((n) => n.data?.automation === "user-action").length;
  const integrations = nodes.filter((n) => n.kind === "integration");
  const areas = nodes.filter((n) => n.kind === "business-area");
  const processes = nodes.filter((n) => n.kind === "process");

  return (
    <div className="shell-content-wide">
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => navigate({ dept: "cleo", section: "niche-library" })}
        style={{ marginBottom: 16 }}
      >
        ← All niches
      </button>

      <div className="page-header row">
        <div>
          <h1 className="page-title">{niche.display_name}</h1>
          <p className="page-subtitle">
            <span className="mono">{niche.niche_slug}</span> ·
            refined {niche.refined_count}× ·
            updated {new Date(niche.updated_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="niche-grid" style={{ marginBottom: 32 }}>
        <KPI label="Nodes" value={nodes.length} />
        <KPI label="Edges" value={edges.length} />
        <KPI label="Required integrations" value={required.length} />
        <KPI label="AI-handled" value={aiNodes} />
        <KPI label="Human-required" value={userNodes} />
        <KPI label="Source customers" value={sources.length} />
      </div>

      <section style={{ marginBottom: 32 }}>
        <h2 className="section-title">Template diagram</h2>
        {nodes.length === 0 ? (
          <div className="empty"><p>This template has no nodes.</p></div>
        ) : (
          <div className="canvas-stage" style={{ height: 640 }}>
            <BusinessMap nodes={nodes} edges={edges} />
          </div>
        )}
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 className="section-title">Required integrations</h2>
        {required.length === 0 ? (
          <div className="empty"><p>This template doesn't call for any integrations yet.</p></div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {required.map((id) => (
              <span key={id} className="pill muted"><span className="pill-dot" />{id}</span>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 className="section-title">Business areas ({areas.length})</h2>
        {areas.length === 0 ? (
          <div className="empty"><p>No areas defined.</p></div>
        ) : (
          <ul className="detail-list">
            {areas.map((n) => (
              <li key={n.id}>
                <strong>{n.label}</strong>
                {n.subLabel ? <span className="dim"> · {n.subLabel}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 className="section-title">Processes ({processes.length})</h2>
        {processes.length === 0 ? (
          <div className="empty"><p>No processes defined.</p></div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Process</th>
                <th>Automation</th>
                <th>AUBOS components</th>
              </tr>
            </thead>
            <tbody>
              {processes.map((n) => (
                <tr key={n.id}>
                  <td>{n.label}</td>
                  <td>
                    {n.data?.automation === "ai" ? (
                      <span className="pill done"><span className="pill-dot" />AI</span>
                    ) : n.data?.automation === "user-action" ? (
                      <span className="pill warn"><span className="pill-dot" />Human</span>
                    ) : (
                      <span className="dim">—</span>
                    )}
                  </td>
                  <td className="dim">
                    {(n.data?.aubos_components ?? []).length > 0
                      ? (n.data.aubos_components as string[]).join(", ")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 className="section-title">Source customers ({sources.length})</h2>
        {sources.length === 0 ? (
          <div className="empty"><p>No source customers recorded yet.</p></div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Customer</th><th>Website</th></tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr
                  key={s.id}
                  className="clickable"
                  onClick={() => navigate({ dept: "cleo", section: "customers", id: s.id, sub: "overview" })}
                >
                  <td>{s.name}</td>
                  <td className="dim">{s.home_website ? s.home_website.replace(/^https?:\/\/(www\.)?/, "") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="section-title">Raw template</h2>
        <details>
          <summary style={{ cursor: "pointer", color: "var(--text-dim)", fontSize: "0.82rem", marginBottom: 8 }}>
            Show JSON
          </summary>
          <pre style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: 16,
            fontSize: "0.74rem",
            fontFamily: "var(--font-mono)",
            color: "var(--text-dim)",
            overflowX: "auto",
            maxHeight: 480,
          }}>
            {JSON.stringify(niche.template, null, 2)}
          </pre>
        </details>
      </section>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="card">
      <div style={{ fontSize: "1.6rem", fontWeight: 600, letterSpacing: "-0.015em" }}>{value}</div>
      <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}
