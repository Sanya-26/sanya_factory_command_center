// AISubscriptionsGate — the "connect your Claude Pro + ChatGPT Pro" step.
//
// Mounts inside Onboarding before the voice conversation starts. Per proposal
// §3.7/§3.8/§3.9 and S2.5: both providers are required to proceed (decision
// N2 = "both required at signup"). Until both ai_subscriptions rows reach
// status='connected', the customer sees this gate instead of the avatar.
//
// Flows:
//   - Anthropic: classic OAuth popup. Opens to console.anthropic.com/oauth/
//     authorize?client_id=...&redirect_uri=<this app>/oauth/anthropic-callback
//     &state=<csrf>. The callback page extracts ?code, POSTs to the
//     anthropic-oauth-callback edge fn, then postMessages this window. We
//     refresh state on Realtime + the postMessage as a backup.
//   - OpenAI: codex device flow. POST action='init' to the
//     openai-codex-callback edge fn → modal shows user_code + verification_uri
//     → we poll action='poll' every {interval}s until 200 (or definitive
//     error).
//
// Also handles the §3.9 re-auth path: if a row exists at status='expired',
// the same Connect buttons re-open the flow. Differentiated by a banner.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase";

type Provider = "anthropic-claude" | "openai-chatgpt";

interface SubscriptionRow {
  id: string;
  provider: Provider;
  status: "pending-capture" | "connected" | "expired" | "revoked";
  expires_at: string | null;
  last_used_at: string | null;
}

const ANTHROPIC_AUTHORIZE_URL =
  (import.meta.env.VITE_ANTHROPIC_OAUTH_AUTHORIZE_URL as string | undefined) ??
  "https://console.anthropic.com/oauth/authorize";
const ANTHROPIC_CLIENT_ID =
  (import.meta.env.VITE_ANTHROPIC_OAUTH_CLIENT_ID as string | undefined) ?? "";
const ANTHROPIC_REDIRECT_URI =
  typeof window !== "undefined"
    ? `${window.location.origin}/oauth/anthropic-callback`
    : "";

const SUPABASE_FUNCTIONS_URL =
  (import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string | undefined) ??
  `${(import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ""}/functions/v1`;

