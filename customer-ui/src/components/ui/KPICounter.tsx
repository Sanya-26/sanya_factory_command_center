/**
 * KPICounter — animated number that counts up on mount.
 * Supports currency, percentage, and plain number formatting.
 */
import { useEffect, useRef, useState } from "react";

interface KPICounterProps {
  value?: number;
  to?: number;
  format?: "number" | "currency" | "percent" | "compact";
  duration?: number;          // ms, default 800
  className?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

export function KPICounter({
  value,
  to,
  format = "number",
  duration = 800,
  className,
  prefix = "",
  suffix = "",
  decimals,
}: KPICounterProps) {
  const target = value ?? to ?? 0;
  const [display, setDisplay] = useState("0");
  const raf = useRef<number>(0);
  const start = useRef<number>(0);

  useEffect(() => {
    if (!target && target !== 0) return;
    start.current = performance.now();

    const animate = (now: number) => {
      const elapsed = now - start.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = eased * target;
      setDisplay(fmt(current));
      if (progress < 1) raf.current = requestAnimationFrame(animate);
    };

    raf.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  function fmt(n: number): string {
    const d = decimals ?? (format === "percent" ? 1 : format === "currency" ? 0 : 0);
    if (format === "compact") {
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
      return n.toFixed(d);
    }
    if (format === "currency") {
      if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
      return `$${n.toFixed(d)}`;
    }
    if (format === "percent") return `${n.toFixed(d)}%`;
    return n.toFixed(d);
  }

  return (
    <span className={className}>
      {prefix}{display}{suffix}
    </span>
  );
}
