"""Phase 2 — Seed Ross user data on all 31 non-system users.

Steps:
  2.1  v3 PATCH each user with Ross profile fields
  2.2  Sentinel-flip region+costCenter to force tag emission (yieldsTags trick)
  2.3  POST /users/{id} to force search-index reindex (Studio User Export fix)
  2.4  Polish — profileHeadline ("{role} • {site}") + publicEmailAddress (firstname.lastname@ross.com)
  2.5  POST-touch again to reindex headlines/emails

Reads assignment table from ../content/users.json.
"""
import json, os, re, time
from _common import get, post, patch, V3_HEADERS

# Load assignment table
CONTENT_DIR = os.path.join(os.path.dirname(__file__), "..", "content")
with open(os.path.join(CONTENT_DIR, "users.json")) as f:
    ASSIGNMENTS = json.load(f)  # name → dict of fields

SKIP_NAMES = {"Staffbase Support User", "Mirella Temp"}


def email_slug(s):
    s = (s or "").lower()
    for de, en in [("ü","u"),("ä","a"),("ö","o"),("ß","ss"),("é","e"),("è","e")]:
        s = s.replace(de, en)
    return re.sub(r"[^a-z]+", "", s)


def site_descriptor(p):
    cc = p.get("costCenter") or ""
    loc = (p.get("location") or "").split(",")[0].strip()
    sn = p.get("storeNumber") or ""
    if cc == "Store":
        return f"Ross {sn} • {loc}" if sn else f"Ross {loc}"
    if cc == "DC":     return f"{loc} DC"
    if cc == "HQ":     return "Ross Home Office"
    if cc == "Buying": return f"Buying Office • {loc}"
    return loc or "Ross"


def main():
    users = get("/users?limit=500").get("data", [])
    name_to_id = {f"{u.get('firstName','')} {u.get('lastName','')}".strip(): u["id"] for u in users}

    # ---- 2.1 PATCH profile data ----
    print(f"=== 2.1 PATCH profile data on {len(ASSIGNMENTS)} users ===")
    ok = err = 0
    for name, data in ASSIGNMENTS.items():
        uid = name_to_id.get(name)
        if not uid:
            print(f"  ⚠ no user named {name!r}"); err += 1; continue
        s, _ = patch(f"/users/{uid}", {"profile": data}, V3_HEADERS)
        if s in (200, 204): ok += 1
        else: err += 1; print(f"  ✗ {name}: HTTP {s}")
    print(f"  → {ok} ok / {err} err")

    # ---- 2.2 Sentinel-flip ----
    print("\n=== 2.2 Sentinel-flip region + costCenter (force tag emission) ===")
    ok = 0
    for name, data in ASSIGNMENTS.items():
        uid = name_to_id.get(name)
        if not uid: continue
        region = data.get("region", "")
        cc = data.get("costCenter", "")
        patch(f"/users/{uid}", {"profile": {"region": region + "_X", "costCenter": cc + "_X"}}, V3_HEADERS)
        s, _ = patch(f"/users/{uid}", {"profile": {"region": region, "costCenter": cc}}, V3_HEADERS)
        if s in (200, 204): ok += 1
    print(f"  → {ok} sentinel-flipped")

    # ---- 2.3 POST-touch to force search index reindex ----
    print("\n=== 2.3 POST /users/{id} (no-op) — force search-index reindex ===")
    ok = 0
    for name in ASSIGNMENTS:
        uid = name_to_id.get(name)
        if not uid: continue
        fn = name.split()[0]
        s, _ = post(f"/users/{uid}", {"firstName": fn})
        if s == 200: ok += 1
    print(f"  → {ok} touched")

    time.sleep(5)
    idx = get("/profiles/search?limit=10")
    print(f"  /profiles/search total = {idx.get('total')}")

    # ---- 2.4 Polish: profileHeadline + @ross.com email ----
    print("\n=== 2.4 profileHeadline + @ross.com email ===")
    ok = 0
    users_now = get("/users?limit=500").get("data", [])
    for u in users_now:
        full = f"{u.get('firstName','')} {u.get('lastName','')}".strip()
        if full in SKIP_NAMES or full not in ASSIGNMENTS: continue
        p = u.get("profile", {})
        position = p.get("position") or p.get("associateRole") or ""
        site = site_descriptor(p)
        headline = f"{position} • {site}"
        if len(headline) > 70:
            if "•" in site and p.get("costCenter") == "Store" and p.get("storeNumber"):
                site_short = f"Ross {site.split('•',1)[1].strip()}"
                headline = f"{position} • {site_short}"
            if len(headline) > 70:
                headline = headline[:67] + "..."
        fn, ln = u.get("firstName",""), u.get("lastName","")
        email = f"{email_slug(fn)}.{email_slug(ln)}@ross.com"
        s, _ = patch(f"/users/{u['id']}",
                     {"profile": {"profileHeadline": headline, "publicEmailAddress": email}},
                     V3_HEADERS)
        if s in (200, 204): ok += 1
    print(f"  → {ok} polished")

    # ---- 2.5 POST-touch again to reindex headlines/emails ----
    print("\n=== 2.5 Re-touch for final reindex ===")
    for u in users_now:
        full = f"{u.get('firstName','')} {u.get('lastName','')}".strip()
        if full in SKIP_NAMES: continue
        post(f"/users/{u['id']}", {"firstName": u.get("firstName", "")})

    time.sleep(3)
    idx = get("/profiles/search?limit=10")
    print(f"\nFinal /profiles/search total = {idx.get('total')}")


if __name__ == "__main__":
    main()
