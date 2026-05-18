// CalendarOAuthCallback — receives Google's redirect after the admin
// grants the calendar scope. Reads ?code from the URL, POSTs it to the
// google-calendar-oauth-callback edge function with the admin's bearer
// token, then routes back to #factory/settings with a result message.
//
// Rendered when window.location.pathname starts with
// /oauth/google-calendar/callback. App.tsx detects this path and renders
// this component instead of the hash-routed Shell.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";

type Status = "exchanging" | "ok" | "error";

export function CalendarOAuthCallback(): JSX.Element {
  const [status, setStatus] = useState<Status>("exchanging");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const errParam = params.get("error");
      if (errParam) {
        if (!cancelled) {
          setStatus("error");
          setMessage(`Google returned: ${errParam}`);
        }
        return;
      }
      if (!code) {
        if (!cancelled) {
          setStatus("error");
          setMessage("Missing OAuth code in callback URL.");
        }
        return;
      }
      try {
        const sb = getFactorySupabase();
        const { data: session } = await sb.auth.getSession();
        const jwt = session.session?.access_token;
        if (!jwt) throw new Error("Sign in expired — refresh and try again.");
        const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
        const res = await fetch(`${base}/functions/v1/google-calendar-oauth-callback`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({ code }),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`Exchange failed: ${txt.slice(0, 300)}`);
        }
        if (cancelled) return;
        setStatus("ok");
        setMessage("Google Calendar connected.");
        // Hand back to the settings page after a brief pause so the
        // user reads the success message.
        setTimeout(() => {
          window.location.replace("/#factory/settings");
        }, 1200);
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setMessage((e as Error).message);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="auth-gate">
      <div className="auth-gate-card" style={{ maxWidth: 520 }}>
        {status === "exchanging" && (
          <>
            <strong>Connecting your calendar…</strong>
            <p className="dim">Exchanging the OAuth code with Google.</p>
          </>
        )}
        {status === "ok" && (
          <>
            <strong>Connected.</strong>
            <p className="dim">{message} Returning to settings…</p>
          </>
        )}
        {status === "error" && (
          <>
            <strong>Connection failed.</strong>
            <p className="dim">{message}</p>
            <p>
              <a href="/#factory/settings">Back to settings</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
