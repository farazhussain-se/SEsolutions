/**
 * Industry Templates — ported from Faraz's standalone Flask tools so the
 * Personas/Groups + News-Rename flows in Replify share the same vocabulary.
 *
 * Sources:
 *   - staffbase-demo-group-tool/app.py  (PERSONA_INDUSTRIES — roles + groups)
 *   - staffbase-news-tool/app.py        (NEWS_INDUSTRIES   — channel templates)
 *
 * Kept verbatim from the originals so descriptions/labels stay consistent
 * with what the SE team already uses in demos. If you tweak titles or add
 * an industry, update BOTH tools and this file together.
 */

/* ── Personas (users + groups) ─────────────────────────────────────────────── */

export interface PersonaIndustry {
  label: string;
  /** Display title for the "communications" role bucket (Step 2 column 1). */
  commsTitle: string;
  /** Display title for the "corporate" role bucket (Step 2 column 2). */
  corporateTitle: string;
  /** Display title for the "frontline" role bucket (Step 2 column 3). */
  frontlineTitle: string;
  /** Keyword signals Gemini uses to classify existing users into the bucket. */
  commsSearch: string[];
  corporateSearch: string[];
  frontlineSearch: string[];
  /** 8 industry-themed groups: [name, description]. */
  groups: Array<[string, string]>;
}

