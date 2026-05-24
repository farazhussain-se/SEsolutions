"""Shared helpers — read STAFFBASE_BASE + STAFFBASE_TOKEN from env, provide req() / get() / post() / put() / patch() / delete()."""
import json, os, urllib.request, urllib.error, sys

BASE  = os.environ.get("STAFFBASE_BASE")
TOKEN = os.environ.get("STAFFBASE_TOKEN")

if not BASE or not TOKEN:
    print("ERROR: set STAFFBASE_BASE and STAFFBASE_TOKEN env vars before running.", file=sys.stderr)
    print("  export STAFFBASE_BASE='https://<host>.staffbase.rocks/api'", file=sys.stderr)
    print("  export STAFFBASE_TOKEN='<basic-auth-token>'", file=sys.stderr)
    sys.exit(2)

V3_HEADERS = {
    "Accept":       "application/vnd.staffbase.accessors.user.v3+json",
    "Content-Type": "application/vnd.staffbase.accessors.user-update.v1+json",
}

def req(method, path, body=None, extra_headers=None):
    """Generic HTTP. Returns (status_code, body_string)."""
    headers = {
        "Authorization": f"Basic {TOKEN}",
        "User-Agent":    "curl/8.4.0",   # Cloudflare blocks default Python UA
        "Content-Type":  "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{BASE}{path}", data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def get(path, extra_headers=None):
    s, b = req("GET", path, extra_headers=extra_headers)
    return json.loads(b) if b else {}

def post(path, body, extra_headers=None):
    return req("POST", path, body, extra_headers)

def put(path, body, extra_headers=None):
    return req("PUT", path, body, extra_headers)

def patch(path, body, extra_headers=None):
    return req("PATCH", path, body, extra_headers)

def delete(path):
    return req("DELETE", path)

# Snapshot dir helper (for scripts that read from snapshot)
def snapshot_dir():
    """Return path to most recent snapshot dir, or None."""
    import os
    base = "/tmp/ross-migration/snapshots"
    if not os.path.isdir(base):
        return None
    subs = sorted(os.listdir(base))
    return os.path.join(base, subs[-1]) if subs else None
