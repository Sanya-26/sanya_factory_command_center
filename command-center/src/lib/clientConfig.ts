// Per-client config baked into the UI bundle at BUILD TIME.
//
// Filled by `vite.config.ts` from the env var CLIENT_CONFIG_JSON during
// the per-client build pipeline (scripts/tenant-providers.ts → buildClientUI()).
//
// SECURITY BOUNDARY: this type is the allowlist. Anon key is fine to bake into
// the bundle (it's public by design — RLS is what protects data on the client
// side). Service role key must NEVER appear here. CI greps the dist/ for the
// service-role key before publishing.

export interface Branding {
  productName: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  /** Feature flags scoped to this client only. */
  features?: Record<string, boolean>;
}

export interface ClientConfig {
  /** e.g. "https://abc123.supabase.co" — public Supabase URL for this client's project */
  supabaseUrl: string;
  /** Supabase ANON key only. Never service role. */
  anonKey: string;
  /** Stable client identifier (matches tenant-state-store slug). */
  slug: string;
  /** Per-client branding + feature flags. */
  branding: Branding;
  /** ISO timestamp the bundle was built. Useful for cache-busting + diagnostics. */
  builtAt: string;
}

declare const __CLIENT_CONFIG__: ClientConfig | undefined;

/**
 * Read the per-client config baked in at build time.
 *
 * Throws if the bundle was built without CLIENT_CONFIG_JSON — that would mean
 * someone ran `pnpm build` directly instead of going through the per-client
 * build pipeline. Catching it loudly here prevents shipping a bundle that
 * would silently fall back to a shared/dev Supabase project.
 */
export function getClientConfig(): ClientConfig {
  if (typeof __CLIENT_CONFIG__ === "undefined" || !__CLIENT_CONFIG__) {
    throw new Error(
      "CLIENT_CONFIG missing — this UI was not built with per-client config. " +
      "Run via scripts/tenant-providers.ts buildClientUI() with CLIENT_CONFIG_JSON set."
    );
  }
  return __CLIENT_CONFIG__;
}

/**
 * Cheap accessor for the most common case — getting the Supabase URL + anon key
 * to construct a Supabase client. Returns the same shape `@supabase/supabase-js`
 * accepts for `createClient(url, key)`.
 */
export function getSupabaseCredentials(): { url: string; anonKey: string } {
  const cfg = getClientConfig();
  return { url: cfg.supabaseUrl, anonKey: cfg.anonKey };
}
