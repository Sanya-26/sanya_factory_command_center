// Generic loading skeleton blocks.

export function SkeletonBox({ height = 80, style }: { height?: number; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        height,
        background: "linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite",
        borderRadius: 12,
        ...style,
      }}
    />
  );
}

export function SkeletonRow({ width = "100%", style }: { width?: number | string; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        width,
        height: 14,
        background: "linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite",
        borderRadius: 4,
        ...style,
      }}
    />
  );
}

// One-time injected keyframes for the shimmer.
if (typeof document !== "undefined" && !document.getElementById("skeleton-shimmer-style")) {
  const s = document.createElement("style");
  s.id = "skeleton-shimmer-style";
  s.textContent = `@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`;
  document.head.appendChild(s);
}
