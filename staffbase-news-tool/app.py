#!/usr/bin/env python3
"""
Staffbase News Demo Tool

Pulls all news channels and posts from a Staffbase instance, lets the user pick
a "demo date" and target industry, then:
  1. Spreads the existing posts' publication dates realistically around the
     demo date (heavy weighting toward the last week, fewer older).
  2. Renames channels (best-effort) to industry-appropriate names.

Mirrors the structure of staffbase-demo-group-tool: Flask + 4-step wizard,
preset auth via X-SB-Base / X-SB-Token headers, snapshot-based rollback.
"""

import os, json, time, random, warnings
from io import BytesIO
from pathlib import Path
from datetime import datetime, timedelta, timezone
import requests as http
from flask import Flask, render_template, request, jsonify

SNAPSHOT_DIR = Path(__file__).parent / "snapshots"
SNAPSHOT_DIR.mkdir(exist_ok=True)

warnings.filterwarnings("ignore")

app = Flask(__name__)

# ── Default Config (overridden per-request via X-SB-Base / X-SB-Token headers) ──
DEFAULT_BASE  = "https://strykerdemo.staffbase.rocks/api"
DEFAULT_TOKEN = ""  # paste in Settings panel — kept blank in source

# Known instance presets surfaced in the Settings panel. The token must be
# supplied by the user — we never ship customer tokens in source.
PRESETS = [
    {"key": "stryker",    "label": "Stryker Demo",  "base": "https://strykerdemo.staffbase.rocks/api",   "sub": "Healthcare / MedTech demo"},
    {"key": "faraz-test", "label": "faraz-test",    "base": "https://faraz-test.staffbase.com/api",      "sub": "Personal test instance"},
]


def get_creds():
    """Read per-request Staffbase credentials from headers, fall back to defaults."""
    base  = request.headers.get("X-SB-Base",  DEFAULT_BASE).rstrip("/")
    token = request.headers.get("X-SB-Token", DEFAULT_TOKEN)
    hdrs  = {"Authorization": f"Basic {token}", "Content-Type": "application/json"}
    return base, hdrs


