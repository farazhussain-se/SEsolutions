/*!
 * fh.page-pdf — Staffbase custom widget
 * Renders a "Download as PDF" button that captures the fully-rendered page
 * (and, optionally, every page below it in the menu — the extended experience)
 * and sends it to a backend that prints it with headless Chrome.
 *
 * Vanilla JS on purpose: no build step, one file, drop-in on any CDN.
 */
(function () {
  "use strict";

  var VERSION = "1.0.0";
  var AUTHOR = "Faraz Hussain <faraz.hussain@staffbase.com>";

  /* Backend defaults to wherever this bundle is served from. */
  var BACKEND = (function () {
    try {
      var s = document.currentScript && document.currentScript.src;
      if (!s) return "";
      var origin = new URL(s).origin;
      /* A static host (GitHub Pages, a CDN) can serve this bundle but cannot
         render PDFs. In that case there is no sensible default and the widget's
         "PDF service URL" setting has to point at the renderer. */
      if (/\.github\.io$|\.pages\.dev$|\.netlify\.app$/.test(new URL(s).hostname)) return "";
      return new URL(".", s).href.replace(/\/$/, "");
    } catch (e) {
      return "";
    }
  })();

  var ICON =
    "data:image/svg+xml;base64," +
    btoa(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="#464B50" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4v16"/><path d="M10 14l6 6 6-6"/><path d="M5 24v2a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2v-2"/></svg>'
    );

  /* ------------------------------------------------------------------ *
   * Configuration schema (rendered by Studio as the widget's edit form)
   * ------------------------------------------------------------------ */
  var widgetAttributes = [
    "label",
    "scope",
    "filename",
    "orientation",
    "backendurl",
    "alignment",
  ];

  var configurationSchema = {
    properties: {
      label: { type: "string", title: "Button label", default: "Download as PDF" },
      scope: {
        type: "string",
        title: "What to export",
        enum: ["page", "experience"],
        enumNames: [
          "This page only (fully expanded)",
          "Entire extended experience (this page + all pages below it)",
        ],
        default: "page",
      },
      orientation: {
        type: "string",
        title: "Paper orientation",
        enum: ["portrait", "landscape"],
        default: "portrait",
      },
      alignment: {
        type: "string",
        title: "Button alignment",
        enum: ["left", "center", "right"],
        default: "left",
      },
      filename: { type: "string", title: "File name (optional)" },
      backendurl: { type: "string", title: "PDF service URL (leave empty for default)" },
    },
  };

  var uiSchema = {
    label: { "ui:help": "Text shown on the button." },
    scope: {
      "ui:help":
        "“Entire extended experience” walks the menu below this page and appends every child page to the same PDF.",
    },
    filename: { "ui:help": "Defaults to the page title." },
    backendurl: {
      "ui:help":
        "Required when the bundle is served from a static host such as GitHub Pages, which cannot render PDFs. Leave empty only if the renderer serves this bundle itself.",
    },
  };

  /* ------------------------------------------------------------------ *
   * Capture helpers — all of this runs inside the end user's session,
   * so everything that is visible to them is visible to us (cookies,
   * lazy-loaded blocks, shadow DOM, media behind /api/media/secure).
   * ------------------------------------------------------------------ */

  var SKIP_SELECTORS = [
    "script",
    "noscript",
    "[data-testid='create-post']",
    ".sb-create-post-portal-host",
    "[class*='edit-button']",
    "[data-sb-page-pdf-widget]",
  ];

  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  /* The Content Designer renders a page into an open shadow root. Find it. */
  function findContentHost(doc) {
    var best = null;
    var all = doc.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!el.shadowRoot) continue;
      var cls = (el.className || "").toString();
      if (/portal|create-post/i.test(cls)) continue;
      var len = el.shadowRoot.innerHTML.length;
      if (!best || len > best.len) best = { el: el, len: len };
    }
    return best ? best.el : null;
  }

  /* Force everything to render: scroll the whole document so lazy blocks,
     carousels and virtualised news feeds actually mount. */
  async function fullyRender(win, doc) {
    var last = 0;
    for (var pass = 0; pass < 25; pass++) {
      var h = Math.max(
        doc.documentElement.scrollHeight,
        doc.body ? doc.body.scrollHeight : 0
      );
      for (var y = 0; y <= h; y += Math.max(200, win.innerHeight * 0.8)) {
        win.scrollTo(0, y);
        await sleep(60);
      }
      win.scrollTo(0, 0);
      await sleep(400);
      var h2 = Math.max(
        doc.documentElement.scrollHeight,
        doc.body ? doc.body.scrollHeight : 0
      );
      if (h2 === last && pass > 0) break;
      last = h2;
    }
    /* wait for images that have started loading */
    var host = findContentHost(doc);
    var imgs = host ? host.shadowRoot.querySelectorAll("img") : [];
    await Promise.all(
      [].map.call(imgs, function (img) {
        if (img.complete) return Promise.resolve();
        return new Promise(function (res) {
          img.addEventListener("load", res, { once: true });
          img.addEventListener("error", res, { once: true });
          setTimeout(res, 4000);
        });
      })
    );
    await sleep(300);
  }

  /* Serialise adoptedStyleSheets (Tailwind lives there) into plain CSS. */
  function adoptedCss(root) {
    var out = [];
    var sheets = root.adoptedStyleSheets || [];
    for (var i = 0; i < sheets.length; i++) {
      try {
        var rules = sheets[i].cssRules;
        for (var j = 0; j < rules.length; j++) out.push(rules[j].cssText);
      } catch (e) {
        /* cross-origin sheet — skip */
      }
    }
    return out.join("\n");
  }

  /* Snapshot every CSS custom property on :root so brand colours survive. */
  function rootVariables(win, doc) {
    var cs = win.getComputedStyle(doc.documentElement);
    var vars = [];
    for (var i = 0; i < cs.length; i++) {
      var name = cs[i];
      if (name.indexOf("--") === 0) vars.push(name + ":" + cs.getPropertyValue(name) + ";");
    }
    var bodyCs = win.getComputedStyle(doc.body);
    return (
      ":root,:host{" +
      vars.join("") +
      "}\nbody{font-family:" +
      bodyCs.fontFamily +
      ";color:" +
      bodyCs.color +
      ";}"
    );
  }

  /* Document-level stylesheets the shadow content still depends on. */
  function documentCss(doc) {
    var parts = [];
    var links = doc.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].href) parts.push('@import url("' + links[i].href + '");');
    }
    return parts.join("\n");
  }

  /* Fetch a same-origin asset with the user's session and turn it into a
     data: URI, downscaling anything heavy so the payload stays sane. */
  var assetCache = new Map();
  async function toDataUri(url) {
    if (!url || /^(data:|blob:)/.test(url)) return url;
    var abs;
    try {
      abs = new URL(url, location.href);
    } catch (e) {
      return url;
    }
    if (abs.origin !== location.origin) return url; /* CDN images are public */
    if (assetCache.has(abs.href)) return assetCache.get(abs.href);

    var p = (async function () {
      try {
        var res = await fetch(abs.href, { credentials: "include" });
        if (!res.ok) return url;
        var blob = await res.blob();
        if (blob.size > 900 * 1024 && /^image\//.test(blob.type)) {
          try {
            var bmp = await createImageBitmap(blob);
            var scale = Math.min(1, 1400 / bmp.width);
            var c = document.createElement("canvas");
            c.width = Math.round(bmp.width * scale);
            c.height = Math.round(bmp.height * scale);
            c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
            return c.toDataURL("image/jpeg", 0.82);
          } catch (e) {
            /* fall through to raw encode */
          }
        }
        return await new Promise(function (res2) {
          var fr = new FileReader();
          fr.onload = function () {
            res2(fr.result);
          };
          fr.onerror = function () {
            res2(url);
          };
          fr.readAsDataURL(blob);
        });
      } catch (e) {
        return url;
      }
    })();
    assetCache.set(abs.href, p);
    return p;
  }

  /* Clean a cloned subtree and inline its media. */
  async function sanitise(clone, onProgress) {
    SKIP_SELECTORS.forEach(function (sel) {
      clone.querySelectorAll(sel).forEach(function (n) {
        n.remove();
      });
    });

    /* Staffbase hides carousel slides behind `:not(:defined)` guards that only
       lift once its custom elements upgrade. No scripts run in the print
       document, so strip those class tokens and let every slide show. */
    clone.querySelectorAll('[class*=":defined"]').forEach(function (el) {
      var kept = (el.getAttribute("class") || "")
        .split(/\s+/)
        .filter(function (t) {
          return t.indexOf(":defined") === -1;
        });
      el.setAttribute("class", kept.join(" "));
    });

    /* cross-origin iframes cannot be printed — leave a visible stub */
    clone.querySelectorAll("iframe").forEach(function (f) {
      var src = f.getAttribute("src") || "";
      var box = document.createElement("div");
      box.className = "sb-pdf-embed-stub";
      box.textContent = "Embedded content: " + src;
      f.replaceWith(box);
    });

    /* videos -> poster image */
    clone.querySelectorAll("video").forEach(function (v) {
      var poster = v.getAttribute("poster");
      if (poster) {
        var img = document.createElement("img");
        img.src = poster;
        v.replaceWith(img);
      } else {
        v.remove();
      }
    });

    /* an image that never loaded on screen only prints as an alt-text box */
    clone.querySelectorAll("img").forEach(function (img) {
      var src = img.getAttribute("src") || "";
      if (!src) img.remove();
    });

    var imgs = [].slice.call(clone.querySelectorAll("img"));
    var done = 0;
    for (var i = 0; i < imgs.length; i += 6) {
      var batch = imgs.slice(i, i + 6);
      await Promise.all(
        batch.map(async function (img) {
          img.removeAttribute("srcset");
          img.removeAttribute("loading");
          var src = img.getAttribute("src") || img.currentSrc;
          var inlined = await toDataUri(src);
          if (!inlined || inlined === src) {
            /* same-origin fetch failed — it will not print either */
            if (new URL(src, location.href).origin === location.origin) {
              img.remove();
              done++;
              if (onProgress) onProgress(done, imgs.length);
              return;
            }
          }
          img.src = inlined;
          done++;
          if (onProgress) onProgress(done, imgs.length);
        })
      );
    }

    /* inline background-image urls set via the style attribute */
    var bgs = [].slice.call(clone.querySelectorAll('[style*="url("]'));
    for (var k = 0; k < bgs.length; k++) {
      var el = bgs[k];
      var m = /url\((["']?)([^"')]+)\1\)/.exec(el.getAttribute("style") || "");
      if (!m) continue;
      var d = await toDataUri(m[2]);
      el.setAttribute(
        "style",
        el.getAttribute("style").replace(m[0], 'url("' + d + '")')
      );
    }
    return clone;
  }

  /* Capture one rendered document into {html, css}. */
  async function captureDocument(win, doc, onProgress) {
    await fullyRender(win, doc);
    var host = findContentHost(doc);
    if (!host) throw new Error("Could not find the page content in this document.");
    var root = host.shadowRoot;

    var wrapper = document.createElement("div");
    for (var i = 0; i < root.children.length; i++) {
      wrapper.appendChild(root.children[i].cloneNode(true));
    }
    await sanitise(wrapper, onProgress);

    var css = [rootVariables(win, doc), documentCss(doc), adoptedCss(root)].join("\n");
    return { html: wrapper.innerHTML, css: css };
  }

  /* Load another page headlessly in a hidden same-origin iframe and capture it. */
  async function capturePage(menuId, onProgress) {
    var frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText =
      "position:fixed;left:-20000px;top:0;width:1280px;height:1600px;border:0;opacity:0;";
    frame.src = "/content/page/" + menuId + "?clientEmbedMode=true";
    document.body.appendChild(frame);
    try {
      await new Promise(function (res, rej) {
        frame.onload = res;
        frame.onerror = rej;
        setTimeout(res, 30000);
      });
      await sleep(2500);
      return await captureDocument(frame.contentWindow, frame.contentDocument, onProgress);
    } finally {
      frame.remove();
    }
  }

  function currentMenuId() {
    var m = /\/content\/page\/([a-f0-9]{24})/i.exec(location.pathname);
    return m ? m[1] : null;
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 30000);
  }

  /* ------------------------------------------------------------------ *
   * The block
   * ------------------------------------------------------------------ */
  var factory = function (BaseBlockClass) {
    return class PagePdfBlock extends BaseBlockClass {
      static get observedAttributes() {
        return widgetAttributes;
      }

      attributeChangedCallback() {
        if (super.attributeChangedCallback)
          super.attributeChangedCallback.apply(this, arguments);
      }

      attrs() {
        var get = (n, d) => {
          var v = this.getAttribute(n);
          return v === null || v === "" ? d : v;
        };
        return {
          label: get("label", "Download as PDF"),
          scope: get("scope", "page"),
          filename: get("filename", ""),
          orientation: get("orientation", "portrait"),
          alignment: get("alignment", "left"),
          backend: (get("backendurl", BACKEND) || "").replace(/\/$/, ""),
        };
      }

      renderBlock(container) {
        var a = this.attrs();
        container.setAttribute("data-sb-page-pdf-widget", "true");
        container.innerHTML =
          '<div class="sb-pdf-root" style="display:flex;justify-content:' +
          ({ left: "flex-start", center: "center", right: "flex-end" }[a.alignment] ||
            "flex-start") +
          ';align-items:center;gap:12px;flex-wrap:wrap;padding:4px 0;">' +
          '<button type="button" class="sb-pdf-btn">' +
          '<svg width="18" height="18" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto"><path d="M16 4v16"/><path d="M10 14l6 6 6-6"/><path d="M5 24v2a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2v-2"/></svg>' +
          "<span></span></button>" +
          '<span class="sb-pdf-status" role="status" aria-live="polite" style="font-size:14px;opacity:.75"></span>' +
          "</div>" +
          "<style>" +
          ".sb-pdf-btn{display:inline-flex;align-items:center;gap:8px;cursor:pointer;border:0;border-radius:999px;" +
          "padding:11px 22px;font:600 15px/1.2 inherit;color:var(--button-text-color,#fff);" +
          "background:var(--primary-brand-color,var(--brand-primary,#003963));transition:opacity .15s}" +
          ".sb-pdf-btn:hover{opacity:.88}" +
          ".sb-pdf-btn[disabled]{opacity:.55;cursor:progress}" +
          "</style>";

        var btn = container.querySelector(".sb-pdf-btn");
        var labelEl = btn.querySelector("span");
        var status = container.querySelector(".sb-pdf-status");
        labelEl.textContent = a.label;

        btn.addEventListener("click", () => this.run(a, btn, labelEl, status));
      }

      async run(a, btn, labelEl, status) {
        var say = function (t) {
          status.textContent = t || "";
        };
        btn.disabled = true;
        var original = labelEl.textContent;
        labelEl.textContent = "Preparing…";
        try {
          var menuId = currentMenuId();
          if (!menuId)
            throw new Error(
              "This widget only works on a page (it reads the page id from the URL)."
            );
          if (!a.backend)
            throw new Error(
              "No PDF service configured. Set this widget's “PDF service URL” to the renderer."
            );

          /* 1. ask the backend which pages belong to this export */
          say("Working out what to include…");
          var treeRes = await fetch(
            a.backend + "/api/tree?menuId=" + menuId + "&scope=" + a.scope,
            { headers: { Accept: "application/json" } }
          );
          if (!treeRes.ok) throw new Error("PDF service unreachable (" + treeRes.status + ").");
          var tree = await treeRes.json();
          var pages = tree.pages || [{ menuId: menuId, title: document.title }];

          /* 2. capture each page in the user's own authenticated session */
          var sections = [];
          for (var i = 0; i < pages.length; i++) {
            var p = pages[i];
            var prefix =
              pages.length > 1 ? "Capturing " + (i + 1) + "/" + pages.length + ": " : "Capturing: ";
            say(prefix + (p.title || "page"));
            var cap;
            if (p.menuId === menuId) {
              cap = await captureDocument(window, document, function (d, t) {
                say(prefix + "images " + d + "/" + t);
              });
            } else {
              cap = await capturePage(p.menuId, function (d, t) {
                say(prefix + "images " + d + "/" + t);
              });
            }
            sections.push({ title: p.title || "", html: cap.html, css: cap.css });
          }

          /* 3. hand it to the renderer */
          labelEl.textContent = "Rendering…";
          say("Building the PDF…");
          var res = await fetch(a.backend + "/api/pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: tree.title || document.title,
              origin: location.origin,
              orientation: a.orientation,
              sections: sections,
            }),
          });
          if (!res.ok) throw new Error("Rendering failed (" + res.status + ").");
          var blob = await res.blob();

          var name =
            (a.filename || tree.title || document.title || "page")
              .replace(/[^\w\s.-]+/g, "")
              .trim()
              .replace(/\s+/g, "-") + ".pdf";
          download(blob, name);
          say("Downloaded.");
          setTimeout(function () {
            say("");
          }, 6000);
        } catch (err) {
          say(String((err && err.message) || err));
          console.error("[page-pdf]", err);
        } finally {
          btn.disabled = false;
          labelEl.textContent = original;
        }
      }
    };
  };

  var blockDefinition = {
    name: "page-pdf",
    factory: factory,
    attributes: widgetAttributes,
    blockLevel: "block",
    configurationSchema: configurationSchema,
    uiSchema: uiSchema,
    label: "Download as PDF",
    iconUrl: ICON,
  };

  /* Exposed so the capture pipeline can be exercised from the console on a
     live page without installing the widget first. */
  window.__sbPagePdf = {
    version: VERSION,
    backend: BACKEND,
    captureDocument: captureDocument,
    capturePage: capturePage,
    currentMenuId: currentMenuId,
    download: download,
  };

  if (typeof window.defineBlock === "function") {
    window.defineBlock({
      blockDefinition: blockDefinition,
      author: AUTHOR,
      version: VERSION,
    });
  } else {
    console.warn("[page-pdf] defineBlock unavailable — loaded outside Staffbase; debug API only.");
  }
})();
