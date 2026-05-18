// MicPermissionGate — first-time microphone permission overlay (proposal §1.3 / S3).
//
// Rendered as an overlay when the browser's mic permission is still 'prompt'
// AND the user hasn't dismissed it before. Once dismissed (Allow, Skip, or
// click-outside), the choice is persisted to localStorage so it never blocks
// again. If the user wants to re-enable later, the mic button in the input
// bar will trigger the native browser prompt directly.

import { useEffect, useState } from "react";

type Permission = "checking" | "granted" | "prompt" | "denied" | "unsupported";

const DISMISSED_KEY = "cleo:mic-gate-dismissed";

export function MicPermissionGate({
  onResolved,
}: {
  /** Fires once after grant/deny/dismiss — caller hides this overlay. */
  onResolved: (granted: boolean) => void;
}): JSX.Element | null {
  const [state, setState] = useState<Permission>("checking");
  const [trying, setTrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // If the user has dismissed this gate before, never show it again —
      // they can still grant mic permission via the mic button later.
      try {
        if (localStorage.getItem(DISMISSED_KEY) === "1") {
          if (!cancelled) {
            setState("granted");  // any non-blocking state
            onResolved(false);
          }
          return;
        }
      } catch { /* private mode / SSR */ }

      try {
        if (!navigator.permissions || !navigator.mediaDevices?.getUserMedia) {
          if (!cancelled) setState("unsupported");
          return;
        }
        // Some browsers throw for unsupported names; defensively try/catch.
        const p = await navigator.permissions.query({ name: "microphone" as PermissionName });
        if (cancelled) return;
        if (p.state === "granted") {
          setState("granted");
          onResolved(true);
          return;
        }
        if (p.state === "denied") {
          setState("denied");
          return;
        }
        setState("prompt");
      } catch {
        if (!cancelled) setState("prompt"); // fall back to showing the gate
      }
    })();
    return () => { cancelled = true; };
  }, [onResolved]);

  // Persist dismissal so the gate doesn't keep coming back on every page load.
  const dismiss = (granted: boolean) => {
    try { localStorage.setItem(DISMISSED_KEY, "1"); } catch { /* */ }
    onResolved(granted);
  };

  const requestMic = async () => {
    setTrying(true);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Release immediately; useMicCapture will request again when needed.
      s.getTracks().forEach((t) => t.stop());
      setState("granted");
      dismiss(true);
    } catch {
      setState("denied");
    } finally {
      setTrying(false);
    }
  };

  if (state === "checking" || state === "granted") return null;

  return (
    // Click the dark backdrop to skip — same behavior as the Skip button.
    // Card itself stops propagation so clicking inside doesn't dismiss.
    <div
      className="mic-permission-gate"
      role="dialog"
      aria-modal="true"
      onClick={() => dismiss(false)}
    >
      <div className="mic-permission-gate-card" onClick={(e) => e.stopPropagation()}>
        <h2>Let Cleo hear you?</h2>
        <p className="mic-permission-gate-body">
          {state === "denied"
            ? "Your browser blocked microphone access. You can still type — or update your browser's site permissions to enable voice."
            : state === "unsupported"
            ? "Your browser doesn't support microphone access for this app. Typing still works."
            : "Cleo can hear you describe your business — much faster than typing. We never record audio to our servers; we send each utterance to a real-time speech-to-text service and the text drives the conversation."}
        </p>
        <div className="mic-permission-gate-actions">
          {state === "prompt" ? (
            <button
              type="button"
              className="mic-permission-gate-btn primary"
              onClick={() => void requestMic()}
              disabled={trying}
            >
              {trying ? "Waiting…" : "Allow microphone"}
            </button>
          ) : null}
          <button
            type="button"
            className="mic-permission-gate-btn secondary"
            onClick={() => dismiss(false)}
          >
            {state === "denied" || state === "unsupported" ? "Continue typing" : "Skip for now"}
          </button>
        </div>
      </div>
    </div>
  );
}
