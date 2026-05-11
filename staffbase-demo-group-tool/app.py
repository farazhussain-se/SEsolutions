#!/usr/bin/env python3
"""
Staffbase Demo Group Tool
Parses a customer brief, finds real or position-accurate people via multi-source search,
and configures a Staffbase instance with industry-appropriate users and groups.
"""

import os, re, json, time, warnings
from io import BytesIO
from pathlib import Path
from datetime import datetime
import requests as http
from flask import Flask, render_template, request, jsonify

SNAPSHOT_DIR = Path(__file__).parent / "snapshots"
SNAPSHOT_DIR.mkdir(exist_ok=True)

# Staffbase v3 accessor headers — required for PATCH /users/{id} with profile fields
# like system_manager, profile.avatar.*, etc. Standard POST uses different content type.
PATCH_HEADERS_EXTRA = {
    "Accept":       "application/vnd.staffbase.accessors.user.v3+json",
    "Content-Type": "application/vnd.staffbase.accessors.user-update.v1+json",
}

warnings.filterwarnings("ignore")

try:
    from docx import Document as DocxDocument
    HAS_DOCX = True
except ImportError:
    HAS_DOCX = False

try:
    from ddgs import DDGS
    HAS_DDGS = True
except ImportError:
    try:
        from duckduckgo_search import DDGS
        HAS_DDGS = True
    except ImportError:
        HAS_DDGS = False

app = Flask(__name__)

# ── Default Config (overridden per-request via X-SB-Base / X-SB-Token headers) ──
DEFAULT_BASE  = "https://faraz-test.staffbase.com/api"
DEFAULT_TOKEN = "NjlmZDYzOTIzZjdiODkxNmFlMjUxMDM1OnNFO0hLe1lofmF3VFFuJDdvN30xV2ZDRkR+Jk42Z3RrU11RW291JmlGKSllSEpydDkuTk1DOSFjeTJtQzFDN1U="

def get_creds():
    """Read per-request Staffbase credentials from headers, fall back to defaults."""
    base  = request.headers.get("X-SB-Base",  DEFAULT_BASE).rstrip("/")
    token = request.headers.get("X-SB-Token", DEFAULT_TOKEN)
    hdrs  = {"Authorization": f"Basic {token}", "Content-Type": "application/json"}
    return base, hdrs

# ── Industry Templates ────────────────────────────────────────────────────────
# Each industry entry drives: column titles in Step 2 (People), search terms for
# DuckDuckGo people-search, and the 8 default group names applied to the instance.
# Keys used directly by frontend: comms_title, corporate_title, frontline_title.
INDUSTRIES = {
    "healthcare": {
        "label": "Healthcare",
        "comms_title":     "Communications & Patient Engagement",
        "corporate_title": "Clinical & Administrative Leadership",
        "frontline_title": "Clinical & Care Staff",
        "comms_search":     ["communications", "marketing", "patient engagement", "content"],
        "corporate_search": ["manager", "director", "administrator", "coordinator", "specialist"],
        "frontline_search": ["nurse", "technician", "assistant", "aide", "therapist", "caregiver"],
        "groups": [
            ("Patient Safety & Quality",     "Updates on patient safety initiatives and quality improvement across all facilities."),
            ("Clinical Updates",             "Latest clinical guidelines, protocols, and announcements for care teams."),
            ("HR & Employee Wellbeing",      "Human resources news, benefits information, and employee wellness programs."),
            ("Shift Notifications",          "Real-time shift updates, scheduling changes, and urgent communications."),
            ("Employee Recognition",         "Celebrating team achievements, years of service, and exceptional care."),
            ("Leadership Forum",             "Strategic updates and messages from clinical and administrative leadership."),
            ("Community & Volunteering",     "Community health initiatives, volunteer opportunities, and outreach programs."),
            ("Training & Development",       "Continuing education, certifications, mandatory training, and career development."),
        ],
    },
    "manufacturing": {
        "label": "Manufacturing",
        "comms_title":     "Internal Communications",
        "corporate_title": "Operations & Management",
        "frontline_title": "Production & Plant Workers",
        "comms_search":     ["communications", "internal communications", "employee engagement"],
        "corporate_search": ["plant manager", "operations manager", "quality manager", "engineer", "supervisor"],
        "frontline_search": ["operator", "technician", "mechanic", "assembler", "production worker"],
        "groups": [
            ("Safety First",                 "Safety alerts, incident reports, and health & safety protocols for all plant staff."),
            ("Production Updates",           "Daily production targets, line updates, and operational announcements."),
            ("Quality & Compliance",         "Quality control updates, audit notices, and compliance requirements."),
            ("Shift Bulletin",               "Shift handover notes, schedule changes, and time-sensitive updates."),
            ("Employee Recognition",         "Celebrating safety milestones, performance awards, and team achievements."),
            ("Training & Compliance",        "Mandatory training, certifications, and skills development programs."),
            ("Environment & Sustainability", "Environmental initiatives, sustainability goals, and green operations news."),
            ("HR & Benefits",                "HR policies, payroll updates, benefits, and employee programs."),
        ],
    },
    "retail": {
        "label": "Retail",
        "comms_title":     "Brand & Communications Team",
        "corporate_title": "Corporate & Regional Management",
        "frontline_title": "Store Associates & Floor Staff",
        "comms_search":     ["communications", "brand", "marketing", "visual merchandising"],
        "corporate_search": ["regional manager", "district manager", "area manager", "buyer", "merchandiser"],
        "frontline_search": ["store associate", "sales associate", "cashier", "floor supervisor"],
        "groups": [
            ("Store Operations",     "Operational guidelines, store standards, and procedural updates for all locations."),
            ("Customer Experience",  "Customer service standards, feedback, and guest experience initiatives."),
            ("Sales & Promotions",   "Current promotions, sales targets, campaign launches, and performance updates."),
            ("Schedule & Shift",     "Roster updates, shift swaps, and scheduling communications."),
            ("Employee Recognition", "Spotlighting top performers, years of service, and team achievements."),
            ("Product & Training",   "Product knowledge, brand training, and seasonal collection briefings."),
            ("Community & Social",   "Community events, social responsibility initiatives, and team activities."),
            ("HR & Benefits",        "HR updates, benefits enrollment, payroll, and employee programs."),
        ],
    },
    "finance": {
        "label": "Finance & Banking",
        "comms_title":     "Corporate Communications",
        "corporate_title": "Corporate & Advisory Staff",
        "frontline_title": "Branch & Client-Facing Staff",
        "comms_search":     ["communications", "corporate communications", "investor relations"],
        "corporate_search": ["analyst", "advisor", "relationship manager", "compliance officer"],
        "frontline_search": ["teller", "branch manager", "customer service", "loan officer"],
        "groups": [
            ("Compliance & Regulatory",  "Regulatory updates, compliance notices, and policy changes affecting all staff."),
            ("Client Services",          "Client experience standards, service updates, and relationship management news."),
            ("Operations Bulletin",      "Operational changes, system updates, and process improvements."),
            ("Team Recognition",         "Recognizing exceptional performance, client outcomes, and team milestones."),
            ("Training & Certification", "Mandatory training, licensing updates, and professional development resources."),
            ("HR & Wellbeing",           "HR policies, benefits, wellness programs, and employee support resources."),
            ("Leadership Forum",         "Updates from executive leadership, strategy announcements, and town halls."),
            ("Innovation & Technology",  "Digital transformation updates, new tools, and fintech innovation news."),
        ],
    },
    "technology": {
        "label": "Technology",
        "comms_title":     "Internal Communications & Culture",
        "corporate_title": "Corporate & Engineering Leadership",
        "frontline_title": "Engineering & Technical Staff",
        "comms_search":     ["internal communications", "culture", "employee experience", "people ops"],
        "corporate_search": ["engineering manager", "product manager", "director", "head of"],
        "frontline_search": ["software engineer", "developer", "data scientist", "DevOps"],
        "groups": [
            ("Engineering Updates",    "Technical announcements, architecture decisions, and engineering all-hands."),
            ("Product & Roadmap",      "Product roadmap updates, release notes, and cross-functional alignment."),
            ("Customer & GTM",         "Customer success stories, go-to-market updates, and sales enablement."),
            ("Innovation Hub",         "Hackathon announcements, innovation challenges, and experimental projects."),
            ("Team Recognition",       "Celebrating milestones, peer kudos, and exceptional contributions."),
            ("Learning & Development", "Conference attendance, certification support, and internal learning."),
            ("All-Hands Community",    "Company-wide announcements, all-hands recordings, and culture updates."),
            ("HR & Benefits",          "People team updates, benefits enrollment, equity, and compensation."),
        ],
    },
    "logistics": {
        "label": "Logistics & Transport",
        "comms_title":     "Operations Communications",
        "corporate_title": "Operations & Logistics Management",
        "frontline_title": "Drivers & Field Operations",
        "comms_search":     ["communications", "operations communications", "fleet communications"],
        "corporate_search": ["logistics manager", "operations manager", "warehouse manager"],
        "frontline_search": ["driver", "courier", "delivery associate", "warehouse operative"],
        "groups": [
            ("Route & Schedule Updates",   "Real-time route changes, delivery schedules, and field operational updates."),
            ("Safety & Compliance",        "Road safety alerts, vehicle compliance, and incident reporting."),
            ("Fleet & Operations",         "Fleet maintenance schedules, vehicle updates, and operational efficiency."),
            ("Driver & Field Recognition", "Recognizing safe driving, on-time delivery, and outstanding field performance."),
            ("HR & Benefits",              "HR updates, benefits, payroll, and employee support resources."),
            ("Training Hub",               "Mandatory certifications, safety training, and skills development."),
            ("Community Board",            "Team events, charity drives, and community engagement."),
            ("Leadership Updates",         "Messages from senior leadership, strategic updates, and company direction."),
        ],
    },
    "energy": {
        "label": "Energy & Utilities",
        "comms_title":     "Communications & Public Affairs",
        "corporate_title": "Engineering & Technical Management",
        "frontline_title": "Field Technicians & Plant Operators",
        "comms_search":     ["communications", "public affairs", "stakeholder engagement"],
        "corporate_search": ["engineer", "project manager", "operations manager", "HSE manager"],
        "frontline_search": ["field technician", "lineworker", "plant operator", "electrician"],
        "groups": [
            ("Safety First",              "Safety alerts, OSHA compliance notices, and incident prevention protocols."),
            ("Operations Updates",        "Grid status, plant operations, and real-time operational announcements."),
            ("Regulatory & Compliance",   "Regulatory changes, environmental compliance, and permit updates."),
            ("Shift Bulletin",            "Shift handover information, maintenance schedules, and time-sensitive alerts."),
            ("Employee Recognition",      "Celebrating safety records, project milestones, and exceptional contributions."),
            ("Training & Certification",  "Safety certifications, technical training, and compliance courses."),
            ("Sustainability Initiative", "Renewable energy projects, carbon reduction goals, and sustainability progress."),
            ("HR & Benefits",             "HR policies, union agreements, benefits enrollment, and employee programs."),
        ],
    },
    "hospitality": {
        "label": "Hospitality & Food Service",
        "comms_title":     "Brand & Guest Experience",
        "corporate_title": "Management & Corporate Staff",
        "frontline_title": "Front-of-House & Kitchen Staff",
        "comms_search":     ["communications", "brand", "guest experience", "marketing"],
        "corporate_search": ["general manager", "regional manager", "food and beverage director"],
        "frontline_search": ["server", "bartender", "chef", "cook", "housekeeper", "front desk"],
        "groups": [
            ("Service Excellence",  "Guest service standards, service recovery protocols, and experience improvement."),
            ("F&B Updates",         "Menu changes, allergen alerts, specials, and food & beverage news."),
            ("Guest Experience",    "Guest feedback, review highlights, and experience enhancement initiatives."),
            ("Shift & Scheduling",  "Shift schedules, section assignments, and time-sensitive updates."),
            ("Staff Recognition",   "Employee of the month, guest compliments, and team performance highlights."),
            ("Training Hub",        "Food safety certifications, service standards training, and skills development."),
            ("Events & Activities", "Upcoming events, private dining, banquet setups, and special occasion plans."),
            ("HR & Benefits",       "HR policies, tip pooling updates, benefits, and employee programs."),
        ],
    },
    "other": {
        "label": "Professional Services",
        "comms_title":     "Corporate Communications",
        "corporate_title": "Office & Corporate Staff",
        "frontline_title": "Client-Facing & Field Staff",
        "comms_search":     ["communications", "marketing", "public relations", "content"],
        "corporate_search": ["manager", "director", "coordinator", "analyst", "specialist"],
        "frontline_search": ["associate", "representative", "technician", "consultant"],
        "groups": [
            ("Company Updates",       "Important company-wide announcements, strategy updates, and all-hands communications."),
            ("Operations Bulletin",   "Operational news, process updates, and cross-functional announcements."),
            ("HR & Wellbeing",        "Human resources news, benefits information, and employee wellness programs."),
            ("Team Recognition",      "Celebrating achievements, peer recognition, and performance milestones."),
            ("Training & Development","Learning opportunities, certifications, and professional development."),
            ("Leadership Forum",      "Messages from leadership, strategic direction, and organizational updates."),
            ("Community & Culture",   "Team events, volunteering, DEI initiatives, and company culture."),
            ("Innovation & Ideas",    "Employee ideas, innovation challenges, and continuous improvement."),
        ],
    },
}

