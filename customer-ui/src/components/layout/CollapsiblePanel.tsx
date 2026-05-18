import { ReactNode, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface CollapsiblePanelProps {
  children: ReactNode;
  position: "left" | "right";
  defaultCollapsed?: boolean;
  collapsedWidth?: number;
  className?: string;
  header?: ReactNode;
  onCollapseChange?: (collapsed: boolean) => void;
}

export function CollapsiblePanel({
  children,
  position,
  defaultCollapsed = false,
  collapsedWidth = 60,
  className = "",
  header,
  onCollapseChange,
}: CollapsiblePanelProps) {
  // Use defaultCollapsed directly as the controlled state from parent
  const isCollapsed = defaultCollapsed;
  const isMobile = useIsMobile();

  const handleToggle = () => {
    const newState = !isCollapsed;
    onCollapseChange?.(newState);
  };

  // On mobile, panels are overlay drawers
  if (isMobile) {
    return (
      <>
        {/* Toggle Button - Always visible outside panel, vertically centered */}
        <button
          onClick={handleToggle}
          className={`fixed ${position === "left" ? "left-2" : "right-2"} top-1/2 -translate-y-1/2 z-[60] bg-white/80 backdrop-blur-sm border border-blue-500/30 rounded-full p-2.5 shadow-lg hover:bg-white/90 hover:border-blue-400/50 hover:scale-110 transition-all group`}
          aria-label={isCollapsed ? `Open ${position} panel` : `Close ${position} panel`}
        >
          {position === "left" ? (
            isCollapsed ? (
              <ChevronRight className="h-4 w-4 text-blue-400 group-hover:text-blue-300 transition-colors" />
            ) : (
              <ChevronLeft className="h-4 w-4 text-blue-400 group-hover:text-blue-300 transition-colors" />
            )
          ) : (
            isCollapsed ? (
              <ChevronLeft className="h-4 w-4 text-blue-400 group-hover:text-blue-300 transition-colors" />
            ) : (
              <ChevronRight className="h-4 w-4 text-blue-400 group-hover:text-blue-300 transition-colors" />
            )
          )}
        </button>

        {/* Mobile Overlay */}
        <AnimatePresence>
          {!isCollapsed && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleToggle}
                className="fixed inset-0 bg-white/60 backdrop-blur-sm z-40"
              />
              {/* Panel */}
              <motion.div
                initial={{ 
                  x: position === "left" ? "-100%" : "100%",
                  opacity: 0 
                }}
                animate={{ 
                  x: 0,
                  opacity: 1 
                }}
                exit={{ 
                  x: position === "left" ? "-100%" : "100%",
                  opacity: 0 
                }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className={`fixed ${position === "left" ? "left-0 border-r" : "right-0 border-l"} top-0 bottom-0 w-[85vw] max-w-[400px] bg-white/95 backdrop-blur-xl border-blue-500/20 y2k-panel z-50 flex flex-col ${className}`}
              >
                {header && (
                  <div className="flex-shrink-0 p-4 border-b border-blue-500/10">
                    {header}
                  </div>
                )}
                <div className="flex-1 overflow-y-auto">
                  {children}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </>
    );
  }

  // Desktop/Tablet: Render as sidebar (takes up space, not overlay)
  return (
    <>
      {/* Toggle Button - Fixed position when collapsed to prevent clipping */}
      {isCollapsed && (
        <button
          onClick={handleToggle}
          className={`fixed ${position === "left" ? "left-2" : "right-2"} top-1/2 -translate-y-1/2 z-[60] bg-white/80 backdrop-blur-sm border border-blue-500/30 rounded-full p-2 shadow-lg hover:bg-white/90 hover:border-blue-400/50 hover:scale-110 transition-all group`}
          aria-label={`Open ${position} panel`}
        >
          {position === "left" ? (
            <ChevronRight className="h-4 w-4 text-blue-400 group-hover:text-blue-300 transition-colors" />
          ) : (
            <ChevronLeft className="h-4 w-4 text-blue-400 group-hover:text-blue-300 transition-colors" />
          )}
        </button>
      )}

      {/* When collapsed, don't render panel (takes 0 space), only show toggle button */}
      {!isCollapsed && (
        <div className="relative flex-shrink-0">
          {/* Sidebar - Takes up space in layout */}
          <motion.div
            initial={false}
            animate={{
              width: 400,
            }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className={`relative h-full ${position === "left" ? "border-r" : "border-l"} border-blue-500/20 bg-white/95 backdrop-blur-xl y2k-panel flex flex-col ${className}`}
            style={{ 
              minWidth: 400,
            }}
          >
          {/* Toggle Button - Positioned on the edge when expanded */}
          <button
            onClick={handleToggle}
            className={`absolute ${position === "left" ? "-right-4" : "-left-4"} top-1/2 -translate-y-1/2 z-[60] bg-white/80 backdrop-blur-sm border border-blue-500/30 rounded-full p-2 shadow-lg hover:bg-white/90 hover:border-blue-400/50 hover:scale-110 transition-all group`}
            aria-label={`Close ${position} panel`}
          >
            {position === "left" ? (
              <ChevronLeft className="h-4 w-4 text-blue-400 group-hover:text-blue-300 transition-colors" />
            ) : (
              <ChevronRight className="h-4 w-4 text-blue-400 group-hover:text-blue-300 transition-colors" />
            )}
          </button>

          {header && (
            <div className="flex-shrink-0 p-4 border-b border-blue-500/10">
              {header}
            </div>
          )}
          <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {children}
          </div>
          </motion.div>
        </div>
      )}
    </>
  );
}

