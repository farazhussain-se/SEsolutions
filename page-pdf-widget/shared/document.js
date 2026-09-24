/*!
 * Shared print-document assembly: turns the widget's captured sections into one
 * printable HTML document. Used by both the Node renderer and the Cloudflare Worker.
 */

export const PRINT_CSS = `
  @page { margin: 14mm 10mm 16mm 10mm; }
  html, body { margin:0; padding:0; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .sb-pdf-stage { width: 1280px; }
  .sb-pdf-section { break-after: page; page-break-after: always; }
  .sb-pdf-section:last-child { break-after: auto; page-break-after: auto; }
  .sb-pdf-section-title { font: 700 15px/1.3 system-ui, sans-serif; color:#6b7280;
    letter-spacing:.06em; text-transform:uppercase; padding:0 0 10px; margin:0 0 18px;
    border-bottom:2px solid #e5e7eb; }
  .sb-pdf-embed-stub { border:1px dashed #c5cbd3; border-radius:10px; padding:18px 20px;
    font:400 13px/1.5 system-ui, sans-serif; color:#6b7280; word-break:break-all; background:#fafbfc; }
  /* nothing should be pinned or clipped on paper */
  .sb-pdf-stage *, .sb-pdf-stage *::before, .sb-pdf-stage *::after {
    animation: none !important; transition: none !important; }
  .sb-pdf-stage [style*="position:fixed"], .sb-pdf-stage [style*="position: fixed"] { position: static !important; }
  .sb-pdf-stage img, .sb-pdf-stage svg { break-inside: avoid; }
  .sb-pdf-stage h1, .sb-pdf-stage h2, .sb-pdf-stage h3 { break-after: avoid; }

  /* Carousels hide most of their content behind a transform. On paper there is
     no swiping, so unfold every slide and print the lot. */
  .sb-pdf-stage .swiper, .sb-pdf-stage [class*="swiper-container"] {
    height: auto !important; max-height: none !important; overflow: visible !important; }
  .sb-pdf-stage .swiper-wrapper {
    display: block !important; transform: none !important; width: auto !important;
    height: auto !important; }
  .sb-pdf-stage .swiper-slide {
    width: 100% !important; max-width: 100% !important; margin: 0 0 18px !important;
    transform: none !important; height: auto !important; }
  .sb-pdf-stage .swiper-slide-duplicate { display: none !important; }
  .sb-pdf-stage .swiper-pagination, .sb-pdf-stage .swiper-button-next,
  .sb-pdf-stage .swiper-button-prev, .sb-pdf-stage [class*="swiper-button"],
  .sb-pdf-stage [class*="carousel-control"], .sb-pdf-stage [class*="autoplay"] {
    display: none !important; }

  /* Anything that scrolls on screen has to grow on paper. */
  .sb-pdf-stage [class*="overflow-x-auto"], .sb-pdf-stage [class*="overflow-x-scroll"],
  .sb-pdf-stage [class*="overflow-y-auto"], .sb-pdf-stage [class*="overflow-y-scroll"],
  .sb-pdf-stage [class*="overflow-auto"], .sb-pdf-stage [class*="overflow-scroll"] {
    overflow: visible !important; max-height: none !important; }

  /* Truncated text is lost text. */
  .sb-pdf-stage [class*="line-clamp"] {
    -webkit-line-clamp: unset !important; display: block !important; overflow: visible !important; }
  .sb-pdf-stage [class*="truncate"] { text-overflow: clip !important; white-space: normal !important;
    overflow: visible !important; }

  /* Keep small self-contained units whole across a page break. */
  .sb-pdf-stage article, .sb-pdf-stage [data-testid*="card"],
  .sb-pdf-stage [data-testid="quick-link"] { break-inside: avoid; }

  /* Sticky / fixed chrome has no meaning in a document. */
  .sb-pdf-stage [class*="sticky"], .sb-pdf-stage [class*="fixed"] { position: static !important; }
`;

export function buildHtml({ title, origin, sections }) {
  /* Every section carries the same ~190 KB Tailwind sheet; emit each distinct
     one once. Keyed on the CSS itself so this needs no crypto — the Worker
     runtime and Node then share exactly the same code path. */
  const seenCss = new Set();
  const head = [];
  for (const s of sections) {
    const css = s.css || "";
    if (seenCss.has(css)) continue;
    seenCss.add(css);
    head.push(`<style>${css}</style>`);
  }
  const body = sections
    .map(
      (s) =>
        `<section class="sb-pdf-section">` +
        (sections.length > 1 && s.title
          ? `<div class="sb-pdf-section-title">${escapeHtml(s.title)}</div>`
          : "") +
        `<div class="sb-pdf-page">${s.html}</div></section>`
    )
    .join("\n");

  return `<!doctype html><html><head><meta charset="utf-8">
<base href="${origin || ""}/">
<title>${escapeHtml(title || "Page")}</title>
${head.join("\n")}
<style>${PRINT_CSS}</style>
</head><body><div class="sb-pdf-stage">${body}</div></body></html>`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