# ── Industry keyword signals ──────────────────────────────────────────────────
# Each industry has a list of substrings that appear in briefs.
# Scored by count; highest score wins. "tech" removed — too ambiguous (matches
# "technician", which is a manufacturing/frontline role, not a tech company).
# Medical-device terms (vascular, implant, orthopedic) boosted under healthcare
# so companies like Stryker score correctly as a medical manufacturer.
INDUSTRY_KEYWORDS = {
    "healthcare":    ["health", "hospital", "clinic", "medical", "nurse", "patient", "care",
                      "pharmacy", "physician", "dental", "surgical", "vascular", "implant",
                      "orthopedic", "therapeutic", "diagnostics", "device", "emplify"],
    "manufacturing": ["manufactur", "factory", "plant ", "production", "assembly", "industrial",
                      "machining", "hourly", "shift work", "line worker", "shop floor"],
    "retail":        ["retail", "store", "shop", "merchandise", "consumer", "fashion", "apparel"],
    "finance":       ["bank", "financ", "invest", "insurance", "credit", "lending", "wealth", "fintech"],
    "technology":    ["software", "saas", "cloud", "developer", "engineering team", "product roadmap",
                      "data scientist", "devops", "startup", "scaleup"],
    "logistics":     ["logistics", "transport", "shipping", "delivery", "fleet", "supply chain",
                      "warehouse", "courier"],
    "energy":        ["energy", "utility", "utilities", "power grid", "oil", "gas", "renewable", "electric"],
    "hospitality":   ["hotel", "restaurant", "hospitality", "food", "beverage", "dining", "catering", "resort"],
}

# Groups that score high here are the most demo-unfriendly (leftover test groups,
# Staffbase-default placeholders) and will be prioritised for renaming at deploy time.
# Higher = rename me first.  Used by pick_groups_to_refresh().
GROUP_REFRESH_SCORE = {
    "fantasy football": 5, "travelbase": 5, "feature:": 5, "industry:": 5,
    "marketplace": 4, "thank you": 4, "store employees": 4, "office /hq": 4,
    "town hall attendee": 3, "company values": 3, "corporate sustainability": 2,
}

INDUSTRY_DEFAULT_RATIOS = {
    "healthcare":    0.72,
    "manufacturing": 0.70,
    "retail":        0.75,
    "finance":       0.45,
    "technology":    0.35,
    "logistics":     0.70,
    "energy":        0.60,
    "hospitality":   0.75,
    "other":         0.55,
}

# ── Fallback profile data (position-accurate by industry) ────────────────────
# Used when LinkedIn/web search returns fewer profiles than the requested spread.
# FALLBACK_NAMES → deterministic pool so the same brief always produces the same
# names (avoids randomness that confuses demo prep).
# FALLBACK_TITLES → real-sounding industry titles used in generated profiles.
FALLBACK_NAMES = {
    "comms":     [("Jennifer","Walsh"),   ("Mark","Hendricks"),  ("Sarah","Fischer"),   ("Michael","Torres"),   ("Rachel","Bennett")],
    "corporate": [("Robert","Chen"),      ("Elizabeth","Murphy"),("David","Martinez"),  ("Amanda","Peterson"),  ("Thomas","Reeves"),   ("Linda","Kowalski")],
    "frontline": [("Michelle","Davis"),   ("Carlos","Rivera"),   ("Ashley","Thompson"), ("James","Wilson"),     ("Lisa","Anderson"),    ("Kevin","Nguyen")],
}

FALLBACK_TITLES = {
    "healthcare": {
        "comms":     ["Director of Internal Communications","Employee Engagement Manager","Communications & Content Specialist","Digital & Social Communications Lead","Corporate Affairs Specialist"],
        "corporate": ["VP of Clinical Operations","Chief Nursing Officer","Director of Quality Improvement","HR Director","Director of Nursing","VP of Patient Services","Clinical Operations Manager"],
        "frontline": ["Registered Nurse — ICU","Medical Assistant","Patient Care Technician","Registered Nurse — Emergency Dept","Nursing Assistant","Licensed Practical Nurse","Sterile Processing Technician"],
    },
    "manufacturing": {
        "comms":     ["Internal Communications Manager","HR Communications Specialist","Employee Engagement Lead","Corporate Communications Coordinator","Workforce Communications Analyst"],
        "corporate": ["Plant Manager","Operations Director","Quality Assurance Manager","EHS & Safety Manager","Production Supervisor","Continuous Improvement Manager","Supply Chain Director"],
        "frontline": ["Machine Operator","Quality Control Technician","Assembly Line Lead","Maintenance Mechanic","Forklift Operator","Welding Specialist","Packaging Technician"],
    },
    "retail": {
        "comms":     ["Brand Communications Manager","Visual Merchandising Director","Content & Social Media Manager","Internal Comms Lead","Customer Experience Comms Specialist"],
        "corporate": ["Regional Operations Manager","District Manager","Buying & Merchandising Manager","Retail HR Business Partner","Area Manager","Loss Prevention Director","Planning & Allocation Manager"],
        "frontline": ["Store Manager","Senior Sales Associate","Department Supervisor","Cashier Team Lead","Receiving & Stock Associate","Beauty Advisor","Floor Supervisor"],
    },
    "finance": {
        "comms":     ["Corporate Communications Manager","Investor Relations Specialist","Internal Communications Lead","Public Affairs Manager","Brand & Content Strategist"],
        "corporate": ["Regional Branch Manager","Senior Financial Advisor","Compliance & Risk Manager","VP of Operations","Relationship Manager","Chief Compliance Officer","Commercial Banking Manager"],
        "frontline": ["Senior Teller","Personal Banker","Loan Officer","Branch Service Representative","Financial Services Associate","Mortgage Consultant","Customer Relations Specialist"],
    },
    "technology": {
        "comms":     ["Head of Internal Communications","Employee Experience Manager","People & Culture Communications Lead","Employer Brand Manager","Internal Content Strategist"],
        "corporate": ["Director of Engineering","Senior Product Manager","VP of Sales","Head of Customer Success","Engineering Manager","Director of People Operations","VP of Marketing"],
        "frontline": ["Senior Software Engineer","Staff Engineer","Senior Data Scientist","Platform Engineer","QA & Automation Lead","Frontend Engineer","Backend Engineer"],
    },
    "logistics": {
        "comms":     ["Operations Communications Manager","Fleet & Driver Comms Lead","Internal Communications Specialist","Employee Engagement Coordinator","Corporate Affairs Lead"],
        "corporate": ["Logistics Operations Manager","Warehouse Director","Supply Chain Manager","Fleet Operations Manager","Regional Hub Manager","Network Planning Manager","Transportation Director"],
        "frontline": ["Senior Long-Haul Driver","Warehouse Team Lead","Last-Mile Delivery Associate","Forklift Operator","Dispatch & Routing Coordinator","Cross-Dock Supervisor","Freight Handler"],
    },
    "energy": {
        "comms":     ["Public Affairs & Communications Manager","Corporate Communications Lead","Stakeholder Engagement Specialist","Government & Community Relations Manager","Media Relations Advisor"],
        "corporate": ["Project Engineering Manager","Grid Operations Manager","HSE & Safety Director","Asset Management Lead","Senior Electrical Engineer","Transmission Planning Manager","Operations VP"],
        "frontline": ["Field Service Technician","Distribution Lineworker","Plant Control Room Operator","Substation Electrician","Meter & Smart Grid Technician","Pipeline Integrity Inspector","Generation Operator"],
    },
    "hospitality": {
        "comms":     ["Brand & Communications Manager","Guest Experience Lead","Social Media & Content Manager","Corporate Communications Specialist","Employee & Guest Engagement Lead"],
        "corporate": ["General Manager","Director of Food & Beverage","Regional Operations Manager","Revenue & Yield Manager","Executive Chef","Director of Sales","Rooms Division Manager"],
        "frontline": ["Assistant Restaurant Manager","Senior Server","Head Bartender","Sous Chef","Front Desk Supervisor","Housekeeping Lead","Banquet & Events Coordinator"],
    },
    "other": {
        "comms":     ["Communications Manager","Marketing & Content Lead","Internal Communications Specialist","Brand & PR Manager","Employee Engagement Lead"],
        "corporate": ["Operations Director","Senior Business Manager","HR Business Partner","Finance Manager","Business Development Director","Strategy & Planning Manager","Client Engagement Director"],
        "frontline": ["Senior Client Associate","Account Manager","Field Operations Representative","Technical Services Specialist","Client Success Manager","Business Analyst","Project Coordinator"],
    },
}

# ── Company Research ──────────────────────────────────────────────────────────
# These functions run in the background after Step 1 (Brief) completes.
# They call /api/research (POST) which returns an org-type badge, workforce spread,
# extracted locations/depts, and tailored group names — all shown in the
# Company Intelligence card above the People columns in Step 2.
def calculate_profile_spread(total_pool, frontline_ratio, comms_size=3):
    """Split a profile pool into comms / corporate / frontline counts.
    Comms is always fixed at comms_size (default 3); the remainder is divided
    proportionally by frontline_ratio with a minimum of 4 frontline / 3 corporate.
    """
    remaining = total_pool - comms_size
    frontline = max(4, round(remaining * frontline_ratio))
    corporate = max(3, remaining - frontline)
    # Clamp so total never exceeds pool
    if comms_size + corporate + frontline > total_pool:
        frontline = max(4, total_pool - comms_size - corporate)
    return {"comms": comms_size, "corporate": corporate, "frontline": frontline}


def _classify_org_type(industry, brief_text):
    """Determine org badge (deskless / mixed / knowledge) and adjust frontline ratio.
    Explicit signals in the brief ("mobile-first", "bedside") override the industry default.
    """
    ratio = INDUSTRY_DEFAULT_RATIOS.get(industry, 0.55)
    text_lower = brief_text.lower()
    # Boost frontline ratio if the brief signals a heavily deskless workforce
    if any(k in text_lower for k in ["deskless", "mobile-first", "frontline first", "bedside", "field workers"]):
        ratio = max(ratio, 0.70)
    # Cap frontline ratio if the brief signals office / knowledge workers
    elif any(k in text_lower for k in ["knowledge worker", "remote work", "office-based", "desk-based"]):
        ratio = min(ratio, 0.40)
    labels = {
        "healthcare":    "Health Network",
        "manufacturing": "Manufacturing / Industrial",
        "retail":        "Retail Organization",
        "finance":       "Financial Services",
        "technology":    "Technology Company",
        "logistics":     "Logistics & Distribution",
        "energy":        "Energy & Utilities",
        "hospitality":   "Hospitality & Food Service",
        "other":         "Professional Services",
    }
    base = labels.get(industry, "Organization")
    if ratio >= 0.65:
        return {"label": base, "workforce_type": "Deskless-First", "badge": "deskless"}
    elif ratio >= 0.40:
        return {"label": base, "workforce_type": "Mixed Workforce", "badge": "mixed"}
    return {"label": base, "workforce_type": "Knowledge Worker", "badge": "knowledge"}


def _extract_departments(brief_text, industry):
    found = []
    for p in [
        r"(?:spanning|including|covering)\s+([A-Z][a-z]+(?: [a-z]+)*(?:,\s*[A-Z][a-z]+(?: [a-z]+)*){1,5})",
        r"\b(registered nurses?|clinical managers?|administrative staff|frontline care workers?|nursing staff|imaging staff|ICU staff|emergency department staff)\b",
    ]:
        for h in re.findall(p, brief_text, re.IGNORECASE):
            h = h.strip().rstrip(",")
            if 4 < len(h) < 50 and h.lower() not in [x.lower() for x in found]:
                found.append(h)
    if not found:
        defaults = {
            "healthcare":    ["Clinical Operations", "Nursing", "Administration", "HR"],
            "manufacturing": ["Production", "Quality Assurance", "EHS", "Maintenance"],
            "retail":        ["Store Operations", "Merchandising", "HR", "Loss Prevention"],
            "finance":       ["Branch Banking", "Compliance", "Operations", "HR"],
            "technology":    ["Engineering", "Product", "Sales", "People Ops"],
            "logistics":     ["Fleet Operations", "Warehouse", "Dispatch", "HR"],
            "energy":        ["Grid Operations", "Field Services", "HSE", "Engineering"],
            "hospitality":   ["Front-of-House", "Food & Beverage", "Housekeeping", "Management"],
            "other":         ["Operations", "HR", "Finance", "Business Development"],
        }
        found = defaults.get(industry, defaults["other"])
    return found[:6]


def _extract_locations(brief_text):
    found = []
    for h in re.findall(
        r"\b([A-Z][a-z]+(?: [A-Z][a-z]+)?),?\s+"
        r"(?:Wisconsin|Minnesota|Ohio|Texas|California|New York|Illinois|Florida|"
        r"Michigan|Pennsylvania|Georgia|North Carolina|Tennessee|Virginia|Washington|"
        r"Arizona|Indiana|Missouri|Maryland|Colorado|Massachusetts|[A-Z]{2})\b",
        brief_text
    ):
        h = h.strip()
        if 2 < len(h) < 40 and h not in found:
            found.append(h)
    for h in re.findall(r"\b([A-Z][a-z]+(?: [A-Z][a-z]+)?)\s*\([A-Z][a-z]+", brief_text):
        h = h.strip()
        if 2 < len(h) < 40 and h not in found:
            found.append(h)
    for h in re.findall(
        r"(?:regions?|locations?|campuses?|sites?)\s*[-:]\s*([A-Z][A-Za-z]+(?: (?:and|&) [A-Z][A-Za-z]+)*)",
        brief_text, re.IGNORECASE
    ):
        h = h.strip()
        if 2 < len(h) < 60 and h not in found:
            found.append(h)
    return found[:4]


