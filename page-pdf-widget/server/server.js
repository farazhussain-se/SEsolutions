/*!
 * Staffbase "Download as PDF" — rendering backend.
 *
 *   GET  /fh.page-pdf.js      the custom-widget bundle (install this URL in Studio)
 *   GET  /api/tree            which pages belong to an export
 *   POST /api/pdf             captured DOM in, PDF out
 */
import express from "express";
import puppeteer from "puppeteer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ---------- config ---------- */
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(__dirname, ".env"), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const BASE_URL = env.BASE_URL;           // https://<tenant>/api
const AUTH = env.AUTH;                   // Basic <token>
const TENANT = BASE_URL.replace(/\/api\/?$/, "");
const PORT = Number(process.env.PORT || 8787);
const MAX_PAGES = 25;

/* ---------- Staffbase API ---------- */
async function api(pathname) {
  const res = await fetch(BASE_URL + pathname, {
    headers: {
      Authorization: AUTH,
      Accept: "application/json",
      "User-Agent": "curl/8.4.0", // the WAF rejects default agents
    },
  });
  if (!res.ok) throw new Error(`${pathname} -> ${res.status}`);
  return res.json();
}

const nodeCache = new Map();
async function menuNode(spaceId, nodeId) {
  const key = `${spaceId}/${nodeId}`;
  if (!nodeCache.has(key)) nodeCache.set(key, api(`/spaces/${spaceId}/menu/${nodeId}`));
  return nodeCache.get(key);
}

function nodeTitle(node) {
  const loc = node?.config?.localization || {};
  const first = loc.en_US || Object.values(loc)[0] || {};
  return first.title || first.shortTitle || "Untitled";
}

async function findSpaceForNode(nodeId) {
  const spaces = await api("/spaces?limit=100");
  for (const s of spaces.data || []) {
    try {
      const n = await menuNode(s.id, nodeId);
      if (n && n.id) return { spaceId: s.id, node: n };
    } catch {
      /* not in this space */
    }
  }
  throw new Error("Menu node not found in any space");
}

/* Page ids referenced from inside a page's content document. */
async function linkedPageNodes(installationId) {
  const out = [];
  for (const p of [`/branch/pages/${installationId}`, `/pages/${installationId}`]) {
    try {
      const doc = await api(p);
      const refs = new Set(
        [...JSON.stringify(doc).matchAll(/content\/page\/([a-f0-9]{24})/g)].map((m) => m[1])
      );
      out.push(...refs);
      break;
    } catch {
      /* try the next shape */
    }
  }
  return out;
}

/* Walk the menu below a node, depth-first, pages only. */
async function menuDescendants(spaceId, node, acc, seen) {
  for (const childId of node.childrenIds || []) {
    if (seen.has(childId) || acc.length >= MAX_PAGES) continue;
    let child;
    try {
      child = await menuNode(spaceId, childId);
    } catch {
      continue;
    }
    seen.add(childId);
    if (child.nodeType === "installation" && child.installationID) {
      acc.push({ menuId: child.id, pageId: child.installationID, title: nodeTitle(child) });
    }
    await menuDescendants(spaceId, child, acc, seen);
  }
}

