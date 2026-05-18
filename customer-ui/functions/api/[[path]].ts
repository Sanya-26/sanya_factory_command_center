// Cloudflare Pages Function — proxies /api/* (the customer harness's REST
// API routes) from the customer's public URL to the droplet's harness on
// port 8000. Same pattern as functions/sdk/[[path]].ts.

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
  const targetPath = url.pathname.replace(/^\//, "");
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
