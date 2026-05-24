"""Phase 6 — pages: title-only renames + community/help full rewrites + 6 new AI reference pages.

Critical: for full rewrites use the snapshot's en_US source (it has all widgets and is English-clean).
Apply targeted text replacements for any page that still has German prose.
"""
import json, os, re
from _common import get, post, put, snapshot_dir

CONTENT_DIR = os.path.join(os.path.dirname(__file__), "..", "content")
with open(os.path.join(CONTENT_DIR, "pages.json")) as f:
    PLAN = json.load(f)


def main():
    snap = snapshot_dir()
    if not snap:
        print("ERROR: no snapshot found. Run 00_snapshot.py first."); return
    snap_pages = json.load(open(f"{snap}/pages_limit_500.json")).get("data", [])

    # Map title → snapshot page (any locale)
    title_to_snap = {}
    for p in snap_pages:
        for loc, c in (p.get("contents") or {}).items():
            t = c.get("title")
            if t and t not in title_to_snap:
                title_to_snap[t] = p

    # Spaces (for new pages we need spaceId for "All Associates" or whatever it ended up named)
    spaces = get("/spaces").get("data", [])
    sp_id = None
    for s in spaces:
        if s["name"] in ("All Associates", "All employees"):
            sp_id = s["id"]; break

    # ---- Bucket A: title-only renames ----
    print("=== Bucket A: title-only renames (preserve content) ===")
    ok = err = 0
    for entry in PLAN["title_only"]:
        snap_p = title_to_snap.get(entry["original_title"])
        if not snap_p:
            print(f"  ⚠ NOT FOUND in snapshot: {entry['original_title']}"); err+=1; continue
        live = get(f"/pages/{snap_p['id']}")
        body = {
            "contents": {"en_US": {"title": entry["new_title"], "content": live.get("contents",{}).get("en_US",{}).get("content","")}},
            "spaceId":  live.get("spaceId"),
            "published": True,
            "readers":  live.get("readers"),
            "admins":   live.get("admins"),
            "owners":   live.get("owners"),
        }
        s, _ = put(f"/pages/{snap_p['id']}", body)
        if s in (200,202,204): ok+=1
        else: err+=1; print(f"  ✗ {entry['original_title']}: {s}")
    print(f"  → {ok} ok / {err} err")

    # ---- Bucket B: community + help full rewrites (use snapshot en_US source) ----
    print("\n=== Bucket B: community/help rewrites (snapshot en_US source preserves widgets) ===")
    def widget_count(html): return len(re.findall(r'<div[^>]+data-widget-', html or ""))
    ok = err = 0
    for entry in PLAN["full_rewrites"]:
        snap_p = title_to_snap.get(entry["original_title"])
        if not snap_p:
            print(f"  ⚠ NOT FOUND in snapshot: {entry['original_title']}"); err+=1; continue
        en_content = snap_p.get("contents",{}).get("en_US",{}).get("content","")
        de_content = snap_p.get("contents",{}).get("de_DE",{}).get("content","")
        chosen = en_content if widget_count(en_content) >= widget_count(de_content) else de_content
        # Apply any per-page text replacements (e.g. for Getting Started which has German prose even in en_US)
        for de, en in entry.get("replacements", []):
            chosen = chosen.replace(de, en)
        body = {
            "contents": {"en_US": {"title": entry["new_title"], "content": chosen}},
            "spaceId":   snap_p.get("spaceId"),
            "published": True,
            "readers":   snap_p.get("readers"),
            "admins":    snap_p.get("admins"),
            "owners":    snap_p.get("owners"),
        }
        s, _ = put(f"/pages/{snap_p['id']}", body)
        if s in (200,202,204): ok+=1
        else: err+=1; print(f"  ✗ {entry['original_title']}: {s}")
    print(f"  → {ok} ok / {err} err")

    # ---- Bucket C: 6 new AI reference pages ----
    print("\n=== Bucket C: create 6 new AI reference pages in All Associates ===")
    ok = err = 0
    for page in PLAN["new_pages"]:
        body = {
            "spaceId": sp_id,
            "published": True,
            "contents": {"en_US": {"title": page["title"], "content": page["content"]}},
            "readers": {"branchAccess": True},
        }
        s, resp = post("/pages", body)
        if s in (200, 201):
            ok += 1
            new_id = (json.loads(resp).get("id") if resp.startswith("{") else "?")
            print(f"  ✓ {page['title']!r:<46} → {new_id}")
        else:
            err += 1; print(f"  ✗ {page['title']}: {s} {resp[:150]}")
    print(f"  → {ok} ok / {err} err")


if __name__ == "__main__":
    main()
