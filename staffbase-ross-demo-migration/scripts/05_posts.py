"""Phase 5 — rewrite all 45 posts with Ross-context titles, content, teasers, and demo-week dates.

Reads content from ../content/posts.json (structured per-channel content bank).

Critical: include image/feedImage/video in PUT to avoid wiping (gotcha #5).
"""
import json, os
from _common import get, put

CONTENT_DIR = os.path.join(os.path.dirname(__file__), "..", "content")
with open(os.path.join(CONTENT_DIR, "posts.json")) as f:
    BANK = json.load(f)  # {channel_title: [ {title, teaser, published, content}, ... ] }


def main():
    chs = get("/channels?limit=100").get("data", [])
    ch_id_by_title = {c.get("config",{}).get("localization",{}).get("en_US",{}).get("title"): c["id"] for c in chs}

    # Group posts by channel
    posts = get("/posts?limit=500").get("data", [])
    from collections import defaultdict
    by_ch = defaultdict(list)
    for p in posts:
        by_ch[p["channelID"]].append(p)
    for cid in by_ch:
        by_ch[cid].sort(key=lambda x: x["id"])  # deterministic ordering

    ok = err = 0
    print(f"Rewriting {len(posts)} posts across {len(by_ch)} channels...\n")
    for ch_title, items in BANK.items():
        cid = ch_id_by_title.get(ch_title)
        if not cid:
            print(f"  ⚠ no channel for {ch_title!r}, skipping bank entries"); continue
        channel_posts = by_ch.get(cid, [])
        for i, item in enumerate(items):
            if i >= len(channel_posts):
                print(f"  ! more bank entries than posts in {ch_title!r} ({len(items)} bank vs {len(channel_posts)} posts)")
                break
            post = channel_posts[i]
            cur_en = post.get("contents", {}).get("en_US", {})
            new_contents = {
                "title":   item["title"],
                "content": item["content"],
                "teaser":  item["teaser"],
            }
            # Preserve image/feedImage/video from existing
            for k in ("image", "feedImage", "video"):
                if cur_en.get(k):
                    new_contents[k] = cur_en[k]
            body = {
                "contents":  {"en_US": new_contents},
                "channelID": cid,
                "published": item["published"],
                "planned":   item["published"],
            }
            s, resp = put(f"/posts/{post['id']}", body)
            if s in (200, 202, 204):
                ok += 1
            else:
                err += 1
                print(f"  ✗ {post['id'][:8]}: {s} {resp[:150]}")

    print(f"\nDone: {ok} ok, {err} err")


if __name__ == "__main__":
    main()
