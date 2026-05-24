"""Phase 1 — Profile fields.

Creates 7 Ross custom fields, sets yieldsTags on region+costCenter, localizes 3 system titles.

Gotchas applied:
  - POST defaults to readOnly=true → must set readOnly:false explicitly
  - Re-fetch + ensure readOnly is false after create
"""
from _common import get, post, put

ROSS_FIELDS = [
    # (slug,         title,            filterable, searchable, yieldsTags)
    ("storeNumber",   "Store Number",   True,  True,  False),
    ("district",      "District",       True,  True,  False),
    ("region",        "Region",         True,  True,  True),    # drives Region conditional groups
    ("costCenter",    "Cost Center",    True,  True,  True),    # drives cost-center conditional groups
    ("associateRole", "Associate Role", True,  True,  False),
    ("homeStore",     "Home Store",     False, False, False),
    ("hireDate",      "Hire Date",      False, False, False),
]

SYSTEM_RETITLES = [
    ("department", "Department / Function"),
    ("location",   "Store / Site"),
    ("position",   "Role Title"),
]


def main():
    schema = get("/branch/profilefields").get("schema", {})

    print("=== 1.1 Create 7 Ross custom fields ===")
    for slug, title, filt, srch, yt in ROSS_FIELDS:
        if slug in schema:
            existing = schema[slug]
            if yt and not existing.get("yieldsTags"):
                f = dict(existing); f["yieldsTags"] = True
                s, _ = put(f"/branch/profilefields/{slug}", f)
                print(f"  {slug}: exists; toggled yieldsTags=true → {s}")
            else:
                print(f"  {slug}: exists, skip")
            continue
        body = {
            "slug": slug, "format": "simpleString", "type": "string",
            "localization": {"en_US": {"title": title}},
            "visible": True, "optional": True,
            "filterable": filt, "searchable": srch,
            "readOnly": False,   # ⚠ critical — defaults to true otherwise
            "internal": False,
            "yieldsTags": yt,
            "filterableInSurveys": False, "primary": False,
        }
        s, _ = post("/branch/profilefields", body)
        print(f"  POST {slug} (yieldsTags={yt}): {s}")

    # Re-fetch + ensure readOnly=false on all 7
    schema = get("/branch/profilefields").get("schema", {})
    print("\n=== 1.2 Ensure readOnly=false on all created fields ===")
    for slug, *_ in ROSS_FIELDS:
        if schema.get(slug, {}).get("readOnly"):
            f = dict(schema[slug]); f["readOnly"] = False
            s, _ = put(f"/branch/profilefields/{slug}", f)
            print(f"  fix readOnly→false on {slug}: {s}")

    print("\n=== 1.3 Localize 3 system field titles ===")
    for slug, new_title in SYSTEM_RETITLES:
        schema = get("/branch/profilefields").get("schema", {})
        f = dict(schema[slug])
        f["localization"] = dict(f.get("localization", {}))
        f["localization"]["en_US"] = dict(f["localization"].get("en_US", {}))
        f["localization"]["en_US"]["title"] = new_title
        s, _ = put(f"/branch/profilefields/{slug}", f)
        print(f"  {slug} → {new_title!r}: {s}")

    # Final verify
    schema = get("/branch/profilefields").get("schema", {})
    print("\n=== Final verification ===")
    for slug, title, _, _, yt in ROSS_FIELDS:
        f = schema.get(slug, {})
        ok = f and not f.get("readOnly") and f.get("yieldsTags") == yt
        mark = "✓" if ok else "✗"
        en = f.get("localization", {}).get("en_US", {}).get("title")
        print(f"  {mark} {slug:<14} readOnly={f.get('readOnly')} yieldsTags={f.get('yieldsTags')} title={en!r}")


if __name__ == "__main__":
    main()