# ── Industry channel templates ────────────────────────────────────────────────
# These drive Step 3's channel-rename suggestions. We map existing channels
# onto a curated set of industry-appropriate channel names + descriptions.
# The user can re-order or override before applying.
INDUSTRIES = {
    "healthcare": {
        "label": "Healthcare",
        "channels": [
            ("Patient Safety & Quality",   "Patient safety initiatives, incident reports, and quality improvement updates."),
            ("Clinical Bulletins",         "Clinical guidelines, protocols, and announcements for care teams."),
            ("Shift Notifications",        "Real-time shift updates, scheduling changes, and urgent communications."),
            ("HR & Wellbeing",             "HR news, benefits, and employee wellness programs."),
            ("Employee Recognition",       "Team achievements, years of service, and exceptional care stories."),
            ("Leadership Forum",           "Strategic updates from clinical and administrative leadership."),
            ("Training & Compliance",      "Continuing education, certifications, and mandatory training."),
            ("Community & Outreach",       "Community health initiatives and volunteer opportunities."),
        ],
    },
    "medtech": {
        "label": "MedTech / Medical Devices",
        "channels": [
            ("Product & Innovation",       "Product launches, R&D milestones, and innovation pipeline updates."),
            ("Quality & Regulatory",       "FDA, MDR, ISO updates, audit notices, and regulatory compliance."),
            ("Field & Sales Bulletins",    "Customer wins, sales enablement, and field team updates."),
            ("Operations & Supply Chain",  "Manufacturing operations, supply chain, and production updates."),
            ("Safety & Recalls",           "Safety alerts, recalls, and post-market surveillance updates."),
            ("HR & Benefits",              "HR policies, benefits, and employee programs."),
            ("Leadership & Strategy",      "Updates from executive leadership and strategic initiatives."),
            ("Employee Recognition",       "Spotlights, milestones, and team achievements."),
        ],
    },
    "manufacturing": {
        "label": "Manufacturing",
        "channels": [
            ("Safety First",               "Safety alerts, incident reports, and H&S protocols for plant staff."),
            ("Production Updates",         "Daily production targets, line updates, and operational announcements."),
            ("Quality & Compliance",       "Quality control updates, audit notices, and compliance requirements."),
            ("Shift Bulletin",             "Shift handover notes, schedule changes, and time-sensitive updates."),
            ("Employee Recognition",       "Safety milestones, performance awards, and team achievements."),
            ("Training & Compliance",      "Mandatory training, certifications, and skills development programs."),
            ("Sustainability",             "Environmental initiatives and sustainability goals."),
            ("HR & Benefits",              "HR policies, payroll updates, benefits, and employee programs."),
        ],
    },
    "retail": {
        "label": "Retail",
        "channels": [
            ("Store Operations",           "Operational guidelines, store standards, and procedural updates."),
            ("Customer Experience",        "Customer service standards, feedback, and guest experience."),
            ("Sales & Promotions",         "Current promotions, sales targets, and campaign launches."),
            ("Schedule & Shift",           "Roster updates, shift swaps, and scheduling communications."),
            ("Employee Recognition",       "Top performers, years of service, and team achievements."),
            ("Product & Training",         "Product knowledge, brand training, and seasonal collection briefings."),
            ("Community & Social",         "Community events, social responsibility, and team activities."),
            ("HR & Benefits",              "HR updates, benefits enrollment, and employee programs."),
        ],
    },
    "finance": {
        "label": "Finance & Banking",
        "channels": [
            ("Market & Economic Update",   "Daily market briefings and economic insights."),
            ("Compliance & Risk",          "Regulatory updates, compliance alerts, and risk advisories."),
            ("Client Wins",                "Deal wins, client stories, and relationship milestones."),
            ("Branch Operations",          "Branch updates, operational changes, and procedural guidance."),
            ("Employee Recognition",       "Awards, milestones, and team achievements."),
            ("Training & Certifications",  "Required training, certification renewals, and learning paths."),
            ("Leadership Forum",           "Updates from executive leadership and strategic priorities."),
            ("HR & Benefits",              "HR updates, benefits, and people programs."),
        ],
    },
    "tech": {
        "label": "Technology",
        "channels": [
            ("Product Updates",            "Product launches, roadmap, and release announcements."),
            ("Engineering Bulletins",      "Engineering org updates, postmortems, and architecture notes."),
            ("Customer Stories",           "Customer wins, case studies, and reference highlights."),
            ("Company All-Hands",          "Updates from leadership and company-wide announcements."),
            ("Employee Recognition",       "Shout-outs, milestones, and team wins."),
            ("Learning & Growth",          "Training, certifications, and growth opportunities."),
            ("Culture & Connection",       "Culture, ERGs, social events, and connection moments."),
            ("People & Benefits",          "HR updates, benefits, and people operations news."),
        ],
    },
    "energy": {
        "label": "Energy & Utilities",
        "channels": [
            ("Safety First",               "Safety alerts, incident reports, and field safety protocols."),
            ("Operations & Reliability",   "Grid, plant, and field operations updates."),
            ("Environment & Sustainability","Environmental compliance and sustainability initiatives."),
            ("Compliance & Regulatory",    "Regulatory updates and compliance requirements."),
            ("Customer & Community",       "Customer service updates and community engagement."),
            ("Training & Certification",   "Mandatory training and certifications."),
            ("Employee Recognition",       "Safety milestones, awards, and team achievements."),
            ("HR & Benefits",              "HR policies, benefits, and people programs."),
        ],
    },
    "logistics": {
        "label": "Logistics & Transportation",
        "channels": [
            ("Safety First",               "Driver and warehouse safety alerts and protocols."),
            ("Route & Operations",         "Route updates, hub operations, and dispatch communications."),
            ("Fleet & Equipment",          "Fleet maintenance, equipment, and vehicle updates."),
            ("Customer & SLA",             "Customer updates, SLA performance, and key account news."),
            ("Employee Recognition",       "Safety milestones, awards, and team achievements."),
            ("Training & Compliance",      "Driver certifications, hours-of-service, and training."),
            ("Leadership Forum",           "Updates from leadership and strategic priorities."),
            ("HR & Benefits",              "HR updates, benefits, and employee programs."),
        ],
    },
    "generic": {
        "label": "Generic / Multi-industry",
        "channels": [
            ("Company News",               "Company-wide announcements and updates."),
            ("Leadership Forum",           "Updates from executive leadership."),
            ("HR & Benefits",              "HR policies, benefits, and people programs."),
            ("Employee Recognition",       "Shout-outs, milestones, and achievements."),
            ("Training & Development",     "Learning opportunities and development programs."),
            ("Customer Stories",           "Customer wins and case studies."),
            ("Culture & Events",           "Culture, social events, and connection moments."),
            ("Operations Updates",         "Operational announcements and guidance."),
        ],
    },
}


