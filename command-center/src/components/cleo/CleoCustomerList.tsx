// Cleo customer list — full page, click row to drill in.
// Uses the new shared design system classes (.page-header, .input, .table, .pill).

import { useEffect, useState, useCallback } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";

interface Company {
  id: string;
  name: string;
  home_website: string | null;
  email: string | null;
  industry: string | null;
  niche: string | null;
  signup_source: string;
  invited_by: string | null;
  created_at: string;
}
interface CompanyIntel {
  company_id: string;
  scrape_status: "queued" | "scraping" | "done" | "failed";
  scrape_started_at: string | null;
  scrape_completed_at: string | null;
  scrape_error: string | null;
  summary: string | null;
  pages_crawled: number;
  updated_at: string;
}
type Row = Company & { intel?: CompanyIntel };

export function CleoCustomerList({
  onOpen,
}: {
  onOpen: (companyId: string) => void;
}): JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "scraping" | "done" | "failed">("all");

  const reload = useCallback(async () => {
    setError(null);
    const sb = getFactorySupabase();
    const { data: companies, error: cErr } = await sb
      .from("companies")
      .select("id, name, home_website, email, industry, niche, signup_source, invited_by, created_at")
      .order("created_at", { ascending: false });
    if (cErr) { setError(cErr.message); setLoading(false); return; }
    const ids = (companies ?? []).map((c) => (c as Company).id);
    let intelByCompany: Record<string, CompanyIntel> = {};
    if (ids.length) {
      const { data: intel } = await sb.from("company_intel").select("*").in("company_id", ids);
      for (const r of (intel ?? []) as CompanyIntel[]) intelByCompany[r.company_id] = r;
    }
    setRows(((companies ?? []) as Company[]).map((c) => ({ ...c, intel: intelByCompany[c.id] })));
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const sb = getFactorySupabase();
    const ch = sb
      .channel("cleo-cust-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "companies" }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "company_intel" }, () => void reload())
      .subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [reload]);

  const filtered = rows.filter((r) => {
    if (filter !== "all" && r.intel?.scrape_status !== filter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      (r.home_website ?? "").toLowerCase().includes(q) ||
      (r.email ?? "").toLowerCase().includes(q) ||
      (r.intel?.summary ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="page-header row">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">{rows.length} signed up · click a row for the full journey.</p>
        </div>
      </div>

      <div className="customers-toolbar">
        <input
          type="search"
          placeholder="Search by name, website, email, summary…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
        />
        <select
          className="input"
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          style={{ width: 160 }}
        >
          <option value="all">All stages</option>
          <option value="scraping">Scraping</option>
          <option value="done">Scraped</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {error ? <div className="empty">{error}</div> : null}

      {loading ? (
        <div className="empty">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <strong>{rows.length === 0 ? "No customers yet" : "No matches"}</strong>
          <p>
            {rows.length === 0
              ? "Customers appear here as they redeem an invite code at /signup."
              : "Try a different search or filter."}
          </p>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Website</th>
              <th>Status</th>
              <th>Summary</th>
              <th>Last activity</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const status = r.intel?.scrape_status ?? "—";
              const summary = r.intel?.summary
                ?? (r.intel?.scrape_error ? `error: ${r.intel.scrape_error}` : "—");
              return (
                <tr key={r.id} className="clickable" onClick={() => onOpen(r.id)}>
                  <td>{r.name}</td>
                  <td className="dim">{r.home_website ? stripHttp(r.home_website) : "—"}</td>
                  <td>
                    <span className={`pill ${pillFor(status)}`}>
                      <span className="pill-dot" />
                      {status === "—" ? "no scrape" : status}
                    </span>
                  </td>
                  <td className="dim" title={summary}>{truncate(summary, 100)}</td>
                  <td className="dim mono">{relativeTime(r.intel?.updated_at ?? r.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function pillFor(s: string): string {
  if (s === "done") return "done";
  if (s === "scraping" || s === "queued") return "running";
  if (s === "failed") return "failed";
  return "muted";
}
function stripHttp(u: string): string { return u.replace(/^https?:\/\/(www\.)?/, ""); }
function truncate(s: string, n: number): string {
  if (!s) return "—";
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}
