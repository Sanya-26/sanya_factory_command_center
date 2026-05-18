// AvatarPicker — embeds Ready Player Me's official avatar creator in an
// iframe. The user picks their own avatar (1 minute), the iframe sends back
// a .glb URL via postMessage, and we save it to localStorage so subsequent
// loads use it instead of the default. Dev-mode only.
//
// Why this exists: the default avatar lives in the .env, but generating a
// new one through RPM's UI is the cleanest way to get a "professional-
// looking" or branded Cleo without needing to muck with curl + Storage.

import { useEffect, useRef, useState } from "react";

const RPM_FRAME_URL =
  "https://demo.readyplayer.me/avatar?frameApi&clearCache&bodyType=halfbody";

const STORAGE_KEY = "cleo:avatar-url";

export function getStoredAvatarUrl(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

interface AvatarPickerProps {
  onPicked: (url: string) => void;
  onClose: () => void;
}

export function AvatarPicker({ onPicked, onClose }: AvatarPickerProps): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // RPM posts JSON-stringified events that include their domain
      let data: { source?: string; eventName?: string; data?: { url?: string } | string } | null = null;
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (!data || data.source !== "readyplayerme") return;

      // The "v1.frame.ready" event fires on iframe boot — subscribe to events.
      if (data.eventName === "v1.frame.ready") {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({
            target: "readyplayerme",
            type: "subscribe",
            eventName: "v1.**",
          }),
          "*"
        );
      }

      // The "v1.avatar.exported" event is what we want — `data` is the URL.
      if (data.eventName === "v1.avatar.exported") {
        const exportedUrl =
          typeof data.data === "string"
            ? data.data
            : data.data?.url ?? "";
        if (!exportedUrl) return;

        // Append the morph targets we need for lipsync.
        const url = exportedUrl.includes("?")
          ? exportedUrl + "&morphTargets=ARKit,Oculus%20Visemes"
          : exportedUrl + "?morphTargets=ARKit,Oculus%20Visemes";

        setSaving(true);
        try {
          localStorage.setItem(STORAGE_KEY, url);
        } catch (e) {
          console.warn("[AvatarPicker] localStorage save failed:", e);
        }
        onPicked(url);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onPicked]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.8)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(960px, 100%)",
          height: "min(720px, 90vh)",
          background: "#0a0a0a",
          borderRadius: "12px",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          overflow: "hidden",
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 18px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            color: "#fff",
            fontSize: "0.78rem",
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
          }}
        >
          <span>Pick a Cleo avatar — half-body works best · click "Next" when done</span>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              color: "rgba(255, 255, 255, 0.7)",
              padding: "4px 12px",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.7rem",
            }}
          >
            ×
          </button>
        </div>
        <iframe
          ref={iframeRef}
          src={RPM_FRAME_URL}
          allow="camera *; microphone *; clipboard-write"
          style={{
            flex: 1,
            border: 0,
            background: "#0a0a0a",
          }}
          title="Ready Player Me Avatar Creator"
        />
        {saving ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0, 0, 0, 0.85)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontFamily: "ui-monospace, monospace",
            }}
          >
            Saving avatar… reloading
          </div>
        ) : null}
      </div>
    </div>
  );
}
