// Cloudflare Pages Function — proxies /sdk/* requests from the customer's
// public URL (e.g. drinkgio.aubos.ai/sdk/install) to the droplet's harness
// on port 8000. Without this proxy, Cloudflare Pages serves only the static
// UI bundle and any /sdk/* request returns 405/404 because Pages has no
// matching static route.
//
// The droplet IP is injected at deploy time via the Pages project's
// environment variable AUBOS_DROPLET_IPV4. The factory's cloudflare-deployer
// sets this when binding the project to the tenant's droplet.

interface Env {
  AUBOS_DROPLET_IPV4?: string;
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const droplet = ctx.env.AUBOS_DROPLET_IPV4;
  if (!droplet) {
    return new Response(
      JSON.stringify({ error: "AUBOS_DROPLET_IPV4 not configured for this Pages project" }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }
  const url = new URL(ctx.request.url);
  // Preserve everything after /sdk/ (or /sdk if no trailing segment).
  const targetPath = url.pathname.replace(/^\//, ""); // "sdk/install"
  const target = `http://${droplet}:8000/${targetPath}${url.search}`;
  return proxy(target, ctx.request);
};

async function proxy(target: string, req: Request): Promise<Response> {
  const init: RequestInit = {
    method: req.method,
    headers: stripHopByHop(req.headers),
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
    redirect: "manual",
  };
  try {
    const res = await fetch(target, init);
    const headers = new Headers(res.headers);
    // CORS — Pages site already same-origin, so just allow.
    headers.set("access-control-allow-origin", "*");
    return new Response(res.body, { status: res.status, headers });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `proxy fetch failed: ${(err as Error).message}`, target }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }
}

function stripHopByHop(h: Headers): Headers {
  const out = new Headers();
  const skip = new Set([
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "host",
  ]);
  h.forEach((v, k) => { if (!skip.has(k.toLowerCase())) out.append(k, v); });
  return out;
}
