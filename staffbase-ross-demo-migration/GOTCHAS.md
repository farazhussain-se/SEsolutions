# Gotchas — undocumented Staffbase API behaviors found while building the Ross demo

Each item below cost real debugging time on the first run. Documented here so the next person doesn't relearn the hard way.

---

## 1. Profile field creation defaults to `readOnly: true`

**Endpoint:** `POST /api/branch/profilefields`

Even if your request body doesn't mention `readOnly`, Staffbase sets it to `true` on the newly-created field. The result: users can't edit the field value via the UI.

**Fix:** Always include `"readOnly": false` explicitly in the create payload.

```json
{
  "slug": "storeNumber",
  "format": "simpleString",
  "type": "string",
  "localization": {"en_US": {"title": "Store Number"}},
  "visible": true,
  "optional": true,
  "filterable": true,
  "searchable": true,
  "readOnly": false
}
```

---

## 2. `yieldsTags: true` doesn't backfill existing users' tags

When you toggle a profile field to `yieldsTags: true` (so it emits `profile:{slug}:{value}` tags used by conditional groups), the existing user records do NOT get the new tags emitted. The tags only appear on users PATCHed *after* the toggle — and even then, only if the PATCH actually changes the value.

**Symptom:** conditional groups using your tag show 0 users even though field values are set correctly.

**Fix:** sentinel-flip every user. PATCH each user's value to a sentinel (e.g. `"West" → "WestX"`), then back (`"WestX" → "West"`). The change-detection layer emits the tag during the round-trip.

```python
for user in users:
    region = user["profile"]["region"]
    patch(user["id"], {"profile": {"region": region + "_X"}})
    patch(user["id"], {"profile": {"region": region}})
```

---

## 3. v3 PATCH writes data but doesn't trigger search-index refresh

The v3 `PATCH /api/users/{id}` (with vendor media-type headers) correctly writes profile data to the user record, but the **search index doesn't refresh**. This means `/profiles/search` returns `total: 0` and **Studio's User Export panel shows 0 estimated users** even though all the data wrote correctly.

This one is brutal because everything *looks* fine — `GET /users` returns all 33 users perfectly. But the admin UI shows nothing.

**Fix:** for each user, additionally `POST /users/{id}` with a no-op body like `{"firstName": "<current>"}`. The older POST code path forces a per-user reindex.

```python
for user in users:
    # ... your v3 PATCH for profile data ...
    # then force reindex:
    post(f"/users/{user['id']}", {"firstName": user["firstName"]})
```

Confirmed: search index recovers from 0 to N within seconds after touching each user.

---

## 4. Conditional group tags with spaces break group creation (500)

Trying to create a conditional group with a tag like `profile:costcenter:buying office` returns HTTP 500 (`UnknownInternalException`). The space in the value seems to break Staffbase's internal tag-slugging.

**Fix:** use single-token values for any custom-field value that drives a conditional group. We used `Buying` (not `Buying Office`), `HQ` (not `Home Office`), `DC`, `Store`, etc.

---

## 5. PUT on pages/posts with partial contents wipes the rest

`PUT /api/pages/{id}` and `PUT /api/posts/{id}` replace the entire `contents` object. If you send only `{title, content}`, you lose `image`, `feedImage`, `video`, `teaser`, and any other locales (`de_DE`, `es_ES`, etc.).

This bit hard on the first run — I rewrote 47 posts and lost all their attached images.

**Fix:** Re-fetch the live record, then build a PUT body that preserves what you're not changing:

```python
live = get(f"/posts/{pid}")
en = live["contents"]["en_US"]
new_contents = {
    "title": new_title,
    "content": new_content,
    "teaser": new_teaser,
}
for k in ("image", "feedImage", "video"):
    if en.get(k):
        new_contents[k] = en[k]
body = {"contents": {"en_US": new_contents}, "channelID": cid, ...}
```

---

## 6. Space rename: only `name` + `sections`; `branchID` is rejected

`PUT /api/spaces/{id}` with `{"branchID": "..."}` (capital ID) returns 400 `"Parameter 'branchID' is invalid"`. The correct casing is `branchId` (lowercase d), and it's optional anyway.