def _fetch_company_overview(company):
    """Pull a 1-sentence factual overview of the company from public web search.
    Used by the research card so it shows real research findings instead of
    quoting the customer's demo script. Returns "" if search is unavailable
    or no clean sentence could be extracted."""
    if not HAS_DDGS or not company:
        return ""
    queries = [
        f'"{company}" company overview headquartered',
        f'"{company}" Wikipedia',
        f'"{company}" "is a" OR "is an" company',
    ]
    # Sentences must contain the company name and at least one fact-signal word
    fact_signals = re.compile(
        r"\b(headquartered|based in|founded|publicly traded|multinational|"
        r"manufactures?|provides?|operates?|specializes? in|leading|global"
        r"|fortune|nasdaq|nyse|employees|subsidiaries|industry|sector"
        r"|company|corporation|firm|business|brand)\b",
        re.IGNORECASE,
    )
    co_lower = company.lower()
    try:
        with DDGS() as ddgs:
            for q in queries:
                for r in ddgs.text(q, max_results=5):
                    body = (r.get("body") or "").strip()
                    if not body:
                        continue
                    for s in re.split(r"(?<=[.!?])\s+", body):
                        s = s.strip()
                        if (40 < len(s) < 260
                                and co_lower in s.lower()
                                and fact_signals.search(s)
                                and not re.match(r"^(?:and|but|or|let|let's|here|jumping|going)\b", s, re.IGNORECASE)):
                            return s
                time.sleep(0.4)
    except Exception:
        pass
    return ""

def research_company(company, industry, brief_text=""):
    """Main company research function called by POST /api/research.
    1. Extracts workforce signals (locations, departments) from the brief text.
    2. Optionally queries DuckDuckGo (tool: ddgs.DDGS.text) to find employee count
       if the brief doesn't mention one.
    3. Returns org type, spread counts, tailored group names, and raw research data
       for the intelligence card in Step 2 of the UI.
    """
    ratio    = INDUSTRY_DEFAULT_RATIOS.get(industry, 0.55)
    org_type = _classify_org_type(industry, brief_text)
    depts    = _extract_departments(brief_text, industry)
    locs     = _extract_locations(brief_text)

    # Parse employee count directly from brief ("15,000 employees") — avoids
    # a DuckDuckGo lookup when the brief already has the number.
    emp_count = None
    m = re.search(r"(\d[\d,]+)\s*(?:employees?|staff|workers?|team members?|people)", brief_text, re.IGNORECASE)
    if m:
        n = int(m.group(1).replace(",", ""))
        if 10 < n < 1000000:
            emp_count = n

    # Override the industry-default frontline ratio if the brief states a percentage,
    # e.g. "70% of our employees are frontline" or "60 frontline workers".
    front_m = re.search(
        r"(\d+)\s*%?\s*(?:of\s+(?:our|the)\s+)?(?:employees?|staff|workers?)\s+(?:are\s+)?(?:frontline|deskless|mobile|field|clinical|bedside)",
        brief_text, re.IGNORECASE
    )
    if front_m:
        val = int(front_m.group(1))
        ratio = val / 100 if 1 < val <= 100 else val

    # If employee count not in brief, query DuckDuckGo as a fallback.
    # Tool: ddgs.DDGS.text() → public web search, no API key needed.
    if HAS_DDGS and emp_count is None:
        try:
            with DDGS() as ddgs:
                for r in ddgs.text(f'"{company}" number of employees OR workforce size', max_results=4):
                    text = r.get("title", "") + " " + r.get("body", "")
                    for num_str in re.findall(r"(\d[\d,]+)\s*(?:employees?|staff|workers?)", text, re.IGNORECASE):
                        n = int(num_str.replace(",", ""))
                        if 50 < n < 500000:
                            emp_count = n
                            break
                    if emp_count:
                        break
        except Exception:
            pass

    # Pull distinctive company-specific terms (products, divisions, brands) so
    # generate_tailored_groups can produce names that reflect what the company
    # actually does — not just location/industry-template substitution.
    lexicon = _research_company_lexicon(company, industry, brief_text)
    tailored_groups = generate_tailored_groups(company, industry, {
        "locations": locs, "departments": depts, "lexicon": lexicon,
    })
    spread = calculate_profile_spread(15, ratio)
    description = _fetch_company_overview(company)

    return {
        "company":         company,
        "description":     description,        # researched 1-sentence factual overview
        "total_employees": emp_count,
        "frontline_ratio": round(ratio, 2),
        "org_type":        org_type,
        "departments":     depts,
        "locations":       locs,
        "lexicon":         lexicon,            # distinctive product/division/brand terms used in group naming
        "spread":          spread,
        "tailored_groups": tailored_groups,
    }


# ── Company-aware group naming ────────────────────────────────────────────────
# Each industry group template name is mapped to a "theme" — what the group is
# actually FOR — and the naming strategy uses themes (not raw keyword matching)
# to decide whether a company-specific term, location, dept, or brand prefix fits.

_GROUP_THEME_RULES = [
    # (theme,        keywords that tag a group with this theme — first match wins.
    #  Order matters: more specific themes go before generic catch-alls so e.g.
    #  "Training & Compliance" matches training first, not safety.
    #  Keywords cover both our tailored output AND the default Staffbase preset
    #  clone-instance group names, so existing groups can be classified for
    #  semantic rename matching.)
    ("training",     ["training", "learning", "development", "certification", "education", "onboarding"]),
    ("quality",      ["quality", "audit", "compliance", "regulatory"]),
    ("innovation",   ["innovation", "engineering", "r&d", "product", "roadmap", "tech",
                      "innovation hub", "engineering updates", "ideas"]),
    ("clinical",     ["clinical", "patient", "nursing", "bedside"]),
    ("customer",     ["customer", "client", "guest", "service excellence", "f&b", "marketplace"]),
    ("recognition",  ["recognition", "award", "kudos", "thank you", "thanks", "shout"]),
    ("leadership",   ["leadership", "forum", "town hall", "all-hands", "executive", "all hands",
                      "town hall attendee", "company values"]),
    ("community",    ["community", "volunteer", "sustainability", "social", "culture", "values",
                      "events", "diversity", "equity", "inclusion", "dei", "fantasy football",
                      "travelbase", "company news"]),
    ("hr",           [" hr ", "hr &", "hr ", "benefits", "wellbeing", "wellness", "people ops"]),
    ("safety",       ["safety", "ehs"]),
    ("frontline",    ["blue-collar", "non-desk", "deskless", "non desk", "store employees"]),
    ("production",   ["production", "operations bulletin", "manufacturing", "fleet & operations"]),
    ("operations",   ["shift", "bulletin", "schedule", "route", "operations", "office /hq", "office/hq"]),
    ("driver",       ["driver", "field"]),
]

# Themes considered "near" for fallback matching when no exact theme match exists.
# A tailored group whose theme is in column 0 prefers an existing group whose
# theme is in column 1 (or vice-versa) before falling back to a positional pair.
_RELATED_THEMES = {
    "production": {"frontline", "operations", "safety"},
    "frontline":  {"production", "operations"},
    "operations": {"production", "frontline", "driver"},
    "safety":     {"quality", "production"},
    "quality":    {"safety", "operations"},
    "innovation": {"customer", "operations"},
    "customer":   {"innovation", "community"},
    "training":   {"hr", "leadership"},
    "recognition":{"community", "hr", "leadership"},
    "leadership": {"recognition", "community"},
    "community":  {"recognition", "leadership", "hr"},
    "hr":         {"community", "training"},
    "clinical":   {"quality", "operations"},
    "driver":     {"frontline", "operations"},
}

def _theme_score(t1, t2):
    """3 = same theme, 1 = related theme, 0 = unrelated. Used for matching tailored
    group names to existing groups in the live instance."""
    if t1 == t2 and t1 != "general":
        return 3
    if t1 == "general" and t2 == "general":
        return 0
    if t2 in _RELATED_THEMES.get(t1, set()):
        return 1
    return 0


def match_tailored_to_existing(tailored, existing):
    """Pair each tailored [name, desc] with the existing group whose theme best
    matches it. Greedy assignment: highest-scoring pairs first; ties break by
    pick_groups_to_refresh ordering of `existing` (most demo-unfriendly first).

    Returns (pairs, unmatched_existing) where:
      pairs              = list of (existing_group, tailored_index, tailored_name, tailored_desc)
      unmatched_existing = existing groups that didn't get a tailored partner
    """
    t_themes = [(_theme_of(name), i, name, desc) for i, (name, desc) in enumerate(tailored)]
    e_themes = [(_theme_of(g["name"]), j, g) for j, g in enumerate(existing)]

    # Build a score matrix and pick highest-score pairs first, greedy.
    scored = []
    for t_theme, t_i, t_name, t_desc in t_themes:
        for e_theme, e_j, e_g in e_themes:
            s = _theme_score(t_theme, e_theme)
            if s > 0:
                scored.append((s, t_i, e_j, t_name, t_desc, e_g))
    scored.sort(key=lambda x: (-x[0], x[2]))   # higher score first, then lower e_j (more demo-unfriendly)

    used_t, used_e = set(), set()
    pairs = []
    for s, t_i, e_j, t_name, t_desc, e_g in scored:
        if t_i in used_t or e_j in used_e:
            continue
        used_t.add(t_i); used_e.add(e_j)
        pairs.append((e_g, t_i, t_name, t_desc))

    # Fallback: tailored entries with no theme-match get paired to the
    # remaining most-demo-unfriendly existing groups in original order.
    leftover_t = [(t_i, t_name, t_desc)
                  for _, t_i, t_name, t_desc in t_themes if t_i not in used_t]
    leftover_e = [e_g for _, e_j, e_g in e_themes if e_j not in used_e]
    for (t_i, t_name, t_desc), e_g in zip(leftover_t, leftover_e):
        pairs.append((e_g, t_i, t_name, t_desc))

    pairs.sort(key=lambda p: existing.index(p[0]))   # render in plan-grid order
    return pairs

# Themes that benefit from a product/division/brand-specific prefix
_THEMES_TAKING_LEXICON = {"production", "quality", "innovation", "customer", "clinical", "frontline"}
# Themes that read better with a "<Company> X" brand-ownership prefix
_THEMES_TAKING_BRAND   = {"recognition", "leadership", "community", "hr"}
# Themes that read better with a location prefix when one is known
_THEMES_TAKING_LOCATION = {"safety", "production", "operations", "driver"}
# Themes that read better with a department prefix
_THEMES_TAKING_DEPT     = {"training"}


def _theme_of(name):
    n = name.lower()
    for theme, kws in _GROUP_THEME_RULES:
        for kw in kws:
            # Word-boundary match so "product" doesn't match inside "Production".
            # Multi-word keywords (e.g. "town hall") use plain substring since they
            # already provide their own boundary via spaces.
            if " " in kw or "&" in kw:
                if kw in n: return theme
            else:
                if re.search(rf"\b{re.escape(kw)}\b", n): return theme
    return "general"


def _terms_from_brief(brief_text, company):
    """Pull distinctive capitalized noun phrases from the brief itself.
    These are operational/product/initiative terms the customer specifically
    called out (e.g. 'Amplitude Vascular Systems' from the Stryker brief)."""
    if not brief_text:
        return []
    co_lower = (company or "").lower()
    skip_starts = {"editor","monday","tuesday","wednesday","thursday","friday","saturday","sunday",
                   "january","february","march","april","may","june","july","august","september",
                   "october","november","december","mr","ms","dr","and","but","or","let","here",
                   "going","jumping","note","ok","yes","no","hi","hello","dear","subject","re"}
    # Doc-structure tokens that often look like noun phrases but aren't operational terms
    noise_contains = ("desktop", "mobile", "personas", "demo flow", "demo brief",
                      "page ", "subject", "from:", "to:", "agenda")
    terms, seen = [], {co_lower}
    # Match within a single line so "Account Stryker\nDemo Flow" doesn't span lines.
    # Connectors (of/and/&) only allowed BETWEEN proper-noun tokens, not at the
    # end — that's what produced the broken "French and German and" lexicon entry.
    pattern = re.compile(
        r"\b("
        r"[A-Z][a-z]{2,18}"
        r"(?:[ \t]+(?:of|and|&)[ \t]+[A-Z][a-z]{1,18}|[ \t]+[A-Z][a-z]{1,18}){0,3}"
        r")\b"
    )
    for m in pattern.findall(brief_text):
        s = m.strip().rstrip(",.;").rstrip()
        # Trim any trailing connector word that slipped through (extra safety)
        s = re.sub(r"\s+(?:of|and|or|&)$", "", s, flags=re.IGNORECASE).strip()
        sl = s.lower()
        words = s.split()
        # Need ≥2 words (or '&') for a useful operational term — single words are noise
        if len(words) < 2 and "&" not in s:
            continue
        # Drop person-name pattern: two title-case words, both 3–12 chars, no connectors
        if (len(words) == 2
                and all(re.fullmatch(r"[A-Z][a-z]{2,11}", w) for w in words)):
            continue
        if (4 < len(s) < 40
                and sl not in seen
                and words[0].lower() not in skip_starts
                and not any(n in sl for n in noise_contains)
                and not re.match(r"^(?:Account|Client|Company|Customer|Locations?|Departments?|Personas?|Industry|Subject|Date)\b", s, re.IGNORECASE)
                and sl not in co_lower):
            seen.add(sl)
            terms.append(s)
    return terms[:10]


