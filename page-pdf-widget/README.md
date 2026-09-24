# fh.page-pdf — "Download as PDF" for Staffbase pages

A Staffbase **custom widget** plus a small **rendering backend**. Drop the widget on a
Content Designer page and end users get a button that exports that page — or the whole
experience below it — as a PDF that looks like the page, not like a text dump.

Built and tested end to end on a Staffbase demo instance.

---

## Why it is built this way

Staffbase renders a Content Designer page into an **open shadow root** inside the app shell.
A backend cannot just fetch the page URL: the markup is assembled client-side, the media sits
behind `/api/media/secure/...` and needs the user's session, and most of the layout depends on
CSS **container queries** and a Tailwind sheet delivered through `adoptedStyleSheets`.

So the split is:

| Where | What it does |
| --- | --- |
| **Widget** (runs in the user's authenticated page) | scrolls the page so every lazy block mounts, reads the shadow root, unfolds carousels, inlines every image as a data URI, serialises the CSS |
| **Backend** (Node + headless Chrome) | works out which pages belong to the export, reassembles the captured DOM into one print document, prints it to A4 |

Nothing about the user's session ever leaves the browser — the backend only needs an API token
to read the **menu structure**, never the page content.

---

## Layout

```
fh.page-pdf.js            the custom widget (vanilla JS, no build step)
shared/document.js        print CSS + document assembly, shared by both renderers
worker/src/worker.js      Cloudflare Worker renderer (Browser Rendering)
server/server.js          Node renderer (drives a locally installed Chrome)
```

## Hosting

The two halves have different hosting needs and that is the main thing to get right.

**`fh.page-pdf.js` is static** and is served from GitHub Pages out of this repo:

```
https://farazhussain-se.github.io/SEsolutions/page-pdf-widget/fh.page-pdf.js
```

That is the URL to paste into Studio → Settings → Extensions → Custom Widgets.

**The renderer needs a real Chrome**, so it cannot run on Pages. There are two builds of it,
sharing the same print-document code in `shared/document.js`:

| Build | Runs on | Use when |
| --- | --- | --- |
| `worker/` | Cloudflare Workers + Browser Rendering | the long-term home — free tier, no spin-down, no card |
| `server/` | any Node host with Chrome installed | local development, or a box you already own |

Either way, put the renderer's hostname into each widget instance's **PDF service URL**
setting. When the bundle is loaded from a `github.io` host the widget deliberately refuses to
guess a backend and tells you to set it.

### Deploying the Worker

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put SB_BASE_URL     # https://<tenant>/api
npx wrangler secret put SB_AUTH         # Basic <base64 api token>
npx wrangler deploy
```

`npm run check` builds it offline with no account, which is a useful sanity check first.

The Workers **free** plan gives 10 minutes of browser time a day — an export costs roughly
4–7 seconds, so about 100 exports — with 3 concurrent browsers and one new browser every 20
seconds. The Worker reconnects to an idle browser session instead of launching a fresh one,
so back-to-back exports do not trip that launch limit.

Free Workers also cap a request at 50 subrequests. Menu walking is the only thing that fans
out, so it runs on a budget of 40 and reports `truncated: true` rather than failing outright
once a menu tree gets too large for one request.

### Running the Node renderer locally


```bash
npm install
node server.js                       # http://localhost:8787
cloudflared tunnel --url http://localhost:8787
```

Then in **Studio → Settings → Extensions → Custom Widgets → Install Widget**, paste:

```
https://<your-host>/fh.page-pdf.js
```

The widget then appears in the Content Designer widget picker as **Download as PDF**.

`CHROME_PATH` overrides which Chrome the backend drives (it defaults to the system Google
Chrome, then Chromium, then Puppeteer's own download).

## Widget settings

| Setting | Values | Meaning |
| --- | --- | --- |
| Button label | text | what the button says |
| What to export | `page` / `experience` | just this page, or this page plus every page below it in the menu and every Staffbase page it links to |
| Paper orientation | `portrait` / `landscape` | landscape fits the desktop layout at a larger scale |
| Button alignment | left / center / right | |
| File name | text | defaults to the page title |
| PDF service URL | url | only needed if the backend is hosted apart from the bundle |

## Endpoints

- `GET /api/tree?menuId=<id>&scope=page|experience` → the ordered list of pages in the export.
  Walks the space menu and the `content/page/<id>` references inside the page's content
  document, capped at 25 pages.
- `POST /api/pdf` → `{title, origin, orientation, sections:[{title, html, css}]}` → `application/pdf`.

## What the capture handles

- lazy-mounted blocks and virtualised news feeds (the page is scrolled to the bottom first)
- Swiper carousels — **every** slide is unfolded onto paper instead of only the one on screen
- `:not(:defined)` guards that hide slides when Staffbase's custom elements have not upgraded
- session-protected images, inlined as data URIs and downscaled past ~900 KB
- `line-clamp` / `truncate` — expanded, because truncated text is lost text
- internal scroll containers — expanded
- cross-origin embeds (TradingView, Microsoft) — replaced with a labelled stub, since a
  third-party iframe cannot be printed

## Known limits

- **Third-party iframes** print as a stub with their URL. Nothing can be done from outside
  their origin.
- **Video** prints as its poster frame.
- A full home page is a ~12 MB capture; the round trip takes roughly 35 s of capture plus
  5 s of rendering. Smaller pages are a few seconds.
- The backend needs a real Chrome. Puppeteer's bundled Chrome for Testing is unsigned and
  macOS kills it, hence the `CHROME_PATH` fallback chain.
- A quick tunnel URL dies with the tunnel. For anything permanent, host the bundle on a CDN
  and the service somewhere with a stable hostname, then reinstall the widget with that URL.