/* ---------- HTML assembly ---------- */
const PRINT_CSS = `
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

function buildHtml({ title, origin, sections }) {
  const seenCss = new Set();
  const head = [];
  for (const s of sections) {
    const h = crypto.createHash("sha1").update(s.css || "").digest("hex");
    if (seenCss.has(h)) continue;
    seenCss.add(h);
    head.push(`<style>${s.css || ""}</style>`);
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
<base href="${origin || TENANT}/">
<title>${escapeHtml(title || "Page")}</title>
${head.join("\n")}
<style>${PRINT_CSS}</style>
</head><body><div class="sb-pdf-stage">${body}</div></body></html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* ---------- browser ---------- */
let browserPromise = null;
async function getBrowser() {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      if (b.connected !== false) return b;
    } catch {
      /* fall through and relaunch */
    }
    browserPromise = null;
  }
  return launchBrowser();
}

function launchBrowser() {
  if (!browserPromise) {
    const explicit = process.env.CHROME_PATH;
    const fallbacks = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/usr/bin/google-chrome",
    ];
    const executablePath =
      explicit || fallbacks.find((p) => fs.existsSync(p)) || undefined;
    browserPromise = puppeteer.launch({
      headless: "new",
      executablePath,
      args: ["--no-sandbox", "--font-render-hinting=none"],
    });
    browserPromise.then((b) =>
      b.on("disconnected", () => {
        browserPromise = null;
      })
    );
  }
  return browserPromise;
}

async function renderPdf(html, { orientation = "portrait", title = "" }) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 1600, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 120000 });
    await page.emulateMediaType("print");
    await page.evaluate(() => document.fonts && document.fonts.ready);
    const landscape = orientation === "landscape";
    /* the capture is laid out at desktop width; scale it down onto the sheet */
    const scale = landscape ? 0.86 : 0.61;
    return await page.pdf({
      format: "A4",
      landscape,
      printBackground: true,
      scale,
      displayHeaderFooter: true,
      headerTemplate: `<div style="font:400 8px system-ui;color:#9aa1a9;width:100%;padding:0 12mm;">${escapeHtml(
        title
      )}</div>`,
      footerTemplate: `<div style="font:400 8px system-ui;color:#9aa1a9;width:100%;padding:0 12mm;display:flex;justify-content:space-between;">
        <span>${escapeHtml(new URL(TENANT).host)}</span>
        <span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
      timeout: 180000,
    });
  } finally {
    await page.close();
  }
}

/* ---------- app ---------- */
const app = express();
app.use(express.json({ limit: "250mb" }));
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use((req, _res, next) => {
  console.log(`[req] ${req.method} ${req.originalUrl}`);
  next();
});
app.use(
  express.static(path.join(__dirname, "public"), {
    setHeaders: (res, f) => {
      if (f.endsWith(".js")) res.set("Content-Type", "application/javascript; charset=utf-8");
      res.set("Cache-Control", "no-store");
    },
  })
);

app.get("/health", (_req, res) => res.json({ ok: true, tenant: TENANT }));

app.get("/api/tree", async (req, res) => {
  try {
    const menuId = String(req.query.menuId || "");
    const scope = String(req.query.scope || "page");
    if (!/^[a-f0-9]{24}$/.test(menuId)) return res.status(400).json({ error: "bad menuId" });

    const { spaceId, node } = await findSpaceForNode(menuId);
    const title = nodeTitle(node);
    const pages = [{ menuId, pageId: node.installationID, title }];

    if (scope === "experience") {
      const seen = new Set([menuId]);
      await menuDescendants(spaceId, node, pages, seen);
      if (node.installationID) {
        for (const ref of await linkedPageNodes(node.installationID)) {
          if (seen.has(ref) || pages.length >= MAX_PAGES) continue;
          seen.add(ref);
          try {
            const n = await menuNode(spaceId, ref);
            if (n?.installationID)
              pages.push({ menuId: n.id, pageId: n.installationID, title: nodeTitle(n) });
          } catch {
            /* link points outside this space */
          }
        }
      }
    }
    res.json({ title, scope, pages });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.post("/api/pdf", async (req, res) => {
  const t0 = Date.now();
  try {
    const { title, origin, orientation, sections } = req.body || {};
    if (!Array.isArray(sections) || !sections.length)
      return res.status(400).json({ error: "no sections" });
    const html = buildHtml({ title, origin, sections });
    const pdf = await renderPdf(html, { orientation, title });
    console.log(
      `[pdf] "${title}" ${sections.length} section(s), ${(html.length / 1e6).toFixed(
        1
      )}MB html -> ${(pdf.length / 1e6).toFixed(2)}MB pdf in ${Date.now() - t0}ms`
    );
    if (process.env.PDF_DEBUG_DIR) {
      fs.writeFileSync(path.join(process.env.PDF_DEBUG_DIR, "last.pdf"), Buffer.from(pdf));
      fs.writeFileSync(path.join(process.env.PDF_DEBUG_DIR, "last.html"), html);
    }
    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", 'attachment; filename="page.pdf"');
    res.end(Buffer.from(pdf));
  } catch (err) {
    console.error("[pdf] failed", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.listen(PORT, () => console.log(`page-pdf service on http://localhost:${PORT} (tenant ${TENANT})`));
