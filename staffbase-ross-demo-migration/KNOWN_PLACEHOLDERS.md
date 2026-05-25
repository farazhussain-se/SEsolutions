# Known Placeholders — Demo-Leftover Items Still in the Instance

What's still generic / demo-flavored after all the Ross polish, plus *why* each one wasn't fixed and what would be needed to fix it. So future-me (or anyone) can decide what to address.

Updated 2026-05-25 after Home-page text polish.

---

## High-severity (visible from the Home page)

### 1. "Vandelay Industries" stock ticker
**Where:** Home page right sidebar, under "Our Stock" heading.
**What renders:** Red dot + "Vandelay Industries" + price + sparkline.
**HTML source:** Single tag — `<stock-ticker></stock-ticker>` — inside a Section widget.
**Why not text-fixable:** The ticker label, symbol, and price feed are read from a Plugin installation config or branch-level setting, NOT from the page HTML. The `<stock-ticker>` element is just a placeholder for the frontend component to render into.
**To fix:**
1. Identify which Plugin installation drives `<stock-ticker>` — try `GET /installations?limit=300` and filter for ticker-related installations
2. If a Plugin install controls it: PATCH that install's config with `{symbol: "ROST", label: "Ross Stores Inc."}` or equivalent (config schema is plugin-specific)
3. If it's branch-level: try `POST /branch` with the relevant config field — but the `flags` field is restricted (HTTP 403), other fields can write through
4. Worst case: remove the widget from the Home page by deleting the surrounding `<div data-widget-...>` block

### 2. Tom Mitchel headshot (image still wrong even after name fix)
**Where:** Mid-page "Building Success Through Innovation & Excellence" banner. The text label now says "Jim Conroy, CEO" but the photo is still a stock-photo Black man in a suit (not Jim Conroy's actual likeness).
**HTML source:** `<img src="https://ross-demo.staffbase.rocks/api/media/secure/external/v2/image/upload/93f7cb186567a8f558bff9f9720e6f5a.png">` inside the Portfolio banner.
**Why not text-fixable:** It's an image, not text.
**To fix:**
1. Source an actual photo of Jim Conroy (publicly available — search "Jim Conroy Ross Stores CEO" — there's a press-release headshot)
2. `POST /media` to upload the image — get back a `mediumID` + URL
3. PUT the Home page with the `<img src="...">` URL replaced
4. OR remove the headshot entirely — just leave the text/CTA, drop the image card

### 3. Footer text color (dark navy on dark blue)
**Where:** Footer band at bottom of every page.
**Why not text-fixable:** CSS / branding issue. Not text.
**Why not fixed:** The footer-readability CSS override I added on the previous instance was reverted by you intentionally. Same fix would be a `customCSS` POST appending rules forcing `.full-width-bg.page-footer *` to `color: #ffffff`.
**To fix if desired:** Re-add the CSS block from the 2026-05-20 polish session.

---

## Medium-severity (visible but not jarring)

### 4. "Popular Tools" widget — generic SaaS apps
**Where:** Home page right sidebar.
**What renders:** Icon grid of Slack, Jira, Salesforce, Drive, Travelperk, Workday, Sheets, Mail.
**Why not fixed:** Most are plausible enterprise tools (Workday is real Ross, Travelperk is widely used). Salesforce/Drive less likely at Ross corporate. Acceptable as backdrop.
**To fix if desired:** PUT the Home page replacing the `data-title="..."` attributes and `<a href="...">` URLs on each `<li>` inside this Section.

### 5. "Building Success Through Innovation & Excellence" headline
**Where:** The banner with Jim Conroy CEO card.
**Why not fixed:** Plausible-sounding corporate messaging. Not jarring like a stock ticker or Lorem ipsum.
**To fix if desired:** Replace with an actual Ross brand-promise quote like "Bringing brand-name bargains to families across America. Every day." (in Jim Conroy's voice).

### 6. Footer "Our Sites" column labels (Home / About You / News / Community)
**Where:** Footer left column.
**Why not fixed:** "About You" is mildly awkward but harmless. "News / Community" are generic enough.
**To fix if desired:** Could rebrand "About You" → "Your Profile" or similar.

### 7. Survey poll generic title "How was your last week?"
**Where:** Home page right sidebar, the surveys Plugin.
**Why not fixed:** Generic enough not to break. Survey title is Plugin-config, not in page HTML.
**To fix if desired:** Edit the survey plugin's config via the Plugin/installation API or in Studio.

---

## Low-severity / cosmetic

### 8. Some pages still have demo widget configs
Beyond the Home page, several other pages (My HR, Town Hall, Health & Safety, etc.) have demo-configured QuickLinks, NewsFeeds bound to non-Ross channels, etc. Not visible without a screenshot review of each.

### 9. Icon-font glyphs that look like German letters
Inside `<span class="icon we-icon">ä</span>` on the *Getting Started at Ross* page (and possibly others). These are font glyphs (Staffbase's `we-icon` font uses Latin codepoints to encode UI icons), NOT actual German text. Safe to leave.

### 10. Welcome-card "Welcome back, {firstName}" tile cluster (AMA / Directory / OKRs / IT Help)
These 4 tiles are likely generic Staffbase demo defaults inside the NewsStage widget. Ross-specific versions would be: Schedule / Time Off / Pay / IT Service Desk. Configurable via the NewsStage widget config inside the page HTML.

---

## How to inventory these efficiently

A script `scripts/find_placeholders.py` could grep all pages' HTML for known placeholder strings:

```python
PLACEHOLDER_PATTERNS = [
    r"Lorem ipsum",
    r"Vandelay",
    r"Tom Mitchel{1,2}",
    r"Podcast Titel",
    r"Working Student",
    r"Ascociate Customer",  # the typo'd one
    r"Mustermann",          # German demo name we've seen
    r"@company\.com",       # demo-seed email pattern
]
```

Run periodically against the live instance to catch demo-leftover content as it surfaces.

---

## Items I deliberately did NOT touch (and won't unless asked)

- **System accounts** (Staffbase Support User, Mirella Temp) — kept intact
- **The 5 demo-leftover custom profile fields** (apitoken, grouptagcountry, hobby, ispeak, workdayworkemail) — kept; may be used by other demo content
- **Branch customCSS** (118KB+) — out of scope for Ross-themed work, plus the footer-color attempt was reverted
- **Branding** (logo, theme colors, header image) — Studio UI path, not API
- **External media uploads** — needs Ross-source imagery; haven't been provided URLs

---

## Recommended next session work order

If a fresh chat asks "what else is there to polish?":

1. **Stock ticker** (highest impact — visible on Home, fake-company name)
2. **CEO headshot image** (visible on Home, generic stock photo)
3. **One-pass inventory** with `find_placeholders.py` to catch anything else
4. **Welcome-card tiles** inside NewsStage (small but high visibility)
5. **Survey poll title** in surveys plugin config

After that, the demo is genuinely Ross-faithful end to end.
