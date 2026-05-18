// AI Factory · Overview — fleet KPI strip + clickable shortcut cards.
// Per CLAUDE.md rule: stat tiles must either link somewhere or be flat KPIs.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { navigate, type Route } from "../../shell/route";

interface Stats {
  customers: number;
  customersScraped: number;
  councilRunsToday: number;
  tenantsLive: number;
  buildsInFlight: number;
  niches: number;
}

export function FactoryOverviewPage(): JSX.Element {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      const todayIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [customersR, scrapedR, councilR, tenantsR, buildsR, nichesR] = await Promise.all([
        sb.from("companies").select("id", { count: "exact", head: true }),
        sb.from("company_intel").select("company_id", { count: "exact", head: true }).eq("scrape_status", "done"),
        sb.from("council_outputs").select("id", { count: "exact", head: true }).gte("started_at", todayIso),
        sb.from("tenants").select("id", { count: "exact", head: true }).eq("status", "live"),
        sb.from("build_runs").select("id", { count: "exact", head: true }).in("status", ["running", "queued", "in-progress"]),
        sb.from("niche_templates").select("niche_slug", { count: "exact", head: true }),
      ]);
      if (cancelled) return;
      setStats({
        customers: customersR.count ?? 0,
        customersScraped: scrapedR.count ?? 0,
        councilRunsToday: councilR.count ?? 0,
        tenantsLive: tenantsR.count ?? 0,
        buildsInFlight: buildsR.count ?? 0,
        niches: nichesR.count ?? 0,
      });
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="shell-content-wide">
      <div className="page-header">
        <h1 className="page-title">AI Factory</h1>
        <p className="page-subtitle">
          Fleet view across every customer. Numbers are live across the whole AUBOS factory.
        </p>
      </div>

      {!stats ? (
        <div className="empty">Loading fleet stats…</div>
      ) : (
        <>
          {/* KPI strip — flat numbers, no card chrome (so they don't look clickable) */}
          <section className="kpi-strip">
            <KPI label="Customers signed up" value={stats.customers} />
            <KPI label="Scrape complete" value={stats.customersScraped} />
            <KPI label="Council runs (24h)" value={stats.councilRunsToday} />
            <KPI label="Tenants live" value={stats.tenantsLive} />
            <KPI label="Builds in flight" value={stats.buildsInFlight} />
            <KPI label="Niche templates" value={stats.niches} />
          </section>

          {/* Clickable shortcut cards — each opens a real page */}
          <h2 className="section-title">Jump to</h2>
          <div className="niche-grid">
            <Shortcut
              title="Customers"
              desc="Every signed-up customer + their full journey."
              to={{ dept: "cleo", section: "customers" }}
            />
            <Shortcut
              title="Tenants"
              desc="Every live VPS — IPs, regions, costs, ops actions."
              to={{ dept: "factory", section: "tenants" }}
            />
            <Shortcut
              title="Build agents"
              desc="The 6-agent dev pipeline that ships customer tools."
              to={{ dept: "factory", section: "build-agents" }}
            />
            <Shortcut
              title="Council activity"
              desc="Cross-customer feed of every Cleo agent run."
              to={{ dept: "cleo", section: "council-runs" }}
            />
            <Shortcut
              title="Niche library"
              desc="Reusable scaffolds compounding across customers."
              to={{ dept: "cleo", section: "niche-library" }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function KPI({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="kpi-cell">
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

function Shortcut({ title, desc, to }: { title: string; desc: string; to: Route }): JSX.Element {
  return (
    <button type="button" className="niche-card niche-card-clickable" onClick={() => navigate(to)}>
      <div className="niche-card-name">{title}</div>
      <p style={{ margin: "8px 0 14px", fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5 }}>{desc}</p>
      <div className="niche-card-foot">open →</div>
    </button>
  );
}
