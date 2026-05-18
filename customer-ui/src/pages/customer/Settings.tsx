// Settings.tsx — Phase 3R · Customer-side settings page.
//
// Four tabs:
//   1. AI Providers (BYOK) — paste own Anthropic / OpenAI / Gemini / Replicate keys.
//   2. Integrations         — Stripe / Shopify / Google / Slack / Klaviyo (uses existing connect-integration).
//   3. AI Automation        — per-capability autonomy (full-auto / human-approve / disabled), budget caps, kill switch.
//   4. Meeting Copilot      — BYOK Google OAuth for Cleo-in-meetings; live deploy status read from meeting_copilot_deploys.
//
// Auth: customer must be logged in. Company resolved from the user's
// companies row (companies.user_id = auth.uid()).

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase";
import { Loader2, KeyRound, Plug, ShieldCheck, AlertCircle, Power, Mic, Copy, Check } from "lucide-react";

type TabKey = "ai-providers" | "integrations" | "automation" | "meeting-copilot";

interface Company {
  id: string;
  name: string | null;
  slug: string | null;
}

export default function CustomerSettings(): JSX.Element {
  const [tab, setTab] = useState<TabKey>("ai-providers");
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (!cancelled) {
          setError("not logged in");
          setLoading(false);
        }
        return;
      }
      const { data, error: e } = await supabase
        .from("companies")
        .select("id, name, slug")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (e || !data) {
        setError(e?.message ?? "company not found");
      } else {
        setCompany(data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="aubos-settings-loading">
        <Loader2 className="spin" />
      </div>
    );
  }
  if (error || !company) {
    return <div className="aubos-settings-error">Couldn't load settings: {error ?? "no company"}</div>;
  }

  return (
    <div className="aubos-settings">
      <header className="aubos-settings-header">
        <h1>Settings</h1>
        <span className="company-label">{company.name ?? company.slug ?? company.id}</span>
      </header>

      <nav className="aubos-settings-tabs">
        <TabButton active={tab === "ai-providers"} onClick={() => setTab("ai-providers")} icon={<KeyRound size={14} />}>
          AI Providers
        </TabButton>
        <TabButton active={tab === "integrations"} onClick={() => setTab("integrations")} icon={<Plug size={14} />}>
          Integrations
        </TabButton>
        <TabButton active={tab === "automation"} onClick={() => setTab("automation")} icon={<ShieldCheck size={14} />}>
          AI Automation
        </TabButton>
        <TabButton active={tab === "meeting-copilot"} onClick={() => setTab("meeting-copilot")} icon={<Mic size={14} />}>
          Meeting Copilot
        </TabButton>
      </nav>

      <main className="aubos-settings-body">
        {tab === "ai-providers" && <AiProvidersTab company={company} />}
        {tab === "integrations" && <IntegrationsTab company={company} />}
        {tab === "automation" && <AutomationTab company={company} />}
        {tab === "meeting-copilot" && <MeetingCopilotTab company={company} />}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: JSX.Element;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`aubos-tab ${active ? "is-active" : ""}`}
    >
      {icon}
      {children}
    </button>
  );
}

/* ─────────────────────────── AI Providers (BYOK) ────────────────────────── */

const PROVIDERS = [
  { id: "anthropic", label: "Anthropic (Claude)", help: "starts with sk-ant-…" },
  { id: "openai", label: "OpenAI (GPT / Codex)", help: "starts with sk-…" },
  { id: "gemini", label: "Google Gemini", help: "AI Studio API key" },
  { id: "replicate", label: "Replicate", help: "starts with r8_…" },
] as const;

interface ProviderRow {
  integration_id: string;       // provider slug
  provider: string | null;
  status: string;
  connected_at: string;
}

