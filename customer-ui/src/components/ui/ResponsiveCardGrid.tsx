import { ReactNode } from "react";

interface ResponsiveCardGridProps {
  children: ReactNode;
  className?: string;
  minCardWidth?: string;
}

/**
 * Responsive card grid component - Single source of truth for card layouts
 * Automatically adjusts columns based on screen size
 * 
 * Breakpoints:
 * - Mobile (< 640px): 1 column
 * - Tablet (640px - 1024px): 2-3 columns
 * - Desktop (> 1024px): 5 columns (or based on minCardWidth)
 */
export function ResponsiveCardGrid({ 
  children, 
  className = "",
  minCardWidth = "200px"
}: ResponsiveCardGridProps) {
  return (
    <div 
      className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 md:gap-6 ${className}`}
    >
      {children}
    </div>
  );
}