def _research_company_lexicon(company, industry, brief_text=""):
    """Distinctive company-specific terms (products, divisions, brands) for use
    in tailored group names. Prefers brief-mentioned terms (most specific) and
    augments with lightweight DDG lookups against Wikipedia / about pages."""
    terms = _terms_from_brief(brief_text, company)
    if not HAS_DDGS or not company:
        return terms

    co_lower = company.lower()
    seen = {t.lower() for t in terms} | {co_lower}
    boilerplate = {
        "wikipedia","linkedin","facebook","youtube","twitter","instagram","reddit",
        "the company","the firm","the group","united states","north america","new york",
        "click here","read more","contact us","privacy policy","cookie policy",
    }
    queries = [
        f'"{company}" Wikipedia products OR divisions',
        f'"{company}" "operating segments" OR "business segments"',
        f'"{company}" brands OR "product lines"',
    ]
    pat = re.compile(r"\b((?:[A-Z][\w&\-]{1,18})(?:\s+(?:&\s+)?[A-Z][\w&\-]{1,18}){0,3})\b")
    try:
        with DDGS() as ddgs:
            for q in queries:
                for r in ddgs.text(q, max_results=4):
                    body = (r.get("body") or "") + " " + (r.get("title") or "")
                    for m in pat.findall(body):
                        s = m.strip()
                        if (4 < len(s) < 40
                                and s.lower() not in seen
                                and s.lower() not in boilerplate
                                and not s.lower().startswith(("http","www"))
                                and s.split()[0].lower() not in {"the","a","an","and","or","but"}):
                            seen.add(s.lower())
                            terms.append(s)
                            if len(terms) >= 18:
                                return terms
                time.sleep(0.4)
    except Exception:
        pass
    return terms


def tailor_existing_groups(existing_selected, company, industry, research):
    """For each existing group already chosen for refresh, generate a company-
    aware new name that PRESERVES its theme.

    This is the deploy's source of truth for renames. It guarantees an existing
    Innovation Hub stays innovation-themed, an HR group stays HR-themed, etc.
    Strategy per existing group:
      1. Classify the existing group's theme.
      2. If the industry template has an entry for that theme, use the template
         name as the base (industry best-practice naming).
      3. Otherwise use the existing name (stripped of any em-dash / "Persona:"
         prefixes) as the base — keeps the group's intent, just localises it.
      4. Apply theme-driven prefix:
           production / quality / innovation / customer / clinical / frontline →
             prefix with a researched product/division/brand term
           safety / operations / driver  → location prefix when known
           training                       → department prefix when known
           recognition / leadership / community / hr → "<Company> <name>"
           anything else                  → "<Company> <name>"

    Returns: list of (existing_group_dict, new_name, new_desc) in original order.
    """
    locs     = research.get("locations", [])
    depts    = research.get("departments", [])
    lexicon  = list(research.get("lexicon", []) or [])
    short_co = " ".join((company or "").split()[:2])
    template_groups = INDUSTRIES.get(industry, INDUSTRIES["other"])["groups"]

    # Build theme → list of available [name, desc] template entries (most are 1 each)
    templates_by_theme = {}
    for n, d in template_groups:
        templates_by_theme.setdefault(_theme_of(n), []).append([n, d])

    used_lex      = set()
    loc_idx       = [0]   # mutable wrapper so the helper can advance it
    used_template = {}    # theme → count, so duplicates fall through to existing-name basis

    def _strip_prefix(name):
        """Drop leading 'Prefix — ' or 'Persona: ' framing and parenthetical
        qualifiers so the base is clean (e.g.
        'Persona: Blue-Collar (Non-Desk) Worker' → 'Blue-Collar Worker')."""
        s = re.sub(r"^[^—]+\s+—\s+", "", name).strip()
        s = re.sub(r"^Persona:\s*", "", s).strip()
        s = re.sub(r"\s*\([^)]+\)\s*", " ", s).strip()   # drop "(Non-Desk)" etc.
        s = re.sub(r"\s{2,}", " ", s)
        return s or name

    def _pick_lexicon():
        for t in lexicon:
            if t.lower() not in used_lex:
                used_lex.add(t.lower())
                return t
        return None

    out = []
    for existing in existing_selected:
        theme = _theme_of(existing["name"])

        # Use template name if this theme has an unused template entry
        candidates = templates_by_theme.get(theme, [])
        idx = used_template.get(theme, 0)
        if idx < len(candidates):
            base_name, base_desc = candidates[idx]
            used_template[theme] = idx + 1
        else:
            # No (more) template entries for this theme — use the existing group's
            # name as the base so its identity is preserved (DEI stays DEI, etc.).
            base_name = _strip_prefix(existing["name"])
            base_desc = f"Updates and discussion for {base_name} at {company}."

        new_name = base_name
        new_desc = (base_desc
            .replace("all facilities",  f"all {company} facilities")
            .replace("all staff",       f"all {company} staff")
            .replace("all locations",   f"all {company} locations")
            .replace("all plant staff", f"all {company} staff"))

        applied = False
        if theme in _THEMES_TAKING_LEXICON:
            term = _pick_lexicon()
            if term:
                new_name = f"{term} — {base_name}"
                applied = True

        if not applied and theme in _THEMES_TAKING_LOCATION and locs and loc_idx[0] < min(2, len(locs)):
            loc = locs[loc_idx[0]]
            new_name = f"{loc} — {base_name}"
            new_desc = f"{new_desc.rstrip('.')} for {loc}."
            loc_idx[0] += 1
            applied = True

        if not applied and theme in _THEMES_TAKING_DEPT and depts:
            new_name = f"{depts[0]} — {base_name}"
            applied = True

        if not applied and theme in _THEMES_TAKING_BRAND:
            new_name = f"{short_co} {base_name}"
            applied = True

        if not applied:
            new_name = f"{short_co} {base_name}"

        out.append((existing, new_name, new_desc))

    # Deduplicate — Staffbase requires unique group names. When two existing
    # groups would map to the same new name (e.g. two HR & Benefits clones),
    # append " (II)", " (III)", … to keep them distinct.
    seen_counts = {}
    deduped = []
    for existing, name, desc in out:
        seen_counts[name] = seen_counts.get(name, 0) + 1
        if seen_counts[name] > 1:
            roman = ["", "II", "III", "IV", "V", "VI"][min(seen_counts[name] - 1, 5)]
            name = f"{name} ({roman})" if roman else f"{name} ({seen_counts[name]})"
        deduped.append((existing, name, desc))
    return deduped


def generate_tailored_groups(company, industry, research):
    """Build 8 company-aware [name, desc] pairs.

    Naming uses theme-driven strategies so the result reflects what the company
    actually does, not just generic industry templates:
      • production / quality / innovation / customer / clinical →
        prefix with a researched product / division / brand term
        (e.g. 'Joint Replacement — Production Updates')
      • recognition / leadership / community / hr → '<Company> <name>'
      • safety / operations / driver → '<Location> — <name>' if location known
      • training → '<Department> — <name>'
      • everything else → '<Company> <name>' (avoids leaving any group generic)
    """
    locs     = research.get("locations", [])
    depts    = research.get("departments", [])
    lexicon  = list(research.get("lexicon", []) or [])
    short_co = " ".join((company or "").split()[:2])

    groups   = []
    loc_idx  = 0
    used_lex = set()

    def _pick_lexicon():
        """Pop the next unused lexicon term (most-relevant-first ordering)."""
        for t in lexicon:
            if t.lower() not in used_lex:
                used_lex.add(t.lower())
                return t
        return None

    for name, desc in INDUSTRIES.get(industry, INDUSTRIES["other"])["groups"]:
        theme   = _theme_of(name)
        new_name = name
        new_desc = (desc
            .replace("all facilities",  f"all {company} facilities")
            .replace("all staff",       f"all {company} staff")
            .replace("all locations",   f"all {company} locations")
            .replace("all plant staff", f"all {company} staff"))

        applied = False

        # 1. Theme + lexicon: e.g. production at Stryker → "Joint Replacement — Production Updates"
        if theme in _THEMES_TAKING_LEXICON:
            term = _pick_lexicon()
            if term:
                new_name = f"{term} — {name}"
                applied = True

        # 2. Theme + location: e.g. safety in Kalamazoo → "Kalamazoo — Safety First"
        if not applied and theme in _THEMES_TAKING_LOCATION and locs and loc_idx < min(2, len(locs)):
            loc = locs[loc_idx]
            new_name = f"{loc} — {name}"
            new_desc = f"{new_desc.rstrip('.')} for {loc}."
            loc_idx += 1
            applied = True

        # 3. Theme + dept: training → "Clinical Operations — Training & Development"
        if not applied and theme in _THEMES_TAKING_DEPT and depts:
            new_name = f"{depts[0]} — {name}"
            applied = True

        # 4. Brand-ownership groups → "<Company> <name>"
        if not applied and theme in _THEMES_TAKING_BRAND:
            new_name = f"{short_co} {name}"
            applied = True

        # 5. Fallback: still company-prefix so no group reads as generic
        if not applied:
            new_name = f"{short_co} {name}"

        groups.append([new_name, new_desc])

    return groups[:8]


# ── Staffbase API helpers (per-request credentials) ──────────────────────────
# All calls use credentials extracted by get_creds() from X-SB-Base / X-SB-Token
# request headers, so each API call targets the correct Staffbase instance.
# Staffbase REST API base path: https://<instance>.staffbase.com/api

def sb_get(base, hdrs, path, params=None):
    """GET {base}{path} — raises on non-2xx."""
    r = http.get(f"{base}{path}", headers=hdrs, params=params, timeout=15)
    r.raise_for_status()
    return r.json()

def sb_post(base, hdrs, path, payload):
    """POST {base}{path} with JSON payload — returns raw response (caller checks status)."""
    return http.post(f"{base}{path}", headers=hdrs, json=payload, timeout=15)

def sb_post_raw(base, hdrs, path, raw_data):
    """POST with raw bytes body (used for group membership — API expects raw JSON array)."""
    return http.post(f"{base}{path}", headers=hdrs, data=raw_data, timeout=15)

def get_clone_users(base, hdrs):
    """Staffbase API: GET /users?status=activated&limit=100
    Returns only users whose email address contains the word 'clone'.
    Demo instances are pre-loaded with clone users (e.g. clone1@example.com)
    that represent real personas — these are the accounts we rename during deploy.
    """
    data = sb_get(base, hdrs, "/users", {"status": "activated", "limit": 100})
    return [u for u in data.get("data", [])
            if any("clone" in e.get("value", "").lower() for e in u.get("emails", []))]

def get_all_groups(base, hdrs):
    """Staffbase API: GET /groups?limit=200 — returns full group list for the instance."""
    return sb_get(base, hdrs, "/groups", {"limit": 200}).get("data", [])

def upsert_group(base, hdrs, name, description):
    """Staffbase API: POST /groups — create a new enumeration group.
    If the API returns 409 Conflict (group already exists), falls back to
    GET /groups to find and return the existing group's ID.
    """
    payload = {
        "name": name, "type": "enumeration",
        "config": {"localization": {"en_US": {"title": name, "description": description}}, "showInOverview": True},
    }
    r = sb_post(base, hdrs, "/groups", payload)
    if r.status_code in (200, 201):
        return r.json()["id"], "created"
    if r.status_code == 409:
        # Group name is unique per instance — find it by name match
        for g in get_all_groups(base, hdrs):
            if g["name"].lower() == name.lower():
                return g["id"], "exists"
    return None, f"error_{r.status_code}"

def rename_group(base, hdrs, gid, name, description):
    """Staffbase API: POST /groups/{id} — update group name and localised title/description."""
    r = sb_post(base, hdrs, f"/groups/{gid}", {
        "name": name,
        "config": {"localization": {"en_US": {"title": name, "description": description}}, "showInOverview": True},
    })
    return r.status_code in (200, 201, 204)

def assign_to_group(base, hdrs, gid, user_ids):
    """Staffbase API: POST /groups/{id}/users — add user IDs to group membership.
    Body must be a raw JSON array (not a dict), hence sb_post_raw.
    """
    r = sb_post_raw(base, hdrs, f"/groups/{gid}/users", json.dumps(user_ids))
    return r.status_code in (200, 201, 202, 204)

def update_user(base, hdrs, uid, payload):
    """Staffbase API: POST /users/{id} — update user profile fields (name, position, dept)."""
    r = sb_post(base, hdrs, f"/users/{uid}", payload)
    return r.status_code == 200

