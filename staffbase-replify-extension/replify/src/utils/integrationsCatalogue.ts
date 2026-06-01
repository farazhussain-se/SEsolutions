// utils/integrationsCatalogue.ts
//
// Data layer for the "Integrations catalogue" feature.
//
// Today we surface the widgets published by the SE monorepo at
//   https://staffbase.github.io/solutions-monorepo/widgets.json
// (a flat array of HTML filenames). Each filename resolves to an
// embeddable page at https://staffbase.github.io/solutions-monorepo/{filename}.
//
// The shape is intentionally generic (IntegrationType union) so that
// plugins / Global JS can be added as additional categories later
// without changing the consumer UI.

export type IntegrationType = "widget" | "plugin" | "globalJs";

export interface Integration {
  /** Stable identifier — currently the source filename, e.g. "leaderboard.html". */
  id: string;
  /** Category bucket used by the UI dropdown. */
  type: IntegrationType;
  /** Human-friendly display name, e.g. "Leaderboard". */
  name: string;
  /** Embeddable URL the SE will paste into the Staffbase studio. */
  url: string;
}

const SOLUTIONS_MONOREPO_BASE_URL =
  "https://staffbase.github.io/solutions-monorepo";

const WIDGETS_MANIFEST_URL = `${SOLUTIONS_MONOREPO_BASE_URL}/widgets.json`;

/**
 * Acronyms / brand tokens that should keep custom casing instead of being
 * Title-Cased. Match is case-insensitive on the raw segment.
 */
const NAME_OVERRIDES: Record<string, string> = {
  sap: "SAP",
  hr: "HR",
  hq: "HQ",
  ai: "AI",
  ui: "UI",
  api: "API",
  servicenow: "ServiceNow",
  ms: "MS",
  ksa: "KSA",
  pdf: "PDF",
};

/**
 * Convert a filename like "production-line-status.html" or
 * "ShiftSwapWidget.html" or "ServiceNow.html" into a human-readable
 * display name. Removes the .html suffix, splits on dashes/underscores
 * and camelCase boundaries, then title-cases each segment with
 * acronym/brand awareness.
 */
export function prettifyFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[a-z0-9]+$/i, "");
  // Split on -, _, whitespace AND lower→upper camelCase boundaries.
  const segments = withoutExt
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[-_\s]+/)
    .filter(Boolean);

  return segments
    .map((segment) => {
      const lower = segment.toLowerCase();
      if (NAME_OVERRIDES[lower]) return NAME_OVERRIDES[lower];
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/** Module-level cache so re-opening the section in the side panel is free. */
let cachedWidgets: Integration[] | null = null;
let inFlightWidgets: Promise<Integration[]> | null = null;

/**
 * Fetch the widget catalogue from the SE monorepo. Returns the cached
 * value if available. Pass `forceRefresh: true` to bypass the cache.
 */
export async function fetchWidgetIntegrations(
  options: { forceRefresh?: boolean } = {}
): Promise<Integration[]> {
  if (!options.forceRefresh && cachedWidgets) {
    return cachedWidgets;
  }
  if (!options.forceRefresh && inFlightWidgets) {
    return inFlightWidgets;
  }

  inFlightWidgets = (async () => {
    const res = await fetch(WIDGETS_MANIFEST_URL, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(
        `Failed to load widgets manifest (HTTP ${res.status})`
      );
    }
    const raw = (await res.json()) as unknown;
    if (!Array.isArray(raw)) {
      throw new Error("Widgets manifest is not a JSON array");
    }
    const filenames = raw.filter(
      (entry): entry is string => typeof entry === "string" && entry.length > 0
    );
    const list: Integration[] = filenames.map((filename) => ({
      id: filename,
      type: "widget",
      name: prettifyFilename(filename),
      url: `${SOLUTIONS_MONOREPO_BASE_URL}/${filename}`,
    }));
    list.sort((a, b) => a.name.localeCompare(b.name));
    cachedWidgets = list;
    return list;
  })();

  try {
    return await inFlightWidgets;
  } finally {
    inFlightWidgets = null;
  }
}

/** Clear the in-memory cache. Exposed for tests / forced refresh paths. */
export function clearIntegrationsCache(): void {
  cachedWidgets = null;
  inFlightWidgets = null;
}

export const INTEGRATIONS_CATALOGUE_URL = SOLUTIONS_MONOREPO_BASE_URL;
