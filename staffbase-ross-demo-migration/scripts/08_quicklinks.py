"""Phase 8 — Add 7 Ross resource links to desktop + mobile."""
import json, os
from _common import get, post

CONTENT_DIR = os.path.join(os.path.dirname(__file__), "..", "content")
with open(os.path.join(CONTENT_DIR, "quicklinks.json")) as f:
    LINKS = json.load(f)


def main():
    ok = err = 0
    for platform in ("desktop", "mobile"):
        for prio, link in enumerate(LINKS, start=10):
            body = {
                "platform": platform,
                "localization": {"en_US": {"name": link["name"]}, "de_DE": {"name": link["name"]}},
                "link":     link["url"],
                "icon":     link.get("icon", ""),
                "priority": prio,
                "enforceNewWindow": True,
                "showIosNavBar":    True,
                "visibleInPublicArea": False,
            }
            s, _ = post("/branch/quicklinks", body)
            if s in (200, 201): ok += 1
            else: err += 1
    print(f"Quick links: {ok} ok, {err} err")

    for plat in ("desktop", "mobile"):
        d = get(f"/branch/quicklinks?platform={plat}").get("data", [])
        print(f"  {plat}: {len(d)} links")


if __name__ == "__main__":
    main()
