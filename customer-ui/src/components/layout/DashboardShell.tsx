// DashboardShell.tsx — Alias for DashboardLayout.
//
// frontend-dev agent emitted GIO pages importing `@/components/layout/DashboardShell`
// but that component name does NOT exist in white_ui (the canonical design system).
// The agent should have imported `DashboardLayout`. Tech-lead's wave-1 review
// flagged this exact drift (`brand_coherence: 52` → "frontend-dev emitted
// components don't match architect's component contract").
//
// This file is a stub to let GIO's pages render so we can audit them visually.
// It's NOT a real fix — the dev-agent emit should be corrected upstream + the
// alias removed. Tracked as a wave-N remediation finding.

import type { ReactNode } from "react";
import DashboardLayout from "./DashboardLayout";

interface ShellProps {
  children: ReactNode;
}

// Provide default brand + noop logout so existing GIO page emits that pass
// only { children } don't throw on missing props.
export function DashboardShell({ children }: ShellProps) {
  return (
    <DashboardLayout
      brand={{ id: "preview", name: "GIÓ", product_category: "workspace" }}
      onLogout={() => { /* preview-mode noop */ }}
    >
      {children}
    </DashboardLayout>
  );
}

export default DashboardShell;
