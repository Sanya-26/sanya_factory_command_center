// factorySupabase — the admin-side Supabase client for the factory app.
//
// Resolves credentials in this order:
//   1. Vite env (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY) — dev/local
//   2. Per-client baked config (CLIENT_CONFIG_JSON via clientConfig.ts) — fallback
//
// Service-role keys NEVER live here — the anon key is fine to expose, RLS
// + ops_users is what gates admin features.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function resolveCreds(): { url: string; anonKey: string } | null {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (envUrl && envKey) return { url: envUrl, anonKey: envKey };
  return null;
}

export function getFactorySupabase(): SupabaseClient {
  if (_client) return _client;
  const creds = resolveCreds();
  if (!creds) {
    throw new Error(
      "[factorySupabase] missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — " +
      "set them in apps/command-center/.env",
    );
  }
  _client = createClient(creds.url, creds.anonKey, {
    auth: {
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return _client;
}