def patch_user(base, hdrs, uid, payload):
    """Staffbase API: PATCH /users/{id} with v3 accessor headers — used for profile.system_manager
    and other fields that require the user-update.v1 content type."""
    merged = {**hdrs, **PATCH_HEADERS_EXTRA}
    r = http.patch(f"{base}/users/{uid}", headers=merged, json=payload, timeout=15)
    return r.status_code in (200, 204)

def set_manager(base, hdrs, uid, manager_uid):
    """Set a user's manager (system_manager profile field). Pass manager_uid=None to clear."""
    return patch_user(base, hdrs, uid, {"profile": {"system_manager": manager_uid or ""}})

def delete_group(base, hdrs, gid):
    """Staffbase API: DELETE /groups/{id} — used by reset to remove groups created during deploy."""
    r = http.delete(f"{base}/groups/{gid}", headers=hdrs, timeout=15)
    return r.status_code in (200, 202, 204)

# ── Manager hierarchy assignment ─────────────────────────────────────────────
# Builds a {uid: manager_uid} map from the deployed users by tiering job titles.
# Tier 1 (no manager / org root): VP, Chief, C-suite, President, Director, Head of
# Tier 2 (mid management):        Manager, Lead, Principal
# Tier 3 (individual contributor): everyone else
# Within each role_type, ICs report to a tier-2 (round-robin), tier-2s report to
# the role_type's tier-1 head. Cross-role: comms/frontline heads report to the
# corporate tier-1 head if one exists, giving the org a single root.

_TIER1_KEYWORDS = ("chief", "ceo", "cfo", "cto", "coo", "cmo", "cdo",
                   "president", "director", "head of", "vp ", "vp,", " vp")
_TIER2_KEYWORDS = ("manager", " lead", "principal", "supervisor")

def _tier_of_title(title):
    t = (title or "").lower()
    if any(k in t for k in _TIER1_KEYWORDS) or t.startswith("vp"):
        return 1
    if any(k in t for k in _TIER2_KEYWORDS):
        return 2
    return 3

def build_manager_assignments(updated_users):
    """Returns {uid: manager_uid} for every user that should have a manager.
    Users not in the dict are roots (no manager). updated_users format:
    {uid: {"role_type": "...", "position": "...", ...}}
    """
    by_role = {"comms": [], "corporate": [], "frontline": []}
    for uid, info in updated_users.items():
        rt = info.get("role_type", "corporate")
        by_role.setdefault(rt, []).append((uid, _tier_of_title(info.get("position", ""))))

    # Sort each role by tier ascending so the head is first
    for rt in by_role:
        by_role[rt].sort(key=lambda x: x[1])

    # Pick head (lowest tier) per role_type
    heads = {rt: users[0][0] for rt, users in by_role.items() if users}
    corp_head = heads.get("corporate")

    assignments = {}
    for rt, users in by_role.items():
        if not users:
            continue
        head_uid = heads[rt]
        # Head of comms/frontline -> corporate head (if it exists and isn't us)
        if rt != "corporate" and corp_head and corp_head != head_uid:
            assignments[head_uid] = corp_head

        # Mid-tier (tier 2) candidates within this role
        tier2 = [u for u, t in users if t == 2 and u != head_uid]
        if not tier2:
            tier2 = [head_uid]   # no mid-tier — ICs go straight to head
        # Tier-2s report to head
        for u in tier2:
            if u != head_uid:
                assignments[u] = head_uid
        # Tier-3 / ICs report to a tier-2 (round-robin)
        ics = [u for u, t in users if u != head_uid and u not in tier2]
        for i, u in enumerate(ics):
            assignments[u] = tier2[i % len(tier2)]
    return assignments

# ── Snapshot / reset ─────────────────────────────────────────────────────────
# Before each deploy, take_snapshot() captures the current state of all clone
# users and all groups so /api/reset can roll the instance back. Snapshots are
# stored as timestamped JSON files in ./snapshots/, scoped per instance host.

def _instance_host(base):
    return base.replace("https://", "").replace("http://", "").split("/")[0]

def _user_snapshot_fields(u):
    """Extract the fields we'll need to restore a user back to its pre-deploy state."""
    profile = u.get("profile") or {}
    return {
        "id":         u.get("id"),
        "firstName":  u.get("firstName", ""),
        "lastName":   u.get("lastName", ""),
        "position":   u.get("position", "") or profile.get("position", ""),
        "department": u.get("department", "") or profile.get("department", ""),
        "system_manager": profile.get("system_manager", "") or "",
    }

def _group_snapshot_fields(g):
    cfg  = g.get("config") or {}
    loc  = (cfg.get("localization") or {}).get("en_US") or {}
    return {
        "id":          g.get("id"),
        "name":        g.get("name", ""),
        "title":       loc.get("title", g.get("name", "")),
        "description": loc.get("description", ""),
    }

def take_snapshot(base, hdrs, company):
    """Capture clone-user + group state into a timestamped JSON file. Returns the
    snapshot dict (caller will append modified_user_ids / new_group_ids after deploy)."""
    clone_users = get_clone_users(base, hdrs)
    all_groups  = get_all_groups(base, hdrs)
    snap = {
        "timestamp":     datetime.utcnow().isoformat() + "Z",
        "instance_host": _instance_host(base),
        "company":       company,
        "users_before":  [_user_snapshot_fields(u) for u in clone_users],
        "groups_before": [_group_snapshot_fields(g) for g in all_groups],
        # Populated after deploy completes:
        "modified_user_ids":  [],
        "renamed_group_ids":  [],
        "new_group_ids":      [],
    }
    return snap

def save_snapshot(snap):
    """Write snapshot JSON to disk. Filename: <host>__<timestamp>.json"""
    ts   = snap["timestamp"].replace(":", "-")
    host = snap["instance_host"].replace(".", "-")
    path = SNAPSHOT_DIR / f"{host}__{ts}.json"
    path.write_text(json.dumps(snap, indent=2))
    return path.name

def list_snapshots(host=None):
    """List snapshots, optionally filtered to a host. Newest first."""
    files = sorted(SNAPSHOT_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    out = []
    for f in files:
        try:
            data = json.loads(f.read_text())
            if host and data.get("instance_host") != host:
                continue
            out.append({
                "filename":     f.name,
                "timestamp":    data.get("timestamp"),
                "instance_host":data.get("instance_host"),
                "company":      data.get("company"),
                "user_count":   len(data.get("users_before", [])),
                "group_count":  len(data.get("groups_before", [])),
                "new_group_ids":data.get("new_group_ids", []),
            })
        except Exception:
            continue
    return out

def load_snapshot(filename):
    path = SNAPSHOT_DIR / filename
    if not path.exists() or path.parent != SNAPSHOT_DIR:
        return None
    return json.loads(path.read_text())

def restore_snapshot(base, hdrs, snap):
    """Roll the instance back: restore user fields, rename groups back, delete new groups.
    Returns a deploy-style log of operations."""
    log = []
    def entry(step, msg, status="ok"): log.append({"step": step, "msg": msg, "status": status})

    modified_uids   = set(snap.get("modified_user_ids") or [])
    renamed_gids    = set(snap.get("renamed_group_ids") or [])
    new_gids        = list(snap.get("new_group_ids") or [])
    users_by_id     = {u["id"]: u for u in snap.get("users_before", []) if u.get("id")}
    groups_by_id    = {g["id"]: g for g in snap.get("groups_before", []) if g.get("id")}

    # 1. Restore user fields (only those we modified, or all snapshotted if list is empty)
    target_uids = modified_uids or set(users_by_id.keys())
    for uid in target_uids:
        u = users_by_id.get(uid)
        if not u: continue
        # Restore name/position/department via the standard POST
        update_user(base, hdrs, uid, {
            "firstName":  u.get("firstName", ""),
            "lastName":   u.get("lastName", ""),
            "position":   u.get("position", ""),
            "department": u.get("department", ""),
        })
        # Restore (or clear) system_manager via PATCH
        set_manager(base, hdrs, uid, u.get("system_manager") or None)
        entry("restore_user", f"Restored: {u.get('firstName','')} {u.get('lastName','')}")

    # 2. Rename groups back
    for gid in (renamed_gids or set(groups_by_id.keys())):
        g = groups_by_id.get(gid)
        if not g: continue
        ok = rename_group(base, hdrs, gid, g.get("name",""), g.get("description",""))
        entry("restore_group", f"Renamed back: {g.get('name','')}", "ok" if ok else "error")

    # 3. Delete groups created during the deploy
    for gid in new_gids:
        ok = delete_group(base, hdrs, gid)
        entry("delete_group", f"Deleted new group: {gid}", "ok" if ok else "error")

    return log

# ── Brief Analysis ────────────────────────────────────────────────────────────
# ── Brief analysis ────────────────────────────────────────────────────────────
# Called by POST /api/analyze.
# Combines company extraction, industry scoring, description selection,
# and explicit persona detection into one payload the frontend uses
# to pre-populate Step 2 (People) and Step 3 (Configure).
def analyze_brief(text, manual_company=None):
    """Parse a customer brief. If `manual_company` is provided, it bypasses
    automatic company extraction (used when the user supplies the name after
    the extractor returned None)."""
    text_lower = text.lower()

    # Score each industry by how many of its keywords appear in the brief.
    # Highest score wins; ties default to "other".
    industry, best = "other", 0
    for ind, keywords in INDUSTRY_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in text_lower)
        if score > best:
            best, industry = score, ind

    company = (manual_company or "").strip() or _extract_company(text)

    # If we couldn't confidently identify the company AND the user didn't supply
    # one manually, return a sentinel so the frontend can prompt instead of
    # proceeding with a guess. We still return the industry guess so the user
    # has context, but skip description / personas (they need a company anchor).
    if not company:
        return {
            "company":           None,
            "needs_company":     True,
            "industry":          industry,
            "industry_label":    INDUSTRIES[industry]["label"],
            "description":       "",
            "template":          {k: v for k, v in INDUSTRIES[industry].items() if k != "groups"},
            "detected_personas": [],
        }

    # Strip leading "Client: X" / "Company: X" header lines before sentence-splitting
    # so they don't bleed into the description.
    clean_text = re.sub(
        r"^(?:Client|Company|Account(?:\s+Name)?|Organization|Customer|Prospect)\s*(?::\s*|\s+-\s+).+\n?",
        "", text.strip(), flags=re.IGNORECASE | re.MULTILINE
    ).strip()

    # Pick the first substantive sentence (>40 chars) that mentions the company
    # or a business-context term.  Skip sentences that start with connective
    # words ("And lets use…", "Let's start…") — those are demo-script transitions.
    sentences   = re.split(r"(?<=[.!?])\s+", clean_text)
    co_lower    = company.lower()
    biz_terms   = ["employees","staff","organization","headquartered","founded","serves",
                   "business","network","group","company","acquisition","strategy"]
    SKIP_STARTS = {"and ","but ","or ","let's ","let ","here ","jumping ","going ",
                   "for the purpose","as a bonus","assembly","john ","julie ","liz "}
    description = ""

    # Priority 1: sentence explicitly mentions the company — always informative
    for s in sentences:
        if len(s) > 40 and co_lower in s.lower():
            description = s[:250]
            break

    # Priority 2: first sentence with business context terms that doesn't start
    # with an obviously non-descriptive word
    if not description:
        for s in sentences:
            if len(s) > 40:
                sl = s.lower()
                if any(sl.startswith(sk) for sk in SKIP_STARTS):
                    continue
                if any(t in sl for t in biz_terms):
                    description = s[:250]
                    break

    # Fallback: first non-skipped sentence of any content
    if not description:
        description = next(
            (s for s in sentences if len(s) > 40
             and not any(s.lower().startswith(sk) for sk in SKIP_STARTS)),
            clean_text[:200]
        )[:250]

    # Extract explicitly named personas from demo scripts / structured briefs.
    # Returns list of profile dicts pre-classified as comms / corporate / frontline.
    detected_personas = _extract_personas(text)

    return {
        "company":            company,
        "needs_company":      False,
        "industry":           industry,
        "industry_label":     INDUSTRIES[industry]["label"],
        "description":        description,
        "template":           {k: v for k, v in INDUSTRIES[industry].items() if k != "groups"},
        "detected_personas":  detected_personas,
    }

