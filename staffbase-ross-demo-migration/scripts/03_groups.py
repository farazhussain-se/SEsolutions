"""Phase 3 — Audience groups: rewire 3 conditional, rename 5 community, create 4 conditional + 1 enum."""
import json, os, time
from _common import get, post, put

CONTENT_DIR = os.path.join(os.path.dirname(__file__), "..", "content")
with open(os.path.join(CONTENT_DIR, "groups.json")) as f:
    PLAN = json.load(f)


def main():
    groups = get("/branch/groups").get("data", [])
    by_name_stripped = {g["name"].strip(): g for g in groups}

    # ---- 3.1 Rewire region conditional groups ----
    print("=== 3.1 Rewire region conditional groups ===")
    for entry in PLAN["region_rewires"]:
        g = by_name_stripped.get(entry["original_name"])
        if not g:
            print(f"  ⚠ NOT FOUND: {entry['original_name']}"); continue
        body = {
            "name": entry["new_name"],
            "config": {
                "localization": {
                    "en_US": {"title": entry["new_name"]},
                    "de_DE": {"title": entry["new_name"]},
                },
                "showInOverview": g.get("config", {}).get("showInOverview", True),
            },
            "conditions": [{"tags": [entry["tag"]]}],
        }
        s, _ = put(f"/groups/{g['id']}", body)
        print(f"  {entry['original_name']!r:<42} → {entry['new_name']!r}: {s}")

    # ---- 3.2 Rename community groups ----
    print("\n=== 3.2 Rename community groups ===")
    for entry in PLAN["community_renames"]:
        g = by_name_stripped.get(entry["original_name"])
        if not g:
            print(f"  ⚠ NOT FOUND: {entry['original_name']}"); continue
        body = {
            "name": entry["new_name"],
            "config": {
                "localization": {
                    "en_US": {"title": entry["new_name"]},
                    "de_DE": {"title": entry["new_name"]},
                },
                "showInOverview": g.get("config", {}).get("showInOverview", True),
            },
        }
        s, _ = put(f"/groups/{g['id']}", body)
        print(f"  {entry['original_name']!r:<46} → {entry['new_name']!r}: {s}")

    # ---- 3.3 Create new conditional + enum groups ----
    print("\n=== 3.3 Create new conditional + enum groups ===")
    for entry in PLAN["new_groups"]:
        body = {
            "name": entry["name"],
            "type": entry["type"],
            "config": {
                "localization": {
                    "en_US": {"title": entry["name"]},
                    "de_DE": {"title": entry["name"]},
                },
                "showInOverview": True,
            },
        }
        if entry.get("tag"):
            body["conditions"] = [{"tags": [entry["tag"]]}]
        s, _ = post("/groups", body)
        print(f"  POST {entry['name']!r}: {s}")

    time.sleep(3)
    final = get("/branch/groups").get("data", [])
    print(f"\n=== Final ({len(final)} groups) ===")
    for g in sorted(final, key=lambda x: (x.get("type", ""), x.get("name", ""))):
        n = g.get("users", {}).get("total", "?")
        tags = sum([c.get("tags", []) for c in g.get("conditions", [])], [])
        tail = f" tags={tags}" if tags else ""
        print(f"  [{g.get('type'):<11}] {n!s:>2} users | {g.get('name'):<40}{tail}")


if __name__ == "__main__":
    main()
