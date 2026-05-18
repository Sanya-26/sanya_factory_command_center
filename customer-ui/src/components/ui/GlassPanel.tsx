import { cn } from "@/lib/utils";

/**
 * GlassPanel — Premium dark glass card with shine, edge glow & reflection.
 * Adapted for aubos #ffffff indigo background.
 *
 * Usage:
 *   <GlassPanel className="p-6">content</GlassPanel>
 *   <GlassPanel variant="card" className="p-4">inner card</GlassPanel>
 */

interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
  variant?: "panel" | "card";
  style?: React.CSSProperties;
}

export function GlassPanel({ children, className, variant = "panel", style }: GlassPanelProps) {
  if (variant === "card") {
    return (
      <div
        className={cn("relative overflow-hidden rounded-[10px]", className)}
        style={{
          background: "linear-gradient(160deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.15) 100%)",
          border: "1px solid rgba(120,140,255,0.06)",
          borderTop: "1px solid rgba(140,160,255,0.12)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(0,0,0,0.03)",
          ...style,
        }}
      >
        {/* Card top-edge shine */}
        <div style={{
          position: "absolute", top: 0, left: "10%", right: "10%", height: 1,
          background: "linear-gradient(90deg, transparent, rgba(140,160,255,0.10), transparent)",
          zIndex: 3, pointerEvents: "none",
        }} />
        <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
      </div>
    );
  }

  return (
    <div
      className={cn("relative overflow-hidden rounded-[16px]", className)}
      style={{
        background: "linear-gradient(135deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.20) 40%, rgba(0,0,0,0.25) 100%)",
        border: "1px solid rgba(120,140,255,0.08)",
        borderTop: "1px solid rgba(160,175,255,0.22)",
        borderLeft: "1px solid rgba(140,160,255,0.10)",
        boxShadow: `
          0 25px 60px rgba(0,0,0,0.45),
          0 8px 30px rgba(0,0,0,0.25),
          0 0 80px rgba(99,102,241,0.04),
          inset 0 1px 0 rgba(0,0,0,0.03),
          inset 0 0 40px rgba(99,102,241,0.02)
        `,
        ...style,
      }}
    >
      {/* ══════ SHINE LAYERS ══════ */}

      {/* Top edge bright highlight */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: "linear-gradient(90deg, transparent 5%, rgba(160,175,255,0.25) 20%, rgba(200,210,255,0.40) 40%, rgba(160,175,255,0.20) 60%, rgba(120,140,255,0.08) 80%, transparent 95%)",
        zIndex: 5, pointerEvents: "none",
      }} />

      {/* Left edge subtle highlight */}
      <div style={{
        position: "absolute", top: 0, left: 0, bottom: 0, width: 1,
        background: "linear-gradient(180deg, rgba(160,175,255,0.18) 0%, rgba(120,140,255,0.05) 50%, transparent 100%)",
        zIndex: 5, pointerEvents: "none",
      }} />

      {/* Top-left shine hotspot */}
      <div style={{
        position: "absolute", top: "-20%", left: "-10%", width: "60%", height: "60%",
        background: "radial-gradient(ellipse at center, rgba(160,175,255,0.06) 0%, rgba(130,150,255,0.025) 40%, transparent 70%)",
        pointerEvents: "none", zIndex: 3,
      }} />

      {/* Second hotspot — brighter, corner */}
      <div style={{
        position: "absolute", top: "-5%", left: "5%", width: "30%", height: "35%",
        background: "radial-gradient(ellipse at center, rgba(200,210,255,0.05) 0%, transparent 60%)",
        pointerEvents: "none", zIndex: 3,
      }} />

      {/* Diagonal light streak — the key "glass shine" */}
      <div style={{
        position: "absolute", top: "-80%", left: "-30%", width: "160%", height: "160%",
        background: `linear-gradient(
          125deg,
          transparent 42%,
          rgba(180,195,255,0.03) 44%,
          rgba(200,210,255,0.06) 45.5%,
          rgba(220,225,255,0.08) 46.5%,
          rgba(200,210,255,0.06) 47.5%,
          rgba(180,195,255,0.03) 49%,
          transparent 51%
        )`,
        pointerEvents: "none", zIndex: 4,
      }} />

      {/* Second thinner streak */}
      <div style={{
        position: "absolute", top: "-60%", left: "-20%", width: "150%", height: "150%",
        background: `linear-gradient(
          125deg,
          transparent 53%,
          rgba(180,195,255,0.02) 54.5%,
          rgba(200,210,255,0.035) 55.5%,
          rgba(180,195,255,0.02) 56.5%,
          transparent 58%
        )`,
        pointerEvents: "none", zIndex: 4,
      }} />

      {/* Top-half fade — overhead light */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "40%",
        background: "linear-gradient(180deg, rgba(180,195,255,0.035) 0%, transparent 100%)",
        borderRadius: "16px 16px 0 0",
        pointerEvents: "none", zIndex: 3,
      }} />

      {/* Corner glint */}
      <div style={{
        position: "absolute", top: 8, left: 12, width: 40, height: 20,
        background: "radial-gradient(ellipse, rgba(0,0,0,0.03) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 5,
      }} />

      {/* ══════ CONTENT ══════ */}
      <div style={{ position: "relative", zIndex: 2, flex: "1 1 0%", minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>{children}</div>
    </div>
  );
}

/**
 * Bottom reflection glow — place below a GlassPanel for a "floating" effect.
 * Usage: <GlassReflection />
 */
export function GlassReflection() {
  return (
    <div style={{
      position: "relative", height: 0,
    }}>
      <div style={{
        position: "absolute", top: -20, left: "15%", right: "15%", height: 50,
        background: "radial-gradient(ellipse at center, rgba(99,102,241,0.07) 0%, transparent 70%)",
        filter: "blur(20px)",
        pointerEvents: "none",
      }} />
    </div>
  );
}