# ── Staffbase News API helpers ────────────────────────────────────────────────

def sb_get(base, hdrs, path, params=None):
    """GET helper — returns parsed JSON or raises with the response body."""
    r = http.get(f"{base}{path}", headers=hdrs, params=params, timeout=30)
    if r.status_code >= 400:
        raise RuntimeError(f"GET {path} → {r.status_code}: {r.text[:300]}")
    return r.json()


def sb_put(base, hdrs, path, body):
    r = http.put(f"{base}{path}", headers=hdrs, json=body, timeout=30)
    if r.status_code >= 400:
        raise RuntimeError(f"PUT {path} → {r.status_code}: {r.text[:300]}")
    return r.json() if r.text else {}


def sb_post(base, hdrs, path, body):
    r = http.post(f"{base}{path}", headers=hdrs, json=body, timeout=30)
    if r.status_code >= 400:
        raise RuntimeError(f"POST {path} → {r.status_code}: {r.text[:300]}")
    return r.json() if r.text else {}


def sb_request_url(hdrs, method, full_url, body=None):
    """Issue a request to an absolute URL (used to follow link relations)."""
    r = http.request(method, full_url, headers=hdrs, json=body, timeout=30)
    if r.status_code >= 400:
        raise RuntimeError(f"{method} {full_url} → {r.status_code}: {r.text[:300]}")
    return r.json() if r.text else {}


def list_all_channels(base, hdrs):
    """Pull every manageable channel via /branch/channels (cursor-based)."""
    out, cursor = [], None
    while True:
        params = {"limit": 100}
        if cursor:
            params["cursor"] = cursor
        data = sb_get(base, hdrs, "/branch/channels", params=params)
        out.extend(data.get("data", []))
        # Cursor pagination on this endpoint: response carries `cursor` ONLY when
        # there is a next page. links.next is the canonical "go further" signal.
        next_link = (data.get("links") or {}).get("next")
        cursor    = data.get("cursor")
        if not next_link or not cursor:
            break
    return out


def list_channel_posts(base, hdrs, channel_id):
    """Pull every post in a channel via /channels/{id}/posts (offset-based)."""
    out, offset = [], 0
    while True:
        data = sb_get(base, hdrs, f"/channels/{channel_id}/posts", params={"limit": 100, "offset": offset})
        batch = data.get("data", [])
        out.extend(batch)
        total = data.get("total", len(out))
        offset += len(batch)
        if not batch or offset >= total:
            break
    return out


def channel_title(ch):
    """Best-effort extraction of a human-readable channel title."""
    cfg = ch.get("config") or {}
    loc = cfg.get("localization") or {}
    for key in ("en_US", "en_GB", "en"):
        if key in loc and loc[key].get("title"):
            return loc[key]["title"]
    if loc:
        first = next(iter(loc.values()))
        if isinstance(first, dict) and first.get("title"):
            return first["title"]
    return ch.get("title") or ch.get("id") or "(untitled)"


