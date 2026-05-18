// ====================================================
// CLEAN WHITE DESIGN SYSTEM
// Light theme with refined colors, subtle shadows, depth
// Toned-down Electric Blue / Violet / Emerald / Coral palette
// ====================================================

export const LUXURY_COLORS = {
  bg: "#ffffff",
  nearBlack: "#f9fafb",

  // Card surfaces — clean white with subtle borders
  cardBg: "rgba(255, 255, 255, 0.15)",
  cardBgHover: "rgba(255, 255, 255, 0.22)",
  cardBorder: "rgba(255, 255, 255, 0.8)",
  cardBorderHover: "rgba(255, 255, 255, 0.9)",
  cardShadow: "0 8px 32px rgba(31, 38, 135, 0.08), inset 0 4px 20px rgba(255, 255, 255, 0.3)",
  cardBackdrop: "blur(16px) saturate(180%)",

  // Typography
  primary: "#111827",
  secondary: "#6b7280",
  muted: "#9ca3af",
  dimmed: "#d1d5db",

  // Primary accent: Blue (muted from neon for white bg)
  accent: "#0ea5e9",
  accentEnd: "#06b6d4",
  accentBright: "#38bdf8",
  accentDim: "rgba(14, 165, 233, 0.6)",
  accentSubtle: "rgba(14, 165, 233, 0.1)",
  accentGlow: "rgba(14, 165, 233, 0.08)",
  accentFill: "rgba(14, 165, 233, 0.05)",

  // Secondary: Violet
  violet: "#8b5cf6",
  violetEnd: "#a78bfa",
  violetDim: "rgba(139, 92, 246, 0.6)",
  violetGlow: "rgba(139, 92, 246, 0.08)",

  // Success/positive: Emerald
  success: "#10b981",
  successEnd: "#14b8a6",
  successDim: "rgba(16, 185, 129, 0.6)",
  successGlow: "rgba(16, 185, 129, 0.08)",

  // Warning/negative: Rose
  danger: "#ef4444",
  dangerEnd: "#f97316",
  dangerDim: "rgba(239, 68, 68, 0.6)",
  dangerGlow: "rgba(239, 68, 68, 0.08)",

  warning: "#f59e0b",
  info: "#0ea5e9",

  // Chart grid
  gridLine: "rgba(0, 0, 0, 0.06)",

  // Chart series colors
  chartLine: "#0ea5e9",
  chartAreaTop: "rgba(14, 165, 233, 0.15)",
  chartBar: "rgba(139, 92, 246, 0.7)",
  chartBarHover: "rgba(139, 92, 246, 0.9)",

  // Pie/chart segments
  pieSegments: [
    "#0ea5e9",  // Sky blue
    "#8b5cf6",  // Violet
    "#10b981",  // Emerald
    "#f97316",  // Orange
    "#ec4899",  // Pink
    "#14b8a6",  // Teal
  ],

  // Sentiment colors
  positive: "#10b981",
  positiveGlow: "rgba(16, 185, 129, 0.15)",
  negative: "#ef4444",
  negativeGlow: "rgba(239, 68, 68, 0.15)",
  negativeBright: "#ef4444",
};

// Gradient definitions for CSS usage
export const PREMIUM_GRADIENTS = {
  primary: "linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)",
  secondary: "linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)",
  success: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)",
  danger: "linear-gradient(135deg, #ef4444 0%, #f97316 100%)",
  cardBg: "linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)",
  accentBar: "linear-gradient(90deg, #0ea5e9, #06b6d4)",
  violetBar: "linear-gradient(90deg, #8b5cf6, #a78bfa)",
  successBar: "linear-gradient(90deg, #10b981, #14b8a6)",
  dangerBar: "linear-gradient(90deg, #ef4444, #f97316)",
};

// Platform colors
export const platformColors = {
  tiktok: {
    primary: "#06b6d4",
    dark: "#0891b2",
    gradient: "linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)",
    glow: "rgba(6, 182, 212, 0.08)",
    bg: "rgba(6, 182, 212, 0.05)",
  },
  instagram: {
    primary: "#ec4899",
    gradient: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
    glow: "rgba(236, 72, 153, 0.08)",
    bg: "rgba(236, 72, 153, 0.05)",
  },
  facebook: {
    primary: "#3b82f6",
    gradient: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
    glow: "rgba(59, 130, 246, 0.08)",
    bg: "rgba(59, 130, 246, 0.05)",
  },
};

// Status colors
export const statusColors = {
  success: LUXURY_COLORS.success,
  warning: LUXURY_COLORS.warning,
  danger: LUXURY_COLORS.danger,
  info: LUXURY_COLORS.info,
};

