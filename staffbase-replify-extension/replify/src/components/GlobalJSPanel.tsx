import { useState, useEffect } from "react";
import { loadGitHubToken } from "../utils/githubAuth";
import {
  fetchManifest,
  applySnippet,
  removeSnippet,
  enableSnippet,
  disableSnippet,
  getEnabledSlugs,
  type Snippet,
} from "../utils/globalJSInjection";
import { colors } from "../styles/colors";
import { inputStyle, buttonStyle, panelStyle } from "../styles";

interface GlobalJSPanelProps {
  staffbaseToken: string;
  tabUrl: string | null;
  apiDomain: string;
}

type LoadState = "idle" | "loading" | "ready" | "error";

const versionBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  color: colors.textMuted,
  background: colors.backgroundLight,
  border: `1px solid ${colors.borderLight}`,
  padding: "1px 6px",
  borderRadius: 4,
};

const snippetCardStyle: React.CSSProperties = {
  ...panelStyle,
  marginBottom: 12,
};

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: colors.textMuted,
  margin: "16px 0 8px",
};

const applyButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  marginTop: 0,
  padding: "5px 10px",
  fontSize: 12,
};

const removeButtonStyle: React.CSSProperties = {
  ...applyButtonStyle,
  background: "transparent",
  color: colors.textDark,
  border: `1px solid ${colors.border}`,
};

const configureButtonStyle: React.CSSProperties = {
  ...applyButtonStyle,
  background: "transparent",
  color: colors.primary,
  border: `1px solid ${colors.primary}`,
};

function extractDefault(description: string): string | null {
  const match = /\(default:\s*([^)]+)\)/i.exec(description);
  return match ? match[1].trim() : null;
}

function buildInitialConfig(
  snippet: Snippet,
  staffbaseToken: string,
  envUrl: string,
  stored?: Record<string, string>
): Record<string, string> {
  if (stored) return stored;
  const config: Record<string, string> = {};
  for (const param of snippet.params) {
    if (param.key === "apiKey") {
      config.apiKey = staffbaseToken;
    } else if (param.key === "envUrl") {
      config.envUrl = envUrl;
    } else {
      const def = extractDefault(param.description);
      if (def !== null) config[param.key] = def;
    }
  }
  return config;
}

