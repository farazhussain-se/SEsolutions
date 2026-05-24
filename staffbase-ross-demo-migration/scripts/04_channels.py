"""Phase 4 — rename 9 channels (5 kept as-is)."""
import json, os
from _common import get, post

CONTENT_DIR = os.path.join(os.path.dirname(__file__), "..", "content")
with open(os.path.join(CONTENT_DIR, "channels.json")) as f:
    RENAMES = json.load(f)  # {old_title: new_title}


def main():
    chs = get("/channels?limit=100").get("data", [])
    by_title = {c.get("config",{}).get("localization",{}).get("en_US",{}).get("title"): c for c in chs}

    for old, new in RENAMES.items():
        ch = by_title.get(old)
        if not ch:
            print(f"  ⚠ NOT FOUND: {old}"); continue
        config = json.loads(json.dumps(ch.get("config", {})))
        config.setdefault("localization", {})
        config["localization"]["en_US"] = dict(config["localization"].get("en_US", {}))
        config["localization"]["en_US"]["title"] = new
        if "de_DE" in config["localization"]:
            config["localization"]["de_DE"] = dict(config["localization"]["de_DE"])
            config["localization"]["de_DE"]["title"] = new
        body = {
            "config": config,
            "spaceID": ch.get("spaceID"),
            "availableInPublicArea": ch.get("availableInPublicArea", True),
            "visibleInPublicArea":  ch.get("visibleInPublicArea", False),
        }
        s, _ = post(f"/installations/{ch['id']}", body)
        print(f"  {old!r:<28} → {new!r:<30} : {s}")

    print("\n=== Final ===")
    chs2 = get("/channels?limit=100").get("data", [])
    for c in chs2:
        t = c.get("config",{}).get("localization",{}).get("en_US",{}).get("title")
        print(f"  {c['id']} | {t!r}")


if __name__ == "__main__":
    main()