export function AISubscriptionsGate({
  companyId,
  onAllConnected,
}: {
  companyId: string;
  onAllConnected: () => void;
}): JSX.Element {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openaiFlow, setOpenaiFlow] = useState<OpenAiFlowState | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase
      .from("ai_subscriptions")
      .select("id, provider, status, expires_at, last_used_at")
      .eq("company_id", companyId);
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as SubscriptionRow[]);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    void reload();
    const ch = supabase
      .channel(`ai-subs-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ai_subscriptions",
          filter: `company_id=eq.${companyId}`,
        },
        () => void reload(),
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [companyId, reload]);

  // Listen for the Anthropic OAuth popup's postMessage handshake.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; provider?: string } | null;
      if (data?.type === "ai-subscription:connected") {
        void reload();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [reload]);

  const anthropic = rows.find((r) => r.provider === "anthropic-claude");
  const openai = rows.find((r) => r.provider === "openai-chatgpt");
  const bothConnected =
    anthropic?.status === "connected" && openai?.status === "connected";

  // Auto-advance once both are connected.
  useEffect(() => {
    if (bothConnected) onAllConnected();
  }, [bothConnected, onAllConnected]);

  const hasExpired =
    anthropic?.status === "expired" || openai?.status === "expired";

  // ── Anthropic connect — open OAuth popup.
  const connectAnthropic = () => {
    if (!ANTHROPIC_CLIENT_ID) {
      setError(
        "Anthropic OAuth not configured (missing VITE_ANTHROPIC_OAUTH_CLIENT_ID).",
      );
      return;
    }
    const state = `${companyId}:${crypto.randomUUID()}`;
    try {
      sessionStorage.setItem("anthropic-oauth-state", state);
      sessionStorage.setItem("anthropic-oauth-company", companyId);
    } catch {
      /* swallow */
    }
    const url = new URL(ANTHROPIC_AUTHORIZE_URL);
    url.searchParams.set("client_id", ANTHROPIC_CLIENT_ID);
    url.searchParams.set("redirect_uri", ANTHROPIC_REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "user:read messages:write");
    url.searchParams.set("state", state);
    window.open(url.toString(), "anthropic-oauth", "width=520,height=720");
  };

  // ── OpenAI connect — start device flow.
  const connectOpenAI = async () => {
    setError(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const jwt = session.session?.access_token;
      if (!jwt) {
        setError("Not signed in.");
        return;
      }
      const initRes = await fetch(`${SUPABASE_FUNCTIONS_URL}/openai-codex-callback`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ action: "init" }),
      });
      if (!initRes.ok) {
        const text = await initRes.text();
        setError(`Device init failed: ${text.slice(0, 200)}`);
        return;
      }
      const init = (await initRes.json()) as {
        device_code: string;
        user_code: string;
        verification_uri: string;
        verification_uri_complete?: string;
        expires_in: number;
        interval: number;
      };
      setOpenaiFlow({
        deviceCode: init.device_code,
        userCode: init.user_code,
        verificationUri: init.verification_uri_complete ?? init.verification_uri,
        intervalSec: Math.max(2, init.interval),
        startedAt: Date.now(),
        expiresInSec: init.expires_in,
        polling: true,
      });
    } catch (e) {
      setError(`Device init failed: ${(e as Error).message}`);
    }
  };

  // OpenAI poll loop.
  const pollAbortRef = useRef<boolean>(false);
  useEffect(() => {
    pollAbortRef.current = false;
    if (!openaiFlow?.polling) return;
    const flow = openaiFlow;
    const tick = async () => {
      if (pollAbortRef.current) return;
      try {
        const { data: session } = await supabase.auth.getSession();
        const jwt = session.session?.access_token;
        if (!jwt) {
          setOpenaiFlow({ ...flow, polling: false });
          return;
        }
        const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/openai-codex-callback`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            action: "poll",
            company_id: companyId,
            device_code: flow.deviceCode,
          }),
        });
        if (res.status === 200) {
          // Connected. Realtime will fire; close the modal.
          setOpenaiFlow(null);
          void reload();
          return;
        }
        if (res.status === 202) {
          // Still pending — keep polling.
          if (!pollAbortRef.current) setTimeout(() => void tick(), flow.intervalSec * 1000);
          return;
        }
        const text = await res.text();
        setError(`Codex auth failed: ${text.slice(0, 200)}`);
        setOpenaiFlow({ ...flow, polling: false });
      } catch (e) {
        setError(`Codex auth failed: ${(e as Error).message}`);
        setOpenaiFlow({ ...flow, polling: false });
      }
    };
    const initialTimer = setTimeout(() => void tick(), flow.intervalSec * 1000);
    return () => {
      pollAbortRef.current = true;
      clearTimeout(initialTimer);
    };
  }, [openaiFlow?.polling, openaiFlow?.deviceCode, companyId, reload]);

  if (loading) {
    return (
      <div className="ai-subs-gate-loading">Checking your AI subscriptions…</div>
    );
  }
  if (bothConnected) {
    // Parent advances via onAllConnected effect; render nothing to avoid flash.
    return <div className="ai-subs-gate-loading">Continuing to Cleo…</div>;
  }

  return (
    <div className="ai-subs-gate">
      <div className="ai-subs-gate-card">
        <h1>Connect your AI accounts</h1>
        <p className="ai-subs-gate-intro">
          Cleo runs on your own Claude Pro and ChatGPT Pro subscriptions. The
          AI work for you is billed to your subscriptions, not ours. Both are
          required to continue.
        </p>

        {hasExpired ? (
          <div className="ai-subs-gate-banner warning">
            One of your subscriptions has expired or was revoked. Reconnect to
            continue.
          </div>
        ) : null}

        {error ? <div className="ai-subs-gate-banner error">{error}</div> : null}

        <div className="ai-subs-gate-providers">
          <ProviderCard
            title="Claude Pro"
            subtitle="Anthropic — powers Cleo's voice, intake council, document reading"
            status={anthropic?.status ?? "pending-capture"}
            onConnect={connectAnthropic}
          />
          <ProviderCard
            title="ChatGPT Pro"
            subtitle="OpenAI — powers the proposal council that builds your deck"
            status={openai?.status ?? "pending-capture"}
            onConnect={() => void connectOpenAI()}
          />
        </div>

        <p className="ai-subs-gate-footer">
          We never see or store your password. We only hold a session token,
          encrypted, that lets Cleo make AI calls on your behalf.
        </p>
      </div>

      {openaiFlow ? (
        <div className="ai-subs-gate-modal-backdrop" role="dialog" aria-modal="true">
          <div className="ai-subs-gate-modal">
            <h2>Connect ChatGPT Pro</h2>
            <p>On your phone or another tab, open:</p>
            <a
              href={openaiFlow.verificationUri}
              target="_blank"
              rel="noreferrer noopener"
              className="ai-subs-gate-modal-link"
            >
              {openaiFlow.verificationUri}
            </a>
            <p>And enter this code:</p>
            <div className="ai-subs-gate-modal-code">{openaiFlow.userCode}</div>
            <p className="ai-subs-gate-modal-foot">
              {openaiFlow.polling ? "Waiting for you to approve…" : "Polling stopped."}
            </p>
            <button
              type="button"
              className="ai-subs-gate-modal-cancel"
              onClick={() => setOpenaiFlow(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProviderCard({
  title,
  subtitle,
  status,
  onConnect,
}: {
  title: string;
  subtitle: string;
  status: SubscriptionRow["status"];
  onConnect: () => void;
}): JSX.Element {
  const isConnected = status === "connected";
  const label =
    status === "connected" ? "Connected"
    : status === "expired" ? "Expired — reconnect"
    : status === "revoked" ? "Revoked — reconnect"
    : "Not connected";
  return (
    <div className={`ai-subs-card ai-subs-card-${status}`}>
      <div className="ai-subs-card-head">
        <strong>{title}</strong>
        <span className={`ai-subs-card-status ai-subs-card-status-${status}`}>{label}</span>
      </div>
      <p className="ai-subs-card-sub">{subtitle}</p>
      <button
        type="button"
        className={isConnected ? "ai-subs-card-btn connected" : "ai-subs-card-btn"}
        onClick={onConnect}
        disabled={isConnected}
      >
        {isConnected ? "✓ Connected" : status === "pending-capture" ? `Connect ${title}` : `Reconnect ${title}`}
      </button>
    </div>
  );
}

interface OpenAiFlowState {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  intervalSec: number;
  startedAt: number;
  expiresInSec: number;
  polling: boolean;
}
