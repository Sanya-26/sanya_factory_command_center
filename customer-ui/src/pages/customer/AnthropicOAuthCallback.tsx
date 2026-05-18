// AnthropicOAuthCallback — landing page after Anthropic redirects back with
// ?code=...&state=.... Validates state vs sessionStorage, POSTs the code to
// the anthropic-oauth-callback edge fn, then postMessages the opener window
// and self-closes.
//
// This lives at /oauth/anthropic-callback. The opening AISubscriptionsGate
// listens for the postMessage and refreshes its Realtime view to reflect the
// new ai_subscriptions row.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase";

const SUPABASE_FUNCTIONS_URL =
  (import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string | undefined) ??
  `${(import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ""}/functions/v1`;

export default function AnthropicOAuthCallback(): JSX.Element {
  const [phase, setPhase] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState<string>("Finishing setup…");

  useEffect(() => {
    void (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const providerError = url.searchParams.get("error");
        if (providerError) {
          setPhase("error");
          setMessage(`Provider returned: ${providerError}`);
          return;
        }
        if (!code || !state) {
          setPhase("error");
          setMessage("Missing code or state in callback URL.");
          return;
        }

        // CSRF check.
        const savedState = sessionStorage.getItem("anthropic-oauth-state");
        const savedCompany = sessionStorage.getItem("anthropic-oauth-company");
        if (!savedState || savedState !== state || !savedCompany) {
          setPhase("error");
          setMessage("State mismatch — refusing to complete OAuth.");
          return;
        }

        const { data: session } = await supabase.auth.getSession();
        const jwt = session.session?.access_token;
        if (!jwt) {
          setPhase("error");
          setMessage("Not signed in.");
          return;
        }

        const redirectUri = `${window.location.origin}/oauth/anthropic-callback`;
        const res = await fetch(
          `${SUPABASE_FUNCTIONS_URL}/anthropic-oauth-callback`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${jwt}`,
            },
            body: JSON.stringify({
              company_id: savedCompany,
              code,
              redirect_uri: redirectUri,
            }),
          },
        );
        if (!res.ok) {
          const text = await res.text();
          setPhase("error");
          setMessage(`Connect failed: ${text.slice(0, 300)}`);
          return;
        }
        setPhase("ok");
        setMessage("Claude Pro connected. Closing…");

        // Notify the opener so it can refresh without waiting for Realtime.
        try {
          if (window.opener) {
            window.opener.postMessage(
              { type: "ai-subscription:connected", provider: "anthropic-claude" },
              window.location.origin,
            );
          }
        } catch {
          /* swallow */
        }

        // Best-effort cleanup + close.
        try {
          sessionStorage.removeItem("anthropic-oauth-state");
          sessionStorage.removeItem("anthropic-oauth-company");
        } catch {
          /* swallow */
        }
        setTimeout(() => {
          try { window.close(); } catch { /* swallow */ }
        }, 600);
      } catch (e) {
        setPhase("error");
        setMessage(`Unexpected error: ${(e as Error).message}`);
      }
    })();
  }, []);

  return (
    <div className="anthropic-oauth-callback">
      <div className={`anthropic-oauth-callback-card ${phase}`}>
        <div className="anthropic-oauth-callback-title">
          {phase === "working" ? "Connecting Claude Pro…"
            : phase === "ok" ? "Connected!"
            : "Connect failed"}
        </div>
        <div className="anthropic-oauth-callback-msg">{message}</div>
        {phase === "error" ? (
          <button
            type="button"
            className="anthropic-oauth-callback-close"
            onClick={() => { try { window.close(); } catch { /* swallow */ } }}
          >
            Close
          </button>
        ) : null}
      </div>
    </div>
  );
}
