import { useEffect, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        },
      ) => string;
      remove: (widgetId?: string) => void;
    };
  }
}

type TurnstileWidgetProps = {
  verified: boolean;
  onVerify: (token: string) => void;
  onExpire?: () => void;
};

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TEST_SITE_KEY = "1x00000000000000000000AA";

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>("script[data-aubos-turnstile]");
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Turnstile script failed to load")), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SRC;
    script.async = true;
    script.defer = true;
    script.dataset.aubosTurnstile = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile script failed to load"));
    document.head.appendChild(script);
  });
}

export default function TurnstileWidget({ verified, onVerify, onExpire }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "verified" | "failed">("loading");

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || TEST_SITE_KEY;
  const useLocalOnly = import.meta.env.DEV && siteKey === TEST_SITE_KEY;
  const allowLocalFallback = useMemo(() => {
    return useLocalOnly || import.meta.env.VITE_ALLOW_DEV_CAPTCHA_BYPASS === "true";
  }, [useLocalOnly]);

  useEffect(() => {
    if (useLocalOnly) {
      setStatus("ready");
      return;
    }

    let cancelled = false;
    async function renderTurnstile() {
      try {
        await loadTurnstileScript();
        if (cancelled || !containerRef.current || !window.turnstile) return;
        setStatus("ready");
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => {
            if (cancelled) return;
            setStatus("verified");
            onVerify(token);
          },
          "expired-callback": () => {
            if (cancelled) return;
            setStatus("ready");
            onExpire?.();
          },
          "error-callback": () => {
            if (cancelled) return;
            setStatus("failed");
          },
        });
      } catch {
        if (!cancelled) setStatus("failed");
      }
    }

    void renderTurnstile();
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* ignore */ }
      }
    };
  }, [onExpire, onVerify, siteKey, useLocalOnly]);

  const verifyLocally = () => {
    setStatus("verified");
    onVerify(`local-turnstile-${Date.now()}`);
  };

  return (
    <section className="aubos-turnstile" data-state={verified || status === "verified" ? "verified" : status}>
      {!useLocalOnly ? <div ref={containerRef} className="aubos-turnstile-frame" /> : null}

      {verified || status === "verified" ? (
        <p className="aubos-turnstile-status">Security check verified.</p>
      ) : null}

      {status === "loading" ? (
        <p className="aubos-turnstile-status">Loading security check...</p>
      ) : null}

      {(useLocalOnly || status === "failed") && !verified ? (
        <div className="aubos-turnstile-local">
          <p>
            {useLocalOnly
              ? "Local preview mode uses a safe test verification instead of Cloudflare."
              : "Security check is unavailable in this browser."}
          </p>
          {allowLocalFallback ? (
            <button type="button" className="aubos-secondary-button" onClick={verifyLocally}>
              Use local verification
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
