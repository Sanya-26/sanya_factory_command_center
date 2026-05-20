// Product · Per-niche customer flags / complaints view.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { navigate } from "../../shell/route";

interface Flag {
  id: string;
  company_id: string;
  reported_at: string;
  source: string;
  severity: string;
  title: string;
  body: string | null;
  status: string;
  resolved_at: string | null;
  company_name?: string;
}

const SEV_COLOR: Record<string, string> = {
  low: "#9ca3af",
  medium: "#f59e0b",
  high: "#ef4444",
  critical: "#7f1d1d",
};

export function ProductFlagsPage({ niche }: { niche: string }): JSX.Element {
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      try {
        const { data: comps } = await sb.from("companies").select("id, name").eq("niche", niche);
        const companyIds = (comps ?? []).map((c: { id: string }) => c.id);
        const nameById = Object.fromEntries((comps ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
        const { data, error: err } = await sb
          .from("customer_flags")
          .select("*")
          .in("company_id", companyIds)
          .order("reported_at", { ascending: false });
        if (err) throw err;
        if (cancelled) return;
        setFlags(((data ?? []) as Flag[]).map((f) => ({ ...f, company_name: nameById[f.company_id] ?? f.company_id })));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      }
    })();
    return () => { cancelled = true; };
  }, [niche]);

  async function resolve(id: string) {
    const sb = getFactorySupabase();
    await sb.from("customer_flags").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", id);
    setFlags((cur) => cur?.map((f) => f.id === id ? { ...f, status: "resolved" } : f) ?? null);
  }

  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" className="btn-ghost" onClick={() => navigate({ dept: "product", section: niche })}>← Back</button>
        <h1 style={{ margin: 0 }}>Flags · {titleFor(niche)}</h1>
      </header>

      {error ? <div style={{ background: "#fee2e2", color: "#b91c1c", padding: 10, borderRadius: 6 }}>{error}</div> : null}

      <table style={{ width: "100%", borderCollapse: "collapse", background: "white", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <thead>
          <tr style={{ background: "#f9fafb", textAlign: "left", color: "#6b7280", fontSize: 12 }}>
            <th style={{ padding: 10 }}>Reported</th>
            <th style={{ padding: 10 }}>Customer</th>
            <th style={{ padding: 10 }}>Severity</th>
            <th style={{ padding: 10 }}>Source</th>
            <th style={{ padding: 10 }}>Title</th>
            <th style={{ padding: 10 }}>Status</th>
            <th style={{ padding: 10 }}></th>
          </tr>
        </thead>
        <tbody>
          {(flags ?? []).map((f) => (
            <tr key={f.id} style={{ borderTop: "1px solid #f3f4f6" }}>
              <td style={{ padding: 10, fontSize: 12, color: "#6b7280" }}>{new Date(f.reported_at).toLocaleString()}</td>
              <td style={{ padding: 10 }}>
                <button type="button" onClick={() => navigate({ dept: "product", section: niche, id: "customer", sub: f.company_id })} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", padding: 0 }}>
                  {f.company_name}
                </button>
              </td>
              <td style={{ padding: 10 }}>
                <span style={{ background: SEV_COLOR[f.severity] ?? "#9ca3af", color: "white", padding: "2px 8px", borderRadius: 999, fontSize: 12 }}>
                  {f.severity}
                </span>
              </td>
              <td style={{ padding: 10 }}>{f.source}</td>
              <td style={{ padding: 10 }}>{f.title}</td>
              <td style={{ padding: 10 }}>{f.status}</td>
              <td style={{ padding: 10 }}>
                {f.status === "open" ? (
                  <button type="button" className="btn" onClick={() => void resolve(f.id)}>Resolve</button>
                ) : null}
              </td>
            </tr>
          ))}
          {(flags?.length ?? 0) === 0 ? (
            <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#9ca3af" }}>No flags.</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function titleFor(slug: string): string {
  return slug.split("-").map((s) => s[0]?.toUpperCase() + s.slice(1)).join(" ");
}
