// One-off: render docs/PRD-ceo-view.md to a styled HTML file ready for
// browser print-to-PDF. Mirrors render-prd-html.cjs (Product PRD).

const fs = require("node:fs");
const path = require("node:path");
const { marked } = require("marked");

const repoRoot = path.resolve(__dirname, "..", "..");
const mdPath = path.join(repoRoot, "docs", "PRD-ceo-view.md");
const outPath = path.join(repoRoot, "docs", "PRD-ceo-view.html");

const md = fs.readFileSync(mdPath, "utf8");
const body = marked.parse(md);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>PRD — CEO View (Ouadie) in command-center</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: white; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 11.5pt; line-height: 1.55; }
  .page { max-width: 880px; margin: 0 auto; padding: 32px 48px 80px; }
  h1 { font-size: 26pt; margin-top: 28pt; border-bottom: 2px solid #0f172a; padding-bottom: 6pt; }
  h2 { font-size: 18pt; margin-top: 22pt; color: #0f172a; border-bottom: 1px solid #e5e7eb; padding-bottom: 4pt; font-family: Georgia, "Times New Roman", serif; font-weight: 400; }
  h3 { font-size: 13pt; margin-top: 16pt; color: #581c87; }
  h4 { font-size: 11.5pt; margin-top: 12pt; color: #475569; }
  p, ul, ol { margin: 8pt 0; }
  ul, ol { padding-left: 20pt; }
  li { margin: 3pt 0; }
  table { border-collapse: collapse; width: 100%; margin: 10pt 0; font-size: 10pt; }
  th, td { border: 1px solid #d1d5db; padding: 5pt 8pt; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-weight: 600; }
  code { background: #f1f5f9; padding: 1pt 4pt; border-radius: 3pt; font-family: "SFMono-Regular", Consolas, monospace; font-size: 9.5pt; }
  pre { background: #0f172a; color: #f1f5f9; padding: 12pt 14pt; border-radius: 6pt; overflow-x: auto; font-size: 9pt; line-height: 1.5; }
  pre code { background: transparent; color: inherit; padding: 0; }
  blockquote { border-left: 4px solid #581c87; background: #faf5ff; margin: 10pt 0; padding: 8pt 12pt; color: #4c1d95; }
  a { color: #1d4ed8; text-decoration: none; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 24pt 0; }
  /* Editorial cover banner (mirrors the Board Snapshot palette) */
  .cover { background: #0f172a; color: white; padding: 48pt 36pt; border-radius: 8pt; margin-bottom: 20pt; position: relative; }
  .cover .tag { font-size: 9pt; letter-spacing: 4pt; text-transform: uppercase; color: #94a3b8; }
  .cover h1 { color: white; border: none; margin: 8pt 0 0; font-size: 36pt; font-family: Georgia, "Times New Roman", serif; font-weight: 400; line-height: 1.05; letter-spacing: -0.5pt; }
  .cover .divider { width: 56pt; height: 2pt; background: #f59e0b; margin: 16pt 0; }
  .cover .sub { font-size: 12pt; color: #e2e8f0; font-style: italic; font-family: Georgia, "Times New Roman", serif; }
  .cover .meta { font-size: 9pt; opacity: 0.75; margin-top: 18pt; letter-spacing: 2pt; text-transform: uppercase; color: #94a3b8; }
  /* Page-break hints */
  table, pre { page-break-inside: avoid; }
  @page { size: Letter; margin: 0.5in; }
  @media print {
    .page { padding: 0; max-width: none; }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="cover">
      <div class="tag">AUBOS · Operating review</div>
      <h1>CEO View.</h1>
      <div class="divider"></div>
      <div class="sub">A command-center dashboard for the things only the CEO can decide — contracts, discounts, runway, strategy.</div>
      <div class="meta">v1 · ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })} · Prepared for Ouadie</div>
    </div>
    ${body}
  </div>
</body>
</html>`;

fs.writeFileSync(outPath, html);
console.log("wrote", outPath, html.length, "bytes");