def post_title(p):
    contents = p.get("contents") or {}
    for key in ("en_US", "en_GB", "en"):
        if key in contents and contents[key].get("title"):
            return contents[key]["title"]
    if contents:
        first = next(iter(contents.values()))
        if isinstance(first, dict) and first.get("title"):
            return first["title"]
    return "(untitled)"


# ── Date spreading ────────────────────────────────────────────────────────────

def spread_dates(n, demo_date_iso, span_days=90, recent_weight=0.6):
    """
    Generate `n` realistic ISO 8601 timestamps, weighted toward the recent past
    relative to `demo_date_iso`.

    Distribution:
      - `recent_weight` fraction lands within the last 7 days before demo_date
      - the rest is exponentially spread back across `span_days`
      - all timestamps snap to weekday business hours (M-F, 8am-5pm local UTC)
      - one or two posts are placed right on or 1-2 days before the demo date
    """
    demo_dt = datetime.fromisoformat(demo_date_iso.replace("Z", "+00:00"))
    if demo_dt.tzinfo is None:
        demo_dt = demo_dt.replace(tzinfo=timezone.utc)

    rng = random.Random(42)  # deterministic for stable preview-to-apply
    timestamps = []

    n_recent = max(1, int(n * recent_weight))
    n_older  = n - n_recent

    # Recent bucket: spread across the 14 days leading up to demo_date
    for _ in range(n_recent):
        days_back = rng.randint(0, 14)
        ts = demo_dt - timedelta(days=days_back)
        timestamps.append(ts)

    # Older bucket: exponential decay back to span_days
    for _ in range(n_older):
        # bias toward more-recent within the older bucket
        u = rng.random() ** 1.6
        days_back = 14 + int(u * (span_days - 14))
        ts = demo_dt - timedelta(days=days_back)
        timestamps.append(ts)

    # Sort newest-first so first post ID gets the most-recent slot
    timestamps.sort(reverse=True)

    # Snap each to a plausible business-hour timestamp on a weekday
    snapped = []
    for ts in timestamps:
        # Bump off weekends to nearest preceding Friday
        while ts.weekday() >= 5:
            ts -= timedelta(days=1)
        hour   = rng.randint(8, 16)
        minute = rng.choice([0, 7, 12, 22, 31, 45, 53])
        ts = ts.replace(hour=hour, minute=minute, second=rng.randint(0, 59), microsecond=0)
        snapped.append(ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"))

    return snapped


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html", presets=PRESETS, industries=INDUSTRIES)


@app.route("/api/connect", methods=["POST"])
def api_connect():
    base, hdrs = get_creds()
    try:
        # /branch/channels is the lightest call that requires manage scope
        sb_get(base, hdrs, "/branch/channels", params={"limit": 1})
        return jsonify({"ok": True, "base": base})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400


@app.route("/api/scan", methods=["POST"])
def api_scan():
    """Pull all channels and all posts. Returns a flat structure for the UI."""
    base, hdrs = get_creds()
    try:
        channels = list_all_channels(base, hdrs)
    except Exception as e:
        return jsonify({"ok": False, "error": f"Failed to list channels: {e}"}), 400

    out_channels = []
    out_posts = []
    for ch in channels:
        cid   = ch.get("id")
        title = channel_title(ch)
        try:
            posts = list_channel_posts(base, hdrs, cid)
        except Exception as e:
            posts = []
            out_channels.append({
                "id": cid, "title": title, "post_count": 0,
                "raw": ch, "error": str(e),
            })
            continue

        # Capture the per-channel update URL from links.update — the News API
        # exposes channels as installations, so channel renames go through
        # POST /installations/{id} rather than the documented news endpoint.
        update_link = (ch.get("links") or {}).get("update") or {}
        out_channels.append({
            "id":           cid,
            "title":        title,
            "post_count":   len(posts),
            "post_count_metadata": ch.get("postCount", len(posts)),
            "update_url":   update_link.get("href"),
            "update_method": update_link.get("method", "POST"),
            "raw":          ch,
        })

        for p in posts:
            out_posts.append({
                "id":          p.get("id"),
                "channel_id":  cid,
                "channel":     title,
                "title":       post_title(p),
                "published":   p.get("published"),
                "planned":     p.get("planned"),
                "contents":    p.get("contents"),
            })

    # Sort posts by current published desc so the UI shows newest first
    out_posts.sort(key=lambda p: p.get("published") or "", reverse=True)

    return jsonify({
        "ok": True,
        "base": base,
        "channels": out_channels,
        "posts": out_posts,
        "summary": {
            "channel_count": len(out_channels),
            "post_count": len(out_posts),
            "published_count": sum(1 for p in out_posts if p.get("published")),
        },
    })


@app.route("/api/plan", methods=["POST"])
def api_plan():
    """
    Build a preview of what we'll change — does NOT call Staffbase.
    Body: {posts: [...], channels: [...], demo_date, industry, account_name, span_days}
    Returns: {post_changes: [...], channel_changes: [...]}
    """
    body = request.json or {}
    posts        = body.get("posts", [])
    channels     = body.get("channels", [])
    demo_date    = body.get("demo_date")
    industry_key = body.get("industry") or "generic"
    account      = (body.get("account_name") or "").strip()
    span_days    = int(body.get("span_days") or 90)
    rename_chans = bool(body.get("rename_channels", True))

    if not demo_date:
        return jsonify({"ok": False, "error": "demo_date is required"}), 400

    # Only respread posts that have a `published` value (drafts/planned posts left alone)
    publishable = [p for p in posts if p.get("published")]
    new_dates   = spread_dates(len(publishable), demo_date, span_days=span_days)

    post_changes = []
    for p, new_pub in zip(publishable, new_dates):
        post_changes.append({
            "id":          p["id"],
            "channel":     p.get("channel"),
            "title":       p.get("title"),
            "old":         p.get("published"),
            "new":         new_pub,
        })

    channel_changes = []
    if rename_chans:
        templates = INDUSTRIES.get(industry_key, INDUSTRIES["generic"])["channels"]
        for i, ch in enumerate(channels):
            if i >= len(templates):
                # No suggestion past the template length — leave untouched
                channel_changes.append({
                    "id":         ch["id"],
                    "old_title":  ch["title"],
                    "new_title":  ch["title"],
                    "new_desc":   "",
                    "skip":       True,
                })
                continue
            new_title, new_desc = templates[i]
            if account:
                # Lightweight account-flavor for top channel
                if i == 0:
                    new_desc = f"{new_desc.rstrip('.')} — {account}."
            channel_changes.append({
                "id":           ch["id"],
                "old_title":    ch["title"],
                "new_title":    new_title,
                "new_desc":     new_desc,
                "update_url":   ch.get("update_url"),
                "update_method": ch.get("update_method", "POST"),
                "skip":         False,
            })

    return jsonify({
        "ok": True,
        "post_changes":    post_changes,
        "channel_changes": channel_changes,
    })


def _save_snapshot(base, post_originals, channel_originals):
    sid  = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    path = SNAPSHOT_DIR / f"{sid}.json"
    path.write_text(json.dumps({
        "id":        sid,
        "base":      base,
        "created":   datetime.utcnow().isoformat() + "Z",
        "posts":     post_originals,
        "channels":  channel_originals,
    }, indent=2))
    return sid


@app.route("/api/apply", methods=["POST"])
def api_apply():
    """
    Apply post date changes (and optional channel renames) to Staffbase.
    Body: {post_changes: [...], channel_changes: [...]}
    Saves a snapshot first for rollback.
    """
    base, hdrs = get_creds()
    body = request.json or {}
    post_changes    = body.get("post_changes", [])
    channel_changes = body.get("channel_changes", [])

    post_originals    = []
    channel_originals = []
    results = {
        "posts_updated":     0,
        "posts_failed":      0,
        "channels_updated":  0,
        "channels_failed":   0,
        "errors":            [],
    }

    # ── Posts: GET each first (so we can roll back), then PUT with new published.
    for ch in post_changes:
        pid = ch["id"]
        try:
            current = sb_get(base, hdrs, f"/posts/{pid}")
            post_originals.append({
                "id":        pid,
                "published": current.get("published"),
                "planned":   current.get("planned"),
            })
            # PUT requires `contents` per BasicPost schema. Round-trip it so we
            # don't wipe content. Strip notificationChannels so we don't trigger
            # re-notifications.
            payload = {
                "published": ch["new"],
                "contents":  current.get("contents") or {},
            }
            sb_put(base, hdrs, f"/posts/{pid}", payload)
            results["posts_updated"] += 1
        except Exception as e:
            results["posts_failed"] += 1
            results["errors"].append(f"post {pid}: {e}")

    # ── Channels: News API exposes channels as installations. Each channel's
    # response carries links.update {method: POST, href: /installations/{id}}.
    # Use that link directly, falling back to POST /installations/{id}.
    for ch in channel_changes:
        if ch.get("skip"):
            continue
        cid = ch["id"]
        try:
            # Pull current channel to capture the original config for snapshot.
            current = sb_get(base, hdrs, f"/channels/{cid}")
            channel_originals.append({
                "id":         cid,
                "config":     current.get("config"),
                "update_url": ch.get("update_url"),
            })
            cfg = current.get("config") or {}
            loc = cfg.get("localization") or {}
            loc.setdefault("en_US", {})
            loc["en_US"]["title"]       = ch["new_title"]
            loc["en_US"]["description"] = ch.get("new_desc") or loc["en_US"].get("description")
            cfg["localization"] = loc
            payload = {"config": cfg}

            update_url    = ch.get("update_url") or f"{base}/installations/{cid}"
            update_method = (ch.get("update_method") or "POST").upper()
            sb_request_url(hdrs, update_method, update_url, body=payload)
            results["channels_updated"] += 1
        except Exception as e:
            results["channels_failed"] += 1
            results["errors"].append(f"channel {cid}: {e}")

    snapshot_id = _save_snapshot(base, post_originals, channel_originals)
    results["snapshot_id"] = snapshot_id
    return jsonify({"ok": True, "results": results})


@app.route("/api/snapshots", methods=["GET"])
def api_snapshots():
    out = []
    for f in sorted(SNAPSHOT_DIR.glob("*.json"), reverse=True):
        try:
            data = json.loads(f.read_text())
        except Exception:
            continue
        out.append({
            "id":            data.get("id"),
            "created":       data.get("created"),
            "base":          data.get("base"),
            "post_count":    len(data.get("posts") or []),
            "channel_count": len(data.get("channels") or []),
        })
    return jsonify({"ok": True, "snapshots": out})


@app.route("/api/snapshots/<sid>/restore", methods=["POST"])
def api_restore(sid):
    base, hdrs = get_creds()
    path = SNAPSHOT_DIR / f"{sid}.json"
    if not path.exists():
        return jsonify({"ok": False, "error": "snapshot not found"}), 404
    snap = json.loads(path.read_text())

    results = {"posts_restored": 0, "channels_restored": 0, "errors": []}

    for orig in snap.get("posts") or []:
        pid = orig["id"]
        try:
            current = sb_get(base, hdrs, f"/posts/{pid}")
            payload = {
                "published": orig.get("published"),
                "contents":  current.get("contents") or {},
            }
            sb_put(base, hdrs, f"/posts/{pid}", payload)
            results["posts_restored"] += 1
        except Exception as e:
            results["errors"].append(f"post {pid}: {e}")

    for orig in snap.get("channels") or []:
        cid = orig["id"]
        try:
            payload = {"config": orig.get("config") or {}}
            update_url = orig.get("update_url") or f"{base}/installations/{cid}"
            sb_request_url(hdrs, "POST", update_url, body=payload)
            results["channels_restored"] += 1
        except Exception as e:
            results["errors"].append(f"channel {cid}: {e}")

    return jsonify({"ok": True, "results": results})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5057))
    app.run(host="127.0.0.1", port=port, debug=True)