function AiProvidersTab({ company }: { company: Company }): JSX.Element {
  const [rows, setRows] = useState<ProviderRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const load = async () => {
    const { data } = await supabase
      .from("customer_secrets")
      .select("integration_id,provider,status,connected_at")
      .eq("company_id", company.id)
      .eq("kind", "ai-provider");
    setRows((data ?? []) as ProviderRow[]);
  };

  useEffect(() => {
    void load();
    const chan = supabase
      .channel(`byok-${company.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customer_secrets", filter: `company_id=eq.${company.id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(chan);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id]);

  const verify = async (provider: string) => {
    const secret = drafts[provider]?.trim();
    if (!secret) return;
    setPendingId(provider);
    setResults((r) => ({ ...r, [provider]: { ok: false, msg: "verifying…" } }));
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("not authenticated");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-ai-provider-key`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          company_id: company.id,
          provider,
          secret_value: secret,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setResults((r) => ({ ...r, [provider]: { ok: false, msg: body?.error ?? `verify failed (${res.status})` } }));
        return;
      }
      setResults((r) => ({
        ...r,
        [provider]: {
          ok: true,
          msg: `verified · ${body.model_count ?? "?"} models available`,
        },
      }));
      setDrafts((d) => ({ ...d, [provider]: "" }));
      setRefreshing(true);
      await load();
      setRefreshing(false);
    } catch (err) {
      setResults((r) => ({ ...r, [provider]: { ok: false, msg: (err as Error).message } }));
    } finally {
      setPendingId(null);
    }
  };

  const remove = async (provider: string) => {
    if (!confirm(`Remove your ${provider} key? Your AI will stop working until you add a new one.`)) return;
    await supabase
      .from("customer_secrets")
      .delete()
      .eq("company_id", company.id)
      .eq("kind", "ai-provider")
      .eq("integration_id", provider);
    await load();
  };

  const byId = useMemo(() => {
    const m = new Map<string, ProviderRow>();
    for (const r of rows) m.set(r.integration_id, r);
    return m;
  }, [rows]);

  return (
    <section className="aubos-byok">
      <h2>Bring your own AI keys</h2>
      <p className="aubos-byok-intro">
        Your AI uses your own provider account. Paste a key — we verify it against the provider before
        storing. Keys live encrypted in your private vault and never leave your runtime.
      </p>
      {refreshing && <div className="aubos-byok-refresh"><Loader2 size={12} className="spin" /> updating…</div>}

      <ul className="aubos-byok-list">
        {PROVIDERS.map((p) => {
          const row = byId.get(p.id);
          const result = results[p.id];
          const pending = pendingId === p.id;
          return (
            <li key={p.id} className="aubos-byok-row">
              <div className="aubos-byok-meta">
                <div className="aubos-byok-name">{p.label}</div>
                <div className="aubos-byok-help">{p.help}</div>
                {row ? (
                  <div className="aubos-byok-status ok">
                    ✓ connected · added {new Date(row.connected_at).toLocaleDateString()}
                  </div>
                ) : (
                  <div className="aubos-byok-status off">not connected</div>
                )}
              </div>

              <div className="aubos-byok-form">
                <input
                  type="password"
                  placeholder={row ? "replace with new key…" : "paste your API key"}
                  value={drafts[p.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                  disabled={pending}
                />
                <button onClick={() => void verify(p.id)} disabled={pending || !drafts[p.id]?.trim()}>
                  {pending ? <Loader2 size={14} className="spin" /> : row ? "Replace" : "Verify + save"}
                </button>
                {row && (
                  <button className="danger" onClick={() => void remove(p.id)} disabled={pending}>
                    Remove
                  </button>
                )}
              </div>

              {result && (
                <div className={`aubos-byok-result ${result.ok ? "ok" : "err"}`}>
                  {result.ok ? "✓" : <AlertCircle size={12} />} {result.msg}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ─────────────────────────────── Integrations ───────────────────────────── */

interface IntegrationRow {
  integration_id: string;
  status: string;
  connected_at: string;
}

type AdScope = "read" | "write" | "financial";
const ADS_INTEGRATION_IDS = new Set(["meta-ads", "google-ads", "tiktok-ads"]);

function IntegrationsTab({ company }: { company: Company }): JSX.Element {
  const [rows, setRows] = useState<IntegrationRow[]>([]);
  const [available, setAvailable] = useState<Array<{ id: string; name: string; auth_flow: string | null }>>([]);
  const [pending, setPending] = useState<string | null>(null);
  // When the customer clicks Connect on an ads integration we show a scope
  // chooser BEFORE kicking off OAuth. null = no chooser open; otherwise it's
  // the integration_id being scoped.
  const [scopeChoiceFor, setScopeChoiceFor] = useState<string | null>(null);
  const [scopeChoice, setScopeChoice] = useState<AdScope>("write");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("customer_secrets")
        .select("integration_id,status,connected_at")
        .eq("company_id", company.id)
        .eq("kind", "integration");
      if (!cancelled) setRows((data ?? []) as IntegrationRow[]);
      const { data: cat } = await supabase
        .from("aubos_integrations_registry")
        .select("integration_id,name,auth_flow")
        .order("name");
      if (!cancelled) {
        setAvailable(
          ((cat ?? []) as Array<{ integration_id: string; name: string; auth_flow: string | null }>).map((c) => ({
            id: c.integration_id,
            name: c.name,
            auth_flow: c.auth_flow,
          })),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [company.id]);

  const clickConnect = (integrationId: string) => {
    if (ADS_INTEGRATION_IDS.has(integrationId)) {
      // Ad providers require explicit scope-tier selection. Show the chooser
      // first; OAuth dialog opens after the user confirms.
      setScopeChoice("write");
      setScopeChoiceFor(integrationId);
      return;
    }
    void startConnect(integrationId);
  };

  const confirmAdScope = async () => {
    if (!scopeChoiceFor) return;
    const id = scopeChoiceFor;
    const scope = scopeChoice;
    setScopeChoiceFor(null);
    await startConnect(id, scope);
  };

  const startConnect = async (integrationId: string, scope?: AdScope) => {
    setPending(integrationId);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("not authenticated");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/connect-integration`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          company_id: company.id,
          integration_id: integrationId,
          action: "start",
          ...(scope ? { scope } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `connect failed (${res.status})`);
      if (body.auth_url) {
        window.open(body.auth_url, "_blank", "noopener,width=560,height=720");
      } else {
        // API-token flow — prompt for the token.
        const token = prompt(`Paste your ${integrationId} API token:`);
        if (!token) return;
        const res2 = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            company_id: company.id,
            integration_id: integrationId,
            action: "save-token",
            token,
          }),
        });
        const body2 = await res2.json();
        if (!res2.ok) throw new Error(body2?.error ?? `save failed (${res2.status})`);
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setPending(null);
    }
  };

  const byId = useMemo(() => {
    const m = new Map<string, IntegrationRow>();
    for (const r of rows) m.set(r.integration_id, r);
    return m;
  }, [rows]);

  return (
    <section className="aubos-integrations">
      <h2>Integrations</h2>
      <p className="aubos-integrations-intro">
        Connect the services your AI runs on top of. Each one uses your own account — we never charge
        through ours.
      </p>
      <ul className="aubos-integrations-list">
        {available.map((c) => {
          const row = byId.get(c.id);
          return (
            <li key={c.id} className={`aubos-integration ${row ? "connected" : ""}`}>
              <div className="aubos-integration-name">{c.name}</div>
              <div className="aubos-integration-state">
                {row ? (
                  <span className="ok">✓ connected</span>
                ) : (
                  <button onClick={() => clickConnect(c.id)} disabled={pending === c.id}>
                    {pending === c.id ? <Loader2 size={14} className="spin" /> : "Connect"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {scopeChoiceFor && (
        <AdScopeChooser
          integrationId={scopeChoiceFor}
          scope={scopeChoice}
          onChange={setScopeChoice}
          onCancel={() => setScopeChoiceFor(null)}
          onConfirm={() => void confirmAdScope()}
        />
      )}
    </section>
  );
}

function AdScopeChooser({
  integrationId,
  scope,
  onChange,
  onCancel,
  onConfirm,
}: {
  integrationId: string;
  scope: AdScope;
  onChange: (s: AdScope) => void;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  const label =
    integrationId === "meta-ads" ? "Meta Ads" :
    integrationId === "google-ads" ? "Google Ads" :
    integrationId === "tiktok-ads" ? "TikTok Ads" : integrationId;
  return (
    <div className="aubos-modal-backdrop" onClick={onCancel}>
      <div className="aubos-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{label} — pick a permission tier</h3>
        <p className="aubos-modal-intro">
          Your AI only gets access at the tier you select. You can re-connect at any time to raise or lower this.
        </p>
        <ul className="aubos-scope-list">
          <li>
            <label>
              <input
                type="radio"
                name="ad-scope"
                checked={scope === "read"}
                onChange={() => onChange("read")}
              />
              <strong>Read-only</strong>
              <span>Reports + insights. Cannot create or edit anything.</span>
            </label>
          </li>
          <li>
            <label>
              <input
                type="radio"
                name="ad-scope"
                checked={scope === "write"}
                onChange={() => onChange("write")}
              />
              <strong>Read + write</strong>
              <span>Recommended. Create + edit campaigns, adsets, ads. No billing access.</span>
            </label>
          </li>
          <li>
            <label>
              <input
                type="radio"
                name="ad-scope"
                checked={scope === "financial"}
                onChange={() => onChange("financial")}
              />
              <strong>Read + write + billing</strong>
              <span>Includes payment-method + billing changes. Use only if your AI needs to top up funds.</span>
            </label>
          </li>
        </ul>
        <div className="aubos-modal-actions">
          <button className="ghost" onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={onConfirm}>Continue to {label}</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── AI Automation Controls ─────────────────────── */

interface AutomationRow {
  capability_id: string;
  capability_label: string | null;
  autonomy: "full-auto" | "human-approve" | "disabled";
  max_usd_per_day: number | null;
  max_actions_per_hour: number | null;
}

interface GlobalSettings {
  global_pause: boolean;
  pause_reason: string | null;
}

function AutomationTab({ company }: { company: Company }): JSX.Element {
  const [rows, setRows] = useState<AutomationRow[]>([]);
  const [global, setGlobal] = useState<GlobalSettings>({ global_pause: false, pause_reason: null });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: caps }, { data: gs }] = await Promise.all([
      supabase
        .from("customer_automation_controls")
        .select("capability_id,capability_label,autonomy,max_usd_per_day,max_actions_per_hour")
        .eq("company_id", company.id)
        .order("capability_label"),
      supabase
        .from("customer_settings")
        .select("global_pause,pause_reason")
        .eq("company_id", company.id)
        .maybeSingle(),
    ]);
    setRows((caps ?? []) as AutomationRow[]);
    if (gs) setGlobal(gs as GlobalSettings);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id]);

  const updateCap = async (capabilityId: string, patch: Partial<AutomationRow>) => {
    setBusy(true);
    setRows((prev) =>
      prev.map((r) => (r.capability_id === capabilityId ? { ...r, ...patch } : r)),
    );
    await supabase
      .from("customer_automation_controls")
      .update(patch)
      .eq("company_id", company.id)
      .eq("capability_id", capabilityId);
    setBusy(false);
  };

  const toggleGlobal = async () => {
    const next = !global.global_pause;
    setGlobal((g) => ({ ...g, global_pause: next, pause_reason: next ? g.pause_reason ?? "manual kill switch" : null }));
    await supabase
      .from("customer_settings")
      .upsert({
        company_id: company.id,
        global_pause: next,
        pause_reason: next ? "manual kill switch" : null,
        paused_at: next ? new Date().toISOString() : null,
      });
  };

  return (
    <section className="aubos-automation">
      <h2>AI Automation</h2>
      <p className="aubos-automation-intro">
        Decide how much your AI is allowed to do on its own. Per capability — and a global kill switch
        if you ever need to stop everything immediately.
      </p>

      <div className={`aubos-kill-switch ${global.global_pause ? "is-on" : ""}`}>
        <Power size={18} />
        <div className="aubos-kill-text">
          <strong>Global pause</strong>
          <span>
            {global.global_pause
              ? `Paused — every agent is halted. ${global.pause_reason ? `(${global.pause_reason})` : ""}`
              : "Everything is running. Hit pause to halt all autonomous actions across your AI."}
          </span>
        </div>
        <button onClick={() => void toggleGlobal()}>
          {global.global_pause ? "Resume" : "Pause everything"}
        </button>
      </div>

      <ul className="aubos-cap-list">
        {rows.length === 0 ? (
          <li className="aubos-cap-empty">
            Your capability list will appear here after your build finishes. Each one starts in{" "}
            <code>human-approve</code> by default.
          </li>
        ) : (
          rows.map((r) => (
            <li key={r.capability_id} className="aubos-cap-row">
              <div className="aubos-cap-name">{r.capability_label ?? r.capability_id}</div>

              <div className="aubos-cap-auto">
                <label>
                  <input
                    type="radio"
                    checked={r.autonomy === "full-auto"}
                    onChange={() => void updateCap(r.capability_id, { autonomy: "full-auto" })}
                    disabled={busy || global.global_pause}
                  />{" "}
                  Full auto
                </label>
                <label>
                  <input
                    type="radio"
                    checked={r.autonomy === "human-approve"}
                    onChange={() => void updateCap(r.capability_id, { autonomy: "human-approve" })}
                    disabled={busy || global.global_pause}
                  />{" "}
                  Human approve
                </label>
                <label>
                  <input
                    type="radio"
                    checked={r.autonomy === "disabled"}
                    onChange={() => void updateCap(r.capability_id, { autonomy: "disabled" })}
                    disabled={busy || global.global_pause}
                  />{" "}
                  Disabled
                </label>
              </div>

              <div className="aubos-cap-caps">
                <label>
                  $/day cap
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={r.max_usd_per_day ?? ""}
                    placeholder="no cap"
                    onChange={(e) =>
                      void updateCap(r.capability_id, {
                        max_usd_per_day: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    disabled={busy}
                  />
                </label>
                <label>
                  actions/hour
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={r.max_actions_per_hour ?? ""}
                    placeholder="no cap"
                    onChange={(e) =>
                      void updateCap(r.capability_id, {
                        max_actions_per_hour: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    disabled={busy}
                  />
                </label>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

/* ───────────────────────────── Meeting Copilot ──────────────────────────── */
//
// BYOK Google OAuth client for Cleo-in-meetings. Reads from:
//   - meeting_copilot_deploys  (status, endpoint, voice backend) → read-only display
//   - customer_secrets (integration_id='google-oauth', kind='google-oauth-client')
//                              → BYOK Google OAuth client_id + secret
// Posts client_id/secret to verify-google-oauth-client edge fn.

interface MeetingCopilotDeployRow {
  status: string;
  vps_endpoint_url: string | null;
  voice_backend: string;
  meeting_bot_backend: string;
  tts_backend: string;
  last_health_check_at: string | null;
  last_health_status: string | null;
  error_message: string | null;
  meta: { byok?: { googleOAuth?: boolean; openai?: boolean }; google_redirect_uri?: string } | null;
  updated_at: string;
  deployed_at: string | null;
}

interface GoogleOAuthRow {
  vault_secret_id: string | null;
  metadata: { client_id?: string; redirect_uri?: string; verified_at?: string; deferred_full_verify?: boolean } | null;
  status: string;
  connected_at: string;
}

function MeetingCopilotTab({ company }: { company: Company }): JSX.Element {
  const [deploy, setDeploy] = useState<MeetingCopilotDeployRow | null>(null);
  const [oauth, setOauth] = useState<GoogleOAuthRow | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [redirectCopied, setRedirectCopied] = useState(false);

  // Derived: pre-filled redirect URI. Slug source: deploy row (authoritative)
  // if present, else company.slug, else null (block submit + show explainer).
  const tenantSlug = deploy?.vps_endpoint_url
    ? (deploy.vps_endpoint_url.match(/^https:\/\/([^.]+)\.aubos\.ai/i)?.[1] ?? null)
    : company.slug;
  const redirectUri = tenantSlug
    ? `https://${tenantSlug}.aubos.ai/meeting-copilot/calendar/oauth/callback`
    : null;

  const load = async () => {
    const [d, o] = await Promise.all([
      supabase
        .from("meeting_copilot_deploys")
        .select("status,vps_endpoint_url,voice_backend,meeting_bot_backend,tts_backend,last_health_check_at,last_health_status,error_message,meta,updated_at,deployed_at")
        .eq("company_id", company.id)
        .maybeSingle(),
      supabase
        .from("customer_secrets")
        .select("vault_secret_id,metadata,status,connected_at")
        .eq("company_id", company.id)
        .eq("integration_id", "google-oauth")
        .maybeSingle(),
    ]);
    setDeploy((d.data ?? null) as MeetingCopilotDeployRow | null);
    setOauth((o.data ?? null) as GoogleOAuthRow | null);
  };

  useEffect(() => {
    void load();
    // Subscribe to BOTH tables so the customer sees their deploy state +
    // BYOK status update live (e.g., ops marks deploy healthy, or the
    // factory's first deploy run lands the meeting_copilot_deploys row).
    const ch1 = supabase
      .channel(`mc-deploy-${company.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meeting_copilot_deploys", filter: `company_id=eq.${company.id}` },
        () => void load(),
      )
      .subscribe();
    const ch2 = supabase
      .channel(`mc-oauth-${company.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customer_secrets", filter: `company_id=eq.${company.id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch1);
      void supabase.removeChannel(ch2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id]);

  const verify = async () => {
    const cid = clientId.trim();
    const sec = clientSecret.trim();
    if (!cid || !sec || !redirectUri) return;
    setPending(true);
    setResult({ ok: false, msg: "verifying…" });
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("not authenticated");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-google-oauth-client`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          company_id: company.id,
          client_id: cid,
          client_secret: sec,
          redirect_uri: redirectUri,
        }),
      });
      const body = await res.json();
      if (!res.ok || body?.valid === false) {
        setResult({ ok: false, msg: body?.error ?? body?.reason ?? `verify failed (${res.status})` });
        return;
      }
      setResult({
        ok: true,
        msg: body?.deferred_full_verify
          ? "saved · full verification on your first real OAuth callback"
          : "saved + verified",
      });
      setClientId("");
      setClientSecret("");
      await load();
    } catch (err) {
      setResult({ ok: false, msg: (err as Error).message });
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    if (!confirm("Remove your Google OAuth client? Cleo's calendar features will stop working until you add a new one.")) return;
    await supabase
      .from("customer_secrets")
      .delete()
      .eq("company_id", company.id)
      .eq("integration_id", "google-oauth");
    await load();
  };

  const copyRedirect = async () => {
    if (!redirectUri) return;
    try {
      await navigator.clipboard.writeText(redirectUri);
      setRedirectCopied(true);
      setTimeout(() => setRedirectCopied(false), 1800);
    } catch {
      /* silently swallow — older browsers / non-https hosts */
    }
  };

  const statusBadge = (s: string | undefined): JSX.Element => {
    const cls =
      s === "healthy" ? "ok" :
      s === "failed" ? "err" :
      s === "paused" ? "warn" :
      "off";
    return <span className={`aubos-byok-status ${cls}`}>{s ?? "not deployed"}</span>;
  };

  return (
    <section className="aubos-byok">
      <h2>Meeting Copilot — Cleo joins your meetings</h2>
      <p className="aubos-byok-intro">
        Cleo joins your Google Meet calls as a participant, listens, answers wake-word questions
        by querying your other connected tools, and writes a post-meeting report. Calendar features
        need your own Google OAuth client (BYOK).
      </p>

      {/* Deploy status panel — read-only */}
      <div className="aubos-byok-row" style={{ flexDirection: "column", gap: 6 }}>
        <div className="aubos-byok-name">Deployment status</div>
        {deploy ? (
          <>
            <div>Status: {statusBadge(deploy.status)}</div>
            <div className="aubos-byok-help">
              Endpoint: <code>{deploy.vps_endpoint_url ?? "(not assigned)"}</code><br />
              Voice backend: <code>{deploy.voice_backend}</code> · Bot backend: <code>{deploy.meeting_bot_backend}</code> · TTS: <code>{deploy.tts_backend}</code>
              {deploy.last_health_check_at && (
                <>
                  <br />Last health check: {new Date(deploy.last_health_check_at).toLocaleString()}
                </>
              )}
              {deploy.deployed_at && (
                <>
                  <br />Deployed: {new Date(deploy.deployed_at).toLocaleString()}
                </>
              )}
              {deploy.status === "failed" && deploy.error_message && (
                <>
                  <br /><span style={{ color: "#c33" }}>Error: {deploy.error_message}</span>
                </>
              )}
            </div>
            <div className="aubos-byok-help">
              Connected services:{" "}
              <span>Google Calendar: {deploy.meta?.byok?.googleOAuth ? "✓" : "✗"}</span>
              {" · "}
              <span>OpenAI (premium voice): {deploy.meta?.byok?.openai ? "✓" : "✗"}</span>
            </div>
          </>
        ) : (
          <div className="aubos-byok-status off">
            Not deployed yet. The factory will provision meeting_copilot on your next build.
          </div>
        )}
      </div>

      {/* BYOK Google OAuth form */}
      <div className="aubos-byok-row" style={{ flexDirection: "column", gap: 8, marginTop: 16 }}>
        <div className="aubos-byok-name">Google OAuth client (BYOK)</div>
        <div className="aubos-byok-help">
          Create an OAuth client in{" "}
          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
            Google Cloud Console
          </a>
          {" "}with these scopes:{" "}
          <code>calendar.events</code>, <code>calendar.readonly</code>, <code>userinfo.email</code>.
          Add the redirect URI below in the Google Console <em>before</em> pasting credentials here.
        </div>

        {/* Redirect URI — display-only with copy */}
        <div className="aubos-byok-form" style={{ alignItems: "center" }}>
          <label style={{ fontSize: 12, minWidth: 100 }}>Redirect URI</label>
          <input
            type="text"
            value={redirectUri ?? "(no tenant slug yet — contact support)"}
            readOnly
            style={{ flex: 1, fontFamily: "ui-monospace, monospace", fontSize: 11 }}
          />
          <button onClick={() => void copyRedirect()} disabled={!redirectUri}>
            {redirectCopied ? <Check size={12} /> : <Copy size={12} />}
            {redirectCopied ? "copied" : "copy"}
          </button>
        </div>

        {/* Client ID */}
        <div className="aubos-byok-form" style={{ alignItems: "center" }}>
          <label style={{ fontSize: 12, minWidth: 100 }}>Client ID</label>
          <input
            type="text"
            placeholder={oauth?.metadata?.client_id ? "replace with new client_id…" : "123456789012-abc…apps.googleusercontent.com"}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            disabled={pending}
            style={{ flex: 1, fontFamily: "ui-monospace, monospace", fontSize: 11 }}
          />
        </div>

        {/* Client Secret */}
        <div className="aubos-byok-form" style={{ alignItems: "center" }}>
          <label style={{ fontSize: 12, minWidth: 100 }}>Client Secret</label>
          <input
            type="password"
            placeholder={oauth?.vault_secret_id ? "replace with new client_secret…" : "paste GOCSPX-…"}
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            disabled={pending}
            style={{ flex: 1 }}
          />
        </div>

        {/* Action buttons */}
        <div className="aubos-byok-form">
          <button
            onClick={() => void verify()}
            disabled={pending || !clientId.trim() || !clientSecret.trim() || !redirectUri}
          >
            {pending ? <Loader2 size={14} className="spin" /> : (oauth?.vault_secret_id ? "Replace + verify" : "Verify + save")}
          </button>
          {oauth?.vault_secret_id && (
            <button className="danger" onClick={() => void remove()} disabled={pending}>
              <Power size={12} /> Remove
            </button>
          )}
        </div>

        {/* Current status */}
        {oauth ? (
          <div className={`aubos-byok-status ${oauth.status === "connected" ? "ok" : oauth.status === "pending" ? "warn" : "off"}`}>
            {oauth.status === "connected" && "✓ connected"}
            {oauth.status === "pending" && (oauth.metadata?.deferred_full_verify
              ? "saved · pending full verification (your first real OAuth callback upgrades to connected)"
              : "saved · pending")}
            {oauth.status !== "connected" && oauth.status !== "pending" && oauth.status}
            {oauth.connected_at && <span> · added {new Date(oauth.connected_at).toLocaleDateString()}</span>}
          </div>
        ) : (
          <div className="aubos-byok-status off">no Google OAuth client connected</div>
        )}

        {/* Verify result */}
        {result && (
          <div className={`aubos-byok-result ${result.ok ? "ok" : "err"}`}>
            {result.ok ? "✓" : <AlertCircle size={12} />} {result.msg}
          </div>
        )}
      </div>
    </section>
  );
}
