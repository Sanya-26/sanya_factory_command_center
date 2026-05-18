import { GitBranch, PanelsTopLeft } from "lucide-react";

export function CanvasPanel({
  companyId,
  dashboardTarget,
  compact,
}: {
  companyId?: string | null;
  dashboardTarget?: string;
  compact?: boolean;
}) {
  return (
    <div className="h-full w-full bg-white/70 text-gray-950">
      <div className="flex h-full flex-col border-r border-black/10">
        <div className="flex items-center justify-between border-b border-black/10 px-3 py-2">
          <div className="flex items-center gap-2">
            <PanelsTopLeft className="h-4 w-4 text-gray-500" />
            <span className="text-xs font-semibold uppercase tracking-wide">Business canvas</span>
          </div>
          <span className="text-[10px] uppercase tracking-wide text-gray-400">{dashboardTarget ?? "main"}</span>
        </div>
        <div className="relative flex-1 overflow-hidden p-3">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.04)_1px,transparent_1px)] bg-[size:24px_24px]" />
          <div className="relative grid h-full place-items-center">
            <div className="w-full max-w-[280px] rounded-md border border-black/10 bg-white/90 p-3 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                <GitBranch className="h-3.5 w-3.5" />
                Live module map
              </div>
              <p className="text-xs leading-relaxed text-gray-500">
                {compact ? "Compact canvas" : "Canvas"} is ready for company modules, tools, and Cleo workflow nodes.
              </p>
              {companyId ? <p className="mt-2 font-mono text-[10px] text-gray-400">{companyId.slice(0, 8)}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
