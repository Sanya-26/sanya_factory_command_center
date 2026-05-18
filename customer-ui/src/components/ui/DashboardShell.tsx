/**
 * DashboardShell — shared wrapper for all agent dashboards.
 * Provides: h-screen layout, #ffffff bg, top bar, GlassPanel, SVG gradient defs.
 * Each agent dashboard fills in: agentName, agentColor, topBarRight, children.
 */
import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPortal } from "react-dom";
import { Loader2, AlertTriangle, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { CanvasPanel } from "@/components/dashboard/CanvasPanel";
import { useEnabledModules } from "@/hooks/useEnabledModules";

// Each nav agent is gated by `id` against the company's enabled_modules
// (mapped via MODULE_ALIASES inside useEnabledModules). Edit a tenant's
// companies.enabled_modules array in Supabase to show/hide nav buttons —
// no code change required.
const NAV_AGENTS = [
  { id: "main",  name: "Cleo",  title: "Overview Dashboard",   path: "/dashboard" },
  { id: "bob",   name: "Bob",   title: "Budget",               path: "/dashboard/finance" },
  { id: "leila", name: "Leila", title: "Operations",           path: "/dashboard/operations" },
  { id: "amy",   name: "Amy",   title: "Organic Social Media", path: "/dashboard/amy" },
  { id: "leo",   name: "Leo",   title: "Paid Ads",             path: "/dashboard/ads" },
  { id: "jen",   name: "Jen",   title: "Email Marketing",      path: "/dashboard/email" },
  { id: "dan",   name: "Dan",   title: "SEO/AIO/GEO",          path: "/dashboard/seo" },
  { id: "joy",   name: "Joy",   title: "Customer Service",     path: "/dashboard/customer-service" },
];

interface DashboardShellProps {
  agentName: string;
  brandName?: string;
  companyId?: string | null;
  agentId?: string;
  loading?: boolean;
  error?: string | null;
  topBarCenter?: React.ReactNode;
  topBarRight?: React.ReactNode;
  children: React.ReactNode;
  onRetry?: () => void;
}

export function DashboardShell({
  agentName,
  brandName,
  companyId,
  agentId,
  loading,
  error,
  topBarCenter,
  topBarRight,
  children,
  onRetry,
}: DashboardShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isModuleEnabled } = useEnabledModules(companyId);
  const visibleNavAgents = NAV_AGENTS.filter(a => isModuleEnabled(a.id));

  if (loading) {
    return (
      <div className="h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        <span className="ml-3 text-gray-400">Loading {agentName.toLowerCase()}...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-white flex flex-col items-center justify-center gap-4">
        <AlertTriangle className="w-8 h-8 text-amber-400" />
        <p className="text-gray-500">{error}</p>
        {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>}
      </div>
    );
  }

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden" style={{ paddingTop: "36px" }}>
      {/* Fixed header — same as main dashboard */}
      {createPortal(
        <div className="fixed top-0 right-0 z-[9999] pointer-events-auto"
          style={{ left: "var(--cleo-panel-width)", background: "rgba(4,4,12,0.88)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
          <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8" style={{ height: "36px", position: "relative" }}>
            <div className="flex items-center gap-2 flex-shrink-0">
              <h1 style={{
                fontSize: "11px", fontWeight: 400, letterSpacing: "0.1em",
                background: "linear-gradient(135deg, #3cb4ff, #ffffff)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              }}>{brandName || "AUBOS"}</h1>
            </div>
            <div className="hidden lg:flex items-center justify-center gap-3" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap" }}>
              {visibleNavAgents.map((agent, index) => (
                <motion.button key={agent.id} onClick={() => navigate(agent.path)}
                  className="px-1.5 py-0.5 transition-all duration-300 relative flex items-center gap-1"
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + index * 0.03 }} whileHover={{ scale: 1.05 }}
                  style={{
                    background: "transparent", border: "none",
                    borderBottom: location.pathname === agent.path ? "1px solid #3cb4ff" : "1px solid transparent",
                    paddingBottom: "2px",
                  }}>
                  <span style={{ fontSize: "9px", fontWeight: 600, textTransform: "uppercase", cursor: "pointer",
                    color: location.pathname === agent.path ? "#3cb4ff" : "#e8f0ff", letterSpacing: "0.10em" }}>
                    {agent.name}
                  </span>
                  <span style={{ fontSize: "7px", textTransform: "uppercase", cursor: "pointer",
                    color: location.pathname === agent.path ? "rgba(60,180,255,0.6)" : "rgba(161,161,170,0.5)", letterSpacing: "0.08em" }}>
                    {agent.title}
                  </span>
                </motion.button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {topBarRight}
            </div>
          </div>
          <div className="flex lg:hidden overflow-x-auto justify-center gap-3 px-3 pb-1" style={{ scrollbarWidth: "none" }}>
            {visibleNavAgents.map((agent) => (
              <button key={agent.id} onClick={() => navigate(agent.path)} className="py-0.5 flex-shrink-0 flex items-center gap-1" style={{ background: "transparent", border: "none" }}>
                <span style={{ fontSize: "8px", fontWeight: 600, textTransform: "uppercase", color: "#e8f0ff", letterSpacing: "0.10em" }}>{agent.name}</span>
                <span style={{ fontSize: "7px", textTransform: "uppercase", color: "rgba(161,161,170,0.5)", letterSpacing: "0.08em" }}>{agent.title}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}

      {/* SVG gradient defs (shared across all dashboards) */}
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="gradPositive" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#f3f4f6" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#4ade80" stopOpacity={0.85} />
          </linearGradient>
          <linearGradient id="gradNegative" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#7f1d1d" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.8} />
          </linearGradient>
          <linearGradient id="gradNeutral" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#27272a" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#71717a" stopOpacity={0.7} />
          </linearGradient>
          <linearGradient id="gradSky" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#0c4a6e" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.6} />
          </linearGradient>
          <linearGradient id="gradAmber" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#78350f" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.75} />
          </linearGradient>
          <linearGradient id="gradIndigo" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#312e81" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#818cf8" stopOpacity={0.6} />
          </linearGradient>
          <linearGradient id="gradFollower" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.25} />
            <stop offset="60%" stopColor="#0c4a6e" stopOpacity={0.08} />
            <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradEngLine" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#f3f4f6" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#86efac" stopOpacity={0.9} />
          </linearGradient>
          <linearGradient id="gradViewsBar" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#0c4a6e" stopOpacity={0.12} />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.2} />
          </linearGradient>
          <linearGradient id="gradPipeline" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#312e81" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.35} />
          </linearGradient>
          <linearGradient id="gradViolet" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#4c1d95" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.6} />
          </linearGradient>
          <linearGradient id="gradRose" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#881337" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#fb7185" stopOpacity={0.6} />
          </linearGradient>
        </defs>
      </svg>

      {/* Main content — full-screen flat layout (matching main overview) */}
      <div className="flex-1 overflow-hidden" style={{ position: "relative", background: "#ffffff" }}>
        {/* Ambient glow */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
          background: "radial-gradient(ellipse at 50% 10%, rgba(60,140,255,0.08) 0%, transparent 40%), radial-gradient(ellipse at 30% 60%, rgba(100,50,200,0.04) 0%, transparent 30%), radial-gradient(ellipse at 70% 60%, rgba(0,200,180,0.04) 0%, transparent 30%)",
        }} />

        <div style={{
          position: "relative", zIndex: 1, width: "100%", height: "100%",
          display: "flex", alignItems: "flex-start", justifyContent: "center",
        }}>
          <div style={{
            width: "100%", height: "100%",
            position: "relative",
          }}>
            <div style={{
              position: "absolute", width: "100%", height: "100%",
              backgroundColor: "rgba(5,5,16,0.6)",
              border: "1px solid rgba(40,150,255,0.10)",
              borderRadius: "6px", overflow: "hidden",
              display: "flex", flexDirection: "row",
            }}>
              {/* Left half — Canvas Panel */}
              <div style={{ width: "50%", height: "100%", position: "relative", overflow: "hidden", flexShrink: 0 }}>
                <CanvasPanel
                  companyId={companyId || null}
                  dashboardTarget={agentId || agentName.toLowerCase()}
                  compact
                />
              </div>

              {/* Vertical divider */}
              <div style={{
                width: "1px", height: "100%", flexShrink: 0,
                background: "linear-gradient(180deg, transparent 2%, rgba(60,180,255,0.4) 20%, rgba(120,80,255,0.35) 50%, rgba(60,180,255,0.4) 80%, transparent 98%)",
                boxShadow: "0 0 8px rgba(60,180,255,0.15), 0 0 20px rgba(60,180,255,0.05)",
              }} />

              {/* Right half — dashboard widgets */}
              <div style={{ width: "50%", height: "100%", overflow: "hidden", padding: "4px" }}>
                <GlassPanel className="h-full p-3" style={{ display: "flex", flexDirection: "column", gap: 8, overflow: "hidden" }}>
                  {children}
                </GlassPanel>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
