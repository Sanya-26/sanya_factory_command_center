import { useState, useRef, useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, Plus, Zap, Home, SlidersHorizontal, Radio } from "lucide-react";
import { motion } from "framer-motion";

interface Brand {
  id: string;
  name: string;
  product_category: string;
}

interface DashboardHeaderProps {
  brand?: Brand;
  onLogout?: () => void;
  className?: string;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}

// Agent configurations with gradient colors for logos
const agents = [
  { id: "main", name: "Cleo", title: "Overview Dashboard", gradient: "from-cyan-400 to-blue-500", path: "/dashboard" },
  { id: "bob", name: "Bob", title: "Budget", gradient: "from-emerald-400 to-teal-400", path: "/dashboard/finance" },
  { id: "leila", name: "Leila", title: "Operations", gradient: "from-violet-400 to-fuchsia-400", path: "/dashboard/operations" },
  { id: "amy", name: "Amy", title: "Organic Social Media", gradient: "from-blue-400 to-cyan-400", path: "/dashboard/amy" },
  { id: "leo", name: "Leo", title: "Paid Ads", gradient: "from-amber-400 to-orange-400", path: "/dashboard/ads" },
  { id: "jen", name: "Jen", title: "Email Marketing", gradient: "from-violet-400 to-purple-400", path: "/dashboard/email" },
  { id: "dan", name: "Dan", title: "SEO/AIO/GEO", gradient: "from-rose-400 to-pink-400", path: "/dashboard/seo" },
  { id: "joy", name: "Joy", title: "Customer Service", gradient: "from-sky-400 to-indigo-400", path: "/dashboard/customer-service" },
];

export function DashboardHeader({
  brand = { id: "preview", name: "AUBOS", product_category: "workspace" },
  onLogout = () => {},
  className = "",
  title,
  subtitle,
  actions,
}: DashboardHeaderProps) {
  const navigate = useNavigate();
  const headerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  if (title) {
    return (
      <header className={`flex items-start justify-between gap-4 ${className}`}>
        <div>
          <h1 className="text-xl font-semibold text-gray-950">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>
    );
  }

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      // Reset scale to measure natural width
      el.style.transform = "scale(1)";
      el.style.transformOrigin = "left center";
      const contentWidth = el.scrollWidth;
      const containerWidth = el.parentElement?.clientWidth ?? contentWidth;
      const newScale = contentWidth > containerWidth
        ? containerWidth / contentWidth
        : 1;
      setScale(newScale);
      el.style.transform = `scale(${newScale})`;
    });

    observer.observe(el.parentElement!);
    return () => observer.disconnect();
  }, []);

  return (
    <nav className={`flex-shrink-0 relative z-10 ${className}`} style={{ background: "transparent" }}>
      <div className="px-2 sm:px-4 md:px-6 py-2 sm:py-3 overflow-hidden">
        <div
          ref={headerRef}
          className="flex items-center justify-between gap-2 sm:gap-3 w-max min-w-full"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "left center",
          }}
        >
          {/* Left: Brand name */}
          <div className="flex items-center min-w-0 flex-shrink-0">
            <h1 className="text-base sm:text-lg font-display font-bold y2k-gradient-text whitespace-nowrap">
              {brand.name}
            </h1>
          </div>

          {/* Center: Agent Avatars */}
          <div className="flex items-center justify-center gap-3 sm:gap-4 md:gap-6 flex-1">
            {agents.map((agent, index) => (
              <motion.button
                key={agent.id}
                onClick={() => navigate(agent.path)}
                className="relative flex flex-col items-center group"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.03 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                {/* Glow effect on hover */}
                <div className="absolute inset-0 -m-1 rounded-full bg-blue-500/0 group-hover:bg-blue-500/40 blur-md transition-all duration-300" />

                {/* Initial Logo */}
                <div
                  className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden border border-zinc-600/50 group-hover:border-zinc-400 transition-colors bg-gradient-to-br ${agent.gradient} flex items-center justify-center`}
                  style={{
                    boxShadow: "0 0 10px rgba(161, 161, 170, 0.15)",
                  }}
                >
                  <span className="text-[10px] sm:text-xs font-bold text-black/70 select-none">
                    {agent.name.charAt(0)}
                  </span>
                </div>

                <span className="mt-0.5 text-[9px] sm:text-[10px] font-semibold text-gray-700 group-hover:text-gray-900 transition-colors whitespace-nowrap">
                  {agent.name}
                </span>
                <span className="text-[7px] sm:text-[8px] text-blue-400/50 group-hover:text-blue-300/60 transition-colors uppercase whitespace-nowrap" style={{ letterSpacing: "0.06em" }}>
                  {agent.title}
                </span>
              </motion.button>
            ))}
          </div>

          {/* Right: Action buttons */}
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <button
              className="rounded-full p-2 hover:bg-gray-100 transition-colors"
              onClick={() => navigate("/dashboard")}
              title="Home"
            >
              <Home className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-600" />
            </button>
            <button
              className="rounded-full p-2 hover:bg-gray-100 transition-colors"
              onClick={() => navigate("/ai-playground")}
              title="AI Playground"
            >
              <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-600" />
            </button>
            <button
              className="rounded-full p-2 hover:bg-gray-100 transition-colors"
              onClick={() => navigate(`/brand/${brand.id}/agent-directives`)}
              title="Agent Directives"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-600" />
            </button>
            <button
              className="rounded-full p-2 hover:bg-gray-100 transition-colors"
              onClick={() => navigate(`/brand/${brand.id}/tracking`)}
              title="Conversion Tracking"
            >
              <Radio className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-600" />
            </button>
            <button
              className="rounded-full p-2 hover:bg-gray-100 transition-colors"
              onClick={() => navigate(`/brand/${brand.id}/info`)}
              title="Settings"
            >
              <Settings className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-600" />
            </button>
            <button
              className="rounded-full p-2 hover:bg-gray-100 transition-colors"
              onClick={() => navigate("/onboard-company")}
              title="Add Brand"
            >
              <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-600" />
            </button>
            <button
              className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-500 hover:text-blue-400 transition-colors whitespace-nowrap"
              onClick={onLogout}
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
