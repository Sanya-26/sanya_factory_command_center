# aubos_factory_ui

Two Cloudflare Pages-deployed UIs that share the AUBOS factory Supabase
project (`jzppqxiprjsuvuyulbyj`).

| Subfolder | Domain | Audience |
|---|---|---|
| [`customer-ui/`](./customer-ui) | https://welcome.aubos.ai | Signed-up customers — 3D Cleo onboarding + business-map canvas + voice chat |
| [`command-center/`](./command-center) | https://factoryadmin.aubos.ai | AUBOS team (ops_users) — admin shell with Cleo + AI Factory departments |

## Local dev

Each app is a standalone Vite + React + TypeScript app.

```bash
cd customer-ui && npm install && npm run dev    # → http://localhost:5174
cd command-center && npm install && npm run dev # → http://localhost:5173
```

Both apps need a `.env` (see each app's `.env.example`).

## Deployment

Cloudflare Pages, one project per app, both connected to this repo:

- `aubos-welcome` → builds `customer-ui/` → serves `welcome.aubos.ai`
- `aubos-factory-admin` → builds `command-center/` → serves `factoryadmin.aubos.ai`

Each Pages project sets its own production env vars (Supabase URL, anon key,
cross-app URLs, brand tokens). Dev-only env vars (`VITE_DEV_*`,
`VITE_ENABLE_DEV_BYPASS`) are NEVER set in production — they're for local dev only.

## Shared backend

Both apps point at the same Supabase project, same auth, same DB. Role
gating is handled inside each app:
- Customer-ui boot redirects users without an `ops_users` row to `/onboarding`.
- Command-center boot redirects users WITH an `ops_users` row to `/`, and
  bounces anyone without one to the customer welcome flow.

## Source of truth

Code in `customer-ui/` and `command-center/` is mirrored from
[`DrinkGio/AI_Factory_Aubos`](https://github.com/DrinkGio/AI_Factory_Aubos)
under `apps/`. Any structural edits should flow through that monorepo and
then be copied here. CI in this repo is purely for Pages builds.
