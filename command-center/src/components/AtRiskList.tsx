// At-risk customers list. Replaces the previous Account-Health donut on the
// overview + per-niche pages. Surfaces the WHY for every yellow/red customer.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../lib/factorySupabase";
import { fetchAccountHealth, STATUS_COLOR, type HealthStatus } from "../lib/health-score";
import { navigate, type Department } from "../shell/route";

interface Company { id: string; name: string; niche: string | null }
interface Flag { company_id: string; severity: string; status: string; title: string; reported_at: string }
interface Issue { company_id: string | null; severity: string; status: string }
interface AtRiskRow {
  company_id: string;
  company_name: string;
  niche: string | null;
  status: HealthStatus;
  reasons: string[];
}

export function AtRiskList({
  nicheFilter,
  maxRows = 8,
  fallbackDept = "product",
}: {
  nicheFilter?: string;
  maxRows?: number;
  fallbackDept?: Department;
}): JSX.Element {
  const [rows, setRows] = useState<AtRiskRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      const q = sb.from("companies").select("id, name, niche");
      const { data: companies } = nicheFilter ? await q.eq("niche", nicheFilter) : await q;
      const ids = ((companies ?? []) as Company[]).map((c) => c.id);
      const [{ data: flags }, { data: issues }, health] = await Promise.all([
        sb.from("customer_flags").select("company_id, severity, status, title, reported_at").in("company_id", ids).eq("status", "open"),
        sb.from("tech_issues").select("company_id, severity, status").in("company_id", ids),
        fetchAccountHealth(ids),
      ]);
      const flagsByC = new Map<string, Flag[]>();
      for (const f of (flags ?? []) as Flag[]) {
        const a = flagsByC.get(f.company_id) ?? [];
        a.push(f);
        flagsByC.set(f.company_id, a);
      }
      const issuesByC = new Map<string, Issue[]>();
      for (const i of (issues ?? []) as Issue[]) {
        if (!i.company_id) continue;
        const a = issuesByC.get(i.company_id) ?? [];
        a.push(i);
        issuesByC.set(i.company_id, a);
      }
      const at: AtRiskRow[] = [];
      for (const c of (companies ?? []) as Company[]) {
        const h = health.find((x) => x.company_id === c.id);
        if (!h || h.status === "green") continue;
        const reasons: string[] = [];
        const cf = flagsByC.get(c.id) ?? [];
        const crit = cf.filter((f) => f.severity === "critical").length;
        const high = cf.filter((f) => f.severity === "high").length;
        const med = cf.filter((f) => f.severity === "medium").length;
        if (crit > 0) reasons.push(`${crit} critical flag${crit === 1 ? "" : "s"} open`);
        if (high > 0) reasons.push(`${high} high flag${high === 1 ? "" : "s"} open`);
        if (med > 1) reasons.push(`${med} medium flags open`);
        const openIssues = (issuesByC.get(c.id) ?? []).filter((i) => !["done", "wontfix"].includes(i.status));
        const issueHigh = openIssues.filter((i) => ["high", "critical"].includes(i.severity)).length;
        if (issueHigh > 0) reasons.push(`${issueHigh} high-severity issue${issueHigh === 1 ? "" : "s"}`);
        if (reasons.length === 0) reasons.push("at-risk per health view");
        at.push({ company_id: c.id, company_name: c.name, niche: c.niche, status: h.status, reasons });
      }
      // sort red first, then yellow
      at.sort((a, b) => (a.status === "red" ? 0 : 1) - (b.status === "red" ? 0 : 1));
      if (!cancelled) setRows(at);
    })();
    return () => { cancelled = true; };
  }, [nicheFilter]);

  if (rows === null) {
    return <p style={{ color: "#9ca3af", fontStyle: "italic", margin: 0, fontSize: 13 }}>Loading…</p>;
  }
  if (rows.length === 0) {
    return (
      <p style={{ color: "#10b981", fontWeight: 500, margin: 0, fontSize: 13 }}>
        ✓ All accounts healthy.
      </p>
    );
  }

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13 }}>
      {rows.slice(0, maxRows).map((r) => (
        <li
          key={r.company_id}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "10px 0",
            borderTop: "1px solid #f3f4f6",
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: STATUS_COLOR[r.status],
              marginTop: 5,
              flexShrink: 0,
            }}
            title={r.status.toUpperCase()}
          />
          <div style={{ flex: 1 }}>
            <button
              type="button"
              onClick={() => navigate({ dept: fallbackDept, section: r.niche ?? "home", id: "customer", sub: r.company_id })}
              style={{ background: "none", border: "none", color: "#2563eb", padding: 0, cursor: "pointer", fontSize: 13, fontWeight: 500, textAlign: "left" }}
            >
              {r.company_name}
            </button>
            <div style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>
              {r.reasons.join(" · ")}
            </div>
          </div>
        </li>
      ))}
      {rows.length > maxRows ? (
        <li style={{ color: "#9ca3af", fontSize: 12, padding: "8px 0", borderTop: "1px solid #f3f4f6" }}>
          + {rows.length - maxRows} more…
        </li>
      ) : null}
    </ul>
  );
}
