#!/usr/bin/env python3
"""
Staffbase User Creator — Emplify Health Nurses
Sources 5 nurses from LinkedIn profiles, creates them in a Staffbase instance.
"""

import requests
import json
import sys

# ── Config ────────────────────────────────────────────────────────────────────
API_BASE = "https://faraz-test.staffbase.com/api"
TOKEN    = "NjlmZDYzOTIzZjdiODkxNmFlMjUxMDM1OnNFO0hLe1lofmF3VFFuJDdvN30xV2ZDRkR+Jk42Z3RrU11RW291JmlGKSllSEpydDkuTk1DOSFjeTJtQzFDN1U="

HEADERS = {
    "Authorization": f"Basic {TOKEN}",
    "Content-Type": "application/json",
}

# ── Nurses sourced from LinkedIn (Emplify Health) ─────────────────────────────
NURSES = [
    {
        "firstName": "Stephanie",
        "lastName":  "Corbin",
        "email":     "stephanie.corbin@emplifyhealth-demo.com",
        "username":  "stephanie.corbin",
        "position":  "Registered Nurse",
        "location":  "La Crosse, WI",
        "linkedin":  "https://www.linkedin.com/in/stephanie-corbin-92586b201/",
    },
    {
        "firstName": "Brittany",
        "lastName":  "Lehndorf",
        "email":     "brittany.lehndorf@emplifyhealth-demo.com",
        "username":  "brittany.lehndorf",
        "position":  "Registered Nurse, RN BSN",
        "location":  "Pulaski, WI",
        "linkedin":  "https://www.linkedin.com/in/brittanyburch/",
    },
    {
        "firstName": "Kelsey",
        "lastName":  "Bolton",
        "email":     "kelsey.bolton@emplifyhealth-demo.com",
        "username":  "kelsey.bolton",
        "position":  "Nurse Practitioner, Family Medicine",
        "location":  "Houston, MN",
        "linkedin":  "https://www.linkedin.com/in/kelsey-bolton-23100595/",
    },
    {
        "firstName": "Lauren",
        "lastName":  "Stoffel",
        "email":     "lauren.stoffel@emplifyhealth-demo.com",
        "username":  "lauren.stoffel",
        "position":  "Clinical Manager",
        "location":  "La Crosse, WI",
        "linkedin":  "https://www.linkedin.com/in/laurenneet/",
    },
    {
        "firstName": "Laura",
        "lastName":  "Hieb",
        "email":     "laura.hieb@emplifyhealth-demo.com",
        "username":  "laura.hieb",
        "position":  "Registered Nurse",
        "location":  "Green Bay, WI",
        "linkedin":  "https://www.linkedin.com/in/laura-hieb-9846aa24/",
    },
]


def test_connection() -> bool:
    """Verify API credentials before attempting user creation."""
    try:
        r = requests.get(f"{API_BASE}/users", headers=HEADERS, timeout=10)
        if r.status_code == 401:
            print("  [ERROR] Authentication failed — check your token.")
            return False
        if r.status_code == 403:
            print("  [ERROR] Token lacks permission to read users.")
            return False
        print(f"  [OK] Connected (HTTP {r.status_code})")
        return True
    except requests.exceptions.ConnectionError:
        print("  [ERROR] Could not reach API — check your network/URL.")
        return False


def create_user(nurse: dict) -> dict:
    payload = {
        "firstName": nurse["firstName"],
        "lastName":  nurse["lastName"],
        "email":     nurse["email"],
        "username":  nurse["username"],
        "position":  nurse["position"],
        "role":      "user",
    }

    r = requests.post(
        f"{API_BASE}/users",
        headers=HEADERS,
        json=payload,
        timeout=15,
    )

    body = {}
    if r.content:
        try:
            body = r.json()
        except ValueError:
            body = {"raw": r.text}

    return {"status": r.status_code, "body": body}


def main():
    sep = "=" * 58
    print(f"\n{sep}")
    print("   Staffbase User Creator  |  Emplify Health Nurses")
    print(f"{sep}\n")

    print("Checking API connection...")
    if not test_connection():
        sys.exit(1)
    print()

    created, failed = [], []

    for nurse in NURSES:
        name = f"{nurse['firstName']} {nurse['lastName']}"
        print(f"  Creating  {name:<22} ({nurse['position']})")
        print(f"            {nurse['email']}")
        print(f"            {nurse['linkedin']}")

        result = create_user(nurse)
        code   = result["status"]
        body   = result["body"]

        if code in (200, 201):
            uid = body.get("id") or body.get("userId") or "—"
            print(f"            -> Created  [ID: {uid}]\n")
            created.append(name)
        elif code == 409:
            print(f"            -> Skipped  [already exists]\n")
            created.append(name)
        else:
            msg = body.get("message") or body.get("error") or json.dumps(body)
            print(f"            -> FAILED   [{code}] {msg}\n")
            failed.append(name)

    print("-" * 58)
    print(f"  Done: {len(created)}/5 users ready   |   {len(failed)} failed")
    if failed:
        print(f"  Failed: {', '.join(failed)}")
    print(f"  Instance: {API_BASE.split('/api')[0]}")
    print("-" * 58 + "\n")


if __name__ == "__main__":
    main()
