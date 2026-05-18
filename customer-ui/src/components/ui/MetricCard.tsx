import { ReactNode } from "react";
import { Activity, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MetricTooltip } from "@/components/ui/MetricTooltip";

interface MetricCardProps {
  icon?: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
  label: string;
  value: string | ReactNode;
  valueColor?: string;
  onClick?: () => void;
  className?: string;
  hoverBorderColor?: string;
  tooltip?: string;
  trend?: string;
  intent?: "positive" | "negative" | "neutral" | string;
}

/**
 * Reusable metric card component - Single source of truth for metric displays
 * Used in "THE SNAPSHOT" section and other metric displays
 */
export function MetricCard({
  icon: Icon = Activity,
  iconColor = "text-blue-400",
  iconBgColor = "bg-blue-500/10",
  label,
  value,
  valueColor = "text-blue-400",
  onClick,
  className = "",
  hoverBorderColor,
  tooltip,
  trend,
  intent,
}: MetricCardProps) {
  const intentColor =
    intent === "positive" ? "text-emerald-500" :
    intent === "negative" ? "text-rose-500" :
    "text-gray-400";

  return (
    <div
      onClick={onClick}
      className={cn(
        "y2k-card p-4",
        onClick && "cursor-pointer group transition-all",
        hoverBorderColor && `hover:border-${hoverBorderColor}/30`,
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-lg", iconBgColor)}>
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider truncate flex items-center">{label}{tooltip && <MetricTooltip text={tooltip} />}</p>
          <p className={cn("text-xl font-bold truncate", valueColor)}>
            {value}
          </p>
          {trend ? <p className={cn("mt-0.5 text-[10px] uppercase tracking-wide", intentColor)}>{trend}</p> : null}
        </div>
      </div>
    </div>
  );
}
