#!/usr/bin/env python3
"""
Staffbase Group Creator — Emplify Health
Creates audience groups reflective of a real healthcare Staffbase deployment,
then assigns the 5 nurses to their relevant groups.
"""

import requests
import json
import sys
import warnings
warnings.filterwarnings("ignore")

# ── Config ────────────────────────────────────────────────────────────────────
API_BASE = "https://faraz-test.staffbase.com/api"
TOKEN    = "NjlmZDYzOTIzZjdiODkxNmFlMjUxMDM1OnNFO0hLe1lofmF3VFFuJDdvN30xV2ZDRkR+Jk42Z3RrU11RW291JmlGKSllSEpydDkuTk1DOSFjeTJtQzFDN1U="

HEADERS = {
    "Authorization": f"Basic {TOKEN}",
    "Content-Type":  "application/json",
}

# ── Nurse IDs (created in previous run) ──────────────────────────────────────
NURSES = {
    "stephanie.corbin": {
        "id":       "69fd65ea6a581c336f7aadde",
        "name":     "Stephanie Corbin",
        "title":    "Registered Nurse",
        "region":   "gundersen",
        "dept":     "family_medicine",
        "shift":    "day",
        "fte":      "full_time",
        "seniority": "staff",
    },
    "brittany.lehndorf": {
        "id":       "69fd65ea6a581c336f7aade3",
        "name":     "Brittany Lehndorf",
        "title":    "Registered Nurse, RN BSN",
        "region":   "bellin",
        "dept":     None,
        "shift":    "night",
        "fte":      "full_time",
        "seniority": "staff",
    },
    "kelsey.bolton": {
        "id":       "69fd65eadf6da43b0edad63b",
        "name":     "Kelsey Bolton",
        "title":    "Nurse Practitioner, Family Medicine",
        "region":   "gundersen",
        "dept":     "family_medicine",
        "shift":    "day",
        "fte":      "part_time_prn",
        "seniority": "advanced_practice",
    },
    "lauren.stoffel": {
        "id":       "69fd65ebdf6da43b0edad641",
        "name":     "Lauren Stoffel",
        "title":    "Clinical Manager",
        "region":   "gundersen",
        "dept":     None,
        "shift":    "day",
        "fte":      "full_time",
        "seniority": "leadership",
    },
    "laura.hieb": {
        "id":       "69fd65eb3f7b8916ae258963",
        "name":     "Laura Hieb",
        "title":    "Registered Nurse",
        "region":   "bellin",
        "dept":     None,
        "shift":    "night",
        "fte":      "full_time",
        "seniority": "staff",
    },
}

