// AudioVisualizer — Cleo's voice as a dense Jarvis HUD + obsidian core.
//
// Renders 11 layers to a single 2D canvas. Each layer animates on its own
// rate so the composition never feels static. Voice-reactive: ring spin,
// particle emission, sweep brightness, and core energy all scale with the
// wawa-lipsync FFT.
//
// Layer stack (back → front):
//    1. Chrome bloom halo
//    2. Faint background grid scaffold (clipped to a ring zone)
//    3. Diagonal arc segments (not full circles — partial arcs at tilts)
//    4. Tilted perspective ellipse (HUD "Saturn ring" effect)
//    5. Five concentric rotating tick rings (dense / dashed / micro / etc)
//    6. Data-label clusters at cardinal points of one ring
//    7. Radar sweep wedge (slow rotation, low alpha)
//    8. FFT micro-flares (subtle outer bars when speaking)
//    9. Obsidian core (glossy sphere with top-left highlight)
//   10. Core scan line + occasional glitch flicker dots
//   11. Data-stream particles (emit while speaking)

import { useEffect, useRef } from "react";
import type { Lipsync } from "wawa-lipsync";

interface Props {
  lipsync: Lipsync | null;
  isSpeaking?: boolean;
  className?: string;
}

const NUM_BARS = 96;
const IDLE_PULSE_HZ = 0.4;
const MAX_PARTICLES = 120;
const MAX_FLICKERS = 24;

type Particle = {
  alive: boolean; angle: number; dist: number; speed: number; life: number; size: number;
};
type Flicker = {
  alive: boolean; angle: number; dist: number; life: number; size: number;
};