export const PERSONA_INDUSTRIES: Record<string, PersonaIndustry> = {
  healthcare: {
    label: "Healthcare",
    commsTitle: "Communications & Patient Engagement",
    corporateTitle: "Clinical & Administrative Leadership",
    frontlineTitle: "Clinical & Care Staff",
    commsSearch: ["communications", "marketing", "patient engagement", "content"],
    corporateSearch: ["manager", "director", "administrator", "coordinator", "specialist"],
    frontlineSearch: ["nurse", "technician", "assistant", "aide", "therapist", "caregiver"],
    groups: [
      ["Patient Safety & Quality", "Updates on patient safety initiatives and quality improvement across all facilities."],
      ["Clinical Updates", "Latest clinical guidelines, protocols, and announcements for care teams."],
      ["HR & Employee Wellbeing", "Human resources news, benefits information, and employee wellness programs."],
      ["Shift Notifications", "Real-time shift updates, scheduling changes, and urgent communications."],
      ["Employee Recognition", "Celebrating team achievements, years of service, and exceptional care."],
      ["Leadership Forum", "Strategic updates and messages from clinical and administrative leadership."],
      ["Community & Volunteering", "Community health initiatives, volunteer opportunities, and outreach programs."],
      ["Training & Development", "Continuing education, certifications, mandatory training, and career development."],
    ],
  },
  manufacturing: {
    label: "Manufacturing",
    commsTitle: "Internal Communications",
    corporateTitle: "Operations & Management",
    frontlineTitle: "Production & Plant Workers",
    commsSearch: ["communications", "internal communications", "employee engagement"],
    corporateSearch: ["plant manager", "operations manager", "quality manager", "engineer", "supervisor"],
    frontlineSearch: ["operator", "technician", "mechanic", "assembler", "production worker"],
    groups: [
      ["Safety First", "Safety alerts, incident reports, and health & safety protocols for all plant staff."],
      ["Production Updates", "Daily production targets, line updates, and operational announcements."],
      ["Quality & Compliance", "Quality control updates, audit notices, and compliance requirements."],
      ["Shift Bulletin", "Shift handover notes, schedule changes, and time-sensitive updates."],
      ["Employee Recognition", "Celebrating safety milestones, performance awards, and team achievements."],
      ["Training & Compliance", "Mandatory training, certifications, and skills development programs."],
      ["Environment & Sustainability", "Environmental initiatives, sustainability goals, and green operations news."],
      ["HR & Benefits", "HR policies, payroll updates, benefits, and employee programs."],
    ],
  },
  retail: {
    label: "Retail",
    commsTitle: "Brand & Communications Team",
    corporateTitle: "Corporate & Regional Management",
    frontlineTitle: "Store Associates & Floor Staff",
    commsSearch: ["communications", "brand", "marketing", "visual merchandising"],
    corporateSearch: ["regional manager", "district manager", "area manager", "buyer", "merchandiser"],
    frontlineSearch: ["store associate", "sales associate", "cashier", "floor supervisor"],
    groups: [
      ["Store Operations", "Operational guidelines, store standards, and procedural updates for all locations."],
      ["Customer Experience", "Customer service standards, feedback, and guest experience initiatives."],
      ["Sales & Promotions", "Current promotions, sales targets, campaign launches, and performance updates."],
      ["Schedule & Shift", "Roster updates, shift swaps, and scheduling communications."],
      ["Employee Recognition", "Spotlighting top performers, years of service, and team achievements."],
      ["Product & Training", "Product knowledge, brand training, and seasonal collection briefings."],
      ["Community & Social", "Community events, social responsibility initiatives, and team activities."],
      ["HR & Benefits", "HR updates, benefits enrollment, payroll, and employee programs."],
    ],
  },
  finance: {
    label: "Finance & Banking",
    commsTitle: "Corporate Communications",
    corporateTitle: "Corporate & Advisory Staff",
    frontlineTitle: "Branch & Client-Facing Staff",
    commsSearch: ["communications", "corporate communications", "investor relations"],
    corporateSearch: ["analyst", "advisor", "relationship manager", "compliance officer"],
    frontlineSearch: ["teller", "branch manager", "customer service", "loan officer"],
    groups: [
      ["Compliance & Regulatory", "Regulatory updates, compliance notices, and policy changes affecting all staff."],
      ["Client Services", "Client experience standards, service updates, and relationship management news."],
      ["Operations Bulletin", "Operational changes, system updates, and process improvements."],
      ["Team Recognition", "Recognizing exceptional performance, client outcomes, and team milestones."],
      ["Training & Certification", "Mandatory training, licensing updates, and professional development resources."],
      ["HR & Wellbeing", "HR policies, benefits, wellness programs, and employee support resources."],
      ["Leadership Forum", "Updates from executive leadership, strategy announcements, and town halls."],
      ["Innovation & Technology", "Digital transformation updates, new tools, and fintech innovation news."],
    ],
  },
  technology: {
    label: "Technology",
    commsTitle: "Internal Communications & Culture",
    corporateTitle: "Corporate & Engineering Leadership",
    frontlineTitle: "Engineering & Technical Staff",
    commsSearch: ["internal communications", "culture", "employee experience", "people ops"],
    corporateSearch: ["engineering manager", "product manager", "director", "head of"],
    frontlineSearch: ["software engineer", "developer", "data scientist", "DevOps"],
    groups: [
      ["Engineering Updates", "Technical announcements, architecture decisions, and engineering all-hands."],
      ["Product & Roadmap", "Product roadmap updates, release notes, and cross-functional alignment."],
      ["Customer & GTM", "Customer success stories, go-to-market updates, and sales enablement."],
      ["Innovation Hub", "Hackathon announcements, innovation challenges, and experimental projects."],
      ["Team Recognition", "Celebrating milestones, peer kudos, and exceptional contributions."],
      ["Learning & Development", "Conference attendance, certification support, and internal learning."],
      ["All-Hands Community", "Company-wide announcements, all-hands recordings, and culture updates."],
      ["HR & Benefits", "People team updates, benefits enrollment, equity, and compensation."],
    ],
  },
  logistics: {
    label: "Logistics & Transport",
    commsTitle: "Operations Communications",
    corporateTitle: "Operations & Logistics Management",
    frontlineTitle: "Drivers & Field Operations",
    commsSearch: ["communications", "operations communications", "fleet communications"],
    corporateSearch: ["logistics manager", "operations manager", "warehouse manager"],
    frontlineSearch: ["driver", "courier", "delivery associate", "warehouse operative"],
    groups: [
      ["Route & Schedule Updates", "Real-time route changes, delivery schedules, and field operational updates."],
      ["Safety & Compliance", "Road safety alerts, vehicle compliance, and incident reporting."],
      ["Fleet & Operations", "Fleet maintenance schedules, vehicle updates, and operational efficiency."],
      ["Driver & Field Recognition", "Recognizing safe driving, on-time delivery, and outstanding field performance."],
      ["HR & Benefits", "HR updates, benefits, payroll, and employee support resources."],
      ["Training Hub", "Mandatory certifications, safety training, and skills development."],
      ["Community Board", "Team events, charity drives, and community engagement."],
      ["Leadership Updates", "Messages from senior leadership, strategic updates, and company direction."],
    ],
  },
  energy: {
    label: "Energy & Utilities",
    commsTitle: "Communications & Public Affairs",
    corporateTitle: "Engineering & Technical Management",
    frontlineTitle: "Field Technicians & Plant Operators",
    commsSearch: ["communications", "public affairs", "stakeholder engagement"],
    corporateSearch: ["engineer", "project manager", "operations manager", "HSE manager"],
    frontlineSearch: ["field technician", "lineworker", "plant operator", "electrician"],
    groups: [
      ["Safety First", "Safety alerts, OSHA compliance notices, and incident prevention protocols."],
      ["Operations Updates", "Grid status, plant operations, and real-time operational announcements."],
      ["Regulatory & Compliance", "Regulatory changes, environmental compliance, and permit updates."],
      ["Shift Bulletin", "Shift handover information, maintenance schedules, and time-sensitive alerts."],
      ["Employee Recognition", "Celebrating safety records, project milestones, and exceptional contributions."],
      ["Training & Certification", "Safety certifications, technical training, and compliance courses."],
      ["Sustainability Initiative", "Renewable energy projects, carbon reduction goals, and sustainability progress."],
      ["HR & Benefits", "HR policies, union agreements, benefits enrollment, and employee programs."],
    ],
  },
  hospitality: {
    label: "Hospitality & Food Service",
    commsTitle: "Brand & Guest Experience",
    corporateTitle: "Management & Corporate Staff",
    frontlineTitle: "Front-of-House & Kitchen Staff",
    commsSearch: ["communications", "brand", "guest experience", "marketing"],
    corporateSearch: ["general manager", "regional manager", "food and beverage director"],
    frontlineSearch: ["server", "bartender", "chef", "cook", "housekeeper", "front desk"],
    groups: [
      ["Service Excellence", "Guest service standards, service recovery protocols, and experience improvement."],
      ["F&B Updates", "Menu changes, allergen alerts, specials, and food & beverage news."],
      ["Guest Experience", "Guest feedback, review highlights, and experience enhancement initiatives."],
      ["Shift & Scheduling", "Shift schedules, section assignments, and time-sensitive updates."],
      ["Staff Recognition", "Employee of the month, guest compliments, and team performance highlights."],
      ["Training Hub", "Food safety certifications, service standards training, and skills development."],
      ["Events & Activities", "Upcoming events, private dining, banquet setups, and special occasion plans."],
      ["HR & Benefits", "HR policies, tip pooling updates, benefits, and employee programs."],
    ],
  },
  other: {
    label: "Professional Services",
    commsTitle: "Corporate Communications",
    corporateTitle: "Office & Corporate Staff",
    frontlineTitle: "Client-Facing & Field Staff",
    commsSearch: ["communications", "marketing", "public relations", "content"],
    corporateSearch: ["manager", "director", "coordinator", "analyst", "specialist"],
    frontlineSearch: ["associate", "representative", "technician", "consultant"],
    groups: [
      ["Company Updates", "Important company-wide announcements, strategy updates, and all-hands communications."],
      ["Operations Bulletin", "Operational news, process updates, and cross-functional announcements."],
      ["HR & Wellbeing", "Human resources news, benefits information, and employee wellness programs."],
      ["Team Recognition", "Celebrating achievements, peer recognition, and performance milestones."],
      ["Training & Development", "Learning opportunities, certifications, and professional development."],
      ["Leadership Forum", "Messages from leadership, strategic direction, and organizational updates."],
      ["Community & Culture", "Team events, volunteering, DEI initiatives, and company culture."],
      ["Innovation & Ideas", "Employee ideas, innovation challenges, and continuous improvement."],
    ],
  },
};

