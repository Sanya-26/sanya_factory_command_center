// Intel — full deep-scrape output for a single customer.
// Now surfaces tech-stack fingerprint + sales channels + product-level
// price/variants/claims, in addition to the original people/SEO/voice fields.

import type { CustomerDetailContext } from "../CustomerDetailLayout";

export function IntelPage({ ctx }: { ctx: CustomerDetailContext }): JSX.Element {
  const intel = ctx.intel;
  if (!intel) {
    return (
      <div className="cd-page">
        <div className="page-header">
          <h1 className="page-title">Scrape · Intel</h1>
          <p className="page-subtitle">No scrape has run for this customer yet.</p>
        </div>
      </div>
    );
  }

  const stack = (intel.tech_stack ?? {}) as Record<string, any>;
  const channels = (intel.sales_channels ?? []) as Array<{ channel: string; url: string; detected_via: string }>;
  const products = (intel.products ?? []) as Array<any>;
  const services = (intel.services ?? []) as Array<any>;
  const team = (intel.team ?? []) as Array<any>;

  return (
    <div className="cd-page cd-intel">
      <div className="page-header">
        <h1 className="page-title">Scrape · Intel</h1>
        <p className="page-subtitle">
          Auto-extracted from {ctx.company?.home_website ?? "the customer's site"}.
          Tech stack and channels are deterministic; products + people + voice
          come from a structured Anthropic extraction.
        </p>
      </div>

      <Field label="Status">
        <span className={`pill ${intel.scrape_status === "done" ? "done" : intel.scrape_status === "failed" ? "failed" : "running"}`}>
          <span className="pill-dot" />{intel.scrape_status}
        </span>
        <span className="dim" style={{ marginLeft: 8 }}>· {intel.pages_crawled ?? 0} pages crawled</span>
        {intel.scrape_error ? <div style={{ marginTop: 8, padding: 8, background: "var(--red-soft)", border: "1px solid var(--red-line)", borderRadius: 6, color: "var(--red)", fontSize: "0.78rem" }}>{intel.scrape_error}</div> : null}
      </Field>

      <Field label="Summary">
        {intel.summary ? <p>{intel.summary}</p> : <span className="dim">—</span>}
      </Field>

      {/* Tech stack */}
      <Field label="Tech stack">
        {Object.keys(stack).length === 0 ? <span className="dim">not detected</span> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            <Mini label="Ecommerce" value={stack.ecommerce_platform ?? "unknown"} accent={stack.ecommerce_platform === "shopify" ? "blue" : undefined} />
            <Mini label="CMS" value={stack.cms ?? "unknown"} />
            <Mini label="Frontend" value={stack.frontend_framework ?? "unknown"} />
            <Mini label="Cart" value={stack.cart_present ? "present" : "—"} />
          </div>
        )}
        {(stack.payments_detected ?? []).length > 0 ? (
          <SubField label="Payments">
            <Pills items={stack.payments_detected as string[]} variant="muted" />
          </SubField>
        ) : null}
        {(stack.subscription_tools ?? []).length > 0 ? (
          <SubField label="Subscriptions">
            <Pills items={stack.subscription_tools as string[]} variant="warn" />
          </SubField>
        ) : null}
        {(stack.analytics ?? []).length > 0 ? (
          <SubField label="Analytics">
            <Pills items={stack.analytics as string[]} variant="muted" />
          </SubField>
        ) : null}
      </Field>

      {/* Sales channels */}
      <Field label={`Sales channels (${channels.length})`}>
        {channels.length === 0 ? <span className="dim">no external channels detected — selling only on their own site</span> : (
          <table className="table" style={{ marginTop: 4 }}>
            <thead>
              <tr><th>Channel</th><th>URL</th><th>Detected via</th></tr>
            </thead>
            <tbody>
              {channels.map((c, i) => (
                <tr key={i}>
                  <td><span className={`pill ${channelPillClass(c.channel)}`}><span className="pill-dot" />{c.channel}</span></td>
                  <td>
                    <a href={c.url} target="_blank" rel="noreferrer noopener" style={{ color: "var(--blue)" }}>
                      {c.url.length > 60 ? c.url.slice(0, 60) + "…" : c.url}
                    </a>
                  </td>
                  <td className="dim">{c.detected_via}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Field>

      {/* Products with full detail */}
      <Field label={`Products (${products.length})`}>
        {products.length === 0 ? <span className="dim">—</span> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {products.map((p, i) => (
              <article key={i} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                  <strong>{p.name}</strong>
                  {typeof p.price_usd === "number" ? <span className="pill done"><span className="pill-dot" />${p.price_usd}</span> : null}
                </div>
                {p.description ? <p style={{ margin: "0 0 10px", fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5 }}>{p.description}</p> : null}
                {(p.variants ?? []).length > 0 ? (
                  <SubField label="Variants"><Pills items={p.variants} variant="muted" /></SubField>
                ) : null}
                {(p.claims ?? []).length > 0 ? (
                  <SubField label="Claims"><Pills items={p.claims} variant="done" /></SubField>
                ) : null}
                {(p.ingredients ?? []).length > 0 ? (
                  <SubField label="Ingredients">
                    <span className="dim mono" style={{ fontSize: "0.74rem" }}>{(p.ingredients as string[]).join(", ")}</span>
                  </SubField>
                ) : null}
                {p.sku || p.page_url ? (
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border)", fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    {p.sku ? <span className="mono">SKU {p.sku}</span> : null}
                    {p.sku && p.page_url ? " · " : null}
                    {p.page_url ? (
                      <a href={p.page_url} target="_blank" rel="noreferrer noopener" style={{ color: "var(--blue)" }}>view page →</a>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </Field>

      {services.length > 0 ? (
        <Field label={`Services (${services.length})`}>
          <ul className="detail-list">
            {services.map((s, i) => (
              <li key={i}>
                <strong>{s.name}</strong>
                {s.pricing ? <span className="dim"> · {s.pricing}</span> : null}
                {s.description ? <div className="dim" style={{ fontSize: "0.78rem" }}>{s.description}</div> : null}
              </li>
            ))}
          </ul>
        </Field>
      ) : null}

      {team.length > 0 ? (
        <Field label={`Team (${team.length})`}>
          <ul className="detail-list">
            {team.map((m, i) => (
              <li key={i}>
                <strong>{m.name}</strong>
                {m.role ? <span className="dim"> · {m.role}</span> : null}
                {m.bio ? <div className="dim" style={{ fontSize: "0.78rem" }}>{m.bio}</div> : null}
              </li>
            ))}
          </ul>
        </Field>
      ) : null}

      <Field label="Social links">
        {(intel.social_links ?? []).length === 0 ? <span className="dim">—</span> : (
          <ul className="detail-list">
            {(intel.social_links as string[]).map((u) => (
              <li key={u}><a href={u} target="_blank" rel="noreferrer noopener">{u}</a></li>
            ))}
          </ul>
        )}
      </Field>

      <Field label="SEO signals"><pre>{JSON.stringify(intel.seo_signals, null, 2)}</pre></Field>
      <Field label="Sales signals"><pre>{JSON.stringify(intel.sales_signals, null, 2)}</pre></Field>
      <Field label="Brand voice"><pre>{JSON.stringify(intel.brand_voice, null, 2)}</pre></Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="detail-field">
      <div className="detail-field-label">{label}</div>
      <div className="detail-field-value">{children}</div>
    </div>
  );
}
function SubField({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
function Mini({ label, value, accent }: { label: string; value: string; accent?: "blue" | "green" }): JSX.Element {
  return (
    <div>
      <div style={{ fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: "0.95rem", fontWeight: 500, color: accent === "blue" ? "var(--blue)" : "var(--text)", marginTop: 2 }}>{value}</div>
    </div>
  );
}
function Pills({ items, variant }: { items: string[]; variant: "muted" | "done" | "warn" | "running" | "failed" }): JSX.Element {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {items.map((t) => <span key={t} className={`pill ${variant}`}><span className="pill-dot" />{t}</span>)}
    </div>
  );
}
function channelPillClass(channel: string): string {
  if (channel === "amazon" || channel === "walmart" || channel === "target") return "warn";
  if (channel === "tiktok-shop" || channel === "instagram-shop" || channel === "tiktok") return "running";
  if (channel === "shopify-storefront" || channel === "own-storefront") return "done";
  return "muted";
}
