/**
 * AgentDashboardLayout — persistent layout wrapper for all agent dashboards.
 * Renders once and stays mounted when switching between agents (AMY, LEO, JEN, etc.).
 * Only the right-side content (<Outlet />) changes on agent switch.
 */
import React, { createContext, useContext, useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useBrandData } from "@/hooks/useBrandData";
import { DashboardScaler } from "./DashboardScaler";
import { useAmyWorkflowStats, type AmyWorkflowStats } from "@/hooks/useAmyWorkflowStats";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { CanvasPanel } from "@/components/dashboard/CanvasPanel";
import {
  BarChart3, Lightbulb, Image, CalendarPlus, Send, ChevronRight,
  Target, Zap, DollarSign, TrendingUp, Mail, MousePointerClick,
  Search, Globe, Link2, Headphones, Clock, CheckCircle,
  Wallet, Phone, UserPlus, Database, ClipboardList,
  Settings, LogOut, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import cleoAvatar from "@/assets/team/cleo.jpg";
import amyAvatar from "@/assets/agent-amy.webp";
import leoAvatar from "@/assets/agent-leo.webp";
import jenAvatar from "@/assets/agent-jen.webp";
import danAvatar from "@/assets/agent-dan.png";
import joyAvatar from "@/assets/agent-joy.webp";
import bobAvatar from "@/assets/agent-bob.webp";
const leilaAvatar = "/images/Leila.jpg";

const NAV_AGENTS = [
  { id: "main", name: "Cleo", title: "Overview Dashboard", avatar: cleoAvatar, path: "/dashboard" },
  { id: "bob", name: "Bob", title: "Budget", avatar: bobAvatar, path: "/dashboard/finance" },
  { id: "leila", name: "Leila", title: "Operations", avatar: leilaAvatar, path: "/dashboard/operations" },
  { id: "amy", name: "Amy", title: "Organic Social Media", avatar: amyAvatar, path: "/dashboard/amy" },
  { id: "leo", name: "Leo", title: "Paid Ads", avatar: leoAvatar, path: "/dashboard/ads" },
  { id: "jen", name: "Jen", title: "Email Marketing", avatar: jenAvatar, path: "/dashboard/email" },
  { id: "dan", name: "Dan", title: "SEO/AIO/GEO", avatar: danAvatar, path: "/dashboard/seo" },
  { id: "joy", name: "Joy", title: "Communications", avatar: joyAvatar, path: "/dashboard/customer-service" },
];

interface AgentLayoutContextValue {
  setHeaderRight: React.Dispatch<React.SetStateAction<React.ReactNode>>;
}

const AgentLayoutCtx = createContext<AgentLayoutContextValue>({
  setHeaderRight: () => {},
});

export function useAgentLayout() {
  return useContext(AgentLayoutCtx);
}

const PATH_TO_AGENT: Record<string, string> = {
  "/dashboard/amy": "amy",
  "/dashboard/ads": "leo",
  "/dashboard/email": "jen",
  "/dashboard/seo": "dan",
  "/dashboard/customer-service": "joy",
  "/dashboard/finance": "bob",
  "/dashboard/sales": "bob",
  "/dashboard/operations": "leila",
  "/dashboard/vox": "vox",
  "/dashboard/budget": "bob",
  "/dashboard/bookkeeping": "bob",
  "/dashboard/ops": "leila",
  "/dashboard/ops/hr": "leila",
  "/dashboard/ops/payroll": "leila",
};

function fmtWfVal(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 10_000) return Math.round(v / 1_000) + "K";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
  if (!Number.isInteger(v)) return v.toFixed(1);
  return v.toString();
}

