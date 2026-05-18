// Brand-token injection — overrides white_ui's CSS variables with the
// current customer's brand colors at boot. The dev-agent NEVER hardcodes
// color classes; it uses semantic tokens (bg-primary, text-foreground)
// which read from these CSS variables, which we set here.
//
// Inputs (compile-time, set by factory's emit-customer-config.ts):
//   VITE_BRAND_PRIMARY_COLOR   "#3F6E2A"
//   VITE_BRAND_ACCENT_COLOR    "#E8DCC1"
//   VITE_BRAND_BG_COLOR        "#FAF7F0"
//   VITE_BRAND_TEXT_COLOR      "#1F2A1A"
//   VITE_BRAND_PRODUCT_NAME    "Drink Gio"
//
// white_ui's index.css declares :root { --primary: <H> <S>% <L>%; ... }
// in HSL components (no hsl() wrapper) so Tailwind's `hsl(var(--primary))`
// composes correctly. We convert hex → HSL string and override at runtime.

function hexToHsl(hex: string): string | null {
  if (!hex || typeof hex !== "string") return null;
  const m = hex.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h = h * 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function applyBrandTokens(): void {
  const root = document.documentElement;
  const set = (cssVar: string, hex: string | undefined) => {
    const hsl = hex ? hexToHsl(hex) : null;
    if (hsl) root.style.setProperty(cssVar, hsl);
  };
  set("--primary", import.meta.env.VITE_BRAND_PRIMARY_COLOR);
  set("--accent",  import.meta.env.VITE_BRAND_ACCENT_COLOR);
  set("--background", import.meta.env.VITE_BRAND_BG_COLOR);
  set("--foreground", import.meta.env.VITE_BRAND_TEXT_COLOR);
  set("--secondary", import.meta.env.VITE_BRAND_ACCENT_COLOR);
  // The product/brand name surfaces in page titles + dock greetings.
  const brandName = import.meta.env.VITE_BRAND_PRODUCT_NAME as string | undefined;
  if (brandName && typeof document !== "undefined") {
    const existing = document.title;
    if (!existing || existing === "AUBOS Factory") document.title = brandName;
  }
}
