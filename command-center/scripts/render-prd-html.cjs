// One-off: render docs/PRD-product-view.md to a styled HTML file ready for
// browser print-to-PDF.

const fs = require("node:fs");
const path = require("node:path");
const { marked } = require("marked");

const repoRoot = path.resolve(__dirname, "..", "..");
const mdPath = path.join(repoRoot, "docs", "PRD-product-view.md");
const outPath = path.join(repoRoot, "docs", "PRD-product-view.html");

const md = fs.readFileSync(mdPath, "utf8");
const body = marked.parse(md);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>PRD — Product-Manager View in command-center</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: white; color: #111827; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 11.5pt; line-height: 1.55; }
  .page { max-width: 880px; margin: 0 auto; padding: 32px 48px 80px; }
  h1 { font-size: 26pt; margin-top: 28pt; border-bottom: 2px solid #1f2937; padding-bottom: 6pt; }
  h2 { font-size: 18pt; margin-top: 22pt; color: #1d4ed8; border-bottom: 1px solid #e5e7eb; padding-bottom: 4pt; }
  h3 { font-size: 13pt; margin-top: 16pt; color: #0e7490; }
  h4 { font-size: 11.5pt; margin-top: 12pt; color: #475569; }
  p, ul, ol { margin: 8pt 0; }
  ul, ol { padding-left: 20pt; }
  li { margin: 3pt 0; }
  table { border-collapse: collapse; width: 100%; margin: 10pt 0; font-size: 10pt; }
  th, td { border: 1px solid #d1d5db; padding: 5pt 8pt; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; }
  code { background: #f3f4f6; padding: 1pt 4pt; border-radius: 3pt; font-family: "SFMono-Regular", Consolas, monospace; font-size: 9.5pt; }
  pre { background: #0f172a; color: #f1f5f9; padding: 12pt 14pt; border-radius: 6pt; overflow-x: auto; font-size: 9pt; line-height: 1.5; }
  pre code { background: transparent; color: inherit; padding: 0; }
  blockquote { border-left: 4px solid #2563eb; background: #eff6ff; margin: 10pt 0; padding: 8pt 12pt; color: #1e3a8a; }
  a { color: #2563eb; text-decoration: none; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 24pt 0; }
  /* Highlights for the appendices */
  h2:where(:has(+ *)) { page-break-after: avoid; }
  table { page-break-inside: avoid; }
  pre { page-break-inside: avoid; }
  /* Cover banner */
  .cover { background: linear-gradient(135deg, #1d4ed8 0%, #7c3aed 100%); color: white; padding: 36pt 32pt; border-radius: 8pt; margin-bottom: 20pt; }
  .cover h1 { color: white; border: none; margin: 0; font-size: 28pt; }
  .cover .sub { font-size: 11pt; opacity: 0.9; margin-top: 10pt; }
  .cover .meta { font-size: 9pt; opacity: 0.75; margin-top: 16pt; }
  @page { size: Letter; margin: 0.5in; }
  @media print {
    .page { padding: 0; max-width: none; }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="cover">
      <h1>Product-Manager View</h1>
      <div class="sub">Command-center extension for product oversight, audit, and customer journey orchestration</div>
      <div class="meta">CLEO · AUBOS · v5 · ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })} · Prepared for Sanya@aubos.ai</div>
    </div>
    ${body}
  </div>
</body>
</html>`;

fs.writeFileSync(outPath, html);
console.log("wrote", outPath, html.length, "bytes");
