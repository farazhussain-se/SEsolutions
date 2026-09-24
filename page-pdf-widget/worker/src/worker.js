/*!
 * Staffbase "Download as PDF" — Cloudflare Worker renderer.
 *
 *   GET  /health
 *   GET  /api/tree?menuId=<id>&scope=page|experience
 *   POST /api/pdf
 *
 * The widget bundle itself is static and lives on GitHub Pages; this Worker only
 * resolves the page tree and prints captured DOM with Browser Rendering.
 *
 * Secrets:  SB_BASE_URL  (https://<tenant>/api)   SB_AUTH  (Basic <token>)
 */
import puppeteer from "@cloudflare/puppeteer";
import { buildHtml, escapeHtml } from "../../shared/document.js";

const MAX_PAGES = 25;
/* The Workers free plan allows 50 subrequests per request. Menu walking is the
   only thing that fans out, so give it a budget and stop cleanly instead of
   dying half way through a tree. */
const SUBREQUEST_BUDGET = 40;

class Staffbase {
  constructor(env) {
    this.base = env.SB_BASE_URL;
    this.auth = env.SB_AUTH;
    this.spent = 0;
    this.cache = new Map();
  }
  get exhausted() {
    return this.spent >= SUBREQUEST_BUDGET;
  }
  async get(path) {
    if (this.cache.has(path)) return this.cache.get(path);
    if (this.exhausted) throw new Error("subrequest budget exhausted");
    this.spent++;
    const res = await fetch(this.base + path, {
      headers: {
        Authorization: this.auth,
        Accept: "application/json",
        "User-Agent": "curl/8.4.0", // the tenant WAF rejects default agents
      },
    });
    if (!res.ok) throw new Error(`${path} -> ${res.status}`);
    const json = await res.json();
    this.cache.set(path, json);
    return json;
  }
  menuNode(spaceId, nodeId) {
    return this.get(`/spaces/${spaceId}/menu/${nodeId}`);
  }
}

function nodeTitle(node) {
  const loc = node?.config?.localization || {};
  const first = loc.en_US || Object.values(loc)[0] || {};
  return first.title || first.shortTitle || "Untitled";
}

async function findSpaceForNode(sb, nodeId) {
  const spaces = await sb.get("/spaces?limit=100");
  for (const s of spaces.data || []) {
    try {
      const node = await sb.menuNode(s.id, nodeId);
      if (node && node.id) return { spaceId: s.id, node };
    } catch (err) {
      if (sb.exhausted) throw err;
    }
  }
  throw new Error("Menu node not found in any space");
}

async function linkedPageNodes(sb, installationId) {
  for (const path of [`/branch/pages/${installationId}`, `/pages/${installationId}`]) {
    try {
      const doc = await sb.get(path);
      return [
        ...new Set(
          [...JSON.stringify(doc).matchAll(/content\/page\/([a-f0-9]{24})/g)].map((m) => m[1])
        ),
      ];
    } catch (err) {
      if (sb.exhausted) return [];
    }
  }
  return [];
}

async function menuDescendants(sb, spaceId, node, acc, seen) {
  for (const childId of node.childrenIds || []) {
    if (seen.has(childId) || acc.length >= MAX_PAGES || sb.exhausted) return;
    let child;
    try {
      child = await sb.menuNode(spaceId, childId);
    } catch {
      continue;
    }
    seen.add(childId);
    if (child.nodeType === "installation" && child.installationID) {
      acc.push({ menuId: child.id, pageId: child.installationID, title: nodeTitle(child) });
    }
    await menuDescendants(sb, spaceId, child, acc, seen);
  }
}

/* Free plan allows one new browser every 20s but several concurrent ones, so
   reconnect to an idle session when there is one. */
async function getBrowser(env) {
  try {
    const sessions = await puppeteer.sessions(env.BROWSER);
    const free = sessions.find((s) => !s.connectionId);
    if (free) return await puppeteer.connect(env.BROWSER, free.sessionId);
  } catch {
    /* fall through to a fresh launch */
  }
  return await puppeteer.launch(env.BROWSER, { keep_alive: 600000 });
}

async function renderPdf(env, html, { orientation, title, host }) {
  const browser = await getBrowser(env);
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 1600 });
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.emulateMediaType("print");
    const landscape = orientation === "landscape";
    return await page.pdf({
      format: "A4",
      landscape,
      printBackground: true,
      /* the capture is laid out at desktop width; scale it onto the sheet */
      scale: landscape ? 0.86 : 0.61,
      displayHeaderFooter: true,
      headerTemplate: `<div style="font:400 8px system-ui;color:#9aa1a9;width:100%;padding:0 12mm;">${escapeHtml(
        title || ""
      )}</div>`,
      footerTemplate: `<div style="font:400 8px system-ui;color:#9aa1a9;width:100%;padding:0 12mm;display:flex;justify-content:space-between;">
        <span>${escapeHtml(host)}</span>
        <span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
    });
  } finally {
    await page.close();
    /* leave the browser up — disconnecting would burn the 20s launch budget */
    await browser.disconnect();
  }
}

const cors = (origin) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
});

const json = (body, status, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });

    const tenant = (env.SB_BASE_URL || "").replace(/\/api\/?$/, "");

    if (url.pathname === "/health") return json({ ok: true, tenant }, 200, origin);

    if (url.pathname === "/api/tree") {
      const menuId = url.searchParams.get("menuId") || "";
      const scope = url.searchParams.get("scope") || "page";
      if (!/^[a-f0-9]{24}$/.test(menuId)) return json({ error: "bad menuId" }, 400, origin);
      try {
        const sb = new Staffbase(env);
        const { spaceId, node } = await findSpaceForNode(sb, menuId);
        const title = nodeTitle(node);
        const pages = [{ menuId, pageId: node.installationID, title }];
        if (scope === "experience") {
          const seen = new Set([menuId]);
          await menuDescendants(sb, spaceId, node, pages, seen);
          if (node.installationID && !sb.exhausted) {
            for (const ref of await linkedPageNodes(sb, node.installationID)) {
              if (seen.has(ref) || pages.length >= MAX_PAGES || sb.exhausted) break;
              seen.add(ref);
              try {
                const n = await sb.menuNode(spaceId, ref);
                if (n?.installationID)
                  pages.push({ menuId: n.id, pageId: n.installationID, title: nodeTitle(n) });
              } catch {
                /* link points outside this space */
              }
            }
          }
        }
        return json({ title, scope, pages, truncated: sb.exhausted }, 200, origin);
      } catch (err) {
        return json({ error: String(err.message || err) }, 500, origin);
      }
    }

    if (url.pathname === "/api/pdf" && request.method === "POST") {
      try {
        const { title, origin: pageOrigin, orientation, sections } = await request.json();
        if (!Array.isArray(sections) || !sections.length)
          return json({ error: "no sections" }, 400, origin);
        const html = buildHtml({ title, origin: pageOrigin || tenant, sections });
        const pdf = await renderPdf(env, html, {
          orientation,
          title,
          host: new URL(pageOrigin || tenant).host,
        });
        return new Response(pdf, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="page.pdf"',
            ...cors(origin),
          },
        });
      } catch (err) {
        return json({ error: String(err.message || err) }, 500, origin);
      }
    }

    return json({ error: "not found" }, 404, origin);
  },
};
