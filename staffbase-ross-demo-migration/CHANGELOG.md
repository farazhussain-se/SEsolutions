# Ross Demo — Chronological Run Log

A diary of everything done on the Ross demo build. Read top-to-bottom for the timeline; jump to a date for context on a specific decision.

---

## 2026-05-20 — First instance build: `staffbasetest.staffbase.rocks` (now retired)

Initial Ross-branded build on the first demo instance. Discovered all the gotchas in `GOTCHAS.md` the hard way.

**What landed:**
- 7 custom profile fields, 3 system fields retitled
- 31 of 33 users patched with Ross profile data (storeNumber, district, region, costCenter, etc.)
- 9 of 14 channels renamed
- All 47 posts rewritten with Ross-themed titles/content/teasers
- 27 pages retitled + 6 new AI reference pages created
- 13 audience groups (7 conditional + 6 enumeration)
- 6 campaigns with 47 references (one failed with 500)
- 7 Ross quick links × 2 platforms

**Time:** ~3 hours including debugging.

**Notable failures recovered from:**
- Search index went empty after schema changes → fixed via POST `/users/{id}` no-op touch
- 10 pages lost their widget content from over-aggressive PUT → restored via snapshot
- 47 posts lost their images from incomplete PUT → restored via snapshot

**CEO mid-build correction:** Realized Jim Conroy is the actual current CEO (since 2025-02-02), not Barbara Rentler. Renamed channel "From Barbara's Desk" → "From Jim's Desk", rewrote 4 CEO posts in Jim's voice. Added `ROSS_FACTS.md` to lock this down.

**Polish pass that day:**
- HQ – Dublin group renamed to "Home Office Associates" (Ross uses "Home Office" terminology, not "HQ")
- 5 Top News posts populated with real Ross corporate news + source URLs (Q4 earnings, store expansion, BGCA partnership, Jim Conroy CEO appointment, sustainability milestone)
- All 47 post teasers rewritten to Ross context (replaced lingering Cook County / generic demo references)
- 47 post publish dates redistributed across past / current / scheduled for demo-week pacing
- "My Store" page hero "London Office" → "Your Ross Store"
- Footer CSS override added (later reverted by user, intentionally)
- Image attachments restored on 42 of 47 posts from snapshot

---

## 2026-05-23 — Migration to new instance: `ross-demo.staffbase.rocks`

First instance flagged as buggy, customer issued a new one. End-to-end migration using the codified playbook.

**Pre-flight inventory:**
- Same demo seed as first instance (33 users, 14 channels, 27 pages, 8 groups, 5 communities)
- 45 visible posts (vs. 47 on first instance — 2 channels had different counts)
- 5 custom profile fields pre-existing (demo leftovers: apitoken, grouptagcountry, hobby, ispeak, workdayworkemail)
- 0 campaigns, 1 desktop quicklink, 0 mobile

**Total run time: ~25 minutes** (vs. 3 hours on the first run).

**Phases executed:**
1. Phase 0 snapshot — ✓
2. Phase 1 profile fields — 7 created with `readOnly:false` first try, 3 system titles localized
3. Phase 2 users — 31 patched, sentinel-flipped, POST-touched for reindex; index went 33 → 33
4. Phase 3 groups — 3 rewired, 5 renamed, 4 conditional created, 1 enum created; conditional counts: 10/3/6/12/4/8/7 (exact match to expected)
5. Phase 4 channels — 9 renamed (202s)
6. Phase 5 posts — 45/45 rewritten with Ross content + teasers + spread dates including 6 scheduled for May 22-27
7. Phase 6 pages — 17 retitled + 10 community/help rewritten + 6 new AI reference pages; widget counts preserved
8. Phase 7 spaces — 3 renamed
9. Phase 8 quick links — 7 × 2 platforms
10. Phase 9 campaigns — 6 campaigns + 44/45 references linked (1 = "treasure hunt" post 500s server-side, unresolvable)
11. Phase 10 audit — search index 33, all counts match

**Gotchas hit:**
- Treasure-hunt post 500'd on campaign reference attempt (couldn't link to Demo Week OR Jim's Desk — known issue with one specific post; 44/45 still excellent)

---

## 2026-05-23 — Repo documentation push

