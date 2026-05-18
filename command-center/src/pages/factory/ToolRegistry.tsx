// AI Factory · Tool registry — shows every tool the tool-registrar has
// discovered + extracted from DrinkGio/aubos_tools. Updates in realtime.
// "Refresh now" button forces a re-extract regardless of content hash.

import { useEffect, useState, useCallback } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { navigate, type Route } from "../../shell/route";

interface RegistryRow {
  tool_id: string;
  name: string;
  purpose: string | null;
  category: string | null;
  status: string | null;
  capabilities: string[];
  replaces: string[];
  takes: string[];
  returns: string[];
  source_path: string | null;
  source_files: string[];
  content_hash: string | null;
  extracted_at: string;
  extracted_by: string | null;
  updated_at: string;
}

export function ToolRegistryPage({ route }: { route: Route }): JSX.Element {
  if (route.id) return <ToolDetail toolId={route.id} />;
  return <ToolIndex />;
}

function ToolIndex(): JSX.Element {
  const [rows, setRows] = useState<RegistryRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const sb = getFactorySupabase();
    const { data, error } = await sb
      .from("aubos_tools_registry")
      .select("*")
      .order("name", { ascending: true });
    if (error) setError(error.message);
    else setRows((data ?? []) as RegistryRow[]);
  }, []);

  useEffect(() => {
    void reload();
    const sb = getFactorySupabase();
    const ch = sb
      .channel("tool-registry-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "aubos_tools_registry" },
        () => void reload(),
      )
      .subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [reload]);

  const refresh = async (force: boolean) => {
    setRefreshing(true);
    try {
      const { data: { session } } = await getFactorySupabase().auth.getSession();
      const token = session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tool-registrar`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          },
          body: JSON.stringify({ refresh: force }),
        },
      );
      if (!res.ok) setError(`refresh: ${res.status} ${await res.text()}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="shell-content-wide">
      <div className="page-header row">
        <div>
          <h1 className="page-title">Tool registry</h1>
          <p className="page-subtitle">
            Every tool in <span className="mono">DrinkGio/aubos_tools</span>, auto-extracted
            from each tool's README + schema + runbook by the tool-registrar agent.
            Council picks these in proposals when capabilities match.
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn"
            onClick={() => void refresh(false)}
            disabled={refreshing}
            title="Discover new tools and re-extract anything that changed (hash-checked)"
          >
            {refreshing ? "Refreshing…" : "Discover new"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void refresh(true)}
            disabled={refreshing}
            title="Force re-extract every tool, ignoring the content-hash cache"
          >
            {refreshing ? "Refreshing…" : "Force refresh all"}
          </button>
        </div>
      </div>

      {error ? <div className="empty">{error}</div> : null}

      {rows === null ? (
        <div className="empty">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <strong>Registry empty</strong>
          <p>Hit "Discover new" to scan aubos_tools and auto-extract metadata for every tool.</p>
        </div>
      ) : (
        <div className="niche-grid">
          {rows.map((r) => (
            <button
              key={r.tool_id}
              type="button"
              className="niche-card niche-card-clickable"
              onClick={() => navigate({ dept: "factory", section: "tool-registry", id: r.tool_id })}
            >
              <div className="niche-card-name">{r.name}</div>
              <div className="niche-card-slug">{r.tool_id} · {r.category}</div>
              {r.purpose ? (
                <p style={{ margin: "8px 0 12px", fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
                  {r.purpose}
                </p>
              ) : null}
              <div className="niche-card-stats">
                <div className="niche-card-stat"><strong>{r.capabilities.length}</strong><span>capabilities</span></div>
                <div className="niche-card-stat"><strong>{r.replaces.length}</strong><span>replaces</span></div>
                <div className="niche-card-stat">
                  <strong style={{ fontSize: "0.74rem" }}>{r.status ?? "—"}</strong>
                  <span>status</span>
                </div>
              </div>
              <div className="niche-card-foot">view extraction →</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolDetail({ toolId }: { toolId: string }): JSX.Element {
  const [row, setRow] = useState<RegistryRow | null | "loading">("loading");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      const { data } = await sb
        .from("aubos_tools_registry")
        .select("*")
        .eq("tool_id", toolId)
        .maybeSingle();
      if (!cancelled) setRow((data ?? null) as RegistryRow | null);
    })();
    return () => { cancelled = true; };
  }, [toolId]);

  if (row === "loading") return <div className="empty">Loading…</div>;
  if (!row) {
    return (
      <div className="shell-content-narrow">
        <button type="button" className="btn btn-ghost" onClick={() => navigate({ dept: "factory", section: "tool-registry" })} style={{ marginBottom: 16 }}>
          ← All tools
        </button>
        <div className="empty"><strong>Tool not found</strong><p>{toolId}</p></div>
      </div>
    );
  }

  return (
    <div className="shell-content-wide">
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => navigate({ dept: "factory", section: "tool-registry" })}
        style={{ marginBottom: 16 }}
      >
        ← All tools
      </button>

      <div className="page-header row">
        <div>
          <h1 className="page-title">{row.name}</h1>
          <p className="page-subtitle">
            <span className="mono">{row.tool_id}</span> · {row.category} · status {row.status ?? "—"}
          </p>
        </div>
      </div>

      {row.purpose ? (
        <div className="card" style={{ marginBottom: 24 }}>
          <p style={{ margin: 0, lineHeight: 1.55 }}>{row.purpose}</p>
        </div>
      ) : null}

      <Section label={`Capabilities (${row.capabilities.length})`}>
        <Pills items={row.capabilities} variant="muted" />
      </Section>

      <Section label={`Replaces (${row.replaces.length})`}>
        {row.replaces.length === 0 ? (
          <p className="dim">No external services explicitly named in source materials.</p>
        ) : (
          <Pills items={row.replaces} variant="warn" />
        )}
      </Section>

      <Section label={`Takes (${row.takes.length})`}>
        <Pills items={row.takes} variant="muted" />
      </Section>

      <Section label={`Returns (${row.returns.length})`}>
        <Pills items={row.returns} variant="done" />
      </Section>

      <Section label="Extraction">
        <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-dim)" }}>
          Auto-extracted by <span className="mono">{row.extracted_by ?? "unknown"}</span> on{" "}
          {new Date(row.extracted_at).toLocaleString()}.<br />
          Source files: {(row.source_files ?? []).map((f) => <span key={f} className="mono" style={{ marginRight: 8 }}>{f}</span>)}<br />
          Content hash: <span className="mono dim">{row.content_hash?.slice(0, 16)}…</span>
        </p>
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 className="section-title">{label}</h2>
      {children}
    </section>
  );
}

function Pills({ items, variant }: { items: string[]; variant: "muted" | "done" | "warn" }): JSX.Element {
  if (items.length === 0) return <p className="dim">—</p>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {items.map((it) => (
        <span key={it} className={`pill ${variant}`}>
          <span className="pill-dot" />{it}
        </span>
      ))}
    </div>
  );
}