const AGENT_WORKFLOWS: Record<string, {
  nodes: Array<{ icon: typeof BarChart3; label: string; defaultVal: number }>;
  nextAgent: { name: string; path: string; action: string } | null;
}> = {
  amy: {
    nodes: [
      { icon: BarChart3, label: "Content Analyzed", defaultVal: 37 },
      { icon: Lightbulb, label: "Strategy Tweaks", defaultVal: 38 },
      { icon: Image, label: "Media Generated", defaultVal: 8 },
      { icon: CalendarPlus, label: "Added to Calendar", defaultVal: 0 },
      { icon: BarChart3, label: "Post Analysis", defaultVal: 365 },
    ],
    nextAgent: { name: "Leo", path: "/dashboard/ads", action: "Send Top Post to Leo" },
  },
  leo: {
    nodes: [
      { icon: Target, label: "Campaigns", defaultVal: 12 },
      { icon: Zap, label: "Ad Sets", defaultVal: 48 },
      { icon: Image, label: "Creatives", defaultVal: 156 },
      { icon: DollarSign, label: "Budget Deployed", defaultVal: 8420 },
      { icon: TrendingUp, label: "Conversions", defaultVal: 342 },
    ],
    nextAgent: { name: "Jen", path: "/dashboard/email", action: "Push Audiences to Jen" },
  },
  jen: {
    nodes: [
      { icon: Mail, label: "Campaigns Sent", defaultVal: 24 },
      { icon: MousePointerClick, label: "Clicks", defaultVal: 3420 },
      { icon: TrendingUp, label: "Open Rate %", defaultVal: 42 },
      { icon: DollarSign, label: "Revenue Attr.", defaultVal: 18600 },
      { icon: BarChart3, label: "Subscribers", defaultVal: 12800 },
    ],
    nextAgent: { name: "Dan", path: "/dashboard/seo", action: "Share Insights with Dan" },
  },
  dan: {
    nodes: [
      { icon: Search, label: "Keywords Tracked", defaultVal: 480 },
      { icon: Globe, label: "Pages Optimized", defaultVal: 67 },
      { icon: Link2, label: "Backlinks", defaultVal: 124 },
      { icon: TrendingUp, label: "Ranking Gains", defaultVal: 38 },
      { icon: BarChart3, label: "Organic Traffic", defaultVal: 24500 },
    ],
    nextAgent: { name: "Joy", path: "/dashboard/customer-service", action: "Route Data to Joy" },
  },
  joy: {
    nodes: [
      { icon: Headphones, label: "Tickets Handled", defaultVal: 892 },
      { icon: Clock, label: "Avg Response", defaultVal: 4 },
      { icon: CheckCircle, label: "Resolved", defaultVal: 847 },
      { icon: TrendingUp, label: "CSAT Score", defaultVal: 4.8 },
      { icon: BarChart3, label: "Satisfaction %", defaultVal: 95 },
    ],
    nextAgent: { name: "Bob", path: "/dashboard/finance", action: "Report Metrics to Bob" },
  },
  leila: {
    nodes: [
      { icon: ClipboardList, label: "Tasks Managed", defaultVal: 156 },
      { icon: Clock, label: "Avg Turnaround", defaultVal: 2 },
      { icon: CheckCircle, label: "Completed", defaultVal: 142 },
      { icon: TrendingUp, label: "Efficiency %", defaultVal: 91 },
      { icon: BarChart3, label: "Active Projects", defaultVal: 18 },
    ],
    nextAgent: { name: "Amy", path: "/dashboard/amy", action: "Brief Amy on Schedule" },
  },
  bob: {
    nodes: [
      { icon: DollarSign, label: "Revenue", defaultVal: 284000 },
      { icon: Wallet, label: "Expenses", defaultVal: 142000 },
      { icon: TrendingUp, label: "Net Profit", defaultVal: 142000 },
      { icon: BarChart3, label: "Margin %", defaultVal: 50 },
      { icon: CheckCircle, label: "Invoices", defaultVal: 234 },
    ],
    nextAgent: { name: "Leila", path: "/dashboard/operations", action: "Sync with Leila" },
  },
  vox: {
    nodes: [
      { icon: Phone, label: "Calls Made", defaultVal: 1240 },
      { icon: UserPlus, label: "Leads Generated", defaultVal: 186 },
      { icon: Database, label: "CRM Updates", defaultVal: 520 },
      { icon: TrendingUp, label: "Conv. Rate %", defaultVal: 15 },
      { icon: BarChart3, label: "Pipeline Value", defaultVal: 94000 },
    ],
    nextAgent: { name: "Cleo", path: "/dashboard", action: "Back to Overview" },
  },
};

