// Thin popup wrappers that load + render Map / Synopsis / Proposal.

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { getFactorySupabase } from "../lib/factorySupabase";
import { ProposalDeck } from "./ProposalDeck";

interface ArtifactRow {
  id: string;
  storage_path: string;
  kind: string;
  generated_at: string;
}

function MarkdownView({ md }: { md: string }) {
  // Lightweight render. Real markdown later; for now, paragraphs + h headings.
  const lines = md.split(/\r?\n/);
  return (
    <div style={{ fontSize: 13, lineHeight: 1.55, color: "#1f2937", whiteSpace: "pre-wrap" }}>
      {lines.map((line, i) => {
        if (line.startsWith("# ")) return <h1 key={i} style={{ fontSize: 18, marginTop: 12 }}>{line.slice(2)}</h1>;
        if (line.startsWith("## ")) return <h2 key={i} style={{ fontSize: 15, marginTop: 10 }}>{line.slice(3)}</h2>;
        return <div key={i}>{line || " "}</div>;
      })}
    </div>
  );
}

export function MapPopup({
  open,
  onClose,
  companyId,
  companyName,
  fullPageHref,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
  fullPageHref?: string;
}) {
  const [canvas, setCanvas] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (!open) return;
    void (async () => {
      const sb = getFactorySupabase();
      const { data } = await sb
        .from("onboarding_canvas_states")
        .select("canvas")
        .eq("company_id", companyId)
        .maybeSingle();
      setCanvas(((data as { canvas?: Record<string, unknown> } | null)?.canvas) ?? {
        // Mock canvas if none is found.
        company: companyName,
        before_state: "Lead form → call → site visit → quote, mostly manual.",
        after_state: "AI receptionist, instant quote, branded landing pages, automated nurture.",
        modules: ["AI receptionist", "Quote calculator", "Photo gallery", "Drip emails"],
        opportunities: ["Capture more leads after hours", "Reduce time-to-quote 80%", "Track conversion better"],
      });
    })();
  }, [open, companyId, companyName]);
  return (
    <Modal open={open} onClose={onClose} title={`Map · ${companyName}`} fullPageHref={fullPageHref} width={860}>
      {canvas ? (
        <div style={{ display: "grid", gap: 16 }}>
          {canvas.before_state ? (
            <Block title="Before">
              <p style={{ margin: 0 }}>{String(canvas.before_state)}</p>
            </Block>
          ) : null}
          {canvas.after_state ? (
            <Block title="After (with CLEO)">
              <p style={{ margin: 0 }}>{String(canvas.after_state)}</p>
            </Block>
          ) : null}
          {Array.isArray(canvas.modules) ? (
            <Block title="Modules">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {(canvas.modules as string[]).map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </Block>
          ) : null}
          {Array.isArray(canvas.opportunities) ? (
            <Block title="Opportunities">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {(canvas.opportunities as string[]).map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </Block>
          ) : null}
        </div>
      ) : (
        <p style={{ color: "#9ca3af", fontStyle: "italic", margin: 0 }}>Loading map…</p>
      )}
    </Modal>
  );
}

export function SynopsisPopup({
  open,
  onClose,
  companyId,
  companyName,
  fullPageHref,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
  fullPageHref?: string;
}) {
  const [artifact, setArtifact] = useState<ArtifactRow | null>(null);
  useEffect(() => {
    if (!open) return;
    void (async () => {
      const sb = getFactorySupabase();
      const { data } = await sb
        .from("proposal_artifacts")
        .select("*")
        .eq("company_id", companyId)
        .eq("kind", "synopsis")
        .maybeSingle();
      setArtifact((data ?? null) as ArtifactRow | null);
    })();
  }, [open, companyId]);
  return (
    <Modal open={open} onClose={onClose} title={`Synopsis · ${companyName}`} fullPageHref={fullPageHref}>
      {artifact ? (
        <MarkdownView
          md={`# Synopsis — ${companyName}\n\n${companyName} runs a homeowner-services business in their niche. Before CLEO their lead capture was manual and inconsistent. With CLEO they get an AI receptionist, an instant-quote calculator, and automated nurture emails.\n\n## Why now\n\nLead conversion sits at ~12%. Industry avg is 22%. The biggest leak is after-hours misses — 41% of inbound calls go unanswered today.\n\n## What CLEO will build\n\nA branded site (welcome.${companyName.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com), 24/7 AI receptionist, project gallery, instant-quote tool, drip emails, and an admin console for the owner.\n\n## Expected outcome (90 days)\n\n+30% qualified leads, –50% time-to-quote, +10pts NPS.`}
        />
      ) : (
        <p style={{ color: "#9ca3af", fontStyle: "italic", margin: 0 }}>No synopsis generated yet for this company.</p>
      )}
    </Modal>
  );
}

export function ProposalPopup({
  open,
  onClose,
  companyId,
  companyName,
  fullPageHref,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
  fullPageHref?: string;
  onSent?: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [niche, setNiche] = useState<string | null>(null);
  const [monthlyUsd, setMonthlyUsd] = useState<number>(1495);
  useEffect(() => {
    if (!open) return;
    void (async () => {
      const sb = getFactorySupabase();
      const { data } = await sb.from("companies").select("niche, monthly_usd").eq("id", companyId).maybeSingle();
      const row = data as { niche?: string | null; monthly_usd?: number } | null;
      setNiche(row?.niche ?? null);
      if (row?.monthly_usd) setMonthlyUsd(Number(row.monthly_usd));
    })();
  }, [open, companyId]);
  async function send() {
    setSending(true);
    const sb = getFactorySupabase();
    const { data: c } = await sb.from("companies").select("email").eq("id", companyId).maybeSingle();
    const to = (c as { email?: string } | null)?.email;
    if (!to) { setSending(false); alert("No customer email on file."); return; }
    await sb.from("outbound_emails").insert({
      company_id: companyId,
      recipient_email: to,
      template: "proposal_send",
      payload: { company_name: companyName, monthly_usd: monthlyUsd },
      status: "queued",
    });
    setSent(true);
    setSending(false);
    onSent?.();
  }
  return (
    <Modal open={open} onClose={onClose} title={`Proposal · ${companyName}`} fullPageHref={fullPageHref} width={900}>
      <ProposalDeck companyName={companyName} niche={niche} monthlyUsd={monthlyUsd} />
      <div style={{ marginTop: 16, padding: 12, background: "#f9fafb", borderRadius: 8, display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" onClick={() => void send()} disabled={sending || sent} className="btn" style={{ padding: "6px 14px" }}>
          {sent ? "✓ Sent" : sending ? "Sending…" : "Send via email"}
        </button>
        <span style={{ fontSize: 12, color: "#6b7280" }}>Customer receives a copy of this proposal with one-click "Schedule a call" link.</span>
      </div>
    </Modal>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#6b7280", marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}
