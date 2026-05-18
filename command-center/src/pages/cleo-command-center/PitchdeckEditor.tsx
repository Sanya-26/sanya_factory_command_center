// PitchdeckEditor.tsx — Phase 3P · Ops-side editor for the generated pitchdeck.
//
// Reads pitchdeck_artifacts row by company_id, renders one slide at a time
// with rich-text editing. Ops can edit copy per slide, swap screenshot URLs,
// add notes. Save flushes the slides[] array back to the row.
//
// Two action paths:
//   approve → status='approved'  (ready to send)
//   send    → status='sent', sent_at=now() (records dispatch; actual delivery
//             happens via the customer-portal share link).

import { useCallback, useEffect, useMemo, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";

interface Slide {
  index: number;
  layout: string;
  title: string;
  body_md: string;
  screenshot_url?: string;
  notes?: string;
}

interface PitchdeckRow {
  id: string;
  company_id: string;
  build_run_id: string | null;
  tenant_slug: string | null;
  slides: Slide[];
  screenshots: Array<{ url: string; caption?: string }>;
  slide_count: number;
  html_url: string | null;
  pdf_url: string | null;
  status: "draft" | "ops-review" | "approved" | "sent" | "archived";
  reviewed_at: string | null;
  sent_at: string | null;
  cost_usd: number | null;
  generated_at: string;
  updated_at: string;
}

interface Company {
  id: string;
  name: string;
  brand_colors: { primary?: string; accent?: string } | null;
  brand_intelligence: { logo_url?: string } | null;
}

export function PitchdeckEditor({
  companyId,
  onBack,
}: {
  companyId: string;
  onBack: () => void;
}): JSX.Element {
  const [company, setCompany] = useState<Company | null>(null);
  const [deck, setDeck] = useState<PitchdeckRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [draft, setDraft] = useState<Slide | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const sb = getFactorySupabase();
    const [{ data: c, error: cErr }, { data: d, error: dErr }] = await Promise.all([
      sb
        .from("companies")
        .select("id, name, brand_colors, brand_intelligence")
        .eq("id", companyId)
        .maybeSingle(),
      sb
        .from("pitchdeck_artifacts")
        .select(
          "id, company_id, build_run_id, tenant_slug, slides, screenshots, slide_count, html_url, pdf_url, status, reviewed_at, sent_at, cost_usd, generated_at, updated_at",
        )
        .eq("company_id", companyId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (cErr) setError(cErr.message);
    if (dErr) setError((prev) => prev ?? dErr.message);
    setCompany((c ?? null) as Company | null);
    setDeck((d ?? null) as PitchdeckRow | null);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Push the active slide into the editor draft.
  useEffect(() => {
    if (!deck) {
      setDraft(null);
      return;
    }
    const slide = deck.slides[activeIdx] ?? null;
    setDraft(slide ? { ...slide } : null);
    setDirty(false);
  }, [deck, activeIdx]);

  const saveSlide = async () => {
    if (!deck || !draft || !dirty) return;
    setSaving(true);
    const next = [...deck.slides];
    next[activeIdx] = draft;
    const { error: err } = await getFactorySupabase()
      .from("pitchdeck_artifacts")
      .update({ slides: next, slide_count: next.length, updated_at: new Date().toISOString() })
      .eq("id", deck.id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDeck({ ...deck, slides: next, slide_count: next.length });
    setDirty(false);
  };

  const transition = async (status: PitchdeckRow["status"]) => {
    if (!deck) return;
    const patch: Partial<PitchdeckRow> = { status };
    if (status === "approved") patch.reviewed_at = new Date().toISOString();
    if (status === "sent") patch.sent_at = new Date().toISOString();
    const { error: err } = await getFactorySupabase()
      .from("pitchdeck_artifacts")
      .update(patch)
      .eq("id", deck.id);
    if (err) {
      setError(err.message);
      return;
    }
    setDeck({ ...deck, ...patch } as PitchdeckRow);
  };

  if (loading) return <div className="empty"><strong>Loading pitchdeck…</strong></div>;
  if (error) return <div className="error-box">{error}</div>;
  if (!deck) {
    return (
      <div className="empty">
        <strong>No pitchdeck yet.</strong>
        <p>The pitchdeck-creator agent runs after deploy succeeds. Check back once the build completes.</p>
        <button className="btn-ghost" type="button" onClick={onBack}>← Back</button>
      </div>
    );
  }

  const accent = company?.brand_colors?.accent ?? company?.brand_colors?.primary ?? "#6ef0c8";

  return (
    <div className="shell-content-wide pitchdeck-editor">
      <header className="page-header">
        <div>
          <button className="btn-ghost" type="button" onClick={onBack}>← Back to project</button>
          <h1 className="page-header-title">{company?.name ?? "Pitchdeck"}</h1>
          <p className="page-header-sub">
            {deck.slide_count} slide{deck.slide_count === 1 ? "" : "s"} · status <strong>{deck.status}</strong>
            {deck.cost_usd ? <> · cost ${deck.cost_usd.toFixed(2)}</> : null}
          </p>
        </div>
        <div className="pitchdeck-actions">
          {deck.html_url && (
            <a className="btn-ghost" href={deck.html_url} target="_blank" rel="noreferrer">Open HTML</a>
          )}
          {deck.pdf_url && (
            <a className="btn-ghost" href={deck.pdf_url} target="_blank" rel="noreferrer">Export PDF</a>
          )}
          {deck.status !== "approved" && deck.status !== "sent" && (
            <button className="btn-primary" type="button" onClick={() => void transition("approved")}>
              Approve for send
            </button>
          )}
          {deck.status === "approved" && (
            <button className="btn-primary" type="button" onClick={() => void transition("sent")}>
              Mark as sent
            </button>
          )}
        </div>
      </header>

      <div className="pitchdeck-grid">
        <aside className="pitchdeck-sidebar">
          {deck.slides.map((s, i) => (
            <button
              key={i}
              type="button"
              className={`pitchdeck-slide-tile ${i === activeIdx ? "is-active" : ""}`}
              onClick={() => setActiveIdx(i)}
              style={{ borderColor: i === activeIdx ? accent : undefined }}
            >
              <span className="pitchdeck-slide-num">{i + 1}</span>
              <span className="pitchdeck-slide-title">{s.title || "(untitled)"}</span>
              <small className="pitchdeck-slide-layout">{s.layout}</small>
            </button>
          ))}
        </aside>

        <main className="pitchdeck-editor-pane">
          {draft ? (
            <SlideEditor
              slide={draft}
              accent={accent}
              dirty={dirty}
              saving={saving}
              onChange={(patch) => {
                setDraft((d) => (d ? { ...d, ...patch } : d));
                setDirty(true);
              }}
              onSave={() => void saveSlide()}
            />
          ) : (
            <div className="empty">Select a slide on the left.</div>
          )}
        </main>
      </div>
    </div>
  );
}

function SlideEditor({
  slide,
  accent,
  dirty,
  saving,
  onChange,
  onSave,
}: {
  slide: Slide;
  accent: string;
  dirty: boolean;
  saving: boolean;
  onChange: (patch: Partial<Slide>) => void;
  onSave: () => void;
}): JSX.Element {
  const preview = useMemo(() => slide.body_md, [slide.body_md]);
  return (
    <div className="pitchdeck-slide-editor">
      <div className="slide-edit-toolbar">
        <input
          className="slide-edit-title"
          value={slide.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Slide title"
        />
        <button
          type="button"
          className="btn-primary"
          disabled={!dirty || saving}
          onClick={onSave}
        >
          {saving ? "Saving…" : dirty ? "Save slide" : "Saved"}
        </button>
      </div>

      <textarea
        className="slide-edit-body"
        value={slide.body_md}
        onChange={(e) => onChange({ body_md: e.target.value })}
        placeholder="Markdown body — headings, bullets, quotes…"
        rows={14}
      />

      <div className="slide-edit-row">
        <label>
          Screenshot URL
          <input
            type="url"
            value={slide.screenshot_url ?? ""}
            onChange={(e) => onChange({ screenshot_url: e.target.value })}
            placeholder="https://…"
          />
        </label>
        <label>
          Layout
          <input
            type="text"
            value={slide.layout}
            onChange={(e) => onChange({ layout: e.target.value })}
            placeholder="cover | problem | solution | screenshot | pricing | …"
          />
        </label>
      </div>

      <label className="slide-edit-notes">
        Ops notes (not shown to customer)
        <textarea
          value={slide.notes ?? ""}
          onChange={(e) => onChange({ notes: e.target.value })}
          rows={3}
          placeholder="Why this slide is here, what to verify…"
        />
      </label>

      <div className="slide-edit-preview" style={{ borderColor: accent }}>
        <h4>Preview</h4>
        <div className="slide-edit-preview-card">
          {slide.screenshot_url ? (
            <img src={slide.screenshot_url} alt="" className="slide-edit-preview-image" />
          ) : null}
          <h3>{slide.title || "(untitled)"}</h3>
          <pre className="slide-edit-preview-md">{preview}</pre>
        </div>
      </div>
    </div>
  );
}
