import { ReactNode } from "react";

interface AgentDashboardBackgroundProps {
  children?: ReactNode;
}

/**
 * Unified background component for all agent dashboards — clean white
 */
export function AgentDashboardBackground({ children }: AgentDashboardBackgroundProps) {
  return (
    <>
      {/* Clean white background with subtle warm gradient */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: `
            radial-gradient(ellipse at 20% 0%, rgba(99, 102, 241, 0.03) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 100%, rgba(14, 165, 233, 0.02) 0%, transparent 50%),
            #ffffff
          `,
        }}
      />

      {children}
    </>
  );
}
