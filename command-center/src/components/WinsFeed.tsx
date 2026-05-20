// Wins feed — contracts CEO signed in the last N days.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../lib/factorySupabase";

interface Win {
  id: string;
  company_id: string;
  company_name: string;
  niche: string | null;
  monthly_usd: number;
  ceo_signed_at: string;
}

export function WinsFeed({ days = 30, max = 10, showCopyButton = true }: { days?: number; max?: number; showCopyButton?: boolean }) {
  const [wins, setWins] = useState<Win[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      const { data } = await sb.from("v_ceo_contracts_pending").select("*");
      const rows = ((data ?? []) as Array<Win & { queue_bucket: string }>)
        .filter((r) => r.queue_bucket === "signed" && r.ceo_signed_at)
        .filter((r) => Date.now() - new Date(r.ceo_signed_at).getTime() <= days * 86400_000)
        .sort((a, b) => new Date(b.ceo_signed_at).getTime() - new Date(a.ceo_signed_at).getTime())
        .slice(0, max);
      if (!cancelled) setWins(rows);
    })();
    return () => { cancelled = true; };
  }, [days, max]);

  function copyBullets() {
    const bullets = wins.map((w) => {
      const date = new Date(w.ceo_signed_at).toLocaleDateString();
      return `- ${w.company_name} (${nicheLabel(w.niche)}) — $${Number(w.monthly_usd).toLocaleString()}/mo · signed ${date}`;
    }).join("\n");
    navigator.clipboard?.writeText(bullets);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      {wins.length === 0 ? (
        <p style={{ color: "#9ca3af", fontStyle: "italic", margin: 0, fontSize: 13 }}>No customers signed in the last {days} days.</p>
      ) : (
        <>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13 }}>
            {wins.map((w) => (
              <li key={w.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid #f3f4f6" }}>
                <span style={{ width: 28, height: 28, borderRadius: 999, background: "#dbeafe", color: "#1d4ed8", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                  {w.company_name[0]}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#111827", fontWeight: 500 }}>{w.company_name}</div>
                  <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 2 }}>{nicheLabel(w.niche)} · {new Date(w.ceo_signed_at).toLocaleDateString()}</div>
                </div>
                <div style={{ color: "#10b981", fontWeight: 600 }}>${Number(w.monthly_usd).toLocaleString()}/mo</div>
              </li>
            ))}
          </ul>
          {showCopyButton ? (
            <button type="button" onClick={copyBullets} style={{ marginTop: 12, padding: "6px 14px", background: "white", color: "#111827", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
              {copied ? "✓ Copied!" : "Copy as bullet list for board email"}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function nicheLabel(slug: string | null): string {
  if (!slug) return "—";
  return slug.split("-").map((s) => s[0]?.toUpperCase() + s.slice(1)).join(" ");
}
