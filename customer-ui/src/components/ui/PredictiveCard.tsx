import { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface PredictiveCardProps {
  icon: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
  title: string;
  bestOutcome: string;
  context: string;
  path: string;
  hoverBorderColor?: string;
}

/**
 * Reusable predictive card component - Single source of truth for "Looking Ahead" cards
 */
export function PredictiveCard({
  icon: Icon,
  iconColor = "text-blue-400",
  iconBgColor = "bg-blue-500/10",
  title,
  bestOutcome,
  context,
  path,
  hoverBorderColor = "blue-500",
}: PredictiveCardProps) {
  const navigate = useNavigate();

  const hoverClassMap: Record<string, string> = {
    "blue-500": "hover:border-blue-500/30",
  };

  const metricColorMap: Record<string, string> = {
    "text-blue-400": "text-blue-300",
  };

  return (
    <div
      onClick={() => navigate(path)}
      className={cn(
        "y2k-card cursor-pointer group p-4 transition-all",
        hoverClassMap[hoverBorderColor] || "hover:border-pink-500/30"
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={cn("p-2 rounded-lg flex-shrink-0", iconBgColor)}>
          <Icon className={cn("h-4 w-4", iconColor)} />
        </div>
        <h4 className="font-semibold text-sm text-slate-200 truncate">{title}</h4>
      </div>
      <p className={cn("text-sm font-medium mb-2 line-clamp-2", metricColorMap[iconColor] || "text-gray-600")}>
        {bestOutcome}
      </p>
      <p className="text-xs text-gray-500 line-clamp-2">{context}</p>
    </div>
  );
}

