// Cloudflare Pages Function — runs for EVERY request to <slug>.aubos.ai
// before any static asset or other function. Enforces the portal password
// (FOUNDATION 5).
//
// Auth model:
//   - The factory bakes AUBOS_PORTAL_PASSWORD_HASH (sha256) into the Pages
//     project's env vars at deploy time (cloudflare-deployer.ts patches
//     deployment_configs.production.env_vars).
//   - When a request arrives WITHOUT a valid `aubos_portal` cookie,
//     this middleware:
//        - If POST /__portal-login → check submitted password, hash it,
//          compare with env. On match, set cookie + 302 to "/".
//        - Otherwise → serve a minimal HTML login form.
//   - When the cookie matches the hash, we forward to next() so the
//     real Pages site renders.
//
// The cookie value IS the hash (so we can verify it without a session
// store). HttpOnly + Secure + SameSite=Strict prevents JS / XSRF leakage.
//
// Skip cases:
//   - /sdk/* and /api/* are proxied to the droplet (have their own auth)
//   - /__portal-login is the login handler itself

interface Env {
  AUBOS_PORTAL_PASSWORD_HASH?: string;
  AUBOS_DROPLET_IPV4?: string;
}

const COOKIE_NAME = "aubos_portal";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

async function sha256(text: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function loginPageHtml(error?: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Portal access</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: var(--bg, #0a0a0f);
        color: var(--fg, #e7e7ea);
        margin: 0; min-height: 100vh;
        display: grid; place-items: center;
      }
      .card {
        width: min(380px, 92vw);
        padding: 32px 28px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 16px;
        backdrop-filter: blur(20px);
      }
      h1 { margin: 0 0 6px; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
      p  { margin: 0 0 22px; font-size: 14px; opacity: 0.65; line-height: 1.5; }
      label { display: block; font-size: 12px; opacity: 0.65; margin-bottom: 6px; }
      input[type=password] {
        width: 100%; box-sizing: border-box;
        padding: 12px 14px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 10px;
        color: inherit; font-size: 15px;
        outline: none;
      }
      input[type=password]:focus { border-color: rgba(255,255,255,0.3); }
      button {
        margin-top: 18px; width: 100%;
        padding: 12px 14px;
        background: rgba(255,255,255,0.9); color: #0a0a0f;
        border: none; border-radius: 10px;
        font-size: 15px; font-weight: 600;
        cursor: pointer;
      }
      button:hover { background: white; }
      .err { color: #ff6b6b; font-size: 13px; margin-top: 12px; }
    </style>
  </head>
  <body>
    <form class="card" method="POST" action="/__portal-login">
      <h1>Portal access</h1>
      <p>This workspace is password-protected. Enter the access key your admin shared with you.</p>
      <label for="pw">Access key</label>
      <input type="password" name="password" id="pw" autocomplete="current-password" required autofocus />
      <button type="submit">Continue</button>
      ${error ? `<div class="err">${error}</div>` : ""}
    </form>
  </body>
</html>`;
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const expected = ctx.env.AUBOS_PORTAL_PASSWORD_HASH;

  // No hash configured → portal is open. (Factory hasn't deployed password
  // protection for this customer yet, or it's intentionally public.)
  if (!expected) return ctx.next();

  // /sdk/* and /api/* are handled by their own Pages Functions which proxy
  // to the droplet. Those endpoints have their own auth (JWT). Skip here.
  if (url.pathname.startsWith("/sdk/") || url.pathname.startsWith("/api/")) {
    return ctx.next();
  }

  // POST /__portal-login → verify password
  if (url.pathname === "/__portal-login" && ctx.request.method === "POST") {
    const form = await ctx.request.formData();
    const submitted = String(form.get("password") ?? "");
    if (!submitted) {
      return new Response(loginPageHtml("Enter the access key."), {
        status: 400, headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    const hash = await sha256(submitted);
    if (hash !== expected) {
      return new Response(loginPageHtml("Incorrect access key."), {
        status: 401, headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    // Match. Set cookie + redirect.
    const cookie = `${COOKIE_NAME}=${hash}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Strict`;
    return new Response(null, {
      status: 302,
      headers: { "location": "/", "set-cookie": cookie },
    });
  }

  // Any other request — check cookie.
  const cookieHeader = ctx.request.headers.get("cookie") ?? "";
  const cookieMatch = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([0-9a-f]+)`));
  if (cookieMatch && cookieMatch[1] === expected) {
    return ctx.next();
  }

  // No valid cookie → serve login page.
  return new Response(loginPageHtml(), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Cache prevents login page from being cached as the real site by CDN
      "cache-control": "no-store, no-cache, must-revalidate",
    },
  });
};