function AgentWorkflowStrip({ agentId, amyStats }: { agentId: string; amyStats?: AmyWorkflowStats | null }) {
  const navigate = useNavigate();
  const config = AGENT_WORKFLOWS[agentId];
  if (!config) return null;

  const nodes = config.nodes.map((node, i) => {
    if (agentId === "amy" && amyStats) {
      const amyVals = [amyStats.contentAnalyzed, amyStats.strategyTweaks, amyStats.mediaGenerated, amyStats.addedToCalendar, amyStats.postAnalysesCount];
      return { ...node, val: amyVals[i] ?? node.defaultVal };
    }
    return { ...node, val: node.defaultVal };
  });

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "5px 16px", gap: 0,
      background: "linear-gradient(180deg, rgba(0,212,255,0.04) 0%, transparent 100%)",
      borderBottom: "1px solid rgba(0,212,255,0.1)",
      boxShadow: "0 1px 12px rgba(0,212,255,0.06)",
    }}>
      {nodes.map((node, i) => (
        <React.Fragment key={i}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
            <node.icon size={13} strokeWidth={1.5} style={{ color: "rgba(0,212,255,0.6)", filter: "drop-shadow(0 0 3px rgba(0,212,255,0.4))" }} />
            <span style={{
              fontSize: 15, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
              color: "#ffffff",
              textShadow: "0 0 8px rgba(0,212,255,0.6), 0 0 20px rgba(0,212,255,0.25)",
            }}>{fmtWfVal(node.val)}</span>
            <span style={{
              fontSize: 10, fontWeight: 500, fontFamily: "'Outfit', sans-serif",
              color: "rgba(0,212,255,0.45)", textTransform: "uppercase", letterSpacing: "0.06em",
            }}>{node.label}</span>
          </div>
          <svg width="36" height="10" viewBox="0 0 36 10" style={{
            flexShrink: 0, margin: "0 6px",
            filter: "drop-shadow(0 0 4px rgba(0,212,255,0.5))",
          }}>
            <line x1="2" y1="5" x2="26" y2="5" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.5"
              strokeDasharray="4 3" className="neon-flow-line" />
            <polygon points="26,2 34,5 26,8" fill="#ffffff" fillOpacity="0.6" />
          </svg>
        </React.Fragment>
      ))}

      {config.nextAgent && (
        <div
          onClick={() => navigate(config.nextAgent!.path)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "3px 12px", cursor: "pointer",
            borderRadius: 6,
            border: "1px solid rgba(0,212,255,0.25)",
            background: "rgba(0,212,255,0.06)",
            boxShadow: "0 0 12px rgba(0,212,255,0.15), 0 0 4px rgba(0,212,255,0.1), inset 0 0 8px rgba(0,212,255,0.05)",
            transition: "all 0.25s ease", whiteSpace: "nowrap",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "rgba(0,212,255,0.14)";
            e.currentTarget.style.borderColor = "rgba(0,212,255,0.5)";
            e.currentTarget.style.boxShadow = "0 0 20px rgba(0,212,255,0.3), 0 0 8px rgba(0,212,255,0.2), inset 0 0 12px rgba(0,212,255,0.1)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "rgba(0,212,255,0.06)";
            e.currentTarget.style.borderColor = "rgba(0,212,255,0.25)";
            e.currentTarget.style.boxShadow = "0 0 12px rgba(0,212,255,0.15), 0 0 4px rgba(0,212,255,0.1), inset 0 0 8px rgba(0,212,255,0.05)";
          }}
        >
          <Send size={11} strokeWidth={1.5} style={{ color: "rgba(0,212,255,0.7)", filter: "drop-shadow(0 0 3px rgba(0,212,255,0.5))" }} />
          <span style={{
            fontSize: 11, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
            color: "#ffffff", letterSpacing: "0.04em",
            textShadow: "0 0 6px rgba(0,212,255,0.4)",
          }}>{config.nextAgent.action}</span>
          <ChevronRight size={12} style={{ color: "rgba(0,212,255,0.5)" }} />
        </div>
      )}
    </div>
  );
}

