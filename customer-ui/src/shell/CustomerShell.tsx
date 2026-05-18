// CustomerShell — wraps every customer route so the mandatory UI shape is
// enforced everywhere:
//   • per-customer brand theme loaded at first paint (CSS vars from
//     company_intel.brand_colors / brand_fonts)
//   • CleoDock mounted globally, page-context aware
//   • a thin top nav with company logo + Settings + Info links
//
// Routes that opt out (Login / Signup) just don't wrap themselves in this.

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase";
import CleoDock from "@/components/CleoDock";

type BrandTheme = {
  primary_color?: string;
  accent_color?: string;
  bg_color?: string;
  fg_color?: string;
  font_family?: string;
  logo_url?: string;
  company_name?: string;
};

function applyTheme(theme: BrandTheme): void {
  const root = document.documentElement;
  if (theme.primary_color) root.style.setProperty("--brand-primary", theme.primary_color);
  if (theme.accent_color)  root.style.setProperty("--brand-accent",  theme.accent_color);
  if (theme.bg_color)      root.style.setProperty("--brand-bg",      theme.bg_color);
  if (theme.fg_color)      root.style.setProperty("--brand-fg",      theme.fg_color);
  if (theme.font_family)   root.style.setProperty("--brand-font",    theme.font_family);
}

const DEFAULT_THEME: BrandTheme = {
  primary_color: "#0a0a0f",
  accent_color:  "#a8ff60",
  bg_color:      "#0a0a0f",
  fg_color:      "rgba(255,255,255,0.92)",
  font_family:   "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
};

export default function CustomerShell({ children }: { children: React.ReactNode }): JSX.Element {
  const loc = useLocation();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [theme, setTheme] = useState<BrandTheme>(DEFAULT_THEME);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Default theme paints immediately so first frame is never unstyled.
      applyTheme(DEFAULT_THEME);

      const { data: sess } = await supabase.auth.getSession();
      const user = sess.session?.user;
      if (!user) return;
      const { data: companies } = await supabase
        .from("companies")
        .select("id, name, brand_colors")
        .eq("user_id", user.id)
        .limit(1);
      const company = companies?.[0];
      if (!alive || !company) return;
      setCompanyId(company.id);

      const colors = (company.brand_colors ?? {}) as Record<string, string>;
      const t: BrandTheme = {
        ...DEFAULT_THEME,
        primary_color: colors.primary ?? DEFAULT_THEME.primary_color,
        accent_color:  colors.accent  ?? DEFAULT_THEME.accent_color,
        bg_color:      colors.bg      ?? DEFAULT_THEME.bg_color,
        fg_color:      colors.fg      ?? DEFAULT_THEME.fg_color,
        font_family:   colors.font    ?? DEFAULT_THEME.font_family,
        company_name:  company.name ?? undefined,
      };
      setTheme(t);
      applyTheme(t);
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="aubos-shell">
      <header className="aubos-shell-nav">
        <Link to="/" className="aubos-shell-logo">
          {theme.logo_url
            ? <img src={theme.logo_url} alt={theme.company_name ?? "Home"} height={28} />
            : <span>{theme.company_name ?? "AUBOS"}</span>}
        </Link>
        <nav className="aubos-shell-links">
          <Link to="/onboarding" className={loc.pathname === "/onboarding" ? "active" : ""}>Canvas</Link>
          <Link to="/info"       className={loc.pathname === "/info"       ? "active" : ""}>Integrations</Link>
          <Link to="/settings"   className={loc.pathname === "/settings"   ? "active" : ""}>Settings</Link>
        </nav>
      </header>

      <main className="aubos-shell-main">
        {children}
      </main>

      {/* Cleo on every page — page-context aware via location */}
      {companyId && (
        <CleoDock
          companyId={companyId}
          pageContext={{ route: loc.pathname }}
        />
      )}
    </div>
  );
}
