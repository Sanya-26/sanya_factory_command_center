// MicPermissionGate — first-time microphone permission overlay (proposal §1.3 / S3).
//
// Rendered as an overlay (NOT as a Onboarding-replacing gate) when the
// browser's microphone permission is still 'prompt'. Click "Allow" briefly
// requests + releases the mic to trigger the browser's native permission
// prompt, then dismisses. If the user denies, the overlay stays with a
// "you can still type" CTA so onboarding isn't fully blocked.

import { useEffect, useState } from "react";

type Permission = "checking" | "granted" | "prompt" | "denied" | "unsupported";

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

  const requestMic = async () => {
    setTrying(true);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Release immediately; useMicCapture will request again when needed.
      s.getTracks().forEach((t) => t.stop());
      setState("granted");
      onResolved(true);
    } catch {
      setState("denied");
    } finally {
      setTrying(false);
    }
  };

  if (state === "checking" || state === "granted") return null;

  return (
    <div className="mic-permission-gate" role="dialog" aria-modal="true">
      <div className="mic-permission-gate-card">
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
            onClick={() => onResolved(false)}
          >
            {state === "denied" || state === "unsupported" ? "Continue typing" : "Skip for now"}
          </button>
        </div>
      </div>
    </div>
  );
}
