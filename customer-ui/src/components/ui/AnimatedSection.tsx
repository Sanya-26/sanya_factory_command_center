/**
 * AnimatedSection — Intersection Observer + Framer Motion wrapper.
 * Fades + slides up when the element scrolls into view.  Animates only once.
 */
import React, { useRef } from "react";
import { motion, useInView } from "framer-motion";

interface AnimatedSectionProps {
  children: React.ReactNode;
  /** Stagger index — each unit adds 0.08 s of delay */
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function AnimatedSection({ children, delay = 0, className, style }: AnimatedSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
      transition={{ duration: 0.45, delay: delay * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}