export default function GlobalJSPanel({ staffbaseToken, tabUrl, apiDomain }: GlobalJSPanelProps) {
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [intranetSnippets, setIntranetSnippets] = useState<Snippet[]>([]);
  const [studioSnippets, setStudioSnippets] = useState<Snippet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeSet, setActiveSet] = useState<Set<string>>(new Set());
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set());
  const [configs, setConfigs] = useState<Record<string, Record<string, string>>>({});
  const [applying, setApplying] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<Record<string, string>>({});

  const envUrl = `https://${apiDomain}`;
  const hostname = tabUrl ? (() => { try { return new URL(tabUrl).hostname; } catch { return apiDomain; } })() : apiDomain;

  useEffect(() => {
    void (async () => {
      setLoadState("loading");
      setError(null);
      try {
        const ghToken = await loadGitHubToken();
        if (!ghToken) throw new Error("GitHub token not found — try signing in again.");

        const manifest = await fetchManifest(ghToken);

        const intranet = manifest.snippets.filter((s) => s.target !== "studio");
        const studio = manifest.snippets.filter((s) => s.target === "studio");

        setIntranetSnippets(intranet);
        setStudioSnippets(studio);

        const all = manifest.snippets;
        const [enabledSlugs, stored] = await Promise.all([
          getEnabledSlugs(hostname),
          chrome.storage.local.get(all.map((s) => `${hostname}:${s.slug}`)),
        ]);

        setActiveSet(new Set(enabledSlugs));

        const loaded: Record<string, Record<string, string>> = {};
        for (const s of all) {
          const key = `${hostname}:${s.slug}`;
          const saved = stored[key] as Record<string, string> | undefined;
          loaded[s.slug] = buildInitialConfig(s, staffbaseToken, envUrl, saved);
        }
        setConfigs(loaded);
        setLoadState("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setLoadState("error");
      }
    })();
  }, [hostname, staffbaseToken, envUrl]);

  const updateConfig = (slug: string, key: string, value: string) => {
    setConfigs((prev) => ({
      ...prev,
      [slug]: { ...(prev[slug] ?? {}), [key]: value },
    }));
  };

  const allRequiredFilled = (snippet: Snippet): boolean => {
    const config = configs[snippet.slug] ?? {};
    return snippet.params.every((p) => !p.required || !!config[p.key]);
  };

  const toggleExpanded = (slug: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });
  };

  const handleApply = async (snippet: Snippet) => {
    const ghToken = await loadGitHubToken();
    if (!ghToken) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    setApplying(snippet.slug);
    setStatusMsg((prev) => ({ ...prev, [snippet.slug]: "" }));
    try {
      const config = configs[snippet.slug] ?? {};
      const tabEnvUrl = (() => { try { return new URL(tab.url ?? "").origin; } catch { return envUrl; } })();
      await applySnippet(tab.id, snippet, config, ghToken, tabEnvUrl);
      await Promise.all([
        enableSnippet(hostname, snippet.slug),
        chrome.storage.local.set({ [`${hostname}:${snippet.slug}`]: config } as Record<string, unknown>),
      ]);
      setActiveSet((prev) => new Set([...prev, snippet.slug]));
      setStatusMsg((prev) => ({ ...prev, [snippet.slug]: "Applied!" }));
    } catch (err) {
      setStatusMsg((prev) => ({
        ...prev,
        [snippet.slug]: `Failed: ${err instanceof Error ? err.message : String(err)}`,
      }));
    } finally {
      setApplying(null);
    }
  };

  const handleRemove = async (snippet: Snippet) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try {
      await removeSnippet(tab.id, snippet.slug);
      await disableSnippet(hostname, snippet.slug);
      setActiveSet((prev) => { const s = new Set(prev); s.delete(snippet.slug); return s; });
      setStatusMsg((prev) => ({ ...prev, [snippet.slug]: "Removed." }));
    } catch (err) {
      setStatusMsg((prev) => ({
        ...prev,
        [snippet.slug]: `Remove failed: ${err instanceof Error ? err.message : String(err)}`,
      }));
    }
  };

  const renderCard = (snippet: Snippet) => {
    const config = configs[snippet.slug] ?? {};
    const isActive = activeSet.has(snippet.slug);
    const isExpanded = expandedSet.has(snippet.slug);
    const hasParams = snippet.params.length > 0;
    const ready = allRequiredFilled(snippet);
    const busy = applying === snippet.slug;

    return (
      <div key={snippet.slug} style={snippetCardStyle}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: colors.textDark }}>{snippet.name}</span>
          <span style={versionBadgeStyle}>v{snippet.version}</span>
        </div>
        <p style={{ fontSize: 12, color: colors.textMuted, margin: "0 0 10px" }}>{snippet.description}</p>

        {/* Param form — only when expanded */}
        {hasParams && isExpanded && (
          <div style={{ marginBottom: 10 }}>
            {snippet.params.map((param) => (
              <div key={param.key} style={{ marginBottom: 8 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: colors.textDark, marginBottom: 2 }}>
                  {param.key}
                  {param.required && <span style={{ color: colors.errorText ?? "#c00", marginLeft: 2 }}>*</span>}
                </label>
                <p style={{ fontSize: 11, color: colors.textMuted, margin: "0 0 4px" }}>{param.description}</p>
                {param.type === "boolean" ? (
                  <input
                    type="checkbox"
                    checked={config[param.key] === "true"}
                    onChange={(e) => updateConfig(snippet.slug, param.key, e.target.checked ? "true" : "false")}
                  />
                ) : (
                  <input
                    type={param.type === "secret" ? "password" : param.type === "number" ? "number" : param.type === "url" ? "url" : "text"}
                    value={config[param.key] ?? ""}
                    onChange={(e) => updateConfig(snippet.slug, param.key, e.target.value)}
                    placeholder={param.required ? "Required" : "Optional"}
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Action row */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {hasParams && (
            <button onClick={() => toggleExpanded(snippet.slug)} style={configureButtonStyle}>
              {isExpanded ? "Hide params" : "Configure"}
            </button>
          )}
          <button
            onClick={() => void handleApply(snippet)}
            disabled={!ready || busy}
            style={{ ...applyButtonStyle, opacity: ready && !busy ? 1 : 0.5 }}
          >
            {busy ? "Applying…" : isActive ? "Re-apply" : "Apply"}
          </button>
          {isActive && (
            <button onClick={() => void handleRemove(snippet)} style={removeButtonStyle}>
              Remove
            </button>
          )}
          {statusMsg[snippet.slug] && (
            <span style={{ fontSize: 11, color: colors.textMuted }}>{statusMsg[snippet.slug]}</span>
          )}
        </div>
      </div>
    );
  };

  if (loadState === "loading") return <p style={{ fontSize: 12, color: colors.textMuted }}>Loading snippets…</p>;
  if (loadState === "error") return <p style={{ fontSize: 12, color: colors.errorText ?? "#c00" }}>{error}</p>;
  if (intranetSnippets.length === 0 && studioSnippets.length === 0) {
    return <p style={{ fontSize: 12, color: colors.textMuted }}>No scripts found.</p>;
  }

  return (
    <div>
      {intranetSnippets.length > 0 && (
        <>
          {studioSnippets.length > 0 && <p style={sectionHeadingStyle}>App &amp; Intranet</p>}
          {intranetSnippets.map(renderCard)}
        </>
      )}
      {studioSnippets.length > 0 && (
        <>
          <p style={sectionHeadingStyle}>Studio</p>
          {studioSnippets.map(renderCard)}
        </>
      )}
    </div>
  );
}
