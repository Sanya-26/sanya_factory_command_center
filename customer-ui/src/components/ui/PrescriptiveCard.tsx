import { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface PrescriptiveCardProps {
  icon: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
  title: string;
  steps: string[];
  status: string;
  statusColor: string;
  path: string;
  hoverBorderColor?: string;
}

/**
 * Reusable prescriptive card component - Single source of truth for "The Roadmap" cards
 */
export function PrescriptiveCard({
  icon: Icon,
  iconColor = "text-blue-400",
  iconBgColor = "bg-blue-500/10",
  title,
  steps,
  status,
  statusColor,
  path,
  hoverBorderColor = "blue-500",
}: PrescriptiveCardProps) {
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
        <span className={cn("text-xs px-2 py-0.5 rounded flex-shrink-0", statusColor)}>
          {status}
        </span>
      </div>
      <ul className="text-xs text-gray-600 leading-relaxed space-y-1">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className={cn("mt-0.5 flex-shrink-0", iconColor)}>•</span>
            <span className="line-clamp-2">{step}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

