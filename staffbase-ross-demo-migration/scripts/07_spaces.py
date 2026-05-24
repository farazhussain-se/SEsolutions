"""Phase 7 — rename 3 spaces.

Critical: body must be {"name": "...", "sections": [...]}. Do NOT include "branchID" (capital ID — rejected).
Omitting "sections" wipes them.
"""
from _common import get, put

RENAMES = {
    "All employees":     "All Associates",
    "Communities Space": "Ross Community",
    "Help Space":        "Associate Help Center",
}


def main():
    spaces = get("/spaces").get("data", [])
    for sp in spaces:
        if sp["name"] in RENAMES:
            new_name = RENAMES[sp["name"]]
            body = {"name": new_name, "sections": sp.get("sections", ["APP_INTRANET", "EMAIL"])}
            s, _ = put(f"/spaces/{sp['id']}", body)
            print(f"  {sp['name']!r} → {new_name!r}: {s}")

    print("\n=== Final ===")
    for sp in get("/spaces").get("data", []):
        print(f"  {sp['id']} | {sp['name']!r}  sections={sp.get('sections')}")


if __name__ == "__main__":
    main()