export function AudioVisualizer({ lipsync, isSpeaking, className }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothedRef = useRef<Float32Array>(new Float32Array(NUM_BARS));
  const isSpeakingRef = useRef(false);
  const lastFrameTime = useRef<number>(performance.now());
  const particlesRef = useRef<Particle[]>(
    Array.from({ length: MAX_PARTICLES }, () => ({
      alive: false, angle: 0, dist: 0, speed: 0, life: 0, size: 0,
    }))
  );
  const flickersRef = useRef<Flicker[]>(
    Array.from({ length: MAX_FLICKERS }, () => ({
      alive: false, angle: 0, dist: 0, life: 0, size: 0,
    }))
  );
  const particleEmitAcc = useRef(0);
  const nextFlickerAt = useRef(performance.now() + 1500);

  useEffect(() => { isSpeakingRef.current = isSpeaking ?? false; }, [isSpeaking]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

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

    const getAnalyser = () =>
      (lipsync as unknown as { analyser?: AnalyserNode } | null)?.analyser ?? null;
    const freqBuf = new Uint8Array(256);

    const render = () => {
      rafRef.current = requestAnimationFrame(render);

      const now = performance.now();
      const dt = Math.min(0.05, (now - lastFrameTime.current) / 1000);
      lastFrameTime.current = now;

      const r = canvas.getBoundingClientRect();
      const w = r.width;
      const h = r.height;
      const cx = w / 2;
      const cy = h / 2;
      const baseRadius = Math.min(w, h) * 0.16;
      const maxBar = Math.min(w, h) * 0.20;

      ctx.clearRect(0, 0, w, h);

      // ── FFT or idle pulse ─────────────────────────────────────────────
      const analyser = getAnalyser();
      const speaking = !!(isSpeakingRef.current && analyser);
      let frame: Float32Array;
      const t = now * 0.001;
      if (speaking && analyser) {
        const n = Math.min(freqBuf.length, analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freqBuf);
        frame = new Float32Array(NUM_BARS);
        for (let i = 0; i < NUM_BARS; i++) {
          const norm = i / (NUM_BARS - 1);
          const bin = Math.floor(Math.pow(norm, 1.6) * (n - 1));
          frame[i] = (freqBuf[bin] ?? 0) / 255;
        }
      } else {
        frame = new Float32Array(NUM_BARS);
        for (let i = 0; i < NUM_BARS; i++) {
          const phase = (i / NUM_BARS) * Math.PI * 2;
          frame[i] = 0.10 + Math.sin(t * IDLE_PULSE_HZ * Math.PI * 2 + phase * 2) * 0.035;
        }
      }
      const smoothed = smoothedRef.current;
      const lerp = speaking ? 0.35 : 0.08;
      for (let i = 0; i < NUM_BARS; i++) smoothed[i] += (frame[i] - smoothed[i]) * lerp;
      const avgEnergy = smoothed.reduce((s, v) => s + v, 0) / NUM_BARS;
      const energyBoost = 1 + (speaking ? avgEnergy * 1.4 : 0);

      // ════════════════════════════════════════════════════════════════
      // 1. CHROME BLOOM HALO
      // ════════════════════════════════════════════════════════════════
      const haloR = baseRadius + maxBar * (0.4 + avgEnergy * 0.6);
      const bloom = ctx.createRadialGradient(cx, cy, baseRadius * 0.3, cx, cy, haloR * 2.0);
      bloom.addColorStop(0,    `rgba(240, 240, 245, ${0.18 + avgEnergy * 0.16})`);
      bloom.addColorStop(0.55, `rgba(200, 200, 208, ${0.08 + avgEnergy * 0.12})`);
      bloom.addColorStop(1,    "rgba(160, 160, 168, 0)");
      ctx.fillStyle = bloom;
      ctx.beginPath();
      ctx.arc(cx, cy, haloR * 2.0, 0, Math.PI * 2);
      ctx.fill();

      // ════════════════════════════════════════════════════════════════
      // 2. BACKGROUND GRID SCAFFOLD — only inside an annulus zone
      // ════════════════════════════════════════════════════════════════
      // Radial spokes every 30°, clipped between r=baseRadius*1.1 and 2.5
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * 2.6, 0, Math.PI * 2);
      ctx.arc(cx, cy, baseRadius * 1.05, 0, Math.PI * 2, true);
      ctx.clip("evenodd");
      ctx.strokeStyle = "rgba(220, 222, 228, 0.045)";
      ctx.lineWidth = 1;
      for (let s = 0; s < 12; s++) {
        const a = (s / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * baseRadius * 1.05, cy + Math.sin(a) * baseRadius * 1.05);
        ctx.lineTo(cx + Math.cos(a) * baseRadius * 2.6, cy + Math.sin(a) * baseRadius * 2.6);
        ctx.stroke();
      }
      // Concentric grid arcs (very faint)
      for (let g = 0; g < 4; g++) {
        const gr = baseRadius * (1.25 + g * 0.35);
        ctx.beginPath();
        ctx.arc(cx, cy, gr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(220, 222, 228, ${0.04 - g * 0.005})`;
        ctx.stroke();
      }
      ctx.restore();

      // ════════════════════════════════════════════════════════════════
      // 3. DIAGONAL ARC SEGMENTS — partial arcs at varying tilts
      // ════════════════════════════════════════════════════════════════
      const arcSpec = [
        { rf: 2.30, start: 0.10, sweep: 0.62, speed:  0.08, lw: 1.4, alpha: 0.55, dashed: false },
        { rf: 2.45, start: 1.30, sweep: 0.38, speed: -0.05, lw: 1.0, alpha: 0.40, dashed: true  },
        { rf: 2.55, start: 3.40, sweep: 0.80, speed:  0.04, lw: 0.8, alpha: 0.32, dashed: false },
        { rf: 2.20, start: 5.10, sweep: 0.45, speed: -0.10, lw: 1.6, alpha: 0.62, dashed: false },
      ];
      for (const arc of arcSpec) {
        const rad = baseRadius * arc.rf;
        const rotation = t * arc.speed * energyBoost;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, arc.start + rotation, arc.start + rotation + arc.sweep * Math.PI * 2);
        ctx.strokeStyle = `rgba(225, 227, 232, ${arc.alpha})`;
        ctx.lineWidth = arc.lw;
        ctx.lineCap = "round";
        if (arc.dashed) ctx.setLineDash([4, 6]);
        ctx.stroke();
        if (arc.dashed) ctx.setLineDash([]);

        // Endcap markers — small bright dots at each end of every arc
        for (const endAt of [arc.start + rotation, arc.start + rotation + arc.sweep * Math.PI * 2]) {
          const ex = cx + Math.cos(endAt) * rad;
          const ey = cy + Math.sin(endAt) * rad;
          ctx.fillStyle = `rgba(255, 255, 255, ${arc.alpha + 0.20})`;
          ctx.beginPath();
          ctx.arc(ex, ey, arc.lw * 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ════════════════════════════════════════════════════════════════
      // 4. TILTED PERSPECTIVE ELLIPSE — HUD Saturn-ring
      // ════════════════════════════════════════════════════════════════
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.05 * energyBoost);
      ctx.scale(1, 0.32); // flatten into ellipse
      ctx.beginPath();
      ctx.arc(0, 0, baseRadius * 1.85, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(225, 227, 232, ${0.40 + avgEnergy * 0.20})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // Inner companion ellipse
      ctx.beginPath();
      ctx.arc(0, 0, baseRadius * 1.62, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(225, 227, 232, ${0.18})`;
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      // Two markers traveling around the ellipse
      const ellipseAngle = t * 0.6 * energyBoost;
      for (const ea of [ellipseAngle, ellipseAngle + Math.PI]) {
        const ex = Math.cos(ea) * baseRadius * 1.85;
        const ey = Math.sin(ea) * baseRadius * 1.85;
        const eGrad = ctx.createRadialGradient(ex, ey, 0, ex, ey, 8);
        eGrad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
        eGrad.addColorStop(1, "rgba(220, 222, 228, 0)");
        ctx.fillStyle = eGrad;
        ctx.beginPath();
        ctx.arc(ex, ey, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // ════════════════════════════════════════════════════════════════
      // 5. FIVE CONCENTRIC TICK RINGS
      // ════════════════════════════════════════════════════════════════
      const ringSpec = [
        { rf: 1.18, speed:  0.22, ticks: 48,  tickLen: 0.018, lw: 1.0, alpha: 0.55, marker: 3, dashed: false, majorEvery: 4 },
        { rf: 1.36, speed: -0.14, ticks: 24,  tickLen: 0.045, lw: 1.4, alpha: 0.70, marker: 5, dashed: true,  majorEvery: 6 },
        { rf: 1.55, speed:  0.32, ticks: 120, tickLen: 0.011, lw: 0.7, alpha: 0.38, marker: 3, dashed: false, majorEvery: 10 },
        { rf: 1.74, speed: -0.08, ticks: 36,  tickLen: 0.024, lw: 1.0, alpha: 0.50, marker: 4, dashed: false, majorEvery: 6 },
        { rf: 1.96, speed:  0.04, ticks: 64,  tickLen: 0.014, lw: 0.8, alpha: 0.32, marker: 3, dashed: false, majorEvery: 8 },
      ];
      for (const ring of ringSpec) {
        const rad = baseRadius * ring.rf;
        const rotation = t * ring.speed * energyBoost;

        // Faint full ring
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(220, 222, 228, ${ring.alpha * 0.18})`;
        ctx.lineWidth = ring.lw * 0.6;
        ctx.stroke();

        for (let i = 0; i < ring.ticks; i++) {
          const a = (i / ring.ticks) * Math.PI * 2 + rotation;
          if (ring.dashed && i % 2 === 1) continue;
          const isMajor = ring.majorEvery && i % ring.majorEvery === 0;
          const tlen = baseRadius * ring.tickLen * (1 + (speaking ? avgEnergy * 0.4 : 0));
          const len = isMajor ? tlen * 2.4 : tlen;
          const x1 = cx + Math.cos(a) * rad;
          const y1 = cy + Math.sin(a) * rad;
          const x2 = cx + Math.cos(a) * (rad + len);
          const y2 = cy + Math.sin(a) * (rad + len);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = `rgba(225, 227, 232, ${ring.alpha * (isMajor ? 1.15 : 0.85)})`;
          ctx.lineWidth = ring.lw;
          ctx.lineCap = "round";
          ctx.stroke();
        }

        // Primary orbital marker
        const markerAngle = rotation * 0.85;
        const mx = cx + Math.cos(markerAngle) * rad;
        const my = cy + Math.sin(markerAngle) * rad;
        const mGrad = ctx.createRadialGradient(mx, my, 0, mx, my, ring.marker * 2.5);
        mGrad.addColorStop(0, `rgba(255, 255, 255, 0.95)`);
        mGrad.addColorStop(1, `rgba(220, 222, 228, 0)`);
        ctx.fillStyle = mGrad;
        ctx.beginPath();
        ctx.arc(mx, my, ring.marker * 2.5, 0, Math.PI * 2);
        ctx.fill();
        // Twin marker on opposite side
        const tmx = cx + Math.cos(markerAngle + Math.PI) * rad;
        const tmy = cy + Math.sin(markerAngle + Math.PI) * rad;
        ctx.fillStyle = `rgba(220, 222, 228, ${ring.alpha * 0.55})`;
        ctx.beginPath();
        ctx.arc(tmx, tmy, ring.marker * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }

      // ════════════════════════════════════════════════════════════════
      // 6. DATA-LABEL CLUSTERS at cardinal points of ring 4 (rf=1.74)
      //    Tiny tick groups + bracket marks reading like data callouts
      // ════════════════════════════════════════════════════════════════
      const labelRad = baseRadius * 1.74;
      const labelRotation = t * -0.08 * energyBoost;
      for (let q = 0; q < 4; q++) {
        const a = (q / 4) * Math.PI * 2 + labelRotation;
        const baseX = cx + Math.cos(a) * labelRad;
        const baseY = cy + Math.sin(a) * labelRad;
        // Bracket: short tangent + perpendicular tick
        const tangentDX = -Math.sin(a);
        const tangentDY =  Math.cos(a);
        const outDX = Math.cos(a);
        const outDY = Math.sin(a);
        const offR = baseRadius * 0.16;
        // Outward tangent line (label baseline)
        ctx.beginPath();
        ctx.moveTo(baseX + outDX * 4, baseY + outDY * 4);
        ctx.lineTo(baseX + outDX * 4 + tangentDX * offR, baseY + outDY * 4 + tangentDY * offR);
        ctx.strokeStyle = `rgba(225, 227, 232, 0.45)`;
        ctx.lineWidth = 1;
        ctx.stroke();
        // Three tiny "text" dashes along the baseline
        for (let d = 0; d < 5; d++) {
          const dx0 = baseX + outDX * 6 + tangentDX * (offR * 0.18 + d * offR * 0.18);
          const dy0 = baseY + outDY * 6 + tangentDY * (offR * 0.18 + d * offR * 0.18);
          const dx1 = dx0 + tangentDX * (offR * 0.06 + Math.random() * offR * 0.05);
          const dy1 = dy0 + tangentDY * (offR * 0.06 + Math.random() * offR * 0.05);
          ctx.beginPath();
          ctx.moveTo(dx0, dy0);
          ctx.lineTo(dx1, dy1);
          ctx.strokeStyle = `rgba(225, 227, 232, 0.32)`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        // Tiny anchor dot
        ctx.fillStyle = `rgba(255, 255, 255, 0.85)`;
        ctx.beginPath();
        ctx.arc(baseX, baseY, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // ════════════════════════════════════════════════════════════════
      // 7. RADAR SWEEP WEDGE
      // ════════════════════════════════════════════════════════════════
      const sweepAngle = (t * 0.45) % (Math.PI * 2);
      const sweepSpan = 0.42;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(sweepAngle);
      const wedge = ctx.createConicGradient(0, 0, 0);
      wedge.addColorStop(0,                    `rgba(255, 255, 255, ${0.0})`);
      wedge.addColorStop(Math.min(0.005, 0.001), `rgba(255, 255, 255, ${0.0})`);
      wedge.addColorStop(0.01,                 `rgba(225, 227, 232, ${0.06 + avgEnergy * 0.10})`);
      wedge.addColorStop(sweepSpan * 0.5,      `rgba(225, 227, 232, ${0.10 + avgEnergy * 0.14})`);
      wedge.addColorStop(sweepSpan,            `rgba(255, 255, 255, ${0})`);
      wedge.addColorStop(1,                    `rgba(255, 255, 255, ${0})`);
      ctx.fillStyle = wedge;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, baseRadius * 1.96, 0, sweepSpan * Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // ════════════════════════════════════════════════════════════════
      // 8. FFT MICRO-FLARES (speaking only)
      // ════════════════════════════════════════════════════════════════
      if (speaking) {
        for (let i = 0; i < NUM_BARS; i++) {
          const angle = (i / NUM_BARS) * Math.PI * 2 - Math.PI / 2;
          const energy = smoothed[i];
          if (energy < 0.04) continue;
          const len = 4 + energy * (maxBar * 0.40);
          const r1 = baseRadius * 1.02;
          const r2 = r1 + len;
          const x1 = cx + Math.cos(angle) * r1;
          const y1 = cy + Math.sin(angle) * r1;
          const x2 = cx + Math.cos(angle) * r2;
          const y2 = cy + Math.sin(angle) * r2;
          const light = 75 + Math.sin((i / NUM_BARS) * Math.PI * 2) * 12 + energy * 12;
          ctx.lineCap = "round";
          ctx.lineWidth = 2;
          ctx.strokeStyle = `hsla(220, 4%, ${light}%, ${0.28 + energy * 0.5})`;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }

      // ════════════════════════════════════════════════════════════════
      // 9. OBSIDIAN CORE (sphere)
      // ════════════════════════════════════════════════════════════════
      const coreR = baseRadius * (0.82 + avgEnergy * 0.22);
      // Outer rim glow
      const rim = ctx.createRadialGradient(cx, cy, coreR * 0.92, cx, cy, coreR * 1.22);
      rim.addColorStop(0,    `rgba(220, 222, 228, 0)`);
      rim.addColorStop(0.6,  `rgba(225, 227, 232, ${0.18 + avgEnergy * 0.25})`);
      rim.addColorStop(1,    `rgba(220, 222, 228, 0)`);
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 1.22, 0, Math.PI * 2);
      ctx.fill();
      // Obsidian body
      const obsidian = ctx.createRadialGradient(
        cx - coreR * 0.25, cy - coreR * 0.30, coreR * 0.05,
        cx, cy, coreR
      );
      obsidian.addColorStop(0,    `rgba(50, 50, 54, 1)`);
      obsidian.addColorStop(0.45, `rgba(18, 18, 20, 1)`);
      obsidian.addColorStop(1,    `rgba(0, 0, 0, 1)`);
      ctx.fillStyle = obsidian;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();
      // Top-left highlight
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.clip();
      const hl = ctx.createRadialGradient(
        cx - coreR * 0.35, cy - coreR * 0.45, 0,
        cx - coreR * 0.35, cy - coreR * 0.45, coreR * 0.85
      );
      hl.addColorStop(0,   `rgba(255, 255, 255, ${0.50 + avgEnergy * 0.20})`);
      hl.addColorStop(0.5, `rgba(255, 255, 255, 0.10)`);
      hl.addColorStop(1,   `rgba(255, 255, 255, 0)`);
      ctx.fillStyle = hl;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      // ── Etched inner ring (visible through the glass) ──
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 0.62, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(225, 227, 232, ${0.18 + avgEnergy * 0.15})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      // ── Crosshair through the sphere ──
      ctx.beginPath();
      ctx.moveTo(cx - coreR * 0.72, cy);
      ctx.lineTo(cx + coreR * 0.72, cy);
      ctx.moveTo(cx, cy - coreR * 0.72);
      ctx.lineTo(cx, cy + coreR * 0.72);
      ctx.strokeStyle = `rgba(225, 227, 232, ${0.10})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // ── Animated scan line that drifts vertically across the core ──
      const scanY = cy + Math.sin(t * 0.6) * coreR * 0.7;
      const scanGrad = ctx.createLinearGradient(0, scanY - 6, 0, scanY + 6);
      scanGrad.addColorStop(0,   "rgba(225, 227, 232, 0)");
      scanGrad.addColorStop(0.5, `rgba(240, 240, 245, ${0.25 + avgEnergy * 0.25})`);
      scanGrad.addColorStop(1,   "rgba(225, 227, 232, 0)");
      ctx.fillStyle = scanGrad;
      ctx.fillRect(cx - coreR, scanY - 4, coreR * 2, 8);
      ctx.restore();

      // ── Inner energy core (only when speaking) ──
      if (speaking) {
        const inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 0.55);
        inner.addColorStop(0,   `rgba(255, 255, 255, ${0.30 + avgEnergy * 0.35})`);
        inner.addColorStop(0.5, `rgba(220, 222, 228, ${0.10 + avgEnergy * 0.15})`);
        inner.addColorStop(1,   `rgba(0, 0, 0, 0)`);
        ctx.fillStyle = inner;
        ctx.beginPath();
        ctx.arc(cx, cy, coreR * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }

      // ════════════════════════════════════════════════════════════════
      // 10. CORNER RETICLE BRACKETS — four L-shapes around the orb
      // ════════════════════════════════════════════════════════════════
      const reticleR = baseRadius * 1.04;
      const blen = baseRadius * 0.18;
      for (let q = 0; q < 4; q++) {
        const a = Math.PI / 4 + q * (Math.PI / 2); // 45°, 135°, 225°, 315°
        const px = cx + Math.cos(a) * reticleR;
        const py = cy + Math.sin(a) * reticleR;
        // Tangent direction (perpendicular to radius)
        const tDX = -Math.sin(a);
        const tDY =  Math.cos(a);
        // Radial direction (outward)
        const rDX = Math.cos(a);
        const rDY = Math.sin(a);
        // L-shape: short outward stub + short tangent stub
        ctx.strokeStyle = `rgba(225, 227, 232, ${0.50 + avgEnergy * 0.20})`;
        ctx.lineWidth = 1.4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + rDX * blen * 0.5, py + rDY * blen * 0.5);
        ctx.moveTo(px, py);
        ctx.lineTo(px + tDX * blen * 0.4, py + tDY * blen * 0.4);
        ctx.stroke();
      }

      // ════════════════════════════════════════════════════════════════
      // 11. GLITCH FLICKERS — occasional tiny bright dots at random
      //     positions inside the ring zone. Suggests live data activity.
      // ════════════════════════════════════════════════════════════════
      const flickers = flickersRef.current;
      if (now >= nextFlickerAt.current) {
        const slot = flickers.find((f) => !f.alive);
        if (slot) {
          slot.alive = true;
          slot.angle = Math.random() * Math.PI * 2;
          slot.dist = baseRadius * (1.1 + Math.random() * 1.4);
          slot.life = 1;
          slot.size = 0.8 + Math.random() * 1.4;
        }
        nextFlickerAt.current = now + 280 + Math.random() * 420;
      }
      for (const f of flickers) {
        if (!f.alive) continue;
        f.life -= dt * 2.2;
        if (f.life <= 0) { f.alive = false; continue; }
        const fx = cx + Math.cos(f.angle) * f.dist;
        const fy = cy + Math.sin(f.angle) * f.dist;
        ctx.fillStyle = `rgba(255, 255, 255, ${f.life * 0.9})`;
        ctx.beginPath();
        ctx.arc(fx, fy, f.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // ════════════════════════════════════════════════════════════════
      // 12. DATA-STREAM PARTICLES (emit while speaking)
      // ════════════════════════════════════════════════════════════════
      const particles = particlesRef.current;
      if (speaking) {
        particleEmitAcc.current += dt * (12 + avgEnergy * 90);
        while (particleEmitAcc.current >= 1) {
          particleEmitAcc.current -= 1;
          const slot = particles.find((p) => !p.alive);
          if (!slot) break;
          slot.alive = true;
          slot.angle = Math.random() * Math.PI * 2;
          slot.dist = baseRadius * 0.95;
          slot.speed = 40 + Math.random() * 80 + avgEnergy * 90;
          slot.life = 1;
          slot.size = 0.7 + Math.random() * 1.6;
        }
      }
      for (const p of particles) {
        if (!p.alive) continue;
        p.dist += p.speed * dt;
        p.life -= dt * 0.85;
        if (p.life <= 0 || p.dist > baseRadius * 2.4) { p.alive = false; continue; }
        const px = cx + Math.cos(p.angle) * p.dist;
        const py = cy + Math.sin(p.angle) * p.dist;
        ctx.fillStyle = `rgba(240, 240, 245, ${p.life * 0.85})`;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
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