export function AgentDashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { brand } = useBrandData();
  const [headerRight, setHeaderRight] = useState<React.ReactNode>(null);
  const currentAgent = useMemo(() => PATH_TO_AGENT[location.pathname] || "cleo", [location.pathname]);
  const isAmy = currentAgent === "amy";
  const activeIdx = useMemo(() => NAV_AGENTS.findIndex(a => a.path === location.pathname), [location.pathname]);
  const { stats: workflowStats } = useAmyWorkflowStats(isAmy ? brand?.id : undefined);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // ── Collapsible canvas panel ────────────────────────────────
  // canvasPct = percentage of the container the canvas panel takes (0 = collapsed, 50 = default)
  const [canvasPct, setCanvasPct] = useState(50);
  const [canvasCollapsed, setCanvasCollapsed] = useState(false);
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(15, Math.min(70, pct));
      setCanvasPct(clamped);
      setCanvasCollapsed(false);
      // Tell Recharts ResponsiveContainers to re-measure
      window.dispatchEvent(new Event("resize"));
    };
    const onUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Final re-measure after drag settles
      setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const toggleCanvas = useCallback(() => {
    setCanvasCollapsed(prev => !prev);
    // Re-measure charts after the CSS transition completes
    setTimeout(() => window.dispatchEvent(new Event("resize")), 350);
  }, []);

  const effectiveCanvasPct = canvasCollapsed ? 0 : canvasPct;

  // Zoom-based header scaling (matches Cleo HeaderBar)
  const headerContainerRef = useRef<HTMLDivElement>(null);
  const headerInnerRef = useRef<HTMLDivElement>(null);
  const [headerZoom, setHeaderZoom] = useState(1);
  useEffect(() => {
    const container = headerContainerRef.current;
    const inner = headerInnerRef.current;
    if (!container || !inner) return;
    const calc = () => {
      inner.style.zoom = "1";
      inner.style.width = "max-content";
      void inner.offsetWidth;
      const natural = inner.scrollWidth;
      inner.style.width = "";
      const available = container.clientWidth;
      const z = natural > available ? available / natural : 1;
      setHeaderZoom(z);
      inner.style.zoom = String(z);
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(container);
    return () => ro.disconnect();
  }, [currentAgent]);

  return (
    <AgentLayoutCtx.Provider value={{ setHeaderRight }}>
      <div
        className="bg-white flex flex-col"
        style={{
          height: isMobile ? "auto" : "100vh",
          minHeight: isMobile ? "100dvh" : undefined,
          overflow: isMobile ? "auto" : "hidden",
          paddingTop: isMobile ? "58px" : "0px",
          paddingBottom: isMobile ? "60px" : undefined,
        }}
      >

        {/* Fixed header — matches Cleo HeaderBar exactly */}
        {createPortal(
          <div ref={headerContainerRef} className="fixed top-0 right-0 z-[9999] pointer-events-auto"
            style={{ left: 0, background: "rgba(4,4,12,0.88)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div ref={headerInnerRef} className="flex items-center justify-between px-4" style={{
              height: "46px",
              whiteSpace: "nowrap",
              zoom: headerZoom,
            }}>
              <div className="flex items-center gap-2 flex-shrink-0">
                {brand?.BrandLogo && (
                  <img src={brand.BrandLogo} alt={brand.name} className="w-5 h-5 rounded object-cover" style={{ border: "1px solid rgba(60,180,255,0.15)" }} />
                )}
                <h1 style={{
                  fontSize: "11px", fontWeight: 400, letterSpacing: "0.1em", whiteSpace: "nowrap",
                  background: "linear-gradient(135deg, #3cb4ff, #ffffff)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                }}>{brand?.name || "AUBOS"}</h1>
              </div>
              <div className="flex items-center justify-center gap-0 flex-1 mx-4" style={{ whiteSpace: "nowrap" }}>
                {NAV_AGENTS.map((agent, index) => {
                  const isActive = location.pathname === agent.path;
                  const isPast = activeIdx >= 0 && index < activeIdx;
                  return (
                    <React.Fragment key={agent.id}>
                      <motion.button onClick={() => navigate(agent.path)}
                        className="px-1 py-0.5 transition-all duration-300 relative flex items-center gap-1.5"
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 + index * 0.03 }} whileHover={{ scale: 1.05 }}
                        style={{
                          background: isActive ? "rgba(0,212,255,0.08)" : "transparent",
                          border: "none",
                          borderBottom: isActive ? "2px solid #ffffff" : isPast ? "1px solid rgba(0,212,255,0.3)" : "1px solid transparent",
                          paddingBottom: "2px",
                          borderRadius: isActive ? "4px 4px 0 0" : undefined,
                          boxShadow: isActive ? "0 2px 12px rgba(0,212,255,0.25), inset 0 0 8px rgba(0,212,255,0.05)" : "none",
                        }}>
                        {agent.avatar ? (
                          <img src={agent.avatar} alt={agent.name}
                            className="w-5 h-5 rounded-full object-cover flex-shrink-0"
                            style={{
                              border: isActive ? "1.5px solid #ffffff" : isPast ? "1px solid rgba(0,212,255,0.35)" : "1px solid rgba(0,0,0,0.08)",
                              opacity: isActive ? 1 : isPast ? 0.9 : 0.55,
                              boxShadow: isActive ? "0 0 10px rgba(0,212,255,0.5), 0 0 20px rgba(0,212,255,0.2)" : isPast ? "0 0 4px rgba(0,212,255,0.2)" : "none",
                              filter: isActive ? "drop-shadow(0 0 4px rgba(0,212,255,0.5))" : "none",
                            }} />
                        ) : (
                          <div className="w-5 h-5 rounded-full flex-shrink-0"
                            style={{
                              background: isActive ? "rgba(0,212,255,0.15)" : "rgba(0,0,0,0.03)",
                              border: isActive ? "1.5px solid #ffffff" : isPast ? "1px solid rgba(0,212,255,0.35)" : "1px solid rgba(0,0,0,0.08)",
                              boxShadow: isActive ? "0 0 10px rgba(0,212,255,0.5)" : "none",
                            }} />
                        )}
                        <span style={{
                          fontSize: "12px", fontWeight: 600, textTransform: "uppercase", cursor: "pointer",
                          color: isActive ? "#ffffff" : isPast ? "rgba(0,212,255,0.75)" : "#e8f0ff",
                          letterSpacing: "0.10em",
                          textShadow: isActive ? "0 0 10px rgba(0,212,255,0.6)" : "none",
                        }}>
                          {agent.name}
                        </span>
                        <span style={{
                          fontSize: "9px", textTransform: "uppercase", cursor: "pointer",
                          color: isActive ? "rgba(0,212,255,0.6)" : isPast ? "rgba(0,212,255,0.35)" : "rgba(161,161,170,0.5)",
                          letterSpacing: "0.08em",
                        }}>
                          {agent.title}
                        </span>
                      </motion.button>
                      {index < NAV_AGENTS.length - 1 && (
                        <svg width="20" height="10" viewBox="0 0 20 8" style={{
                          flexShrink: 0, margin: "0 1px",
                          filter: (isPast || isActive)
                            ? "drop-shadow(0 0 4px rgba(0,212,255,0.6)) drop-shadow(0 0 8px rgba(0,212,255,0.3))"
                            : "none",
                          opacity: (isPast || isActive) ? 1 : 0.3,
                          transition: "all 0.3s ease",
                        }}>
                          <line x1="0" y1="4" x2="13" y2="4"
                            stroke="#ffffff" strokeWidth="1.5"
                            strokeDasharray={isActive ? "3 2" : undefined}
                            className={isActive ? "neon-flow-line" : undefined}
                          />
                          <polygon points="13,1 20,4 13,7" fill="#ffffff" />
                        </svg>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {headerRight}
                <div style={{ width: 1, height: 16, background: "rgba(0,0,0,0.03)", margin: "0 2px" }} />
                <button onClick={() => navigate(`/brand/${brand?.id}/info`)} className="p-1.5 transition-colors hover:bg-gray-50" style={{ color: "#71717a", borderRadius: "6px" }}>
                  <Settings size={13} strokeWidth={1} />
                </button>
                <button onClick={async () => { await supabase.auth.signOut(); navigate("/"); }} className="p-1.5 transition-colors hover:bg-gray-50" style={{ color: "#71717a", borderRadius: "6px" }}>
                  <LogOut size={13} strokeWidth={1} />
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

        <style>{`
          .neon-flow-line {
            animation: neonFlow 1.5s linear infinite;
          }
          @keyframes neonFlow {
            from { stroke-dashoffset: 7; }
            to { stroke-dashoffset: 0; }
          }
        `}</style>

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

        {/* Main content */}
        <div style={{ position: "relative", background: "linear-gradient(135deg, #eef2ff 0%, #fafbff 35%, #f0f5ff 70%, #e8f0ff 100%)", display: "flex", flexDirection: "column", flex: isMobile ? undefined : 1, overflow: isMobile ? "visible" : "hidden" }}>
          {/* Ambient glow — large colorful blobs for glass to show through */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
            background: "radial-gradient(circle at 20% 15%, rgba(99,102,241,0.18) 0%, transparent 45%), radial-gradient(circle at 80% 30%, rgba(236,72,153,0.12) 0%, transparent 40%), radial-gradient(circle at 50% 80%, rgba(34,197,94,0.12) 0%, transparent 50%), radial-gradient(circle at 85% 85%, rgba(251,146,60,0.10) 0%, transparent 40%)",
          }} />

          {/* Agent workflow strip */}
          <div style={{ position: "relative", zIndex: 5, flexShrink: 0 }}>
            <AgentWorkflowStrip agentId={currentAgent} amyStats={workflowStats} />
          </div>

          {/* Full-screen flat layout (matching main overview) */}
          <div style={{
            position: "relative", zIndex: 1, width: "100%",
            flex: isMobile ? undefined : 1,
            minHeight: isMobile ? undefined : 0,
            display: "flex", alignItems: "flex-start", justifyContent: "center",
          }}>
            <div style={{
              width: "100%",
              height: isMobile ? "auto" : "100%",
              position: "relative",
            }}>
              <div ref={containerRef} style={{
                ...(isMobile ? {
                  position: "relative", width: "100%",
                  display: "flex", flexDirection: "column",
                  backgroundColor: "rgba(5,5,16,0.6)",
                } : {
                  position: "absolute", width: "100%", top: 0, height: "100%",
                  backgroundColor: "rgba(5,5,16,0.6)",
                  border: "1px solid rgba(40,150,255,0.10)",
                  borderRadius: "6px", overflow: "hidden",
                  display: "flex", flexDirection: "row",
                }),
              }}>
                {/* Canvas Panel — top on mobile, left on desktop (collapsible) */}
                <div style={isMobile ? {
                  width: "100%", height: "260px", flexShrink: 0,
                  position: "relative", overflow: "hidden",
                  borderBottom: "1px solid rgba(60,180,255,0.15)",
                } : {
                  width: `${effectiveCanvasPct}%`, height: "100%",
                  position: "relative", overflow: "hidden", flexShrink: 0,
                  transition: isDraggingRef.current ? "none" : "width 0.3s ease",
                }}>
                  {(isMobile || !canvasCollapsed) && (
                    <CanvasPanel
                      companyId={brand?.id || null}
                      dashboardTarget="main"
                      compact
                    />
                  )}
                </div>

                {/* Draggable divider + collapse toggle — desktop only */}
                {!isMobile && (
                  <div
                    style={{
                      width: "12px", height: "100%", flexShrink: 0,
                      display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                      cursor: "col-resize",
                      position: "relative",
                      zIndex: 10,
                    }}
                    onMouseDown={handleDragStart}
                  >
                    {/* Glow line */}
                    <div style={{
                      position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
                      width: "1px", height: "100%",
                      background: "linear-gradient(180deg, transparent 2%, rgba(60,180,255,0.4) 20%, rgba(120,80,255,0.35) 50%, rgba(60,180,255,0.4) 80%, transparent 98%)",
                      boxShadow: "0 0 8px rgba(60,180,255,0.15), 0 0 20px rgba(60,180,255,0.05)",
                    }} />
                    {/* Collapse/expand toggle */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleCanvas(); }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title={canvasCollapsed ? "Show canvas" : "Hide canvas"}
                      style={{
                        position: "relative", zIndex: 11,
                        width: 20, height: 36, borderRadius: 4,
                        background: "rgba(255,255,255,0.9)",
                        border: "1px solid rgba(60,180,255,0.25)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer",
                        color: "rgba(160,210,255,0.7)",
                        transition: "all 0.2s",
                      }}
                    >
                      {canvasCollapsed
                        ? <PanelLeftOpen style={{ width: 12, height: 12 }} />
                        : <PanelLeftClose style={{ width: 12, height: 12 }} />}
                    </button>
                  </div>
                )}

                {/* Dashboard content — Outlet */}
                <div style={isMobile ? {
                  width: "100%", overflow: "auto",
                  minHeight: "400px",
                } : {
                  flex: 1, height: "100%", overflow: "hidden",
                  transition: isDraggingRef.current ? "none" : "flex 0.3s ease",
                }}>
                  <GlassPanel
                    className="p-3"
                    style={isMobile ? {
                      display: "flex", flexDirection: "column",
                      minHeight: "400px",
                      borderRadius: 6,
                    } : {
                      height: "100%", display: "flex", flexDirection: "column", overflow: "hidden",
                      borderRadius: 6,
                    }}
                  >
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={location.pathname}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        style={isMobile ? {
                          flex: 1, position: "relative",
                        } : {
                          flex: 1, minHeight: 0, position: "relative", overflow: "hidden",
                        }}
                      >
                        <div style={isMobile ? {
                          display: "flex", flexDirection: "column",
                        } : {
                          position: "absolute", inset: 0,
                        }}>
                          {isMobile ? (
                            <Outlet />
                          ) : (
                            <DashboardScaler idealWidth={900}>
                              <Outlet />
                            </DashboardScaler>
                          )}
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </GlassPanel>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AgentLayoutCtx.Provider>
  );
}
