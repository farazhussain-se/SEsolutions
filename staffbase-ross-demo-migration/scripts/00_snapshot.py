"""Phase 0 — snapshot every major surface to /tmp/ross-migration/snapshots/<timestamp>/

Read-only. Run first; subsequent scripts may read from here for content matching + rollback.
"""
import os, json, time
from _common import get, BASE

TS = time.strftime("%Y%m%d_%H%M%S")
OUT = f"/tmp/ross-migration/snapshots/{TS}"
os.makedirs(OUT, exist_ok=True)
print(f"Snapshot → {OUT}\nBASE = {BASE}\n")

ENDPOINTS = [
    "/branch",
    "/branch/profilefields",
    "/branch/groups",
    "/spaces",
    "/channels?limit=100",
    "/posts?limit=500",
    "/pages?limit=500",
    "/users?limit=500",
    "/campaigns?limit=50",
    "/branch/quicklinks?platform=desktop",
    "/branch/quicklinks?platform=mobile",
    "/installations?limit=200",
    "/profiles/search?limit=10",
]

for ep in ENDPOINTS:
    fn = ep.lstrip("/").replace("/", "_").replace("?", "_").replace("=", "_").replace("&", "_")
    try:
        d = get(ep)
        with open(f"{OUT}/{fn}.json", "w") as f:
            json.dump(d, f, indent=2)
        size = os.path.getsize(f"{OUT}/{fn}.json")
        n = len(d.get("data", [])) if isinstance(d, dict) and "data" in d else "n/a"
        print(f"  ✓ {ep:<45} size={size:>9,}  data_len={n}")
    except Exception as e:
        print(f"  ✗ {ep}: {e}")

# Also pull scheduled posts (excluded from /posts default)
posts = json.load(open(f"{OUT}/posts_limit_500.json"))
visible_ids = {p["id"] for p in posts.get("data", [])}
# A wider /posts pull wouldn't help — scheduled posts are excluded. If you have the prior snapshot,
# iterate those IDs against /posts/{id} to capture scheduled ones.

# Write a manifest
manifest = {"timestamp": TS, "base": BASE, "endpoints": ENDPOINTS}
with open(f"{OUT}/_manifest.json", "w") as f:
    json.dump(manifest, f, indent=2)

print(f"\nDone. Snapshot saved to: {OUT}")
print(f"Symlink: ln -sfn {OUT} /tmp/ross-migration/latest")
os.makedirs("/tmp/ross-migration", exist_ok=True)
latest = "/tmp/ross-migration/latest"
if os.path.islink(latest) or os.path.exists(latest):
    os.remove(latest)
os.symlink(OUT, latest)