// Priority styling — light theme
export const priorityColors = {
  critical: { bg: "bg-red-50", text: "text-red-600", border: "border-red-200" },
  high: { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200" },
  medium: { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200" },
  low: { bg: "bg-gray-50/50", text: "text-gray-400", border: "border-gray-100" },
};

// Card styles — clean white
export const luxuryCardStyles = `
  relative overflow-hidden
  bg-white
  border border-gray-200
  rounded-2xl
  shadow-[0_1px_3px_rgba(0,0,0,0.06)]
  transition-all duration-300
`;

export const luxuryCardHoverStyles = `
  hover:border-gray-300
  hover:bg-gray-50/50
  hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]
`;

// Typography
export const luxuryTypography = {
  heading: {
    fontWeight: 400,
    letterSpacing: "-0.02em",
    color: LUXURY_COLORS.primary,
  },
  sectionLabel: {
    fontSize: "11px",
    fontWeight: 500,
    letterSpacing: "1.5px",
    textTransform: "uppercase" as const,
    color: "rgba(0, 0, 0, 0.45)",
  },
  body: {
    fontSize: "15px",
    fontWeight: 400,
    letterSpacing: "-0.01em",
    color: LUXURY_COLORS.secondary,
  },
  metricValue: {
    fontSize: "2.5rem",
    fontWeight: 400,
    letterSpacing: "-0.02em",
    color: LUXURY_COLORS.primary,
    fontFeatureSettings: '"tnum"',
  },
  metricLabel: {
    fontSize: "11px",
    fontWeight: 500,
    letterSpacing: "1.5px",
    textTransform: "uppercase" as const,
    color: "rgba(0, 0, 0, 0.45)",
  },
  chartTitle: {
    fontSize: "11px",
    fontWeight: 500,
    letterSpacing: "1.5px",
    textTransform: "uppercase" as const,
    color: "rgba(0, 0, 0, 0.45)",
  },
  axisLabel: {
    fontSize: "10px",
    fill: "rgba(0, 0, 0, 0.4)",
  },
};

// Chart theme for Recharts
export const chartTheme = {
  colors: {
    primary: LUXURY_COLORS.chartLine,
    secondary: LUXURY_COLORS.violet,
    tertiary: LUXURY_COLORS.success,
    quaternary: LUXURY_COLORS.danger,
    grid: LUXURY_COLORS.gridLine,
    axis: "rgba(0, 0, 0, 0.4)",
  },
  gradients: {
    area: {
      start: "rgba(14, 165, 233, 0.2)",
      end: "rgba(14, 165, 233, 0)",
    },
    areaViolet: {
      start: "rgba(139, 92, 246, 0.2)",
      end: "rgba(139, 92, 246, 0)",
    },
    areaSuccess: {
      start: "rgba(16, 185, 129, 0.2)",
      end: "rgba(16, 185, 129, 0)",
    },
    areaDanger: {
      start: "rgba(239, 68, 68, 0.2)",
      end: "rgba(239, 68, 68, 0)",
    },
    bar: {
      start: "#8b5cf6",
      end: "#c4b5fd",
    },
    barCyan: {
      start: "#0ea5e9",
      end: "#7dd3fc",
    },
  },
  tooltip: {
    background: "rgba(255, 255, 255, 0.98)",
    border: "1px solid rgba(0, 0, 0, 0.08)",
    borderRadius: "12px",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.1)",
    backdropFilter: "none",
    padding: "10px 14px",
    fontSize: "11px",
  },
};

// Platform glow effects
export const platformGlow = {
  tiktok: "shadow-[0_0_20px_rgba(6,182,212,0.1)]",
  instagram: "shadow-[0_0_20px_rgba(236,72,153,0.1)]",
  facebook: "shadow-[0_0_20px_rgba(59,130,246,0.1)]",
};

// Recharts color exports
export const rechartsColors = {
  tiktok: "#06b6d4",
  instagram: "#ec4899",
  facebook: "#3b82f6",
  primary: "#0ea5e9",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
};

// Premium tooltip style object for Recharts <Tooltip>
export const PREMIUM_TOOLTIP_STYLE = {
  contentStyle: {
    background: "rgba(255, 255, 255, 0.98)",
    border: "1px solid rgba(0, 0, 0, 0.08)",
    borderRadius: "12px",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.1)",
    backdropFilter: "none",
    padding: "10px 14px",
    fontSize: "11px",
    color: "#111827",
  },
  itemStyle: {
    color: "#6b7280",
    fontSize: "10px",
  },
  labelStyle: {
    color: "#111827",
    fontWeight: 500,
    marginBottom: "4px",
    fontSize: "11px",
  },
  cursor: {
    stroke: "rgba(14, 165, 233, 0.3)",
    strokeWidth: 1,
    strokeDasharray: "4 4",
  },
};

// Recharts axis tick style
export const PREMIUM_AXIS_STYLE = {
  axisLine: false,
  tickLine: false,
  tick: { fill: "rgba(0, 0, 0, 0.4)", fontSize: 10 },
};

// Recharts CartesianGrid style
export const PREMIUM_GRID_STYLE = {
  strokeDasharray: "none",
  stroke: "rgba(0, 0, 0, 0.06)",
  vertical: false,
};
