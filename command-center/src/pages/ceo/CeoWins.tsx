// CEO Wins — full feed + range toggle + investor email generator.

import { useState } from "react";
import { WinsFeed } from "../../components/WinsFeed";
import { Modal } from "../../components/Modal";

export function CeoWinsPage(): JSX.Element {
  const [days, setDays] = useState<30 | 60 | 90>(30);
  const [emailOpen, setEmailOpen] = useState(false);
  return (
    <div style={{ padding: 24, display: "grid", gap: 16, maxWidth: 780 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Wins feed</h1>
          <p style={{ color: "#9ca3af", margin: "4px 0 0", fontSize: 13 }}>Every customer you've signed in the last {days} days.</p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[30, 60, 90].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d as 30 | 60 | 90)} style={{ padding: "6px 12px", border: "1px solid #e5e7eb", borderRadius: 6, background: days === d ? "#2563eb" : "white", color: days === d ? "white" : "#111827", cursor: "pointer", fontSize: 12 }}>{d}d</button>
          ))}
          <button type="button" onClick={() => setEmailOpen(true)} className="btn" style={{ padding: "6px 14px", fontSize: 12 }}>📨 Generate investor update</button>
        </div>
      </header>

      <div style={{ background: "white", color: "#111827", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
        <WinsFeed days={days} max={100} showCopyButton={false} />
      </div>

      <Modal open={emailOpen} onClose={() => setEmailOpen(false)} title="Investor update draft" width={680}>
        <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>Copy this paragraph into your investor email. Edit as needed.</p>
        <pre style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: 12, marginTop: 8, fontSize: 12, whiteSpace: "pre-wrap", color: "#111827" }}>
{`Hi investors,

Quick update from the last ${days} days at AUBOS. We've signed a fresh cohort of customers across our three product lines (Cleo for Pools, Gameday, Real Estate). MRR is growing month over month and our pipeline conversion remains strong.

Highlights:
- {N} new customers signed
- ${"{$X}"}k MRR added
- Sanya is auditing each tenant against a client-experience checklist before they go live
- Triage Agent is rolling up customer flags into prioritized engineering work

Full board snapshot ships next week.

— Ouadie`}
        </pre>
      </Modal>
    </div>
  );
}
