# Ross Demo — Staffbase Instance Migration Playbook

End-to-end runbook to convert a Staffbase demo-seeded instance into a Ross-branded "production-ready" demo environment. Battle-tested across two runs (2026-05-20 on `staffbasetest.staffbase.rocks`, 2026-05-23 on `ross-demo.staffbase.rocks`).

**Second run took ~25 minutes** end-to-end vs. the first run's ~3 hours. The difference is this playbook.

---

## What this does

Converts a vanilla Staffbase demo branch into a Ross Stores Inc. demo:

| Surface | Result |
|---|---|
| Spaces | All Associates / Ross Community / Associate Help Center |
| Profile fields | Adds 7 Ross-specific custom fields + localizes 3 system titles |
| News channels (14) | 9 renamed (incl. *From Jim's Desk*, *Buying Office & DC News*, *Associate Spotlight*, etc.) |
| News posts (45) | All retitled, teaser+body rewritten with Ross context; Top News carries 3 real Ross press stories; demo-week scheduled posts dated for the live demo |
| Pages (33) | 17 retitled (My Schedule, My Store, My Pay, Break Room, Time Off & PTO, Home — Corporate, etc.) + 10 community/help pages full-rewritten with widgets preserved + 6 new AI-reference pages (Shifts, Inventory, LP, Discount, Open/Close, Code of Conduct) |
| Audience groups | 13: 7 conditional (by region + costCenter) + 6 enumeration. Conditional groups auto-populate from `region` / `costCenter` profile-field tags |
| Users (33) | 31 patched with Ross profile data (storeNumber, district, region, costCenter, associateRole, hireDate, homeStore), Ross-context `profileHeadline`, `@ross.com` emails. 2 system accounts intentionally untouched |
| Campaigns | 6 themed campaigns with date windows + colors, all 45 posts linked |
| Quick Links | 7 Ross resource links × 2 platforms |

---

## Prerequisites

- A Staffbase API token with **Administrative** scope on the target branch
- The target branch must already have the standard Staffbase demo seed (33 users, 14 channels, 27 pages, 8–9 audience groups, 5 "My Communities" pages). If the seed is different, see the *Adaptation* section below.
- `python3` ≥ 3.8

Set environment:
```bash
export STAFFBASE_BASE="https://<your-host>.staffbase.rocks/api"
export STAFFBASE_TOKEN="<your-basic-auth-token>"
```

---

## Run order

```bash
cd scripts/
python3 00_snapshot.py             # 5 min  — read-only; saves to /tmp/ross-migration/snapshots/<ts>/
python3 01_profile_fields.py       # 1 min  — 7 custom fields + 3 system retitled + yieldsTags
python3 02_users.py                # 5 min  — Ross seed + sentinel-flip + POST-touch reindex + headline/email
python3 03_groups.py               # 2 min  — rewire 3 conditional + rename 5 community + create 4 conditional + 1 enum
python3 04_channels.py             # 1 min  — rename 9 channels (5 kept as-is)
python3 05_posts.py                # 3 min  — rewrite all 45 posts (titles, content, teasers, dates incl. scheduled)
python3 06_pages.py                # 3 min  — 17 retitle + 10 rewrite + 6 new AI ref pages
python3 07_spaces.py               # 1 min  — rename 3 spaces
python3 08_quicklinks.py           # 1 min  — 7 Ross links × 2 platforms
python3 09_campaigns.py            # 2 min  — 6 campaigns + reference all posts
python3 10_audit.py                # 1 min  — verify everything
```

Each script reads `STAFFBASE_BASE` + `STAFFBASE_TOKEN` from env. All are idempotent — safe to re-run.

---

## Phase dependency graph

```
00_snapshot ─────────────────────────────────────┐ (read-only)
                                                 ▼
01_profile_fields ──► 02_users ──► 03_groups (groups depend on yieldsTags + user PATCH triggering tags)
                          │
                          └──► 09_campaigns (uses indexed user data; runs late so search index is healthy)

04_channels (independent) ──► 05_posts (posts need channels named)
07_spaces (independent)
08_quicklinks (independent)
06_pages (independent, but better after 04 so titles align)

10_audit (always last)
```

---

## Critical undocumented behaviors (the gotchas)

Each of these cost ≥30 minutes of debugging on the first run. They are baked into the scripts here. See `GOTCHAS.md` for full notes.

1. **`POST /branch/profilefields` defaults to `readOnly: true`** on the new field even if the body doesn't say so. Must set `"readOnly": false` explicitly to make users able to edit values via UI.
2. **`yieldsTags: true` on a profile field does NOT backfill tags** on existing users. You must PATCH each user with a *changed* value (sentinel flip: e.g. `region: "West" → "WestX" → "West"`) for the tag to actually be emitted.
3. **v3 `PATCH /users/{id}` does NOT trigger search-index refresh.** This means `GET /profiles/search` will return 0 and Studio's User Export will show 0 users even though all the data wrote correctly. The fix: `POST /users/{id}` with `{"firstName": "<currentValue>"}` (no-op) — that older code path forces reindex.
4. **Conditional group tags with spaces in the value break group creation with HTTP 500.** Use single-token values (e.g. `Buying` not `Buying Office`) for any field that will drive a conditional group.
5. **`PUT /pages/{id}` and `PUT /posts/{id}` with partial contents wipes everything else** in that contents object — including image, feedImage, video, and any other locales. Always include `image`/`feedImage`/`video` from the existing record (or a re-fetch).
6. **`PUT /spaces/{id}` with `branchID` (capital ID) returns 400.** The accepted field is `branchId` (lowercase d) but it's optional. Send `{"name": "...", "sections": [...]}` and skip the branch identifier. Forgetting `sections` wipes them.
7. **`POST /campaigns/{id}/references` body must be `{"sourceId": "<postId>", "sourceType": "POST"}`.** The error `"Could not parse JSON request body"` is misleading — the actual issue is the wrong field name. The official docs call them `sourceId` / `sourceType`.
8. **Scheduled (future-dated) posts are excluded from `GET /posts` by default.** They still exist; fetch them by direct ID. Means campaign-reference assignment misses them unless you iterate snapshot IDs directly.
9. **`POST /branch` returns 403 on the `flags` sub-property** but other config writes (e.g. `customCSS`) still succeed through that same call. Treat 403 as partial-success and verify the field you cared about.
10. **`/branch/profilefields` supports full CRUD on field DEFINITIONS** (POST/PUT/DELETE), but Staffbase's public docs only document reading the schema. Empirically confirmed; works in production.
11. **CEO of Ross is Jim Conroy** (since 2025-02-02), not Barbara Rentler (who is in an advisory role through 2027-03-31). Important for any CEO-blog channel content.

---

## Content kept in `content/`

| File | What |
|---|---|
| `posts.json` | All 45 posts: title, content (HTML), teaser, publish date, channel mapping |
| `pages.json` | 6 new AI-reference pages + rename map for 17 title-only + 10 full-rewrite |
| `users.json` | 33-user assignment table: name → costCenter/region/store/etc. |
| `groups.json` | Group rewire + create plan with tag values |
| `channels.json` | Channel rename map |
| `campaigns.json` | 6 campaigns with windows, colors, post-substring assignment |
| `quicklinks.json` | 7 Ross link entries |

---

## Adaptation — when the new instance differs from the demo seed

If the target instance doesn't ship with the standard Staffbase demo seed:

- **Different channel set** — edit `content/channels.json` to map your existing channels to Ross names, or create missing channels via `POST /channels` (requires `pluginID: "news"` + spaceID).
- **No demo posts to repurpose** — change `05_posts.py` to `POST /channels/{channelID}/posts` (create) instead of `PUT /posts/{id}` (update). Same body shape, different endpoint.
- **Fewer/more users** — edit `content/users.json` to add/remove name entries.
- **No "My Communities" pages** — skip `06_pages.py` Bucket B (community rewrites), or adapt for whatever community pages do exist.

---

## Rollback

Every script is reversible IF you snapshot first (`00_snapshot.py` must have been run). To reverse:

```bash
python3 99_rollback.py /tmp/ross-migration/snapshots/<timestamp>/
```

The rollback script is not built here — pattern is: walk each entity in the snapshot, PUT/POST original body back, DELETE entities that were created (use the snapshot ID set as ground truth, anything new is fair game to delete).

---

## What this playbook intentionally does NOT do

- **Branding** (theme colors, logos, customCSS) — Studio UI is the path
- **Screens (digital signage)** — not exposed via API, product not enabled by default
- **System accounts** (Staffbase Support, Mirella Temp) — left intact to avoid breaking support access
- **The 5 demo-leftover custom profile fields** (`apitoken`, `grouptagcountry`, `hobby`, `ispeak`, `workdayworkemail`) — kept for safety in case downstream demo content references them
- **External media upload** — keeps the existing Staffbase-CDN stock photos attached to posts; can be extended with `POST /media` if Ross brand imagery is provided

---

## Repo location of source-of-truth files

Within this folder:
- `README.md` (this file) — the playbook
- `CHANGELOG.md` — chronological run log of everything done across builds
- `GOTCHAS.md` — full notes on every undocumented behavior
- `ROSS_FACTS.md` — Ross corporate facts (CEO, brand, sales, key partnerships, sources)
- `WIDGET_RENDERING_NOTES.md` — what each Staffbase widget actually looks like rendered (from screenshot review)
- `KNOWN_PLACEHOLDERS.md` — demo-leftover items still in the instance + how to fix each
- `scripts/` — 11 phase scripts + audit
- `content/` — Ross content as JSON for portability

### If you're resuming this work cold

1. Read `CHANGELOG.md` for the timeline and decisions.
2. Read `GOTCHAS.md` before any API write.
3. Read `KNOWN_PLACEHOLDERS.md` to see what's left to fix.
4. Read `WIDGET_RENDERING_NOTES.md` if you need to interpret page HTML structure.

---

## Authors / changelog

- 2026-05-20 — first build on `staffbasetest.staffbase.rocks` (instance retired due to bugs)
- 2026-05-23 — second build on `ross-demo.staffbase.rocks` (this playbook codified from that run)
- Maintainer: Faraz Hussain (Staffbase SE)
