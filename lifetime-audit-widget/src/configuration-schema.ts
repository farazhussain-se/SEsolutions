/*!
 * Life Time Club Audit widget — Studio configuration schema.
 *
 * No "Apps Script URL" or "Base URL" fields here on purpose: the question
 * bank ships embedded (see DUMMY_QUESTIONS in index.ts) and the branch's API
 * base URL is read from widgetApi.getBranchInformation() at render time —
 * same pattern as this repo's manager-hub-widget. The only setting most
 * installs need is the API Token.
 */

export const DEFAULT_API_TOKEN = "";
export const DEFAULT_PRIMARY = "#1A1A1A"; // Life Time charcoal (override via config)
export const DEFAULT_ACCENT = "#B08D57"; // Life Time bronze/gold accent (override via config)
export const DEFAULT_THRESHOLD = "90";

export const configurationSchema = {
    properties: {
        apitoken: { type: "string", title: "API Token", default: DEFAULT_API_TOKEN },
        usethemecolors: { type: "boolean", title: "Use Theme Colors", default: false },
        backgroundcolor: { type: "string", title: "Background Color", default: "" },
        storelabelsingular: { type: "string", title: "Club Label (singular)", default: "Club" },
        storelabelplural: { type: "string", title: "Club Label (plural)", default: "Clubs" },
        passthreshold: { type: "string", title: "Pass Threshold (%)", default: DEFAULT_THRESHOLD },
        notifyonassign: { type: "boolean", title: "Notify on Assignment", default: false },
        enablerequisitions: { type: "boolean", title: "Enable Workday Requisitions", default: true },
        facopsrole: { type: "string", title: "Facility Operations Group", default: "Club Facility Specialists & Engineers" },
        workdaytenant: { type: "string", title: "Workday Tenant (label)", default: "lifetime" },
        limitheight: { type: "boolean", title: "Limit Height", default: false },
    },
    // When "Use Theme Colors" is off, expose the manual Primary/Accent pickers.
    // When on, they're hidden (colors are pulled from the branding theme instead).
    dependencies: {
        usethemecolors: {
            oneOf: [
                {
                    properties: {
                        usethemecolors: { const: false },
                        primarycolor: { type: "string", title: "Primary Color", default: DEFAULT_PRIMARY },
                        accentcolor: { type: "string", title: "Accent Color", default: DEFAULT_ACCENT },
                    },
                },
                {
                    properties: {
                        usethemecolors: { const: true },
                    },
                },
            ],
        },
        // When "Limit Height" is on, reveal the Max Height field.
        limitheight: {
            oneOf: [
                { properties: { limitheight: { const: false } } },
                { properties: { limitheight: { const: true }, maxheight: { type: "string", title: "Max Height (px)", default: "600" } } },
            ],
        },
    },
};

export const uiSchema = {
    apitoken: { "ui:widget": "password", "ui:help": "Staffbase Basic auth token" },
    usethemecolors: { "ui:help": "Pull Primary & Accent from the app's branding theme (uses the API Token). Hides the color pickers below." },
    primarycolor: { "ui:widget": "color" },
    accentcolor: { "ui:widget": "color" },
    backgroundcolor: { "ui:widget": "color", "ui:help": "Leave blank for transparent" },
    storelabelsingular: { "ui:help": "e.g. Store, Location, Branch" },
    storelabelplural: { "ui:help": "e.g. Stores, Locations, Branches" },
    passthreshold: { "ui:help": "Score % required to pass (default 90)" },
    notifyonassign: { "ui:help": "Send a Staffbase notification (“You were assigned a new task”) to people/groups when audit failure tasks are created and assigned. Off by default (audits can create many tasks at once)." },
    enablerequisitions: { "ui:help": "For failed Facility Operations items, offer a “Create Requisition” action that drafts and submits a Facilities requisition to Workday (simulated demo flow — nothing leaves the browser)." },
    facopsrole: { "ui:help": "Assignee role that marks a question as Facility Operations. Matching questions auto-route their task to the group with this title AND become Workday-requisition eligible." },
    workdaytenant: { "ui:help": "Workday tenant name shown in the simulated requisition (cosmetic in demo mode)." },
    limitheight: { "ui:help": "Cap the widget's height — anything taller scrolls inside a styled scrollbar" },
    maxheight: { "ui:help": "Maximum height in pixels (e.g. 600). You can also include a CSS unit like 600px or 70vh." },
};