# ── Group definitions — keyed by internal slug ───────────────────────────────
# Each group maps to a dimension; nurses are tagged per-dimension above.
GROUPS = [
    # ── Dimension 1: Clinical Role ──────────────────────────────────────────
    {
        "slug":        "registered_nurses",
        "name":        "Registered Nurses (RN)",
        "description": "All bedside and staff registered nurses across Emplify Health facilities.",
        "match":       lambda n: n["seniority"] == "staff",
    },
    {
        "slug":        "advanced_practice",
        "name":        "Advanced Practice Providers",
        "description": "Nurse Practitioners, Physician Assistants, and CRNAs.",
        "match":       lambda n: n["seniority"] == "advanced_practice",
    },
    {
        "slug":        "nursing_leadership",
        "name":        "Nursing Leadership & Management",
        "description": "Charge nurses, unit managers, clinical directors, and CNOs.",
        "match":       lambda n: n["seniority"] == "leadership",
    },

    # ── Dimension 2: Region / Facility ──────────────────────────────────────
    {
        "slug":        "gundersen_region",
        "name":        "Gundersen Region",
        "description": "Staff based at Emplify Health Gundersen campuses (La Crosse, WI and surrounding).",
        "match":       lambda n: n["region"] == "gundersen",
    },
    {
        "slug":        "bellin_region",
        "name":        "Bellin Region",
        "description": "Staff based at Emplify Health Bellin campuses (Green Bay, WI and surrounding).",
        "match":       lambda n: n["region"] == "bellin",
    },

    # ── Dimension 3: Department ─────────────────────────────────────────────
    {
        "slug":        "emergency_department",
        "name":        "Emergency Department",
        "description": "ED nursing and clinical staff across all Emplify Health sites.",
        "match":       lambda n: n["dept"] == "ed",
    },
    {
        "slug":        "icu_critical_care",
        "name":        "ICU / Critical Care",
        "description": "Intensive care and critical care unit nurses.",
        "match":       lambda n: n["dept"] == "icu",
    },
    {
        "slug":        "family_medicine",
        "name":        "Family Medicine & Primary Care",
        "description": "Clinic-based nurses and APPs in family medicine and primary care settings.",
        "match":       lambda n: n["dept"] == "family_medicine",
    },

    # ── Dimension 4: Shift ──────────────────────────────────────────────────
    {
        "slug":        "day_shift",
        "name":        "Day Shift",
        "description": "Clinical staff working standard day shift hours (approx. 07:00–19:00).",
        "match":       lambda n: n["shift"] == "day",
    },
    {
        "slug":        "night_shift",
        "name":        "Night Shift",
        "description": "Clinical staff working night shift hours (approx. 19:00–07:00).",
        "match":       lambda n: n["shift"] == "night",
    },

    # ── Dimension 5: Employment Type ────────────────────────────────────────
    {
        "slug":        "full_time_staff",
        "name":        "Full-Time Staff",
        "description": "Employees at 0.9–1.0 FTE.",
        "match":       lambda n: n["fte"] == "full_time",
    },
    {
        "slug":        "part_time_prn",
        "name":        "Part-Time & PRN Staff",
        "description": "Employees below 0.9 FTE or on a per-diem / as-needed basis.",
        "match":       lambda n: n["fte"] == "part_time_prn",
    },
]


def create_group(group: dict):
    """Create a group, return its ID or None on failure."""
    payload = {
        "name": group["name"],
        "type": "enumeration",
        "config": {
            "localization": {
                "en_US": {
                    "title":       group["name"],
                    "description": group["description"],
                }
            },
            "showInOverview": True,
        },
    }
    r = requests.post(f"{API_BASE}/groups", headers=HEADERS, json=payload, timeout=15)
    if r.status_code in (200, 201):
        return r.json()["id"]
    if r.status_code == 409:
        return "__exists__"
    print(f"      [WARN] {r.status_code}: {r.json().get('message', r.text[:120])}")
    return None


def assign_users_to_group(group_id, user_ids):
    """Assign a list of user IDs to a group via POST."""
    r = requests.post(
        f"{API_BASE}/groups/{group_id}/users",
        headers=HEADERS,
        data=json.dumps(user_ids),
        timeout=15,
    )
    return r.status_code in (200, 201, 202, 204)


