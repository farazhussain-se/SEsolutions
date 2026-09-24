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
import { fileURLToPath } from "node:url";
import { PRINT_CSS, buildHtml, escapeHtml } from "../shared/document.js";

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
/* print CSS + document assembly are shared with the Worker */

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
