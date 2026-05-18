/**
 * DashboardScaler — passthrough wrapper.
 *
 * Previously applied CSS `transform: scale()` to fit content into the
 * split-panel width. That caused subpixel rasterization (every glyph
 * and 1px border was rendered then shrunk by a non-integer fraction),
 * which is what made the dashboard "feel 1280p" on big screens.
 *
 * Now: passes children through with native sizing. The `idealWidth`
 * prop is kept for API compatibility with existing call sites but is
 * no longer used.
 */
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Deprecated — kept for API compat. No longer used. */
  idealWidth?: number;
}

export function DashboardScaler({ children }: Props) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
        textRendering: "optimizeLegibility",
      }}
    >
      {children}
    </div>
  );
}