def _extract_company(text):
    # ── 1. Explicit field label: "Client:", "Company:", "Account Name:", etc. ──
    # Use (?::\s*|\s+-\s+) so "company-wide" (no spaces around hyphen) never matches.
    m = re.search(
        r"(?:Client|Company|Account(?:\s+Name)?|Organization|Customer|Prospect)\s*(?::\s*|\s+-\s+)(.+)",
        text, re.IGNORECASE | re.MULTILINE
    )
    if m:
        raw = m.group(1).strip()
        raw = re.split(r"\s+(?:is\s+an?\b|are\s+a\b|has\s+been\b|provides?\b|offers?\b)|[,\|;]", raw)[0]
        candidate = " ".join(raw.split()[:5]).strip().rstrip(".:-")
        if len(candidate) > 2:
            return candidate

    # ── 1b. Header line with no colon: "Account Stryker", "Client Stryker" ─────
    # Common in pasted demo briefs where the label and name are on the same line
    # without punctuation. Capture only the trailing identifier word(s).
    m = re.search(
        r"(?:^|\n)\s*(?:Client|Company|Account(?:\s+Name)?|Organization|Customer|Prospect)\s+([A-Z][\w&\.\- ]{1,40})",
        text, re.MULTILINE
    )
    if m:
        raw = m.group(1).strip()
        # Stop at common follow-on tokens that aren't part of the name
        raw = re.split(r"\s+(?:Demo|Brief|Personas?|Overview|Flow|Script|Deck|RFP|Proposal)\b", raw, 1, re.IGNORECASE)[0]
        candidate = " ".join(raw.split()[:4]).strip().rstrip(".:-")
        if len(candidate) > 2 and candidate.split()[0].lower() not in {"name"}:
            return candidate

    # ── 2. "Demo Brief for X" / "Prepared for X" ─────────────────────────────
    m = re.search(
        r"(?:Demo\s+Brief\s+for|Brief\s+for|Prepared\s+for|Demo\s+for)\s*:?\s*(.+)",
        text, re.IGNORECASE | re.MULTILINE
    )
    if m:
        raw = m.group(1).strip()
        raw = re.split(r"[,\|;\n]|\s+(?:is\s|are\s|has\s)", raw)[0]
        candidate = " ".join(raw.split()[:4]).strip().rstrip(".:-")
        if len(candidate) > 2:
            return candidate

    # ── 3. Short standalone header line (before "is a" to avoid false matches) ─
    SKIP = re.compile(
        r"^(?:Demo|Brief|Prepared|Date|Subject|RE:|To:|From:|Hello|Hi|Dear|The|This"
        r"|We\s|Our\s|Personas?:|Editor|Assembly|Associate|Sales|Note|Here|Let|And"
        r"|Going|Overview|For:|Agenda)",
        re.IGNORECASE
    )
    for line in text.strip().splitlines()[:6]:
        line = line.strip()
        if not line or SKIP.match(line) or len(line) > 60 or len(line) < 3:
            continue
        # Strip trailing "- Demo Brief", "| Proposal" etc.
        line = re.sub(
            r"\s*[-|]\s*(?:Demo|Brief|Proposal|RFP|Pitch|Script|Overview|Deck).*$",
            "", line, flags=re.IGNORECASE
        ).strip()
        words = line.split()
        if not words:
            continue
        cap_count = sum(1 for w in words if w and (w[0].isupper() or not w[0].isalpha()))
        if cap_count >= max(1, len(words) * 0.65) and 1 <= len(words) <= 6:
            return line.title() if line == line.upper() else line

    # ── 4. Scored context search — brand-signal patterns ─────────────────────
    # Score each candidate by how often it appears in company-like contexts.
    # Personal names (Liz, John) rarely appear with "at X", "X news", "X strategy".
    _NOISE = {
        "Staffbase","AI","App","Microsoft","Teams","Email","French","German",
        "English","Spanish","Monday","Tuesday","Wednesday","Thursday","Friday",
        "Saturday","Sunday","Here","Let","And","Going","While","Once","Maybe",
        "Editor","Assembly","Associate","Sales","Manager","Director","CEO","HR",
    }
    scores = {}
    for pat, weight in [
        (r"\bat\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)\b",                         3),
        (r"\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)'s\b",                            2),
        (r"\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)\s+"
         r"(?:platform|employees?|team|strategy|acquisition|news|culture|communications?|AI)\b", 2),
        (r"\binto\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)\b",                       1),
    ]:
        for hit in re.findall(pat, text):
            if hit and hit not in _NOISE and len(hit) > 2:
                scores[hit] = scores.get(hit, 0) + weight
    if scores:
        best = max(scores, key=scores.get)
        if scores[best] >= 3:
            return best

    # ── 5. "CompanyName is a/an/are/was..." at line start ─────────────────────
    # Filtered: name must be ≥2 words or a known multi-cap token to avoid "Here is an"
    m = re.search(
        r"^([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9&'\-]+)+)\s+(?:is\s+an?\b|are\s+a\b|has\s+been\b|was\s+founded)",
        text, re.MULTILINE
    )
    if m:
        return m.group(1).strip()

    # ── 6. Raw frequency of capitalized words (≥3 appearances) ───────────────
    _STOP_FREQ = _NOISE | {
        "The","A","An","In","And","Or","For","Of","At","To","This","Their","Our",
        "With","By","From","On","Its","We","They","Has","It","You","Your","Also",
    }
    raw_freq = {}
    for w in re.findall(r'\b([A-Z][A-Za-z]{2,})\b', text):
        if w not in _STOP_FREQ:
            raw_freq[w] = raw_freq.get(w, 0) + 1
    if raw_freq:
        best = max(raw_freq, key=raw_freq.get)
        if raw_freq[best] >= 3:
            return best

    # No high- or medium-confidence match — return None so the caller can ask
    # the user instead of fabricating something like "the organization" or
    # plucking the first capitalised words it sees (which produced bad guesses
    # like extracting persona names as the company).
    return None


# ── Persona extraction from brief text ───────────────────────────────────────
# Reads explicitly defined personas from demo scripts / structured briefs.
# Handles two common formats:
#   Format A — "Role (Context): First Last"   e.g. "Editor (Desktop): Liz Clark"
#   Format B — "Job Title ... who we'll call 'Name'"  e.g. "Assembly Technician at
#               Kalamazoo, MI (hourly employee) ... who we'll call 'John'"
# Each persona is classified into comms / corporate / frontline based on title
# keywords and contextual signals like "(hourly employee)" or "(salaried EE)".
def _extract_personas(text):
    personas = []
    seen     = set()

    # Labels that look like field headers, not job titles — skip these in Format A
    LABEL_SKIP = {
        "client","company","account","organization","customer","date","subject",
        "industry","location","re","to","from","by","version","prepared",
    }

    def _classify_role_type(title_text, context=""):
        """Map a job title + surrounding context to comms / corporate / frontline."""
        t  = (title_text + " " + context).lower()
        # Deskless / frontline indicators
        if any(k in t for k in [
            "technician","operator","driver","nurse","worker","hourly","floor ",
            "store associate","teller","cashier","server","bartender","chef",
            "housekeeper","mechanic","assembl","electrician","welder","warehouse",
            "delivery","caregiver","aide","linework","field tech","plant worker",
            "hourly employee","shift worker",
        ]):
            return "frontline"
        # Communications / editorial indicators
        if any(k in t for k in [
            "communication","editor","comms","pr ","brand","marketing","content",
            "internal comm","corporate comm","employee experience","engagement manager",
        ]):
            return "comms"
        # Everything else is corporate / office
        return "corporate"

    def _add(first, last, position, role_type, location=""):
        """Add a persona if not already seen (deduplicated by name)."""
        key = (first + last).lower().strip()
        if not key or key in seen or (not first and not last):
            return
        seen.add(key)
        # Single-name personas (e.g. "John") get a deterministic fallback last name
        if not last:
            fallback_pool = FALLBACK_NAMES.get(role_type, FALLBACK_NAMES["corporate"])
            last = fallback_pool[sum(ord(c) for c in first) % len(fallback_pool)][1]
        pos = position.strip()
        personas.append({
            "firstName":  first.strip(),
            "lastName":   last.strip(),
            "position":   pos,
            "department": _infer_dept(pos),
            "location":   location.strip(),
            "url":        "",
            "source":     "brief",    # displayed as "Brief" badge in UI
            "role_type":  role_type,
        })

    # ── Format A: "Role (optional context): First Last" ──────────────────────
    # Matches "Editor (Desktop): Liz Clark",  "HR Manager: Sarah Chen", etc.
    for m in re.finditer(
        r"([A-Za-z][A-Za-z &/\-]{1,50}?)\s*(?:\([^)]{1,40}\))?\s*:\s*([A-Z][a-z]{1,15})\s+([A-Z][a-z]{1,20})\b",
        text
    ):
        role_raw = m.group(1).strip()
        first    = m.group(2)
        last     = m.group(3)

        # Skip header-style fields (Client:, Company:, Industry:, etc.)
        if role_raw.lower().rstrip("s") in LABEL_SKIP:
            continue
        # Require multi-word role OR a known single-word title keyword
        title_kws = ["editor","manager","director","officer","lead","rep","vp","nurse","engineer"]
        if len(role_raw.split()) < 2 and not any(k in role_raw.lower() for k in title_kws):
            continue

        rt = _classify_role_type(role_raw, text[m.start():m.end()+100])
        # Strip "(Desktop)" / "(Mobile)" annotations from the displayed position
        clean_role = re.sub(r"\s*\([^)]+\)", "", role_raw).strip()
        _add(first, last, clean_role, rt)

    # ── Format B: "Job Title [at Location, ST] [(context)] who we'll call 'Name'" ─
    # Matches: "Assembly Technician at Kalamazoo, MI (hourly employee) ... who we'll call 'John'"
    #          "Associate Sales Representative in Montreal (salaried EE) ... who we'll call 'Julie'"
    # Note: title char class includes comma + period so "Kalamazoo, MI" is captured.
    for m in re.finditer(
        r"([A-Z][A-Za-z &,\.\-]{4,80}?)\s*(?:\([^)]*\)\s*)*(?:this\s+image[^\n]*?)?"
        r"\bwho\s+we'?ll\s+call\s+[\"']?([A-Z][a-z]+)[\"']?",
        text
    ):
        title_raw = m.group(1).strip()
        name      = m.group(2).strip()

        # Pull "at/in Location, ST" from the title fragment
        loc_m    = re.search(r"(?:at|in)\s+([A-Z][A-Za-z]+(?:,\s*[A-Z]{2})?)", title_raw)
        location = loc_m.group(1) if loc_m else ""

        # Strip "at/in Location..." from the displayed job title
        clean_title = re.sub(r"\s+(?:at|in)\s+[A-Za-z,. ]+$", "", title_raw).strip()

        # Use the full match context (incl. parentheticals like "(hourly employee)")
        # for accurate frontline vs. corporate classification
        context = text[m.start():m.end()]
        rt = _classify_role_type(clean_title, context)
        _add(name, "", clean_title, rt, location)

    return personas


# ── Multi-source People Search ────────────────────────────────────────────────
# Called by POST /api/search.
# Tool: ddgs.DDGS.text() (DuckDuckGo search, no API key) used at every step.
# Results are deduplicated by firstName+lastName and capped at max_results.

# Tokens commonly used as labels or legal suffixes — filtered out of company names
# before keyword-matching against search results, so e.g. "Account Stryker" still
# matches results that mention only "Stryker".
_COMPANY_NOISE_TOKENS = {
    "account", "client", "company", "customer", "the", "a", "an",
    "inc", "inc.", "incorporated", "corp", "corp.", "corporation",
    "llc", "ltd", "ltd.", "co.", "co", "plc", "ag", "gmbh", "sa", "limited",
    "group", "holdings", "global", "international",
}

def _company_keyword(company):
    """Return the most distinctive single token from a company name, used to
    verify search results actually mention this company. Falls back to the
    full string if every token is noise."""
    tokens = [t for t in re.split(r"[\s,&]+", (company or "").strip()) if t]
    distinctive = [t for t in tokens if t.lower().rstrip(".") not in _COMPANY_NOISE_TOKENS and len(t) >= 3]
    return max(distinctive, key=len) if distinctive else (company or "").strip()

def _result_mentions_company(text, company_kw):
    """Case-insensitive containment check used to filter parser output."""
    return bool(company_kw) and company_kw.lower() in (text or "").lower()

def search_people_multi(company, industry, role_type, template, max_results=6):
    """
    Search hierarchy:
      1. LinkedIn profiles via DuckDuckGo (site:linkedin.com/in)
      2. News & press releases naming real employees
      3. Company careers / org info for realistic titles
      4. Fallback: industry + company accurate generated profiles
    Real people take priority; generated clearly labelled with source="generated".
    """
    found, seen = [], set()
    company_kw  = _company_keyword(company)
    # Use the keyword in queries too, not the full label-prefixed string. This
    # is what stopped Stryker from matching when company was "Account Stryker".
    company_q   = company_kw or company

    def add(p):
        key = (p.get("firstName", "") + p.get("lastName", "")).lower().strip()
        if len(key) > 3 and key not in seen and p.get("firstName") and p.get("lastName"):
            seen.add(key)
            found.append(p)

    terms = template.get(f"{role_type}_search", [])
    terms_q = " OR ".join(f'"{t}"' for t in terms[:3])

    if HAS_DDGS:
        # ── 1. LinkedIn direct ──────────────────────────────────────────────
        _ddg_query(
            f'site:linkedin.com/in "{company_q}" ({terms_q})',
            lambda r: _parse_linkedin(r, company_kw), add, max_r=8, source="linkedin"
        )
        time.sleep(1.0)

        # ── 2. News / press releases with named individuals ─────────────────
        if len(found) < max_results:
            _ddg_query(
                f'"{company_q}" {terms[0]} (director OR manager OR joins OR named OR appointed)',
                lambda r: _parse_named_from_web(r, company_kw), add, max_r=10, source="web"
            )
            time.sleep(0.8)

        # ── 3. Broader role search (any web) ────────────────────────────────
        if len(found) < max_results:
            _ddg_query(
                f'"{company_q}" {terms[0]} staff OR team OR employee',
                lambda r: _parse_named_from_web(r, company_kw), add, max_r=8, source="web"
            )
            time.sleep(0.6)

        # ── 4. Try company careers page for real titles ──────────────────────
        if len(found) < max_results // 2:
            _ddg_query(
                f'"{company_q}" jobs OR careers {terms[0]}',
                lambda r: _parse_named_from_web(r, company_kw), add, max_r=6, source="web"
            )
            time.sleep(0.5)

    # ── 5. Fallback: company-aware generated profiles ───────────────────────
    needed = max_results - len(found)
    if needed > 0:
        # Try to find actual titles from careers search first
        real_titles = _scrape_company_titles(company, industry, role_type) if HAS_DDGS else []
        for p in _build_fallback(company, industry, role_type, real_titles, needed):
            add(p)

    return found[:max_results]


