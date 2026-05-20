// Generic overlay modal. Esc + overlay-click to close. Optional "Open full page" header link.

import { useEffect } from "react";

export function Modal({
  open,
  onClose,
  title,
  fullPageHref,
  width = 720,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  fullPageHref?: string;
  width?: number;
  children: React.ReactNode;
}): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.6)",
        zIndex: 100,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "60px 16px",
        overflow: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          color: "#111827",
          borderRadius: 12,
          width: "100%",
          maxWidth: width,
          boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "calc(100vh - 120px)",
        }}
      >
        <header
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, flex: 1 }}>{title}</h2>
          {fullPageHref ? (
            <a
              href={fullPageHref}
              onClick={onClose}
              style={{ fontSize: 12, color: "#2563eb", textDecoration: "none" }}
            >
              Open full page ↗
            </a>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              fontSize: 20,
              cursor: "pointer",
              color: "#6b7280",
              padding: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </header>
        <div style={{ padding: 20, overflow: "auto", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}
