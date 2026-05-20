// factorySupabase — the admin-side data client for the Factory app.
//
// Picks a backend based on VITE_DATA_BACKEND:
//   • "mock"     → local-only in-memory client (lib/mockSupabase.ts), zero network.
//                  Default in dev unless VITE_DATA_BACKEND=supabase is set.
//   • "supabase" → real Supabase client. Required in prod builds.
//
// Service-role keys NEVER live here — anon key is fine, RLS + ops_users gates admin features.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createMockClient } from "./mockSupabase";

let _client: SupabaseClient | null = null;

function resolveCreds(): { url: string; anonKey: string } | null {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (envUrl && envKey) return { url: envUrl, anonKey: envKey };
  return null;
}

function shouldUseMock(): boolean {
  const explicit = import.meta.env.VITE_DATA_BACKEND as string | undefined;
  if (explicit === "mock") return true;
  if (explicit === "supabase") return false;
  // No explicit setting: in dev, mock unless we have real creds.
  if (import.meta.env.DEV) return !resolveCreds();
  // Prod: always supabase.
  return false;
}

export function isMockBackend(): boolean {
  return shouldUseMock();
}

export function getFactorySupabase(): SupabaseClient {
  if (_client) return _client;
  if (shouldUseMock()) {
    // Cast — mock implements the subset of SupabaseClient used by the app.
    _client = createMockClient() as unknown as SupabaseClient;
    return _client;
  }
  const creds = resolveCreds();
  if (!creds) {
    throw new Error(
      "[factorySupabase] missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — " +
      "set them in apps/command-center/.env or use VITE_DATA_BACKEND=mock",
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

// Lets the UI reset to seeded state when in mock mode.
export { resetMockDB } from "./mockSupabase";
