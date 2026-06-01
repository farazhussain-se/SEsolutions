import { useCallback, useEffect, useMemo, useState } from "react";
import {
  inputStyle,
  subDescriptionStyle,
  actionButtonStyle,
  buttonStyle,
  panelStyle,
  formGroupStyle,
} from "../styles";
import { colors } from "../styles/colors";
import {
  fetchWidgetIntegrations,
  INTEGRATIONS_CATALOGUE_URL,
  type Integration,
  type IntegrationType,
} from "../utils/integrationsCatalogue";

type LoadState = "idle" | "loading" | "ready" | "error";

const CATEGORY_LABELS: Record<IntegrationType, string> = {
  widget: "Widgets",
  plugin: "Plugins",
  globalJs: "Global JS",
};

const headingStyle: React.CSSProperties = {
  margin: "0 0 6px 0",
  fontSize: 16,
  color: colors.textDark,
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  width: "100%",
  appearance: "auto",
  cursor: "pointer",
};

const inlineRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const linkPreviewStyle: React.CSSProperties = {
  fontSize: 12,
  color: colors.textMuted,
  wordBreak: "break-all",
  background: colors.backgroundLight,
  padding: "6px 8px",
  borderRadius: 4,
  border: `1px solid ${colors.borderLight}`,
};

const copyButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  marginTop: 0,
  padding: "8px 14px",
  fontSize: 14,
};

const refreshButtonStyle: React.CSSProperties = {
  ...actionButtonStyle,
  background: "transparent",
  border: `1px solid ${colors.border}`,
  color: colors.textDark,
  cursor: "pointer",
  borderRadius: 4,
};

const errorTextStyle: React.CSSProperties = {
  fontSize: 12,
  color: colors.errorText,
  marginTop: 6,
};

const successPillStyle: React.CSSProperties = {
  fontSize: 12,
  color: colors.successText,
  background: colors.successLight,
  border: `1px solid ${colors.success}`,
  padding: "2px 8px",
  borderRadius: 999,
};

interface IntegrationsCatalogueProps {
  isOnContentPage?: boolean;
  onPreviewInPage?: (url: string) => void;
}

export default function IntegrationsCatalogue({ isOnContentPage, onPreviewInPage }: IntegrationsCatalogueProps) {
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [justCopied, setJustCopied] = useState(false);

  const loadCatalogue = useCallback(
    async (forceRefresh = false) => {
      setLoadState("loading");
      setError(null);
      try {
        const list = await fetchWidgetIntegrations({ forceRefresh });
        setIntegrations(list);
        setLoadState("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setLoadState("error");
      }
    },
    []
  );

  // Fetch once the sub-view mounts.
  useEffect(() => {
    void loadCatalogue();
  }, [loadCatalogue]);

  useEffect(() => {
    if (!justCopied) return;
    const handle = window.setTimeout(() => setJustCopied(false), 1800);
    return () => window.clearTimeout(handle);
  }, [justCopied]);

  const grouped = useMemo(() => {
    const filterLower = filter.trim().toLowerCase();
    const matches = filterLower
      ? integrations.filter(
          (item) =>
            item.name.toLowerCase().includes(filterLower) ||
            item.id.toLowerCase().includes(filterLower)
        )
      : integrations;
    const buckets = new Map<IntegrationType, Integration[]>();
    for (const item of matches) {
      const bucket = buckets.get(item.type) ?? [];
      bucket.push(item);
      buckets.set(item.type, bucket);
    }
    return buckets;
  }, [integrations, filter]);

  const selected = useMemo(
    () => integrations.find((item) => item.id === selectedId) ?? null,
    [integrations, selectedId]
  );

  const copyToClipboard = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setJustCopied(true);
    } catch {
      // Clipboard API can fail when the side panel is unfocused;
      // fall back to a hidden textarea + execCommand.
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        setJustCopied(true);
      } finally {
        document.body.removeChild(textarea);
      }
    }
  }, []);

  const handleSelectChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = event.target.value;
    setSelectedId(value);
    if (!value) return;
    const integration = integrations.find((item) => item.id === value);
    if (integration) {
      void copyToClipboard(integration.url);
    }
  };

  const totalCount = integrations.length;
  const visibleCount = Array.from(grouped.values()).reduce(
    (sum, list) => sum + list.length,
    0
  );

  return (
    <div style={panelStyle}>
      <h3 style={headingStyle}>Integrations Catalogue</h3>
      <p style={subDescriptionStyle}>
        Browse widgets published in the SE solutions-monorepo. Pick one
        to copy its embed URL — paste it into a Custom Widget in the
        Staffbase studio.
      </p>

      <div style={{ ...inlineRowStyle, marginBottom: 10 }}>
        <button
          type="button"
          style={refreshButtonStyle}
          onClick={() => void loadCatalogue(true)}
          disabled={loadState === "loading"}
        >
          {loadState === "loading" ? "Refreshing…" : "Refresh"}
        </button>
        <a
          href={INTEGRATIONS_CATALOGUE_URL}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12, color: colors.primary }}
        >
          Open catalogue site ↗
        </a>
        {loadState === "ready" && (
          <span style={{ fontSize: 12, color: colors.textMuted }}>
            {filter
              ? `${visibleCount} of ${totalCount}`
              : `${totalCount} widgets`}
          </span>
        )}
      </div>

      {loadState === "error" && (
        <p style={errorTextStyle}>
          Couldn’t load the catalogue: {error}
        </p>
      )}

      {loadState !== "error" && (
        <div style={formGroupStyle}>
          <input
            type="search"
            placeholder="Filter by name…"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            style={inputStyle}
            disabled={loadState !== "ready"}
          />

          <select
            value={selectedId}
            onChange={handleSelectChange}
            style={selectStyle}
            disabled={loadState !== "ready"}
          >
            <option value="">
              {loadState === "loading"
                ? "Loading catalogue…"
                : visibleCount === 0
                ? "No matches"
                : "Select an integration…"}
            </option>
            {Array.from(grouped.entries()).map(([type, items]) => (
              <optgroup key={type} label={CATEGORY_LABELS[type]}>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {selected && (
            <>
              <div style={linkPreviewStyle}>{selected.url}</div>
              <div style={inlineRowStyle}>
                <button
                  type="button"
                  style={copyButtonStyle}
                  onClick={() => void copyToClipboard(selected.url)}
                >
                  Copy embed link
                </button>
                {isOnContentPage && onPreviewInPage && (
                  <button
                    type="button"
                    style={copyButtonStyle}
                    onClick={() => onPreviewInPage(selected.url)}
                  >
                    Preview in page
                  </button>
                )}
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 12, color: colors.primary }}
                >
                  Open preview ↗
                </a>
                {justCopied && (
                  <span style={successPillStyle}>Copied!</span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
