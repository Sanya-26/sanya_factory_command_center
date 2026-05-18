// Info — the customer's "integrations + required logins" page.
//
// Mandated by the orchestration plan: every customer's portal MUST have an
// info page surfacing the integrations their build resolved + the OAuth/BYOK
// connect buttons for each. Loads:
//
//   • tool_resolutions for the customer's latest build_run — which tools the
//     planner determined they need
//   • customer_secrets — which integrations they've already connected
//   • For each missing one, render a "Connect" CTA that opens the per-provider
//     OAuth flow (handled by supabase/functions/connect-integration/ today)

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase";

type Resolution = {
  demand_key: string;
  matched_tool_id: string | null;
  resolution: string;     // 'existing' | 'missing' | 'dangerous' | 'composio'
  rationale: string | null;
};

type Secret = {
  provider: string;
  status: string;           // 'connected' | 'expired' | 'revoked'
  connected_at: string | null;
};

const PROVIDER_DISPLAY: Record<string, { label: string; logo?: string }> = {
  "shopify":       { label: "Shopify" },
  "klaviyo":       { label: "Klaviyo" },
  "apollo":        { label: "Apollo" },
  "google-search-console": { label: "Google Search Console" },
  "google-ads":    { label: "Google Ads" },
  "meta-ads":      { label: "Meta Ads" },
  "tiktok-ads":    { label: "TikTok Ads" },
  "stripe":        { label: "Stripe" },
  "sendgrid":      { label: "SendGrid" },
  "ga4":           { label: "Google Analytics 4" },
  "google-workspace": { label: "Google Workspace" },
  "hubspot":       { label: "HubSpot" },
  "intercom":      { label: "Intercom" },
};

function providerFromToolId(toolId: string): string {
  // aubos-mail → mail, aubos-social-scheduler → social-scheduler
  return toolId.replace(/^aubos-/, "");
}

export default function CustomerInfo(): JSX.Element {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [secrets, setSecrets] = useState<Record<string, Secret>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user?.id;
      if (!userId) { setLoading(false); return; }
      const { data: companies } = await supabase
        .from("companies").select("id").eq("user_id", userId).limit(1);
      const cId = companies?.[0]?.id;
      if (!alive || !cId) { setLoading(false); return; }
      setCompanyId(cId);

      // Latest planning build_run for this company
      const { data: brs } = await supabase
        .from("build_runs")
        .select("id, package_id, started_at")
        .eq("kind", "planning")
        .order("started_at", { ascending: false })
        .limit(1);
      const buildRunId = brs?.[0]?.id;

      if (buildRunId) {
        const { data: rows } = await supabase
          .from("tool_resolutions")
          .select("demand_key, matched_tool_id, resolution, rationale")
          .eq("build_run_id", buildRunId);
        if (alive && rows) setResolutions(rows);
      }

      const { data: secs } = await supabase
        .from("customer_secrets")
        .select("provider, status, connected_at")
        .eq("company_id", cId);
      if (alive && secs) {
        const m: Record<string, Secret> = {};
        for (const s of secs) m[s.provider] = s as Secret;
        setSecrets(m);
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  // Required integrations = unique providers across all resolutions where
  // the tool needs OAuth / BYOK (i.e. tool replaces an external service).
  const requiredProviders = new Set<string>();
  for (const r of resolutions) {
    if (r.matched_tool_id && r.resolution === "existing") {
      requiredProviders.add(providerFromToolId(r.matched_tool_id));
    }
  }

  const openConnect = async (provider: string) => {
    if (!companyId) return;
    const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
    const { data: sess } = await supabase.auth.getSession();
    const jwt = sess.session?.access_token;
    const res = await fetch(`${base}/functions/v1/connect-integration`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ company_id: companyId, provider, redirect_to: window.location.href }),
    });
    if (!res.ok) {
      alert(`Couldn't start ${provider} connection — ${(await res.text()).slice(0, 200)}`);
      return;
    }
    const { auth_url } = (await res.json()) as { auth_url?: string };
    if (auth_url) window.location.href = auth_url;
  };

  if (loading) return <div className="aubos-info-loading">Loading your integrations…</div>;

  return (
    <div className="aubos-info">
      <header className="aubos-info-header">
        <h1>Your integrations</h1>
        <p className="aubos-info-sub">
          These connect Cleo to the services your business already uses. Connect what's missing — she'll wake up the moment each is live.
        </p>
      </header>

      <section className="aubos-info-grid">
        {[...requiredProviders].sort().map((provider) => {
          const status = secrets[provider]?.status ?? "missing";
          const label = PROVIDER_DISPLAY[provider]?.label ?? provider;
          return (
            <article key={provider} className={`aubos-info-card aubos-info-card--${status}`}>
              <header>
                <span className="aubos-info-card-name">{label}</span>
                <span className={`aubos-info-pill aubos-info-pill--${status}`}>
                  {status === "connected" ? "Connected" : status === "expired" ? "Expired" : status === "revoked" ? "Revoked" : "Not connected"}
                </span>
              </header>
              {status === "connected" && secrets[provider]?.connected_at
                ? <p className="aubos-info-card-meta">Connected {new Date(secrets[provider]!.connected_at!).toLocaleDateString()}</p>
                : null}
              <button onClick={() => openConnect(provider)} className="aubos-info-cta">
                {status === "connected" ? "Reconnect / rotate" : "Connect"}
              </button>
            </article>
          );
        })}
        {requiredProviders.size === 0 && (
          <p className="aubos-info-empty">
            Cleo will list every integration she needs here as soon as your build plan is approved.
          </p>
        )}
      </section>
    </div>
  );
}
