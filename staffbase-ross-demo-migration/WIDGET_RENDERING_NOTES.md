# Widget Rendering Notes

What the HTML markup actually maps to visually, learned from screenshot review of the rendered Home page. Useful next time someone needs to understand a Staffbase page from API output alone.

---

## How each widget type actually looks when rendered

### `NewsStage`
**Not a simple news rollup.** It's a full-width hero compound:
- Big background image of the top news article
- Headline + teaser overlaid bottom-left
- Right-side card with: weather, personalized greeting ("Welcome back, {firstName} 👋"), 4 quick-link tiles
- "Read more" link to the article body

The 4× count in HTML (`NewsStage × 4` on the Home page) reflects 4 nested sub-widgets (image, headline block, welcome card, quick-link tiles) — not 4 independent News Stages.

### `Portfolio`
Horizontal hero/promo banner. On the Home page renders as the **"Building Success Through Innovation & Excellence"** block with:
- Left-side text (heading + subhead + CTA button)
- Right-side image card with a person + name/title overlay
- Single visible banner per `Portfolio × 4` count (the 4 reflects subordinate component widgets, not 4 banners)

### `ShortVideos`
Horizontal carousel of 3 video thumbnails with a "+ New Short" affordance at the start. Pulls from a specified channel (Quick Takes in our case).

### `QuickLinks`
Renders as a **grid of icon tiles** (4×2 in the "Popular Tools" sidebar instance). Each tile is an icon image + label + click destination. Configured per-instance — the page-level QuickLinks widget on Home shows generic SaaS tools (Slack, Jira, Salesforce, Drive, Travelperk, Workday, Sheets, Mail), separate from the branch-level `/branch/quicklinks` we configured for the global header/launchpad.

### `NewsFeed`
The standard 2-up news card grid. Each post renders as image+headline+date+channel-pill+teaser+"Read more". The "**Important**" badge on a card comes from the post's `highlighted` flag, not from widget config.

### `Accordion`
Renders as a **single accordion control with multiple panels**. Each `data-title="..."` attribute is a panel label, and each panel can contain other widgets (Plugin embeds are common). Counted by the number of sub-widgets inside, hence high counts.

### `CreatePost`
Inline composer ("**What's on your mind today?**") with avatar of the logged-in user. Appears on social-feed pages and the home dashboard.

### `Plugin`
**Opaque rendering** — whatever the plugin installation does. The HTML only carries the `data-widget-conf-installation-id`. To know what the user sees you need to look up the installation in `/installations` and ideally have the rendered page.

Known plugin types referenced across the Ross demo:
- `form` — form-builder embeds (Kudos Nomination, Registration Form, Incident Report, IT Hardware Request)
- `surveys` — survey/poll widget ("How was your last week?" 5-star)
- Unresolved installations (job board, stock ticker, podcast player, etc.)

### `<stock-ticker>` (not a widget — a custom HTML element)
Standalone HTML tag `<stock-ticker></stock-ticker>` rendered by a Staffbase frontend component. The ticker symbol (Vandelay Industries in this demo) is configured **outside the page HTML** — likely in a Plugin installation or branch-level setting. **Cannot be changed via Page PUT.**

### `<h2>Our Stock</h2>` etc. — Section headings
Plain HTML headings inside widgets. The page renders these as visible section titles in the sidebar.

### `Button`
A click target with styled label. Each Button has `data-widget-conf-href`, text color, etc. Renders as a button or a link tile depending on the surrounding context.

### `Infobox`
Highlighted info card (light background, often used for "important" or "to acknowledge" items). The "**To Acknowledge**" strip on the Home page is likely a NewsFeed in Infobox display mode.

### `UserProfile`
Person card showing avatar + name + role headline. Pulls from the user record at `data-widget-conf-user-id`. After our Phase 2 work, these cards now show **Ross-context headlines** ("Sr. Internal Comms Mgr • Ross Home Office", etc.) instead of "I'm a happy employee".

### `UserAbsence`, `UserPayslips`, `ServiceNow`
Self-service personal-data widgets. Each pulls from a user-specific data source (HRIS for absences, payroll for payslips, ServiceNow for tickets). On most pages these are 2-count (likely desktop + mobile variants).

### `VideoBlock`
Inline video player. Source URL configured per widget; not surfaced in our HTML inspection. Renders as a video thumbnail with play button.

---

## Section grid types we've seen

| `data-widget-conf-grid-type` | Visual |
|---|---|
| `100` | Full-width single column |
| `66-33` | 2/3 left + 1/3 right (most common dashboard layout) |
| `33-66` | 1/3 left + 2/3 right (mirror of above) |
| `50-50` | Even 2-column split |
| `33-33-33` | 3 equal columns |
| `25-25-25-25` | 4 equal columns (used for icon-tile rows) |

---

## What HTML markup tells you reliably

| Question | Answer source |
|---|---|
| How many widgets, what types, how nested? | `data-widget-type` / `data-widget-src` count |
| Section grid layout? | `data-widget-conf-grid-type="..."` |
| What user does a UserProfile card show? | `data-widget-conf-user-id` → resolve via `/users/{id}` |
| What plugin is embedded? | `data-widget-conf-installation-id` → resolve via `/installations` |
| HeroImage banner text? | `data-heading="..."`, `data-description="..."` |
| Accordion panel labels? | `data-title="..."` on each panel |
| Image URLs in headers/banners? | `data-widget-conf-background-image-url="..."`, `<img src="...">` |
| Button label + destination? | inline text + `data-widget-conf-href` |

---

## What HTML markup canNOT tell you (need a screenshot)

| Question | Why HTML can't answer |
|---|---|
| How does the whole page actually look stacked together? | Render order, responsive behavior, customCSS effects |
| Does a Plugin embed render correctly or show a broken placeholder? | Plugin is opaque from HTML |
| What's in the stock ticker / podcast / job board widgets? | Data comes from external Plugin configs |
| Mobile vs desktop differences? | `data-widget-conf-device-visibility` shows which device a widget targets, but you still can't see the actual mobile rendering |
| Text contrast / readability issues? | CSS-applied colors not visible from page HTML |
| Whether a widget is positioned where you expect? | Stacking + grid behaviors are render-time concerns |

---

## Concrete examples from Ross Home page (one screenshot worth of mapping)

Visual section → HTML widget(s):

1. Top hero (Q4 Ross story + weather card + 4 tile launcher) = **NewsStage × 4**
2. "To Acknowledge" 4-card strip in light-blue band = **NewsFeed** in highlight/acknowledge filter mode
3. Center "My news" 2×2 = **NewsFeed**
4. "Our Shorts" 3-thumbnail carousel = **ShortVideos × 4**
5. "Popular Tools" 4×2 icon grid = **QuickLinks × 14** (multiple instances for responsive variants)
6. "Our Stock" / Vandelay = `<stock-ticker>` HTML element (not a widget)
7. "Until our next Town Hall" CTA = **Button** inside a styled Section
8. "Building Success" Tom Mitchel banner = **Portfolio × 4**
9. Social Wall composer + posts = **CreatePost × 2** + **NewsFeed × 2**
10. "Podcast Titel" tile = a **Plugin** (podcast player)
11. "Survey Poll" 5-stars = the `surveys | Last week` **Plugin**
12. "Job Openings" 4 entries = inline HTML inside a Section (not a Plugin — that's why we could text-edit it)
13. Footer = **Section × 1** + multiple **StaticContent** blocks