Pushed `staffbase-ross-demo-migration/` to https://github.com/farazhussain-se/SEsolutions (branch main, commit 81f4936).

Contents:
- `README.md`, `GOTCHAS.md`, `ROSS_FACTS.md`
- 11 phase scripts (env-var auth, no secrets baked in)
- 7 JSON content files (posts, pages, users, groups, channels, campaigns, quicklinks)
- `.gitignore` excludes /tmp snapshots

---

## 2026-05-25 — Post-migration polish (visual review)

**Page-by-page HTML analysis** of all 33 pages — characterized widget composition per page. Aggregate widget mix:

| Widget | Count |
|---|---|
| StaticContent | 330 |
| Section | 270 |
| UserProfile | 106 (19 unique users referenced) |
| NewsFeed | 94 |
| QuickLinks | 70 |
| Button | 54 |
| HeroImage | 52 |
| Accordion | 48 |
| Plugin | 38 (15 unique installations) |
| Portfolio | 32 |
| CreatePost | 30 |
| Infobox / NewsStage / VideoBlock / UserAbsence / UserPayslips / FileList / ShortVideos / ServiceNow | rest |

**Home page screenshot review** revealed widget rendering details only visible from the rendered page (see `WIDGET_RENDERING_NOTES.md`).

**Home page placeholder content fixed (text-only PUT, widgets untouched):**
- "Tom Mitchel, CEO" portrait card → **"Jim Conroy, CEO"** (photo is still a stock-photo headshot — image swap out of scope for text-only pass)
- "Podcast Titel" + Lorem ipsum → **"The Off-Price Insider" + Ross-context tagline**
- Footer Lorem ipsum body → real Ross corporate copy
- Footer "News" column labels (Company Update / Product Update / Marketing / Customer Service / Industry Service) → **Ross channel names (Top News / From Jim's Desk / Buying Office & DC News / Store News / Off-Price Retail News)**
- Footer "Internal Page" → **Associate Help Center**
- Job Openings 4 entries:
  - "Working Student • Berlin • Customer Success" → **"Sales Associate (PT) • Sacramento, CA • Store Operations"**
  - "Customer Success Manager • Berlin • Customer Success" → **"Assistant Store Manager • Phoenix, AZ • Store Leadership"**
  - "Ascociate Customer Care Agent • New York • Customer Care" → **"DC Material Handler • Carlisle, PA • DC Operations"**
  - "Senior Legal Director, Commercial • New York • Legal" → **"Buyer – Ladies Apparel • New York, NY • Buying Office"**

Net HTML delta: +125 bytes. 9 substitutions applied. Page PUT 200.

**Still placeholder (see `KNOWN_PLACEHOLDERS.md`):**
- "Vandelay Industries" stock ticker
- "Tom Mitchel" headshot (image)
- Popular Tools widget (Slack/Jira/Salesforce/etc.)
- Footer text color (dark on dark blue)

---

## Demo readiness checklist (for tomorrow)

- [x] Profile field schema in place
- [x] 31 users with Ross profile data + Ross headlines + `@ross.com` emails
- [x] 13 audience groups populating correctly
- [x] 14 channels with Ross names
- [x] 45 posts (39 visible + 6 scheduled for May 22-27 demo week)
- [x] Top News carrying 3 real Ross stories
- [x] From Jim's Desk has 4 posts in Jim's voice
- [x] 33 pages including 6 AI reference pages
- [x] 6 campaigns with 44/45 references
- [x] Quick links populated on both platforms
- [x] Home page placeholders cleaned (text)
- [ ] Stock ticker still shows Vandelay (not fixable via Page API — requires Plugin config change)
- [ ] CEO headshot still generic stock photo (requires image upload)
- [ ] Footer text-color contrast (CSS-level; deliberate skip)

**Scheduled posts that will land during demo week (currently hidden from default feed):**
- May 22 (already landed) — New SOP heads-up (Quick Takes)
- May 23 (already landed) — The treasure hunt is what makes us Ross (From Jim's Desk)
- May 24 — BOPIS pilot (Store News)
- May 25 — Sustainability milestone (Top News)
- May 25 — Regional contest results (District & Region Updates)
- May 26 (DEMO DAY) — A customer thank-you note (Associate Spotlight)
- May 27 (day after demo) — Store closure procedure (Crisis Hub News)