If you omit `sections` from the PUT, **it wipes them to `[]`** — that breaks the space's availability on products (APP_INTRANET / EMAIL).

**Fix:** Send `{"name": "<new name>", "sections": ["APP_INTRANET", "EMAIL"]}`. Don't include branch identifier.

---

## 7. Campaign references: `sourceId` / `sourceType`, not what you'd guess

`POST /api/campaigns/{cid}/references` — every obvious body shape returns HTTP 400 with `"Could not parse JSON request body"` (a misleading error; the JSON parses fine). The actual accepted field names are `sourceId` and `sourceType`.

```json
{"sourceId": "<post-id>", "sourceType": "POST"}
```

Other values to try if needed: `sourceType` may also accept `"PAGE"` or `"EMAIL"` though we only tested `POST`.

---

## 8. Scheduled posts are hidden from default `GET /posts`

If `published` is a future timestamp, the post is auto-treated as scheduled and **excluded from `GET /posts?limit=...`**. They still exist; fetch by direct ID.

**Symptom:** post-to-campaign reference assignment misses 5+ posts.

**Fix:** iterate post IDs from your snapshot (or from `/posts/sync`) rather than only what `/posts` returns.

---

## 9. `POST /branch` returns 403 on `flags`, but other config still writes

If you send a config update via `POST /api/branch` that touches multiple fields, the response may be 403 `"Access to property [flags] is restricted"`. But your other fields (e.g. `customCSS`) actually wrote through.

Always re-GET after a config write to confirm the change you cared about actually landed. Don't treat 403 as "nothing happened."

---

## 10. Undocumented profile-field CRUD

`developers.staffbase.com` only documents reading the schema (`GET /branch/profilefields`). But empirically:

- `POST /branch/profilefields` — create a new field definition
- `PUT /branch/profilefields/{slug}` — update a field definition (rename title, change format, toggle yieldsTags/filterable/etc.)
- `DELETE /branch/profilefields/{slug}` — delete a custom field

Works in production. Test thoroughly because it's undocumented and the behavior could change.

---

## 11. CEO of Ross is **Jim Conroy**, not Barbara Rentler

Not an API gotcha, a content gotcha. Barbara Rentler was CEO for over a decade and is associated with Ross in many older articles. As of February 2, 2025, Jim Conroy is CEO; Barbara is in an advisory role through March 31, 2027.

If you sign CEO-blog content `— Barbara`, it dates the demo immediately.

---

## 12. New posts land at the END of the menu / feed

`POST /api/pages` and `POST /api/channels/{cid}/posts` create the new entity at the end of the relevant list. There's no `position` field on the create payload. Reordering requires Studio UI or a (per channel) `PATCH /spaces/{sid}/menu` call we did not fully explore.

For demo content, this usually doesn't matter — new posts naturally appear at the top of the news feed because of their publish date, not their menu position.

---

## 13. The `/pages/sync` endpoint has a 60-day window

`GET /pages/sync?cursor=...&includeDelete=true` only returns changes within the last 60 days. For a full reseed you have to walk `/pages` directly.

Not a gotcha we hit on this build (we worked off snapshots) but worth knowing.

---

## 14. Cloudflare blocks default Python UA

Calling `*.staffbase.com` / `*.staffbase.rocks` from Python's `urllib` with the default `User-Agent: Python-urllib/X.Y` returns Cloudflare error 1010.

**Fix:** set a real-looking UA in every request:

```python
headers = {
    "User-Agent": "curl/8.4.0",
    "Authorization": f"Basic {token}",
}
```

---

## 15. Posts can't be deleted via REST when scheduled (sometimes)

Not always reproducible, but: a few times during the build, deleting a scheduled post returned a transient 500. Recreate or PUT-empty as a workaround.

---

## 16. Custom-field tags reference the value casefolded (sort of)

The conditional-group tag spec is `profile:{slug}:{value}` — but the value's casing in the tag is system-determined. We saw lowercase tags (`profile:region:west`) from a value stored as `"West"`. Stick to single-token, lowercase-stable values.
