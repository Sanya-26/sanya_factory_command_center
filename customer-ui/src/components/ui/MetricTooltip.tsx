import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MetricTooltipProps {
  text: string;
  size?: number;
}

export function MetricTooltip({ text, size = 12 }: MetricTooltipProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex items-center justify-center cursor-help flex-shrink-0 ml-1"
            onClick={(e) => e.stopPropagation()}
          >
            <HelpCircle className="text-gray-400 hover:text-gray-500 transition-colors" style={{ width: size, height: size }} />
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs z-[9999]"
          style={{
            background: "rgba(255,255,255,0.95)",
            border: "1px solid rgba(0,0,0,0.1)",
            color: "#1a1a1a",
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.5,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
