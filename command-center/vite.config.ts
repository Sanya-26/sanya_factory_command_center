import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Per-client config is injected at build time via the CLIENT_CONFIG_JSON env var.
// The build pipeline (scripts/tenant-providers.ts → buildClientUI) sets this
// before running `pnpm build`. The shape must match `ClientConfig` in
// src/lib/clientConfig.ts. Service-role keys are blocked (see safety check below).

const clientConfigJson = process.env.CLIENT_CONFIG_JSON ?? "";
let clientConfig: unknown = undefined;

if (clientConfigJson) {
  try {
    clientConfig = JSON.parse(clientConfigJson);
  } catch (err) {
    throw new Error(`CLIENT_CONFIG_JSON is not valid JSON: ${(err as Error).message}`);
  }

  // Allowlist check — only these keys are permitted to be baked into the bundle.
  const allowed = new Set(["supabaseUrl", "anonKey", "slug", "branding", "builtAt"]);
  const cfg = clientConfig as Record<string, unknown>;
  const extra = Object.keys(cfg).filter((k) => !allowed.has(k));
  if (extra.length > 0) {
    throw new Error(`CLIENT_CONFIG_JSON has disallowed keys: ${extra.join(", ")}. Allowlist: ${[...allowed].join(", ")}`);
  }

  // Service role keys must never enter the UI bundle. The role claim is in the
  // JWT payload — quick base64-decode check on the anon key.
  const anon = cfg.anonKey;
  if (typeof anon === "string" && anon.includes(".")) {
    try {
      const payload = JSON.parse(Buffer.from(anon.split(".")[1], "base64").toString("utf8"));
      if (payload.role && payload.role !== "anon") {
        throw new Error(`CLIENT_CONFIG_JSON.anonKey has role='${payload.role}', expected 'anon'. Refusing to bake service-role key into UI bundle.`);
      }
    } catch (err) {
      // If we can't decode it, that's also a problem — fail closed.
      if (err instanceof Error && err.message.includes("Refusing to bake")) throw err;
      throw new Error(`CLIENT_CONFIG_JSON.anonKey could not be decoded as a JWT: ${(err as Error).message}`);
    }
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __CLIENT_CONFIG__: clientConfig ? JSON.stringify(clientConfig) : "undefined",
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api/monday': {
        target: 'https://api.monday.com/v2',
        changeOrigin: true,
        rewrite: (path) => '',
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            const token = process.env.VITE_MONDAY_API_KEY ?? '';
            proxyReq.setHeader('Authorization', `Bearer ${token}`);
            proxyReq.setHeader('Content-Type', 'application/json');
          });
        },
      },
    },
  },
});
