import { ReactNode, useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { DashboardHeader } from "./DashboardHeader";
import { CollapsiblePanel } from "./CollapsiblePanel";

interface Brand {
  id: string;
  name: string;
  product_category: string;
}

interface DashboardLayoutProps {
  brand?: Brand;
  onLogout?: () => void;
  leftPanel?: ReactNode;
  rightPanel?: ReactNode;
  children: ReactNode;
  backgroundImage?: string;
  backgroundVideo?: string;
  backgroundOverlay?: ReactNode;
  leftPanelHeader?: ReactNode;
  rightPanelHeader?: ReactNode;
  leftPanelDefaultCollapsed?: boolean;
  rightPanelDefaultCollapsed?: boolean;
  leftPanelWidth?: string;
  rightPanelWidth?: string;
}

export function DashboardLayout({
  brand = { id: "preview", name: "AUBOS", product_category: "workspace" },
  onLogout = () => {},
  leftPanel,
  rightPanel,
  children,
  backgroundImage,
  backgroundVideo,
  backgroundOverlay,
  leftPanelHeader,
  rightPanelHeader,
  leftPanelDefaultCollapsed,
  rightPanelDefaultCollapsed,
  leftPanelWidth = "30%",
  rightPanelWidth = "300px",
}: DashboardLayoutProps) {
  const isMobile = useIsMobile();
  
  // Initialize state: default to open (false) on desktop, collapsed on mobile
  const [leftCollapsed, setLeftCollapsed] = useState(leftPanelDefaultCollapsed ?? false);
  const [rightCollapsed, setRightCollapsed] = useState(rightPanelDefaultCollapsed ?? false);

  // Update state when mobile status or props change
  useEffect(() => {
    if (isMobile) {
      // Mobile: always collapsed (overlay mode)
      setLeftCollapsed(true);
      setRightCollapsed(true);
    } else {
      // Desktop/tablet: panels open by default unless explicitly set to collapsed
      setLeftCollapsed(leftPanelDefaultCollapsed ?? false);
      setRightCollapsed(rightPanelDefaultCollapsed ?? false);
    }
  }, [isMobile, leftPanelDefaultCollapsed, rightPanelDefaultCollapsed]);

  return (
    <div className="h-screen flex flex-col overflow-hidden relative" style={{ overflowX: 'visible' }}>
      {/* Video Background */}
      {backgroundVideo && (
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-screen pointer-events-none z-0 scale-125"
        >
          <source src={backgroundVideo} type="video/mp4" />
        </video>
      )}
      {/* Image Background (fallback if no video) */}
      {!backgroundVideo && backgroundImage && (
        <div 
          className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none z-0"
          style={{ backgroundImage: `url(${backgroundImage})` }}
        />
      )}
      {backgroundOverlay || (
        <div className="absolute inset-0 bg-white/40 pointer-events-none z-0" />
      )}

      {/* Header */}
      <DashboardHeader brand={brand} onLogout={onLogout} />

      {/* Main Body - Sidebar Layout on Desktop/Tablet, Overlay on Mobile */}
      <div className={`flex-1 flex relative z-10 ${isMobile ? 'overflow-hidden' : 'overflow-x-visible overflow-y-hidden'}`}>
        {/* LEFT PANEL - Chat */}
        {leftPanel && (
          <CollapsiblePanel
            position="left"
            defaultCollapsed={leftCollapsed}
            onCollapseChange={setLeftCollapsed}
            className={isMobile ? "" : "flex-shrink-0"}
            header={leftPanelHeader}
          >
            {leftPanel}
          </CollapsiblePanel>
        )}

        {/* MIDDLE - Main Content (Expands to fill ALL available space) */}
        <div className="flex-1 min-w-0 w-full overflow-y-auto p-4 lg:p-6">
          <div className="w-full max-w-full px-4 lg:px-8 space-y-6">
            {children}
          </div>
        </div>

        {/* RIGHT PANEL - Tasks/Achievements */}
        {rightPanel && (
          <CollapsiblePanel
            position="right"
            defaultCollapsed={rightCollapsed}
            onCollapseChange={setRightCollapsed}
            className={isMobile ? "" : "flex-shrink-0"}
            header={rightPanelHeader}
          >
            {rightPanel}
          </CollapsiblePanel>
        )}
      </div>
    </div>
  );
}

export default DashboardLayout;
