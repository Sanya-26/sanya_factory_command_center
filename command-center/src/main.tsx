import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { getClientConfig } from "./lib/clientConfig";
import { getFactorySupabase } from "./lib/factorySupabase";

// Per-client config — baked at build time via vite.config.ts (CLIENT_CONFIG_JSON
// env var). Touching it here keeps it from being tree-shaken so we can verify
// the build pipeline actually injected the right values, and the user-facing
// product name lives somewhere reachable from anywhere in the UI.
//
// In dev (no CLIENT_CONFIG_JSON), this throws — that's intentional. The dev
// flow should set CLIENT_CONFIG_JSON to a stub config in .env.local.
try {
  const cfg = getClientConfig();
  document.title = cfg.branding.productName;
  // @ts-expect-error — exposing for debugging only; not a public API.
  window.__AUBOS_CLIENT__ = { slug: cfg.slug, productName: cfg.branding.productName, builtAt: cfg.builtAt };
} catch {
  // Dev mode without baked config — leave defaults in place.
}

// Cross-origin session handoff from the customer-facing login portal.
// The portal sends us:    /#aubos-handoff:<access_token>:<refresh_token>
// We restore the session, scrub the hash, then mount App.
async function consumeAuthHandoff(): Promise<void> {
  const hash = window.location.hash;
  if (!hash.startsWith("#aubos-handoff:")) return;
  const parts = hash.slice("#aubos-handoff:".length).split(":");
  if (parts.length < 2) return;
  const [access_token, refresh_token] = parts;
  if (!access_token || !refresh_token) return;
  try {
    const sb = getFactorySupabase();
    await sb.auth.setSession({ access_token, refresh_token });
  } catch (e) {
    console.warn("[main] handoff failed:", e);
  } finally {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

void consumeAuthHandoff().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});

