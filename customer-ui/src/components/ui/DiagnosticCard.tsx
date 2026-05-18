import { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface DiagnosticCardProps {
  icon: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
  title: string;
  metric: string;
  metricColor?: string;
  why: string;
  vsCompetitors: string;
  verdict: string;
  isGood: boolean;
  path: string;
  hoverBorderColor?: string;
}

/**
 * Reusable diagnostic card component - Single source of truth for "THE WHY" cards
 * Used in UnifiedSynopsis showPerformanceOnly section
 */
export function DiagnosticCard({
  icon: Icon,
  iconColor = "text-blue-400",
  iconBgColor = "bg-blue-500/10",
  title,
  metric,
  metricColor = "text-blue-300",
  why,
  vsCompetitors,
  verdict,
  isGood,
  path,
  hoverBorderColor = "blue-500",
}: DiagnosticCardProps) {
  const navigate = useNavigate();

  const hoverClassMap: Record<string, string> = {
    "blue-500": "hover:border-blue-500/30",
  };

  return (
    <div
      onClick={() => navigate(path)}
      className={cn(
        "y2k-card cursor-pointer group p-4 transition-all",
        hoverClassMap[hoverBorderColor] || "hover:border-pink-500/30"
      )}
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn("p-2 rounded-lg flex-shrink-0", iconBgColor)}>
            <Icon className={cn("h-4 w-4", iconColor)} />
          </div>
          <h4 className="font-semibold text-sm text-slate-200 truncate">{title}</h4>
        </div>
        <span className={cn(
          "text-xs px-2 py-0.5 rounded flex-shrink-0",
          isGood ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
        )}>
          {verdict}
        </span>
      </div>
      <p className={cn("text-sm font-medium mb-2 truncate", metricColor)}>{metric}</p>
      <p className="text-xs text-gray-500 leading-relaxed mb-2 line-clamp-2">{why}</p>
      <p className="text-xs text-cyan-400/80 leading-relaxed italic line-clamp-2">vs Competitors: {vsCompetitors}</p>
    </div>
  );
}

