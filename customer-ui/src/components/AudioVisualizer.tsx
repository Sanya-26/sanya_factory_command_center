// AudioVisualizer — Cleo's voice as a Siri-style organic orb.
//
// Replaces the 3D avatar. Renders to a canvas, taps the wawa-lipsync
// analyser (which already exists for the lipsync FFT) so we don't fight
// MediaElementAudioSourceNode's "one per element" rule.
//
// What it draws:
//   - A central glowing orb that breathes (idle pulse)
//   - 64 radial bars whose lengths track frequency bins (loud sound = long bars)
//   - Soft radial gradient + outer glow for depth
//   - Smooth interpolation between frames (lerp values, not raw FFT, so the
//     orb doesn't jitter — feels organic, not robotic)

import { useEffect, useRef } from "react";
import type { Lipsync } from "wawa-lipsync";

interface Props {
  lipsync: Lipsync | null;
  isSpeaking?: boolean;
  className?: string;
}

const NUM_BARS = 96;
const IDLE_PULSE_HZ = 0.4;  // slow ambient breathing when silent

export function AudioVisualizer({ lipsync, isSpeaking, className }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  // Smoothed bar lengths (frame-to-frame interpolation makes movement organic)
  const smoothedRef = useRef<Float32Array>(new Float32Array(NUM_BARS));
  const isSpeakingRef = useRef(false);
  useEffect(() => { isSpeakingRef.current = isSpeaking ?? false; }, [isSpeaking]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // Resize canvas to its CSS box at devicePixelRatio. Re-run on viewport
    // changes via ResizeObserver — keeps the rendering crisp.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fit = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.floor(r.width * dpr);
      canvas.height = Math.floor(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    // Reach into wawa-lipsync's private analyser. The TypeScript `private`
    // marker is compile-time only — at runtime the field is reachable.
    // Using `as unknown as ...` keeps strict mode happy without lying.
    const getAnalyser = () =>
      (lipsync as unknown as { analyser?: AnalyserNode } | null)?.analyser ?? null;

    const freqBuf = new Uint8Array(256);  // matches wawa-lipsync's fftSize/8

    const render = () => {
      rafRef.current = requestAnimationFrame(render);

      const r = canvas.getBoundingClientRect();
      const w = r.width;
      const h = r.height;
      const cx = w / 2;
      const cy = h / 2;
      const baseRadius = Math.min(w, h) * 0.18;
      const maxBar = Math.min(w, h) * 0.22;

      ctx.clearRect(0, 0, w, h);

      // ── Pull current frequency data (or fall back to idle pulse) ──────
      const analyser = getAnalyser();
      const speaking = isSpeakingRef.current && analyser;
      let frame: Float32Array;
      const t = performance.now() * 0.001;
      if (speaking && analyser) {
        const n = Math.min(freqBuf.length, analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freqBuf);
        frame = new Float32Array(NUM_BARS);
        for (let i = 0; i < NUM_BARS; i++) {
          // Map bar index to log-spaced frequency bin (low → low bin, high → high bin)
          const norm = i / (NUM_BARS - 1);
          const bin = Math.floor(Math.pow(norm, 1.6) * (n - 1));
          frame[i] = (freqBuf[bin] ?? 0) / 255;  // 0..1
        }
      } else {
        // Idle: gentle breathing sine wave around 0.12 amplitude
        frame = new Float32Array(NUM_BARS);
        for (let i = 0; i < NUM_BARS; i++) {
          const phase = (i / NUM_BARS) * Math.PI * 2;
          frame[i] = 0.12 + Math.sin(t * IDLE_PULSE_HZ * Math.PI * 2 + phase * 2) * 0.04;
        }
      }

      // ── Smooth toward the target (lerp factor controls organic-ness) ──
      const smoothed = smoothedRef.current;
      const lerp = speaking ? 0.35 : 0.08;
      for (let i = 0; i < NUM_BARS; i++) {
        smoothed[i] += (frame[i] - smoothed[i]) * lerp;
      }

      // ── Outer glow halo (drawn behind everything) ────────────────────
      const avgEnergy = smoothed.reduce((s, v) => s + v, 0) / NUM_BARS;
      const haloR = baseRadius + maxBar * (0.4 + avgEnergy * 0.6);
      const g1 = ctx.createRadialGradient(cx, cy, baseRadius * 0.3, cx, cy, haloR * 1.8);
      g1.addColorStop(0,    `rgba(139, 92, 246, ${0.30 + avgEnergy * 0.25})`);
      g1.addColorStop(0.5,  `rgba(96, 165, 250, ${0.15 + avgEnergy * 0.20})`);
      g1.addColorStop(1,    "rgba(96, 165, 250, 0)");
      ctx.fillStyle = g1;
      ctx.beginPath();
      ctx.arc(cx, cy, haloR * 1.8, 0, Math.PI * 2);
      ctx.fill();

      // ── Radial bars ───────────────────────────────────────────────────
      // Each bar is a rounded rect emerging from baseRadius, length ∝ energy.
      // Color shifts from cool blue (low freq, bass) to warm purple (high freq, treble).
      for (let i = 0; i < NUM_BARS; i++) {
        const angle = (i / NUM_BARS) * Math.PI * 2 - Math.PI / 2;
        const energy = smoothed[i];
        const len = 6 + energy * maxBar;
        const r1 = baseRadius;
        const r2 = baseRadius + len;
        const x1 = cx + Math.cos(angle) * r1;
        const y1 = cy + Math.sin(angle) * r1;
        const x2 = cx + Math.cos(angle) * r2;
        const y2 = cy + Math.sin(angle) * r2;

        const hue = 220 + (i / NUM_BARS) * 60;  // 220° (blue) → 280° (purple)
        const sat = 70 + energy * 30;
        const light = 55 + energy * 15;

        ctx.lineCap = "round";
        ctx.lineWidth = 3;
        ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${0.5 + energy * 0.5})`;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // ── Inner core orb ───────────────────────────────────────────────
      const coreR = baseRadius * (0.85 + avgEnergy * 0.25);
      const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      g2.addColorStop(0,   `rgba(255, 255, 255, ${0.95})`);
      g2.addColorStop(0.4, `rgba(196, 181, 253, ${0.7 + avgEnergy * 0.2})`);
      g2.addColorStop(1,   `rgba(96, 165, 250, 0.0)`);
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [lipsync]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