def _ddg_query(query, parser, add_fn, max_r=8, source="web"):
    """Run a DuckDuckGo text search (tool: ddgs.DDGS.text) and pass each parsed
    result to add_fn.  Swallows all exceptions so search failures never crash deploy.
    """
    try:
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_r):
                p = parser(r)
                if p:
                    p["source"] = source
                    add_fn(p)
    except Exception:
        pass


def _parse_linkedin(result, company_kw=""):
    title = result.get("title", "")
    body  = result.get("body",  "")
    url   = result.get("href",  "")
    if "linkedin.com/in/" not in url:
        return None
    # Reject profiles that don't actually mention the target company anywhere.
    # DDG often returns LinkedIn results that loosely match keywords but are at
    # other companies (e.g. "Customer Success @ Topline Pro" when searching Stryker).
    if company_kw and not _result_mentions_company(title + " " + body, company_kw):
        return None

    # Split on first dash/pipe to isolate name segment
    name_segment = re.split(r"\s*[-–|]\s*", title)[0].strip()

    # Strip post-nominal credentials (RN, MSN, MD, PhD, MBA, etc.)
    name_segment = re.sub(
        r"[,\s]+(?:MSN|RN|BSN|DNP|NP|PA|MD|DO|PhD|MBA|PMP|PHR|SHRM[-\w]*|FAPA|IFMCP|CNE|RACR|CPA|JD|Esq\.?)[,\s]*",
        " ", name_segment, flags=re.IGNORECASE
    ).strip()

    parts = name_segment.split()
    # Must have at least first + last; skip if too short or clearly not a name
    if len(parts) < 2 or not parts[0][0].isupper():
        return None
    first = parts[0]
    last  = parts[1]  # take only second token to avoid "Jane Doe Smith Jones" artifacts
    # Reject obvious non-name first words (Dividend Info, Investor Day, Press Release, …)
    if first.lower() in _NON_NAME_FIRSTS or last.lower() in _NON_NAME_FIRSTS:
        return None

    # Extract position — look for segment between first dash and "at Company" or "|"
    pos = ""
    pos_m = re.search(r"[-–]\s*(.+?)(?:\s+at\s+.+?)?\s*(?:\||$)", title)
    if pos_m:
        pos = re.sub(r"\bat\b.+$", "", pos_m.group(1), flags=re.IGNORECASE).strip()
        # If position looks like another person's name (two caps), discard it
        if re.match(r"^[A-Z][a-z]+ [A-Z][a-z]+$", pos):
            pos = ""
    # Clean position string
    pos = re.sub(r"\s*[-–]\s*(?:Emplify Health|LinkedIn|Gundersen|Bellin).*$", "", pos, flags=re.IGNORECASE).strip()
    pos = re.sub(r"[,\s]+(?:MSN|RN|BSN|DNP|NP|MD|PhD|MBA|PMP|PHR|SHRM[-\w]*|CSM|PSM|CPA)[,\s]*", " ", pos, flags=re.IGNORECASE).strip()
    pos = pos.strip(",").strip() or "Staff"

    # Reject job-posting-style descriptions (too long or all lowercase start)
    if len(pos) > 60 or re.search(r"\b(hiring|we are|join|apply|opportunity)\b", pos, re.IGNORECASE):
        pos = "Staff"

    # Strip trailing comma from last name (parsing artifact)
    last = last.rstrip(",")

    # Extract location
    loc_m = re.search(r"(?:Greater|Area|Location)[\s:]+([A-Za-z, ]+?)(?:\.|,|$)", body, re.IGNORECASE)
    loc   = loc_m.group(1).strip() if loc_m else ""

    # Sanity check
    if len(first) < 2 or len(last) < 2 or not last[0].isupper():
        return None

    return {"firstName": first, "lastName": last, "position": pos,
            "department": _infer_dept(pos), "location": loc, "url": url,
            "display": f"{first} {last} — {pos}"}


_NON_NAME_FIRSTS = {
    # Words that look like a name slot but aren't — common on financial /
    # corporate news pages and produced bogus personas like "Dividend Info".
    "dividend","quarterly","annual","investor","press","news","earnings","fiscal",
    "headquarters","headlines","company","corporate","official","welcome","about",
    "contact","privacy","terms","cookie","copyright","subscribe","read","share",
    "today","yesterday","tomorrow","monday","tuesday","wednesday","thursday",
    "friday","saturday","sunday","january","february","march","april","may",
    "june","july","august","september","october","november","december","wikipedia",
}

def _parse_named_from_web(result, company):
    """Extract name + title from news/press/web snippets. `company` here is the
    distinctive keyword (already passed through _company_keyword) — results that
    don't mention it anywhere are rejected as off-target."""
    text = result.get("title", "") + " " + result.get("body", "")
    url  = result.get("href", "")
    if company and not _result_mentions_company(text, company):
        return None

    # Patterns for "Name, Title" or "Title Name" in snippets
    patterns = [
        # "John Smith, Director of Communications"
        r"\b([A-Z][a-z]{1,14})\s+([A-Z][a-z]{1,20}),\s+((?:Director|Manager|VP|Chief|Head|President|Officer|Coordinator|Specialist|Nurse|Supervisor|Lead|Senior)[^,\.\n]{3,55})",
        # "Dr. Jane Doe, Chief Medical Officer"
        r"(?:Dr\.|Mr\.|Ms\.|Mrs\.)\s+([A-Z][a-z]{1,14})\s+([A-Z][a-z]{1,20}),\s+([A-Z][^,\.\n]{4,55})",
        # In HTML-stripped job titles pattern
        r"\b([A-Z][a-z]{1,14})\s+([A-Z][a-z]{1,20})\s+(?:is the|serves as|joins as|was named)\s+((?:[A-Z][a-z]+ ?){2,6})",
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            first, last, pos = m.group(1), m.group(2), m.group(3).strip()
            if (len(pos) > 5
                    and first.lower() not in {"the","and","our","for","with","from","this","that"}
                    and first.lower() not in _NON_NAME_FIRSTS
                    and last.lower()  not in _NON_NAME_FIRSTS):
                return {"firstName": first, "lastName": last, "position": pos,
                        "department": _infer_dept(pos), "location": "", "url": url,
                        "display": f"{first} {last} — {pos}"}
    return None


def _scrape_company_titles(company, industry, role_type):
    """Extract actual job titles from company's careers/job postings."""
    titles = []
    try:
        query = f'"{company}" site:indeed.com OR site:linkedin.com/jobs OR site:glassdoor.com'
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=6):
                text = r.get("title", "") + " " + r.get("body", "")
                hits = re.findall(
                    r"\b((?:Director|Manager|Specialist|Coordinator|VP|Chief|Head|Officer|Supervisor|Lead|Senior|Staff|Registered|Licensed)\s+(?:of\s+)?[A-Z][a-zA-Z &\-]{3,40})",
                    text
                )
                titles.extend(t.strip() for t in hits if 8 < len(t.strip()) < 55)
    except Exception:
        pass
    # Deduplicate and return
    return list(dict.fromkeys(titles))[:8]


def _build_fallback(company, industry, role_type, real_titles, count):
    """Build generated profiles using real titles (if found) or industry defaults."""
    ind_titles = FALLBACK_TITLES.get(industry, FALLBACK_TITLES["other"])
    titles     = real_titles if len(real_titles) >= 2 else ind_titles.get(role_type, ["Staff Member"])
    names      = FALLBACK_NAMES.get(role_type, FALLBACK_NAMES["corporate"])

    profiles = []
    for i in range(min(count, len(names))):
        first, last = names[i % len(names)]
        pos = titles[i % len(titles)]
        profiles.append({
            "firstName":  first,
            "lastName":   last,
            "position":   pos,
            "department": _infer_dept(pos),
            "location":   "",
            "url":        "",
            "display":    f"{first} {last} — {pos}",
            "source":     "generated",
        })
    return profiles


def _infer_dept(pos):
    p = pos.lower()
    for dept, kws in [
        ("Communications", ["comms", "communications", "pr ", "public relations", "content", "marketing", "brand"]),
        ("Human Resources", ["hr ", "human resources", "people ops", "talent", "recruiting"]),
        ("Finance",         ["financ", "accounting", "payroll", "treasury", "audit"]),
        ("Operations",      ["operations", "ops", "logistics", "supply chain"]),
        ("Sales",           ["sales", "business development", "account exec"]),
        ("Technology",      ["engineering", "software", "developer", "data ", "devops", "tech"]),
        ("Clinical",        ["nurse", "clinical", "medical", "care", "patient", "health"]),
    ]:
        if any(k in p for k in kws):
            return dept
    return "Operations"

# ── Group selector ────────────────────────────────────────────────────────────
def pick_groups_to_refresh(all_groups, count=8):
    """Sort existing Staffbase groups by GROUP_REFRESH_SCORE and return the
    top `count` — these are the placeholder/test groups most worth renaming.
    Groups not in the score dict score 0 and are picked last.
    """
    def score(g):
        n = g["name"].lower()
        return sum(pts for kw, pts in GROUP_REFRESH_SCORE.items() if kw in n)
    return sorted(all_groups, key=score, reverse=True)[:count]

# ── User mapper ───────────────────────────────────────────────────────────────
def map_profiles_to_clones(profiles, clone_users):
    """Match found/generated profiles to clone users by role affinity.
    Clone users already in the instance (email contains "clone") are sorted by
    how well their current position/department matches the target role type, then
    assigned in order.  Each clone user is used at most once (tracked via `used`).
    """
    def affinity(user, role_type):
        """Score how well a clone user's existing metadata fits a role bucket."""
        txt = f"{user.get('position','').lower()} {user.get('department','').lower()}"
        kws = {
            "comms":     ["communications","marketing","content","pr","brand","media","engagement"],
            "corporate": ["manager","director","coordinator","analyst","specialist","head","officer","lead"],
            "frontline": ["worker","operator","technician","associate","assistant","driver","representative"],
        }
        return sum(1 for k in kws.get(role_type, []) if k in txt)

    mapping, used = {}, set()
    for role_type in ["comms", "corporate", "frontline"]:
        available = sorted(
            [u for u in clone_users if u["id"] not in used],
            key=lambda u: affinity(u, role_type), reverse=True
        )
        for i, profile in enumerate(profiles.get(role_type, [])):
            if i >= len(available):
                break
            clone = available[i]
            mapping[clone["id"]] = {**profile, "role_type": role_type,
                                     "clone_name": f"{clone.get('firstName','')} {clone.get('lastName','')}"}
            used.add(clone["id"])
    return mapping

# ── Flask Routes ──────────────────────────────────────────────────────────────
# All /api/* routes read Staffbase credentials from X-SB-Base and X-SB-Token headers
# (injected by apiFetch() in app.js) so the same server handles multiple demo instances.

@app.route("/")
def index():
    """Serve the single-page app shell (templates/index.html)."""
    return render_template("index.html")

@app.route("/api/ping", methods=["GET", "POST"])
def api_ping():
    """Test Staffbase connectivity. Called by the settings panel "Test Connection"
    button and on page load to colour the connection dot in the topbar.
    Staffbase API: GET /users?status=activated&limit=1
    """
    base, hdrs = get_creds()
    try:
        data = sb_get(base, hdrs, "/users", {"status": "activated", "limit": 1})
        instance = base.replace("/api", "").replace("https://", "")
        total    = data.get("total", "?")
        return jsonify({"ok": True, "instance": instance, "users": total,
                        "base": base, "msg": f"Connected — {total} activated users"})
    except Exception as e:
        return jsonify({"ok": False, "msg": str(e)}), 200

@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    """Step 1 → Step 2 transition.  Accepts either:
      - multipart/form-data with a .docx or .txt file (parsed with python-docx)
      - application/json with {"text": "..."} for pasted briefs
    Returns: company, industry, industry_label, description, template fields,
             and detected_personas (any explicitly named personas found in the brief).
    """
    text = ""
    if "file" in request.files:
        f = request.files["file"]
        if HAS_DOCX and f.filename.lower().endswith(".docx"):
            text = "\n".join(p.text for p in DocxDocument(BytesIO(f.read())).paragraphs)
        else:
            text = f.read().decode("utf-8", errors="ignore")
        manual_company = (request.form.get("manual_company") or "").strip()
    else:
        body = request.get_json(silent=True) or {}
        text = body.get("text", "")
        manual_company = (body.get("manual_company") or "").strip()
    if not text.strip():
        return jsonify({"error": "No brief text provided"}), 400
    return jsonify(analyze_brief(text, manual_company=manual_company or None))

