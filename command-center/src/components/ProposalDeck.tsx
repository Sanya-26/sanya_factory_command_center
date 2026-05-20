// 8-slide proposal deck. Brand-agnostic clean styling. Prev/next + counter.

import { useState } from "react";

interface DeckProps {
  companyName: string;
  niche?: string | null;
  monthlyUsd?: number;
}

const ACCENT_BY_SLIDE = ["#2563eb", "#dc2626", "#7c3aed", "#0891b2", "#10b981", "#f59e0b", "#ec4899", "#16a34a"];

export function ProposalDeck({ companyName, niche, monthlyUsd = 1495 }: DeckProps): JSX.Element {
  const [idx, setIdx] = useState(0);
  const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const nicheLabel = niche
    ? niche.split("-").map((s) => s[0]?.toUpperCase() + s.slice(1)).join(" ")
    : "";

  const slides: Array<{ title: string; body: JSX.Element }> = [
    {
      title: "Cover",
      body: (
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%", textAlign: "center", gap: 16 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, color: "#6b7280", textTransform: "uppercase" }}>Prepared for</div>
          <div style={{ fontSize: 42, fontWeight: 700, color: "#111827" }}>{companyName}</div>
          {nicheLabel ? <div style={{ fontSize: 14, color: "#6b7280" }}>{nicheLabel}</div> : null}
          <div style={{ marginTop: 24, padding: "12px 24px", background: ACCENT_BY_SLIDE[0], color: "white", borderRadius: 999, fontSize: 13, fontWeight: 600, letterSpacing: 1 }}>
            CLEO · OPERATING PLATFORM
          </div>
          <div style={{ marginTop: 32, fontSize: 12, color: "#9ca3af" }}>{date}</div>
        </div>
      ),
    },
    {
      title: "The challenge",
      body: (
        <Slide accent={ACCENT_BY_SLIDE[1]} heading="The challenge today">
          <p style={{ fontSize: 17, lineHeight: 1.6, color: "#1f2937", margin: 0 }}>
            Customer acquisition for {nicheLabel || "your business"} is mostly manual — calls missed, quotes delayed, leads leaking.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 24 }}>
            <Stat number="12%" caption="lead conversion (industry avg 22%)" />
            <Stat number="41%" caption="after-hours calls missed" />
            <Stat number="3.5d" caption="average time-to-quote" />
          </div>
        </Slide>
      ),
    },
    {
      title: "What CLEO will build",
      body: (
        <Slide accent={ACCENT_BY_SLIDE[2]} heading="What we'll build for you">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 8 }}>
            <ModuleCard icon="🌐" title="Branded site" body="Mobile-first homepage with your brand, photos, and trust signals." />
            <ModuleCard icon="🤖" title="AI receptionist" body="Answers your phone 24/7. Books calls. Captures leads." />
            <ModuleCard icon="💲" title="Quote calculator" body="Customers self-serve a quote in under 60 seconds." />
            <ModuleCard icon="✉️" title="Drip nurture" body="Multi-touch follow-up via email + SMS. Never lose a lead again." />
          </div>
        </Slide>
      ),
    },
    {
      title: "Customer experience",
      body: (
        <Slide accent={ACCENT_BY_SLIDE[3]} heading="The customer experience">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <SideCard tone="muted" title="Before">
              <ul style={{ paddingLeft: 18, margin: 0, lineHeight: 1.7 }}>
                <li>Call → voicemail → call back next day</li>
                <li>Email quote 2–3 days later</li>
                <li>Lead goes cold, books with competitor</li>
              </ul>
            </SideCard>
            <SideCard tone="accent" title="After (with CLEO)">
              <ul style={{ paddingLeft: 18, margin: 0, lineHeight: 1.7 }}>
                <li>Instant AI receptionist answers the call</li>
                <li>Self-serve quote in 60 seconds</li>
                <li>Booked appointment before lead cools</li>
              </ul>
            </SideCard>
          </div>
        </Slide>
      ),
    },
    {
      title: "Pricing",
      body: (
        <Slide accent={ACCENT_BY_SLIDE[4]} heading="Investment">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "stretch" }}>
            <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 12, padding: 24 }}>
              <div style={{ color: "#16a34a", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Standard tier</div>
              <div style={{ fontSize: 44, fontWeight: 700, color: "#111827", marginTop: 4 }}>${monthlyUsd}<span style={{ fontSize: 16, color: "#6b7280" }}> / month</span></div>
              <ul style={{ marginTop: 16, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: "#1f2937" }}>
                <li>Everything in scope</li>
                <li>100 AI receptionist calls / month</li>
                <li>Quarterly business review with Sanya</li>
                <li>Unlimited content updates</li>
              </ul>
            </div>
            <div style={{ background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 12, padding: 24 }}>
              <div style={{ color: "#1d4ed8", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Expected ROI · year 1</div>
              <ul style={{ marginTop: 12, paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: "#1f2937" }}>
                <li>+30% qualified leads (~+15 builds)</li>
                <li>–50% time-to-quote</li>
                <li>~$45k–$80k incremental revenue</li>
                <li>Payback in &lt; 3 months</li>
              </ul>
            </div>
          </div>
        </Slide>
      ),
    },
    {
      title: "Timeline",
      body: (
        <Slide accent={ACCENT_BY_SLIDE[5]} heading="3–5 days from signed to live">
          <div style={{ marginTop: 16 }}>
            {[
              { day: "Day 1", title: "Intake", desc: "30-min call. We map your business, capture your voice." },
              { day: "Day 2", title: "Build", desc: "The AI Factory produces every tool in your tier." },
              { day: "Day 3", title: "Audit", desc: "Sanya tests every flow as a real customer." },
              { day: "Day 4", title: "Handover", desc: "30-min walkthrough. Credentials. Integrations connect." },
              { day: "Day 5", title: "Live", desc: "Your site, receptionist, and pipeline are operating." },
            ].map((row, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "70px 100px 1fr", alignItems: "center", gap: 16, padding: "10px 0", borderTop: i > 0 ? "1px solid #f3f4f6" : "none" }}>
                <div style={{ color: ACCENT_BY_SLIDE[5], fontWeight: 700, fontSize: 13 }}>{row.day}</div>
                <div style={{ color: "#111827", fontWeight: 600 }}>{row.title}</div>
                <div style={{ color: "#6b7280", fontSize: 13 }}>{row.desc}</div>
              </div>
            ))}
          </div>
        </Slide>
      ),
    },
    {
      title: "Why now",
      body: (
        <Slide accent={ACCENT_BY_SLIDE[6]} heading="Why now">
          <div style={{ display: "grid", gap: 16, marginTop: 8 }}>
            {[
              ["Buyer expectations changed.", "Homeowners expect instant answers. Wait > 5 min and they've moved on."],
              ["AI is finally good enough.", "Voice receptionists, generative copy, and quote engines are production-ready in 2026."],
              ["Window of advantage is closing.", "First movers in each niche lock in 2–3 years of pricing power before competitors catch up."],
            ].map(([title, body], i) => (
              <div key={i} style={{ borderLeft: `4px solid ${ACCENT_BY_SLIDE[6]}`, paddingLeft: 16 }}>
                <div style={{ color: "#111827", fontWeight: 600 }}>{title}</div>
                <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>{body}</div>
              </div>
            ))}
          </div>
        </Slide>
      ),
    },
    {
      title: "Next step",
      body: (
        <Slide accent={ACCENT_BY_SLIDE[7]} heading="Next step">
          <div style={{ marginTop: 24, textAlign: "center" }}>
            <p style={{ fontSize: 17, color: "#1f2937", lineHeight: 1.6, margin: 0 }}>
              Let's spend 30 minutes walking through this together.
              <br />
              You ask anything. I show you exactly what your site, receptionist, and pipeline will look like.
            </p>
            <button
              type="button"
              onClick={() => alert("In the live app this opens the multi-slot scheduler.")}
              style={{
                marginTop: 32,
                padding: "14px 28px",
                background: ACCENT_BY_SLIDE[7],
                color: "white",
                border: "none",
                borderRadius: 999,
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 6px 14px rgba(22,163,74,0.3)",
              }}
            >
              Schedule the 30-min walkthrough →
            </button>
            <div style={{ marginTop: 40, fontSize: 12, color: "#9ca3af" }}>
              — Sanya · Product · CLEO
            </div>
          </div>
        </Slide>
      ),
    },
  ];

  const cur = slides[idx];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          background: "white",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          minHeight: 460,
          padding: 32,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {cur.body}
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: 16,
            right: 16,
            color: "#9ca3af",
            fontSize: 10,
            display: "flex",
            justifyContent: "space-between",
            borderTop: "1px solid #f3f4f6",
            paddingTop: 6,
          }}
        >
          <span>CLEO · {companyName}</span>
          <span>{date}</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} className="btn-ghost" style={{ fontSize: 13 }}>← Prev</button>
        <div style={{ display: "flex", gap: 4 }}>
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Slide ${i + 1}`}
              style={{
                width: idx === i ? 22 : 8,
                height: 8,
                borderRadius: 4,
                background: idx === i ? ACCENT_BY_SLIDE[idx] : "#d1d5db",
                border: "none",
                cursor: "pointer",
                transition: "all 0.2s",
                padding: 0,
              }}
            />
          ))}
        </div>
        <button type="button" onClick={() => setIdx((i) => Math.min(slides.length - 1, i + 1))} disabled={idx === slides.length - 1} className="btn-ghost" style={{ fontSize: 13 }}>Next →</button>
      </div>
      <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
        Slide {idx + 1} / {slides.length} · {cur.title}
      </div>
    </div>
  );
}

function Slide({ heading, accent, children }: { heading: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 6, height: 24, background: accent, borderRadius: 4 }} />
        <h2 style={{ margin: 0, fontSize: 22, color: "#111827" }}>{heading}</h2>
      </div>
      <div style={{ marginTop: 8, flex: 1 }}>{children}</div>
    </div>
  );
}

function Stat({ number, caption }: { number: string; caption: string }) {
  return (
    <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 16, textAlign: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#b91c1c" }}>{number}</div>
      <div style={{ fontSize: 11, color: "#7f1d1d", marginTop: 4, lineHeight: 1.4 }}>{caption}</div>
    </div>
  );
}

function ModuleCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 24 }}>{icon}</div>
      <div style={{ marginTop: 8, color: "#111827", fontWeight: 600 }}>{title}</div>
      <div style={{ color: "#6b7280", fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

function SideCard({ tone, title, children }: { tone: "muted" | "accent"; title: string; children: React.ReactNode }) {
  const styles = tone === "muted"
    ? { bg: "#f9fafb", border: "#e5e7eb", titleColor: "#6b7280" }
    : { bg: "#ecfeff", border: "#67e8f9", titleColor: "#0e7490" };
  return (
    <div style={{ background: styles.bg, border: `1px solid ${styles.border}`, borderRadius: 10, padding: 20 }}>
      <div style={{ color: styles.titleColor, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>{title}</div>
      <div style={{ color: "#1f2937", fontSize: 14 }}>{children}</div>
    </div>
  );
}
