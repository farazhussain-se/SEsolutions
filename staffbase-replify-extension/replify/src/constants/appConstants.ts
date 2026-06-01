import type { AnalyticsToggleKey } from "../utils/analyticsManager";

// constants/appConstants.ts

export const DEFAULT_DOMAIN = "app.staffbase.com";
export const STAFFBASE_DOMAINS = ["staffbase.com", "staffbase.rocks", "staffbase.dev"];
export const DEMO_VERTICALS = [
  "Manufacturing",
  "Healthcare",
  "Education",
  "Retail",
  "Financial Services",
  "Technology",
  "Government",
  "Non-Profit",
];
export const ADMIN_ROLE = "WeBranchAdminRole";
export const DEFAULT_MERGE_FIELD = "publicEmailAddress";
export const DEFAULT_WORKDAY_FIELD_TITLE = "Public Email Address";
export const UNKNOWN_BRANCH_ID = "unknown-branch-id";

export interface BrandingDefaults {
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
  floatingNavBgColor: string;
  floatingNavTextColor: string;
  logoHeight: number;
  headerTransparency: number;
}

export const DEFAULT_BRANDING: BrandingDefaults = {
  primaryColor: "#000000",
  textColor: "#f0f0f0",
  backgroundColor: "#F3F3F3",
  floatingNavBgColor: "#FFFFFF",
  floatingNavTextColor: "#000000",
  logoHeight: 100,
  headerTransparency: 70,
};

export interface QuickLink {
  name: string;
  title: string;
  position: number;
  enabled: boolean;
}

export const DEFAULT_QUICK_LINKS: QuickLink[] = [
  { name: "Home", title: "Home", position: 0, enabled: true },
  { name: "My Directory", title: "Directory", position: 1, enabled: true },
  { name: "Launchpad", title: "Launchpad", position: 2, enabled: true },
];

export const LAUNCHPAD_DICT = [
    "sharepoint",
    "teams",
    "outlook",
    "word",
    "powerpoint",
    "excel",
    "workday",
    "confluence",
    "salesforce",
    "slack",
    "zoom",
    "ukg",
    "servicenow",
    "drive",
    "docs",
    "slides",
    "sheets",
    "travelperk",
    "jira",
  ];

  export const blockRegex = /\/\*\s*⇢\s*REPLIFY START[\s\S]*?REPLIFY END\s*⇠\s*\*\//g;

  export interface AnalyticsType {
    id: AnalyticsToggleKey;
    label: string;
  }

  export const ANALYTICS_TYPES: AnalyticsType[] = [
    { id: "news",       label: "News"       },
    { id: "hashtags",   label: "Hashtags"   },
    { id: "campaigns",  label: "Campaigns"  },
    { id: "posts",      label: "Posts"      },
    { id: "email",      label: "Email"      },
    { id: "dashboard",  label: "Dashboard"  },
    { id: "user",       label: "User"       },
    { id: "search",     label: "Search"     },
    { id: "chat",       label: "Chat"       },
    { id: "pages",      label: "Pages (Experimental)"      },
    { id: "editorial",  label: "Editorial Calendar"        },
    { id: "governance", label: "Content Governance"        },
  ];