@app.route("/api/search", methods=["POST"])
def api_search():
    """Step 2 Search button.
    Accepts: {"company", "industry", "spread": {"comms":N, "corporate":N, "frontline":N}}
    The spread dict comes from /api/research and controls how many profiles to fetch
    per column — default 3/6/6 if research hasn't completed yet.
    Tool: ddgs.DDGS.text() via search_people_multi() for each role type.
    Returns: {"comms": [...], "corporate": [...], "frontline": [...]}
    """
    body     = request.get_json(silent=True) or {}
    company  = body.get("company", "")
    industry = body.get("industry", "other")
    template = INDUSTRIES.get(industry, INDUSTRIES["other"])
    if not company:
        return jsonify({"error": "Company name required"}), 400

    # `or` (not just default) — frontend sends spread: null when /api/research
    # hasn't completed yet, and dict.get only falls back on missing keys.
    spread  = body.get("spread") or {"comms": 3, "corporate": 6, "frontline": 6}
    results = {}
    for role_type in ["comms", "corporate", "frontline"]:
        count = spread.get(role_type, 6)
        results[role_type] = search_people_multi(company, industry, role_type, template, count)
    return jsonify(results)

@app.route("/api/clone-users", methods=["GET"])
def api_clone_users():
    """Staffbase API: GET /users — returns clone users only (email contains 'clone').
    Called by buildPlanGrid() on the frontend to show which Staffbase accounts
    will be updated.  Not directly called during deploy (deploy re-fetches internally).
    """
    base, hdrs = get_creds()
    try:
        users = get_clone_users(base, hdrs)
        return jsonify({"users": users, "total": len(users)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/groups", methods=["GET"])
def api_groups():
    """Staffbase API: GET /groups — returns all groups in the instance.
    Called by buildPlanGrid() in Step 3 to populate the "Groups to Rename" table.
    """
    base, hdrs = get_creds()
    try:
        groups = get_all_groups(base, hdrs)
        return jsonify({"groups": groups, "total": len(groups)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/research", methods=["POST"])
def api_research():
    """Background research endpoint called immediately after Step 1 analysis.
    Accepts: {"company", "industry", "brief"}
    Returns org type, spread counts, locations, departments, tailored group names.
    May invoke DuckDuckGo (tool: ddgs.DDGS.text) for employee count if not in brief.
    Results power the Company Intelligence card and dynamic column counts in Step 2.
    """
    body       = request.get_json(silent=True) or {}
    company    = body.get("company", "")
    industry   = body.get("industry", "other")
    brief_text = body.get("brief", "")
    if not company:
        return jsonify({"error": "company required"}), 400
    return jsonify(research_company(company, industry, brief_text))

@app.route("/api/deploy", methods=["POST"])
def api_deploy():
    """Step 3 Deploy button — executes the full 6-step deployment sequence:
      1. Fetch clone users      Staffbase API: GET /users
      2. Map profiles → clones  (in-memory affinity matching)
      3. Update clone users     Staffbase API: POST /users/{id}  (name, position, dept)
      4. Create 3 new groups    Staffbase API: POST /groups
      5. Rename 8 existing groups  Staffbase API: POST /groups/{id}
      6. Assign users to groups    Staffbase API: POST /groups/{id}/users

    Accepts tailored_groups from /api/research; falls back to industry template defaults.
    Returns full deploy log, updated user list, new/refreshed group details.
    """
    base, hdrs = get_creds()
    body            = request.get_json(silent=True) or {}
    company         = body.get("company", "")
    industry        = body.get("industry", "other")
    profiles        = body.get("profiles", {})
    tailored_groups = body.get("tailored_groups", None)  # from S.research — None = use template defaults
    new_group_names = body.get("new_group_names", None)  # user-edited overrides for the 3 created groups: {comms, corporate, frontline}
    assign_managers = bool(body.get("assign_managers", False))
    template        = INDUSTRIES.get(industry, INDUSTRIES["other"])
    log       = []

    def entry(step, msg, status="ok"):
        log.append({"step": step, "msg": msg, "status": status})

    # 0. Snapshot current state so /api/reset can roll this deploy back later.
    try:
        snap = take_snapshot(base, hdrs, company)
        entry("snapshot", f"Snapshot taken: {len(snap['users_before'])} users, {len(snap['groups_before'])} groups")
    except Exception as e:
        snap = None
        entry("snapshot", f"Snapshot failed: {e}", "error")

    # 1. Fetch clone users
    try:
        clone_users = get_clone_users(base, hdrs)
        entry("fetch", f"Found {len(clone_users)} clone users")
    except Exception as e:
        return jsonify({"error": f"Could not fetch users: {e}", "log": log}), 500

    # 2. Map profiles → clone users
    mapping = map_profiles_to_clones(profiles, clone_users)
    entry("map", f"Mapped {len(mapping)} profiles to clone users")

    # 3. Update clone users
    updated_users = {}
    for uid, profile in mapping.items():
        ok = update_user(base, hdrs, uid, {
            "firstName":  profile["firstName"],
            "lastName":   profile["lastName"],
            "position":   profile.get("position", ""),
            "department": profile.get("department", ""),
        })
        name = f"{profile['firstName']} {profile['lastName']}"
        updated_users[uid] = {"name": name, "role_type": profile["role_type"],
                               "position": profile.get("position", ""),
                               "source": profile.get("source", "web")}
        entry("update_user", f"{'Updated' if ok else 'FAILED'}: {name} ({profile.get('position','')})", "ok" if ok else "error")

    # 4. Create 3 new groups (company-branded names; user-editable via new_group_names)
    short_co = " ".join(company.split()[:2])
    new_groups = {}
    for role_type, title_key in [("comms","comms_title"),("corporate","corporate_title"),("frontline","frontline_title")]:
        default = f"{short_co} — {template[title_key]}"
        gname   = (new_group_names or {}).get(role_type) or default
        gid, status = upsert_group(base, hdrs, gname, f"{template[title_key]} at {company}.")
        if gid:
            new_groups[role_type] = {"id": gid, "name": gname, "status": status}
            entry("create_group", f"{'Created' if status=='created' else 'Already exists'}: {gname}")
        else:
            entry("create_group", f"FAILED: {gname}", "error")

    # 5. Refresh 8 existing groups — for each existing group, generate a
    # company-aware name that PRESERVES its theme. Industry template names are
    # used as the base when their theme matches; otherwise the existing name is
    # kept (stripped of any prefix) so groups like "Innovation Hub" stay
    # innovation-themed and "DEI" stays DEI-themed.
    all_groups = get_all_groups(base, hdrs)
    new_ids    = {v["id"] for v in new_groups.values()}
    candidates = [g for g in all_groups if g["id"] not in new_ids]
    to_update  = pick_groups_to_refresh(candidates, count=8)

    research_for_rename = {
        "locations":   body.get("locations")   or [],
        "departments": body.get("departments") or [],
        "lexicon":     body.get("lexicon")     or [],
    }
    # Allow client-side edits to override the auto-generated names. The client
    # sends `rename_overrides: {existing_id: name}` when the user has typed a
    # new name into one of the inline plan-grid inputs.
    rename_overrides = body.get("rename_overrides") or {}

    refreshed = []
    for existing, new_name, new_desc in tailor_existing_groups(to_update[:8], company, industry, research_for_rename):
        if existing["id"] in rename_overrides:
            new_name = (rename_overrides[existing["id"]] or new_name).strip() or new_name
        ok = rename_group(base, hdrs, existing["id"], new_name, new_desc)
        refreshed.append({"id": existing["id"], "old": existing["name"], "new": new_name, "ok": ok})
        entry("rename_group",
              f"'{existing['name']}' [{_theme_of(existing['name'])}] → '{new_name}' [{_theme_of(new_name)}]",
              "ok" if ok else "error")

    # 6. Assign users to groups
    for role_type, grp in new_groups.items():
        uids = [uid for uid, info in updated_users.items() if info["role_type"] == role_type]
        if uids and grp.get("id"):
            ok = assign_to_group(base, hdrs, grp["id"], uids)
            entry("assign", f"Assigned {len(uids)} users → '{grp['name']}'", "ok" if ok else "error")

    # 7. Optional: assign manager hierarchy via PATCH /users/{id} {profile.system_manager}
    hierarchy_assignments = {}
    if assign_managers and updated_users:
        hierarchy_assignments = build_manager_assignments(updated_users)
        for uid, mgr_uid in hierarchy_assignments.items():
            ok = set_manager(base, hdrs, uid, mgr_uid)
            mgr_name = updated_users.get(mgr_uid, {}).get("name", mgr_uid)
            user_name = updated_users.get(uid, {}).get("name", uid)
            entry("set_manager", f"{user_name} → reports to {mgr_name}", "ok" if ok else "error")
        roots = [uid for uid in updated_users if uid not in hierarchy_assignments]
        for uid in roots:
            entry("set_manager", f"{updated_users[uid].get('name', uid)} → org root (no manager)")

    # Persist snapshot with the IDs of everything we modified (so reset can target them)
    snapshot_filename = None
    if snap:
        snap["modified_user_ids"] = list(updated_users.keys())
        snap["renamed_group_ids"] = [g["id"] for g in refreshed if g.get("ok")]
        snap["new_group_ids"]     = [g["id"] for g in new_groups.values() if g.get("status") == "created"]
        try:
            snapshot_filename = save_snapshot(snap)
            entry("snapshot_save", f"Snapshot saved: {snapshot_filename}")
        except Exception as e:
            entry("snapshot_save", f"Snapshot save failed: {e}", "error")

    return jsonify({
        "success": True, "company": company,
        "industry_label": template.get("label", industry),
        "updated_users": updated_users, "new_groups": new_groups,
        "refreshed_groups": refreshed, "log": log,
        "manager_assignments": {
            uid: {"manager_id": mgr, "manager_name": updated_users.get(mgr, {}).get("name", "")}
            for uid, mgr in hierarchy_assignments.items()
        },
        "snapshot": snapshot_filename,
    })

# ── Snapshot listing + reset ─────────────────────────────────────────────────
@app.route("/api/snapshots", methods=["GET"])
def api_snapshots():
    """List available snapshots, newest first. Optional ?host= filter."""
    base, _ = get_creds()
    host = request.args.get("host") or _instance_host(base)
    return jsonify({"snapshots": list_snapshots(host)})

@app.route("/api/plan-rename", methods=["POST"])
def api_plan_rename():
    """Preview the rename pairs the deploy will produce. The plan-grid renders
    these so the user sees the exact 'old → new' mapping before clicking deploy.
    Body: {"company", "industry", "locations", "departments", "lexicon"}.
    Calls Staffbase API: GET /groups (live existing groups for this instance)."""
    base, hdrs = get_creds()
    body  = request.get_json(silent=True) or {}
    company  = body.get("company", "")
    industry = body.get("industry", "other")
    research = {
        "locations":   body.get("locations")   or [],
        "departments": body.get("departments") or [],
        "lexicon":     body.get("lexicon")     or [],
    }
    try:
        all_groups = get_all_groups(base, hdrs)
    except Exception as e:
        return jsonify({"error": f"Could not fetch groups: {e}"}), 500
    to_update = pick_groups_to_refresh(all_groups, count=8)
    pairs = [
        {"id": existing["id"],
         "old": existing["name"],
         "old_theme": _theme_of(existing["name"]),
         "new": new_name,
         "new_theme": _theme_of(new_name)}
        for existing, new_name, _new_desc in tailor_existing_groups(to_update, company, industry, research)
    ]
    return jsonify({"pairs": pairs})

@app.route("/api/update-managers", methods=["POST"])
def api_update_managers():
    """Bulk-update manager hierarchy in the live instance.
    Body: {"assignments": {user_id: manager_id_or_null}}
    Pass null/empty for any user to clear their manager (becomes a root)."""
    base, hdrs = get_creds()
    body    = request.get_json(silent=True) or {}
    assigns = body.get("assignments") or {}
    log = []
    ok_count = 0
    for uid, mgr in assigns.items():
        ok = set_manager(base, hdrs, uid, mgr or None)
        if ok: ok_count += 1
        log.append({
            "uid": uid, "manager": mgr or "",
            "msg": f"{uid} → {mgr or 'no manager'}",
            "status": "ok" if ok else "error",
        })
    return jsonify({"success": True, "ok_count": ok_count, "total": len(log), "log": log})

@app.route("/api/reset", methods=["POST"])
def api_reset():
    """Roll an instance back to a saved snapshot. Body: {"snapshot": "<filename>"} or
    omit to use the most recent snapshot for the current instance host."""
    base, hdrs = get_creds()
    body     = request.get_json(silent=True) or {}
    filename = body.get("snapshot")
    if not filename:
        host = _instance_host(base)
        snaps = list_snapshots(host)
        if not snaps:
            return jsonify({"error": f"No snapshots found for {host}"}), 404
        filename = snaps[0]["filename"]

    snap = load_snapshot(filename)
    if not snap:
        return jsonify({"error": f"Snapshot not found: {filename}"}), 404

    log = restore_snapshot(base, hdrs, snap)
    return jsonify({
        "success":  True,
        "snapshot": filename,
        "company":  snap.get("company"),
        "instance_host": snap.get("instance_host"),
        "log":      log,
    })

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    print(f"\n  Staffbase Demo Group Tool  →  http://localhost:{port}\n")
    app.run(debug=True, port=port)