def probe_activation() -> dict:
    """
    Confirm whether API-created users can be set to 'activated' state.
    Tests: creation-time flag, POST modify, dedicated endpoint.
    """
    results = {}

    # Test 1: creation-time status=activated
    r = requests.post(f"{API_BASE}/users", headers=HEADERS, json={
        "firstName": "__actprobe__",
        "lastName":  "Test",
        "email":     "actprobe@emplifyhealth-demo.com",
        "username":  "actprobe.test",
        "role":      "user",
        "status":    "activated",
    }, timeout=10)
    body = r.json()
    probe_id = body.get("id")
    results["create_with_activated"] = body.get("status")

    if probe_id:
        # Test 2: POST modify with status
        r2 = requests.post(f"{API_BASE}/users/{probe_id}", headers=HEADERS,
            json={"status": "activated"}, timeout=10)
        results["post_modify_status"] = r2.json().get("status")

        # Test 3: dedicated activate endpoint
        r3 = requests.post(f"{API_BASE}/users/{probe_id}/activate",
            headers=HEADERS, json={}, timeout=10)
        results["dedicated_activate_endpoint"] = r3.status_code

        # Cleanup
        requests.delete(f"{API_BASE}/users/{probe_id}", headers=HEADERS, timeout=10)

    return results


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    sep = "=" * 60
    print(f"\n{sep}")
    print("   Staffbase Group Creator  |  Emplify Health")
    print(f"{sep}\n")

    # ── Step 1: Activation probe ───────────────────────────────────────────
    print("Step 1  Probing activated-state creation via API...\n")
    act = probe_activation()
    can_activate = all(v not in ("pending", 404) for v in act.values())

    print(f"  Create user with status=activated  ->  {act.get('create_with_activated', 'N/A')}")
    print(f"  POST modify  status=activated      ->  {act.get('post_modify_status', 'N/A')}")
    print(f"  Dedicated /activate endpoint       ->  HTTP {act.get('dedicated_activate_endpoint', 'N/A')}")

    print()
    if not can_activate:
        print("  VERDICT: API cannot force 'activated' status.\n"
              "           Users created via API always start as 'pending'.\n"
              "           Activation requires the user to accept their email\n"
              "           invitation, OR an admin to activate them manually\n"
              "           in the Staffbase Admin panel (People > user > Activate).\n"
              "           Group membership CAN be assigned while status=pending —\n"
              "           permissions apply as soon as the user activates.\n")
    else:
        print("  VERDICT: Activation IS possible via API.\n")

    # ── Step 2: Create groups ──────────────────────────────────────────────
    print(f"Step 2  Creating {len(GROUPS)} Emplify Health audience groups...\n")
    created_groups = {}   # slug -> group_id

    for g in GROUPS:
        gid = create_group(g)
        status_str = (
            "Created" if gid and gid != "__exists__"
            else "Exists " if gid == "__exists__"
            else "FAILED "
        )
        if gid and gid != "__exists__":
            created_groups[g["slug"]] = gid
            print(f"  [{status_str}] {g['name']:<42} ID: {gid}")
        elif gid == "__exists__":
            print(f"  [{status_str}] {g['name']}")
        else:
            print(f"  [{status_str}] {g['name']}")

    print()

    # ── Step 3: Assign nurses to groups ───────────────────────────────────
    print("Step 3  Assigning nurses to their groups...\n")
    assignment_log = []

    for nurse in NURSES.values():
        nurse_groups = []
        for g in GROUPS:
            if g["match"](nurse) and g["slug"] in created_groups:
                nurse_groups.append((g["slug"], created_groups[g["slug"]], g["name"]))

        if not nurse_groups:
            print(f"  {nurse['name']:<25}  No matching new groups")
            continue

        user_id = nurse["id"]
        assigned, failed = [], []
        for slug, gid, gname in nurse_groups:
            ok = assign_users_to_group(gid, [user_id])
            if ok:
                assigned.append(gname)
            else:
                failed.append(gname)

        status_icon = "v" if not failed else "!"
        print(f"  [{status_icon}] {nurse['name']:<25}  ({nurse['title']})")
        for g in assigned:
            print(f"      + {g}")
        for g in failed:
            print(f"      x FAILED: {g}")
        print()
        assignment_log.append({"nurse": nurse["name"], "groups": assigned})

    # ── Summary ────────────────────────────────────────────────────────────
    print("-" * 60)
    print(f"  Groups created : {len(created_groups)}/{len(GROUPS)}")
    print(f"  Nurses assigned: {len(assignment_log)}/5")
    print(f"  Activation API : {'Supported' if can_activate else 'NOT supported — pending only via API'}")
    print("-" * 60 + "\n")


if __name__ == "__main__":
    main()