/* ── News channels (channel rename) ────────────────────────────────────────── */

export interface NewsIndustry {
  label: string;
  /** 8 industry-themed channels: [title, description]. */
  channels: Array<[string, string]>;
}

export const NEWS_INDUSTRIES: Record<string, NewsIndustry> = {
  healthcare: {
    label: "Healthcare",
    channels: [
      ["Patient Safety & Quality", "Patient safety initiatives, incident reports, and quality improvement updates."],
      ["Clinical Bulletins", "Clinical guidelines, protocols, and announcements for care teams."],
      ["Shift Notifications", "Real-time shift updates, scheduling changes, and urgent communications."],
      ["HR & Wellbeing", "HR news, benefits, and employee wellness programs."],
      ["Employee Recognition", "Team achievements, years of service, and exceptional care stories."],
      ["Leadership Forum", "Strategic updates from clinical and administrative leadership."],
      ["Training & Compliance", "Continuing education, certifications, and mandatory training."],
      ["Community & Outreach", "Community health initiatives and volunteer opportunities."],
    ],
  },
  medtech: {
    label: "MedTech / Medical Devices",
    channels: [
      ["Product & Innovation", "Product launches, R&D milestones, and innovation pipeline updates."],
      ["Quality & Regulatory", "FDA, MDR, ISO updates, audit notices, and regulatory compliance."],
      ["Field & Sales Bulletins", "Customer wins, sales enablement, and field team updates."],
      ["Operations & Supply Chain", "Manufacturing operations, supply chain, and production updates."],
      ["Safety & Recalls", "Safety alerts, recalls, and post-market surveillance updates."],
      ["HR & Benefits", "HR policies, benefits, and employee programs."],
      ["Leadership & Strategy", "Updates from executive leadership and strategic initiatives."],
      ["Employee Recognition", "Spotlights, milestones, and team achievements."],
    ],
  },
  manufacturing: {
    label: "Manufacturing",
    channels: [
      ["Safety First", "Safety alerts, incident reports, and H&S protocols for plant staff."],
      ["Production Updates", "Daily production targets, line updates, and operational announcements."],
      ["Quality & Compliance", "Quality control updates, audit notices, and compliance requirements."],
      ["Shift Bulletin", "Shift handover notes, schedule changes, and time-sensitive updates."],
      ["Employee Recognition", "Safety milestones, performance awards, and team achievements."],
      ["Training & Compliance", "Mandatory training, certifications, and skills development programs."],
      ["Sustainability", "Environmental initiatives and sustainability goals."],
      ["HR & Benefits", "HR policies, payroll updates, benefits, and employee programs."],
    ],
  },
  retail: {
    label: "Retail",
    channels: [
      ["Store Operations", "Operational guidelines, store standards, and procedural updates."],
      ["Customer Experience", "Customer service standards, feedback, and guest experience."],
      ["Sales & Promotions", "Current promotions, sales targets, and campaign launches."],
      ["Schedule & Shift", "Roster updates, shift swaps, and scheduling communications."],
      ["Employee Recognition", "Top performers, years of service, and team achievements."],
      ["Product & Training", "Product knowledge, brand training, and seasonal collection briefings."],
      ["Community & Social", "Community events, social responsibility, and team activities."],
      ["HR & Benefits", "HR updates, benefits enrollment, and employee programs."],
    ],
  },
  finance: {
    label: "Finance & Banking",
    channels: [
      ["Market & Economic Update", "Daily market briefings and economic insights."],
      ["Compliance & Risk", "Regulatory updates, compliance alerts, and risk advisories."],
      ["Client Wins", "Deal wins, client stories, and relationship milestones."],
      ["Branch Operations", "Branch updates, operational changes, and procedural guidance."],
      ["Employee Recognition", "Awards, milestones, and team achievements."],
      ["Training & Certifications", "Required training, certification renewals, and learning paths."],
      ["Leadership Forum", "Updates from executive leadership and strategic priorities."],
      ["HR & Benefits", "HR updates, benefits, and people programs."],
    ],
  },
  tech: {
    label: "Technology",
    channels: [
      ["Product Updates", "Product launches, roadmap, and release announcements."],
      ["Engineering Bulletins", "Engineering org updates, postmortems, and architecture notes."],
      ["Customer Stories", "Customer wins, case studies, and reference highlights."],
      ["Company All-Hands", "Updates from leadership and company-wide announcements."],
      ["Employee Recognition", "Shout-outs, milestones, and team wins."],
      ["Learning & Growth", "Training, certifications, and growth opportunities."],
      ["Culture & Connection", "Culture, ERGs, social events, and connection moments."],
      ["People & Benefits", "HR updates, benefits, and people operations news."],
    ],
  },
  energy: {
    label: "Energy & Utilities",
    channels: [
      ["Safety First", "Safety alerts, incident reports, and field safety protocols."],
      ["Operations & Reliability", "Grid, plant, and field operations updates."],
      ["Environment & Sustainability", "Environmental compliance and sustainability initiatives."],
      ["Compliance & Regulatory", "Regulatory updates and compliance requirements."],
      ["Customer & Community", "Customer service updates and community engagement."],
      ["Training & Certification", "Mandatory training and certifications."],
      ["Employee Recognition", "Safety milestones, awards, and team achievements."],
      ["HR & Benefits", "HR policies, benefits, and people programs."],
    ],
  },
  logistics: {
    label: "Logistics & Transportation",
    channels: [
      ["Safety First", "Driver and warehouse safety alerts and protocols."],
      ["Route & Operations", "Route updates, hub operations, and dispatch communications."],
      ["Fleet & Equipment", "Fleet maintenance, equipment, and vehicle updates."],
      ["Customer & SLA", "Customer updates, SLA performance, and key account news."],
      ["Employee Recognition", "Safety milestones, awards, and team achievements."],
      ["Training & Compliance", "Driver certifications, hours-of-service, and training."],
      ["Leadership Forum", "Updates from leadership and strategic priorities."],
      ["HR & Benefits", "HR updates, benefits, and employee programs."],
    ],
  },
  generic: {
    label: "Generic / Multi-industry",
    channels: [
      ["Company News", "Company-wide announcements and updates."],
      ["Leadership Forum", "Updates from executive leadership."],
      ["HR & Benefits", "HR policies, benefits, and people programs."],
      ["Employee Recognition", "Shout-outs, milestones, and achievements."],
      ["Training & Development", "Learning opportunities and development programs."],
      ["Customer Stories", "Customer wins and case studies."],
      ["Culture & Events", "Culture, social events, and connection moments."],
      ["Operations Updates", "Operational announcements and guidance."],
    ],
  },
};

export const personaIndustryKeys = (): Array<{ key: string; label: string }> =>
  Object.entries(PERSONA_INDUSTRIES).map(([key, value]) => ({ key, label: value.label }));

export const newsIndustryKeys = (): Array<{ key: string; label: string }> =>
  Object.entries(NEWS_INDUSTRIES).map(([key, value]) => ({ key, label: value.label }));
