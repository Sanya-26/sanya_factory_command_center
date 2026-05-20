// Horizontal 12-step stepper across the full lifecycle pipeline.
// Highlights the current stage; flag the synthetic 'sanya-audit' phase.

const STAGES: { slug: string; label: string; group: "phase1" | "phase2" | "phase3" | "live" }[] = [
  { slug: "intake", label: "Intake", group: "phase1" },
  { slug: "council", label: "Council", group: "phase1" },
  { slug: "proposal", label: "Proposal", group: "phase1" },
  { slug: "proposing", label: "Proposed", group: "phase1" },
  { slug: "awaiting-approval", label: "Contract", group: "phase1" },
  { slug: "queued", label: "Queued", group: "phase2" },
  { slug: "planning", label: "Planning", group: "phase2" },
  { slug: "building", label: "Building", group: "phase2" },
  { slug: "deployed", label: "Deployed", group: "phase2" },
  { slug: "sanya-audit", label: "Audit", group: "phase3" },
  { slug: "live", label: "Live", group: "live" },
];

const GROUP_COLOR: Record<string, string> = {
  phase1: "#8b5cf6",
  phase2: "#3b82f6",
  phase3: "#f59e0b",
  live: "#10b981",
};

export function StageStepper({
  currentStage,
}: {
  currentStage: string | null | undefined;
}): JSX.Element {
  const currentIdx = STAGES.findIndex((s) => s.slug === currentStage);
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        overflowX: "auto",
      }}
    >
      <div style={{ color: "#6b7280", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
        Lifecycle
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 0, minWidth: 700 }}>
        {STAGES.map((s, i) => {
          const reached = currentIdx >= 0 && i <= currentIdx;
          const isCurrent = i === currentIdx;
          const color = GROUP_COLOR[s.group];
          return (
            <div key={s.slug} style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 56 }}>
              <div style={{ flex: 1, position: "relative" }}>
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    border: `2px solid ${reached ? color : "#d1d5db"}`,
                    background: reached ? color : "white",
                    boxShadow: isCurrent ? `0 0 0 4px ${color}33` : "none",
                    transition: "all 0.2s",
                    margin: "0 auto",
                  }}
                />
                <div
                  style={{
                    fontSize: 10,
                    textAlign: "center",
                    marginTop: 6,
                    color: isCurrent ? color : reached ? "#374151" : "#9ca3af",
                    fontWeight: isCurrent ? 600 : 400,
                  }}
                >
                  {s.label}
                </div>
              </div>
              {i < STAGES.length - 1 ? (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    background: reached && i < currentIdx ? color : "#e5e7eb",
                    marginBottom: 18,
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
