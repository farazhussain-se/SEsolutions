# staffbase-replify-extension

Forked + bolted-on copy of the upstream **Replify** Chrome extension with two
internal SE tools merged in as native sub-views:

| Sub-view                        | Where it lives in the UI                          | Ported from |
| ------------------------------- | ------------------------------------------------- | ----------- |
| **Personas & Groups**           | `Manage Users` mode → third button alongside Automation / Manage Users | `staffbase-demo-group-tool/` |
| **Rename News Channels**        | `Brand existing environment` mode → tab strip next to "Branding" | `staffbase-news-tool/` |

Both new sub-views reuse Replify's existing per-environment Basic-auth token
and the Supabase Gemini proxy — no new credentials, no new endpoints.

---

## Load in Chrome (no build step required)

`dist/` is pre-built and committed.

1. `chrome://extensions` → enable **Developer mode** (top right).
2. **Load unpacked** → pick the `dist/` folder inside this directory.
3. Click the Replify icon (or open the side panel) on a Staffbase tenant tab.

The extension is identical to upstream Replify in every other way — saved
tokens, branding, automation, etc. all behave as documented in `dist/info.md`.

---

## Rebuild after editing source

```bash
cd replify
nvm use            # or any Node >= 20 (built with v24.16.0)
npm install
npm run build      # writes ../dist/{main,vendor,rolldown-runtime}.js
```

Then **Reload** the extension at `chrome://extensions`.

---

## What changed vs. upstream Replify

All bolt-in additions are tagged with a comment so they're easy to grep:
`🎭`, `🪧`, `🪧 Bolt-in:`, `// Personas & Groups`, `// News channel rename`.

**5 new files** (none touch upstream files):
- `replify/src/utils/automationOperations/industryTemplates.ts`
- `replify/src/utils/automationOperations/personas.ts`
- `replify/src/utils/automationOperations/newsChannelRename.ts`
- `replify/src/components/PersonasForm.tsx`
- `replify/src/components/NewsChannelRenameForm.tsx`

**4 surgical edits** in existing files:
- `replify/src/App.tsx` — 2 component imports, `existingView` state, 2 sub-view render blocks, 1 "Personas & Groups" selection button
- `replify/src/utils/automationOperations/index.ts` — 8 new ops registered in
  `OPERATION_REGISTRY` and `getOperationDescriptions()` so the Ask-Gemini
  overlay can also invoke them by name

Diff vs upstream is small enough to rebase if upstream Replify changes.

---

## Staffbase API quirks worth knowing

Both ports preserve the originals' fragile bits:

| Endpoint | Quirk |
| --- | --- |
| `PATCH /api/users/{id}` (for `system_manager`) | Requires `Accept: application/vnd.staffbase.accessors.user.v3+json` and `Content-Type: application/vnd.staffbase.accessors.user-update.v1+json`. Without both, the field is silently dropped. |
| `POST /api/groups/{id}/users` | Body is a raw JSON array `["uid1","uid2"]`, NOT `{user_ids:[...]}`. |
| News channel rename | Use `links.update.method` + `links.update.href` from the channel GET response. Don't hardcode POST vs PUT. |
| `PUT /api/posts/{id}` | Always include the original `contents` field, otherwise the post body gets wiped. |

---

## Source provenance

- Upstream: `replify-main` (internal Solutions tool)
- Personas & Groups: ported from `staffbase-demo-group-tool/app.py` in this same repo
- Channel rename + date redistribution: ported from `staffbase-news-tool/app.py` in this same repo
