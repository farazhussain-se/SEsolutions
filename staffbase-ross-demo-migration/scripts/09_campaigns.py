"""Phase 9 — Create 6 themed campaigns + reference all 45 posts.

Critical: reference body is {"sourceId": "<postID>", "sourceType": "POST"}.
Scheduled posts are hidden from GET /posts — iterate snapshot IDs to catch them.
"""
import json, os
from _common import get, post, snapshot_dir

CONTENT_DIR = os.path.join(os.path.dirname(__file__), "..", "content")
with open(os.path.join(CONTENT_DIR, "campaigns.json")) as f:
    PLAN = json.load(f)  # {campaigns: [{title, goal, startAt, endAt, color}], assignments: {camp_title: [substrings]}}


def main():
    # Create campaigns
    created = {}
    print("=== Create 6 campaigns ===")
    for c in PLAN["campaigns"]:
        s, body = post("/campaigns", c)
        if s in (200, 201):
            cid = json.loads(body)["id"]
            created[c["title"]] = cid
            print(f"  ✓ {c['title']}  [{c['startAt'][:10]} → {c['endAt'][:10]}]")
        else:
            print(f"  ✗ {c['title']}: {s} {body[:200]}")

    # Pull ALL posts (including scheduled — they're excluded from default /posts)
    snap = snapshot_dir()
    if not snap:
        print("ERROR: no snapshot for scheduled post IDs"); return
    all_ids = [p["id"] for p in json.load(open(f"{snap}/posts_limit_500.json")).get("data", [])]

    title_to_post = {}
    for pid in all_ids:
        p = get(f"/posts/{pid}")
        title_to_post[p.get("contents",{}).get("en_US",{}).get("title","")] = p

    # Also add posts that were created AFTER the snapshot (shouldn't apply here but safe to handle)
    for p in get("/posts?limit=500").get("data", []):
        t = p.get("contents",{}).get("en_US",{}).get("title","")
        if t and t not in title_to_post:
            title_to_post[t] = p

    print(f"\n  Matched {len(title_to_post)} posts (visible + scheduled)")

    print("\n=== Reference posts to campaigns ===")
    ok = err = unmatched = 0
    for camp_title, substrs in PLAN["assignments"].items():
        cid = created.get(camp_title)
        if not cid:
            print(f"  ⚠ campaign not created: {camp_title}"); continue
        for sub in substrs:
            match = None
            for t, p in title_to_post.items():
                if sub.lower() in t.lower():
                    match = p; break
            if not match:
                print(f"  ⚠ no post matches substr {sub!r} for {camp_title}"); unmatched += 1; continue
            s, resp = post(f"/campaigns/{cid}/references",
                           {"sourceId": match["id"], "sourceType": "POST"})
            if s in (200, 201): ok += 1
            else: err += 1; print(f"  ✗ ref {sub!r} → {camp_title}: {s} {resp[:150]}")

    print(f"\n  References: {ok} ok / {err} err / {unmatched} unmatched")

    # Final report
    total = 0
    print("\n=== Final ===")
    for c in get("/campaigns?limit=50").get("data", []):
        refs = get(f"/campaigns/{c['id']}/references?limit=200").get("data", [])
        total += len(refs)
        print(f"  {c['title']:<45} refs={len(refs)}")
    print(f"\n  Total references: {total}")


if __name__ == "__main__":
    main()
