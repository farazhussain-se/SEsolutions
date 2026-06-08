// components/BrandingForm.tsx

import { useState, useRef, useEffect, useCallback } from "react";
import type { CSSProperties, ChangeEvent, Dispatch, SetStateAction } from "react";
import { IoIosCheckmark } from "react-icons/io";
import { BsSave2 } from "react-icons/bs";
import { AiOutlineFormatPainter } from "react-icons/ai";
import { HiSparkles } from "react-icons/hi";
import {
  formGroupStyle,
  inputStyle,
  checkboxLabelStyle,
  checkboxStyle,
  brandingButtonStyle,
  labelStyle,
} from "../styles";
import { colors } from "../styles/colors";
// 📰 Bolt-in: industry templates for the news-channel-rename sub-option.
import { newsIndustryKeys } from "../utils/automationOperations/industryTemplates";
import SavedProspects, { type Prospect } from "./SavedProspects";
import MultiBranding, { type GroupBranding } from "./MultiBranding";

const AiNewsDisplay = ({ text }: { text?: string }) => {
  if (!text) return null;
  return (
    <>
      {text.split('\n').map((line, lineIndex) => {
        const parts = line.split(/(\*\*.*?\*\*)/g);
        return (
          <p key={lineIndex} style={{ margin: 0, padding: 0, lineHeight: '1.5' }}>
            {parts.map((part, partIndex) =>
              part.startsWith('**') && part.endsWith('**')
                ? <strong key={partIndex}>{part.slice(2, -2)}</strong>
                : part
            )}
          </p>
        );
      })}
    </>
  );
};

const CREATE_NEW_CHANNEL_VALUE = "__create_new_channel__";

interface Channel {
  id: string;
  title: string;
}

interface NewsSource {
  url?: string;
  title?: string;
}

interface FetchedBranding {
  primaryColor?: string;
  textColor?: string;
  backgroundColor?: string;
}

interface ProspectSuggestion {
  domain?: string;
  name: string;
  icon?: string;
}

interface Group {
  id: string;
  name: string;
}

interface FilterableChannelSelectProps {
  value: string;
  onChange: (v: string) => void;
  channels: Channel[];
  filterValue: string;
  onFilterChange: (v: string) => void;
  createOptionLabel?: string;
  createOptionValue?: string;
  selectStyle?: CSSProperties;
}

const FilterableChannelSelect = ({
  value,
  onChange,
  channels,
  filterValue,
  onFilterChange,
  createOptionLabel = '+ Create new channel',
  createOptionValue = CREATE_NEW_CHANNEL_VALUE,
  selectStyle = {},
}: FilterableChannelSelectProps) => {
  const normalizedFilter = (filterValue || "").trim().toLowerCase();
  const allChannels = channels || [];
  const filteredChannels = !normalizedFilter
    ? allChannels
    : allChannels.filter((c) => (c.title || "").toLowerCase().includes(normalizedFilter));

  const selectedChannel = allChannels.find((c) => c.id === value);
  const optionsToRender =
    selectedChannel && !filteredChannels.some((c) => c.id === selectedChannel.id)
      ? [selectedChannel, ...filteredChannels]
      : filteredChannels;

  return (
    <>
      <input
        type="text"
        style={{ ...inputStyle, padding: "4px 6px", marginBottom: 6, fontSize: 12 }}
        value={filterValue}
        onChange={(e) => onFilterChange(e.target.value)}
        placeholder="Filter dropdown"
      />
      <select
        style={{ ...inputStyle, paddingRight: 8, ...selectStyle }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value={createOptionValue}>{createOptionLabel}</option>
        {optionsToRender.map((c) => (
          <option key={c.id} value={c.id}>{c.title}</option>
        ))}
      </select>
    </>
  );
};

interface BrandingFormProps {
  apiToken?: string;
  branchId?: string;
  savedProspects: Prospect[];
  onSaveProspect: () => void;
  onLoadProspect: (prospect: Prospect) => void;
  onDeleteProspect: (id: string) => void;
  prospectNews?: string;
  isFetchingNews: boolean;
  onFetchNews: () => void;
  fetchedBranding?: FetchedBranding;
  newsSources?: NewsSource[];
  onApplyFetchedBranding: () => void;
  prospectSuggestions: ProspectSuggestion[];
  onFetchSuggestions: (value: string) => void;
  onSuggestionSelected: (name: string) => void;
  multiBrandingEnabled: boolean;
  setMultiBrandingEnabled: Dispatch<SetStateAction<boolean>>;
  multiBrandings: GroupBranding[];
  onAddMultiBranding: (b: GroupBranding) => void;
  onUpdateMultiBranding: (b: GroupBranding) => void;
  onRemoveMultiBranding: (groupId: string) => void;
  allGroups: Group[];
  isAdminMode?: boolean;
  customCss: string;
  setCustomCss: (v: string) => void;
  isStaffbaseTab: boolean;
  includeBranding: boolean;
  setIncludeBranding: (v: boolean) => void;
  updateThemeColors: boolean;
  setUpdateThemeColors: (v: boolean) => void;
  includeArticles: boolean;
  setIncludeArticles: (v: boolean) => void;
  includeLinkedIn: boolean;
  setIncludeLinkedIn: (v: boolean) => void;
  includeAiArticles: boolean;
  setIncludeAiArticles: (v: boolean) => void;
  aiArticleCount: number;
  setAiArticleCount: (v: number) => void;
  aiArticleTopics: string;
  setAiArticleTopics: (v: string) => void;
  aiLocales: string[];
  setAiLocales: (v: string[]) => void;
  availableLocales?: string[];
  aiChannelId: string;
  setAiChannelId: (v: string) => void;
  aiNewChannelName: string;
  setAiNewChannelName: (v: string) => void;
  /* 📰 Advanced AI articles mode — when ON, the simple "single channel +
   *    manual topics" inputs become hints to Gemini; channel selection
   *    switches to a multi-checkbox; and a demo-date input appears so the
   *    pipeline can redistribute publish timestamps. Drives
   *    generateDistributedDemoArticles at execution time. */
  aiAdvancedMode: boolean;
  setAiAdvancedMode: (v: boolean) => void;
  aiAdvancedChannelIds: string[];
  setAiAdvancedChannelIds: (v: string[]) => void;
  aiAdvancedDemoDate: string;
  setAiAdvancedDemoDate: (v: string) => void;
  includeBlogScrape: boolean;
  // 📰 Bolt-in: rename news channels as part of the Create Branding flow
  includeChannelRename: boolean;
  setIncludeChannelRename: (v: boolean) => void;
  channelRenameIndustry: string;
  setChannelRenameIndustry: (v: string) => void;
  setIncludeBlogScrape: (v: boolean) => void;
  blogUrl: string;
  setBlogUrl: (v: string) => void;
  blogArticleCount: number;
  setBlogArticleCount: (v: number) => void;
  blogChannelId: string;
  setBlogChannelId: (v: string) => void;
  blogNewChannelName: string;
  setBlogNewChannelName: (v: string) => void;
  brandingExists: boolean;
  resetThemeOnDelete: boolean;
  setResetThemeOnDelete: (v: boolean) => void;
  previewActive: boolean;
  onPreview: () => void;
  onMobilePreview: () => void;
  onCancelPreview: () => void;
  getCreateLabel: () => string;
  onDeleteBranding: () => void;
  onPullBranding: () => void;
  prospectName: string;
  setProspectName: (v: string) => void;
  logoUrl: string;
  setLogoUrl: (v: string) => void;
  bgUrl: string;
  setBgURL: (v: string) => void;
  primaryColor: string;
  setPrimaryColor: (v: string) => void;
  textColor: string;
  setTextColor: (v: string) => void;
  backgroundColor: string;
  setBackgroundColor: (v: string) => void;
  floatingNavBgColor: string;
  setFloatingNavBgColor: (v: string) => void;
  floatingNavTextColor: string;
  setFloatingNavTextColor: (v: string) => void;
  // 🪧 Link Tiles widget colors — independent from primary/text so demos
  // can have a navy tile while primary is white, etc. Drives both Preview
  // (CSS override on .quick-links-widget__item) and Apply (Pages API PUT).
  tileBgColor: string;
  setTileBgColor: (v: string) => void;
  tileTextColor: string;
  setTileTextColor: (v: string) => void;
  logoPadWidth: number;
  setLogoPadWidth: (v: number) => void;
  logoPadHeight: number;
  setLogoPadHeight: (v: number) => void;
  bgVertical: number;
  setBgVertical: (v: number) => void;
  changeLogoSize: boolean;
  setChangeLogoSize: (v: boolean) => void;
  logoHeight: number;
  setLogoHeight: (v: number) => void;
  headerTransparency: number;
  setHeaderTransparency: (v: number) => void;
  logoMarginTop: number;
  setLogoMarginTop: (v: number) => void;
  prospectLinkedInUrl: string;
  setProspectLinkedInUrl: (v: string) => void;
  linkedinChannels: Channel[];
  linkedinChannelId: string;
  setLinkedinChannelId: (v: string) => void;
  linkedinNewChannelName: string;
  setLinkedinNewChannelName: (v: string) => void;
  linkedinLocales: string[];
  setLinkedinLocales: (v: string[]) => void;
  linkedInPostsCount: number;
  setLinkedInPostsCount: (v: number) => void;
  blogLocales: string[];
  setBlogLocales: (v: string[]) => void;
  onCreateDemo: () => void;
  hideArticlesAndActions?: boolean;
}

export default function BrandingForm({
  apiToken,
  branchId,
  savedProspects,
  onSaveProspect,
  onLoadProspect,
  onDeleteProspect,
  prospectNews,
  isFetchingNews,
  onFetchNews,
  fetchedBranding,
  newsSources,
  onApplyFetchedBranding,
  prospectSuggestions,
  onFetchSuggestions,
  onSuggestionSelected,
  multiBrandingEnabled,
  setMultiBrandingEnabled,
  multiBrandings,
  onAddMultiBranding,
  onUpdateMultiBranding,
  onRemoveMultiBranding,
  allGroups,
  isAdminMode,
  customCss,
  setCustomCss,
  isStaffbaseTab,
  includeBranding,
  setIncludeBranding,
  updateThemeColors,
  setUpdateThemeColors,
  includeArticles,
  setIncludeArticles,
  includeLinkedIn,
  setIncludeLinkedIn,
  includeAiArticles,
  setIncludeAiArticles,
  aiArticleCount,
  setAiArticleCount,
  aiArticleTopics,
  setAiArticleTopics,
  aiLocales,
  setAiLocales,
  availableLocales,
  aiChannelId,
  setAiChannelId,
  aiNewChannelName,
  setAiNewChannelName,
  aiAdvancedMode,
  setAiAdvancedMode,
  aiAdvancedChannelIds,
  setAiAdvancedChannelIds,
  aiAdvancedDemoDate,
  setAiAdvancedDemoDate,
  includeBlogScrape,
  includeChannelRename,
  setIncludeChannelRename,
  channelRenameIndustry,
  setChannelRenameIndustry,
  setIncludeBlogScrape,
  blogUrl,
  setBlogUrl,
  blogArticleCount,
  setBlogArticleCount,
  blogChannelId,
  setBlogChannelId,
  blogNewChannelName,
  setBlogNewChannelName,
  brandingExists,
  resetThemeOnDelete: _resetThemeOnDelete,
  setResetThemeOnDelete: _setResetThemeOnDelete,
  previewActive,
  onPreview,
  onMobilePreview,
  onCancelPreview,
  getCreateLabel,
  onDeleteBranding,
  onPullBranding,
  prospectName,
  setProspectName,
  logoUrl,
  setLogoUrl,
  bgUrl,
  setBgURL,
  primaryColor,
  setPrimaryColor,
  textColor,
  setTextColor,
  backgroundColor,
  setBackgroundColor,
  floatingNavBgColor,
  setFloatingNavBgColor,
  floatingNavTextColor,
  setFloatingNavTextColor,
  tileBgColor,
  setTileBgColor,
  tileTextColor,
  setTileTextColor,
  logoPadWidth,
  setLogoPadWidth,
  logoPadHeight,
  setLogoPadHeight,
  bgVertical,
  setBgVertical,
  changeLogoSize,
  setChangeLogoSize,
  logoHeight,
  setLogoHeight,
  headerTransparency,
  setHeaderTransparency,
  logoMarginTop,
  setLogoMarginTop,
  prospectLinkedInUrl,
  setProspectLinkedInUrl,
  linkedinChannels,
  linkedinChannelId,
  setLinkedinChannelId,
  linkedinNewChannelName,
  setLinkedinNewChannelName,
  linkedinLocales,
  setLinkedinLocales,
  linkedInPostsCount,
  setLinkedInPostsCount,
  blogLocales,
  setBlogLocales,
  onCreateDemo,
  hideArticlesAndActions = false,
}: BrandingFormProps) {
  const autocompleteWrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (autocompleteWrapperRef.current && !autocompleteWrapperRef.current.contains(event.target as Node)) {
        onSuggestionSelected(prospectName);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [autocompleteWrapperRef, onSuggestionSelected, prospectName]);

  const [showCustomCss, setShowCustomCss] = useState(false);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const [saveConfirmed, setSaveConfirmed] = useState(false);
  const [aiChannelFilter, setAiChannelFilter] = useState("");
  const [linkedinChannelFilter, setLinkedinChannelFilter] = useState("");
  const [blogChannelFilter, setBlogChannelFilter] = useState("");

  const handleSaveClick = () => {
    onSaveProspect();
    setSaveConfirmed(true);
    setTimeout(() => setSaveConfirmed(false), 2000);
  };

  const withPreview = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    if (isStaffbaseTab && previewActive) onPreview();
  };

  const debounce = (func: (value: string) => void, delay: number) => {
    let timeout: ReturnType<typeof setTimeout>;
    return (value: string) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(value), delay);
    };
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedFetch = useCallback(debounce(onFetchSuggestions, 300), [onFetchSuggestions]);

  const handleProspectInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setProspectName(value);
    debouncedFetch(value);
  };

  const isValidHex = (value?: string) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value || "");
  const getHexValidationMessage = (value?: string): string | null => {
    const trimmed = (value || "").trim();
    if (!trimmed) return "Hex code is required.";
    if (!trimmed.startsWith("#")) return "Hex code must start with #.";
    if (trimmed.length !== 4 && trimmed.length !== 7) {
      return "Hex code must be 4 or 7 characters (including #).";
    }
    if (!/^#[0-9a-fA-F]+$/.test(trimmed)) {
      return "Hex code can only contain 0-9 and A-F.";
    }
    return null;
  };

  const colorValidation: Record<string, string | null> = {
    primaryColor: getHexValidationMessage(primaryColor),
    textColor: getHexValidationMessage(textColor),
    backgroundColor: getHexValidationMessage(backgroundColor),
    floatingNavBgColor: getHexValidationMessage(floatingNavBgColor),
    floatingNavTextColor: getHexValidationMessage(floatingNavTextColor),
    tileBgColor: getHexValidationMessage(tileBgColor),
    tileTextColor: getHexValidationMessage(tileTextColor),
  };
  const hasHexValidationErrors = Object.values(colorValidation).some(Boolean);

  const handleCreateClick = () => {
    if (includeBranding && hasHexValidationErrors) return;
    onCreateDemo();
  };

  const colorSwatches = [
    { label: "Primary", value: fetchedBranding?.primaryColor },
    { label: "Text", value: fetchedBranding?.textColor },
    { label: "Background", value: fetchedBranding?.backgroundColor },
  ].filter((color) => isValidHex(color.value));
  const sourceList = Array.isArray(newsSources) ? newsSources : [];
  const getSourceLabel = (source: NewsSource) => {
    if (!source) return "";
    if (source.title) return source.title;
    try {
      return new URL(source.url ?? "").hostname;
    } catch {
      return source.url || "";
    }
  };

  return (
    <>
      {/* ───────── existing-branding notice ───────── */}
      {brandingExists && (
        <div
          style={{
            marginTop: 10,
            padding: 16,
            background: colors.backgroundInfo,
            borderRadius: 4,
            marginBottom: 10,
          }}
        >
          This environment is already branded with Replify.
          <br />
          <strong>Adding branding will replace the existing branding.</strong>

          <div style={{ margin: "10px 0", display: "flex", gap: 12 }}>
            <button
              style={{
                ...brandingButtonStyle,
                background:
                  hoveredButton === "delete"
                    ? colors.dangerLight
                    : colors.danger,
                color: colors.textOnPrimary,
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onClick={onDeleteBranding}
              onMouseEnter={() => setHoveredButton("delete")}
              onMouseLeave={() => setHoveredButton(null)}
            >
              <span style={{ fontSize: "24px", marginRight: 6 }}>✖︎</span>
              Delete branding
            </button>
            <button
              onClick={onPullBranding}
              style={{
                ...brandingButtonStyle,
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor:
                  hoveredButton === "pull"
                    ? colors.primaryLight
                    : colors.primary,
              }}
              onMouseEnter={() => setHoveredButton("pull")}
              onMouseLeave={() => setHoveredButton(null)}
            >
              <span style={{ fontSize: "24px", marginRight: 6 }}>⟳</span>
              Pull current
            </button>
          </div>
        </div>
      )}

      {/* ───────── Add-branding toggle ───────── */}
      <div style={formGroupStyle}>
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            style={checkboxStyle}
            checked={includeBranding}
            onChange={(e) => setIncludeBranding(e.target.checked)}
          />
          Add branding
        </label>
      </div>

      {/* ───────── Branding details ───────── */}
      {includeBranding && (
        <>
          <SavedProspects
            prospects={savedProspects}
            onSelect={onLoadProspect}
            onDelete={onDeleteProspect}
          />
          {/* CHECKBOX FOR THEME COLORS */}
          <div style={{ ...formGroupStyle, paddingLeft: "20px" }}>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                style={checkboxStyle}
                checked={updateThemeColors}
                onChange={(e) => setUpdateThemeColors(e.target.checked)}
              />
              Update colors in App/Intranet branding page
            </label>
          </div>

          <div style={formGroupStyle}>
            <label style={labelStyle}>Prospect Name:</label>
            <div style={{ position: 'relative' }} ref={autocompleteWrapperRef}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="text"
                  style={{ ...inputStyle, flex: 1 }}
                  value={prospectName}
                  onChange={handleProspectInputChange}
                  placeholder="e.g., Google, Staffbase..."
                  autoComplete="off"
                />
                {prospectName.length >= 3 && (
                  <button
                    onClick={onFetchNews}
                    style={{
                      padding: "8px",
                      width: "40px",
                      height: "40px",
                      background: colors.primary,
                      border: "none",
                      borderRadius: "8px",
                      color: "white",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                    title="Get AI Overview"
                  >
                    <HiSparkles size={20} />
                  </button>
                )}
              </div>
              {/* Autocomplete Dropdown */}
              {prospectSuggestions.length > 0 && (
                <ul style={{
                  position: 'absolute', top: '100%', left: 0, right: 0,
                  backgroundColor: 'white', border: `1px solid ${colors.border}`,
                  borderRadius: '4px', listStyle: 'none', margin: '4px 0 0', padding: 0, zIndex: 10
                }}>
                  {prospectSuggestions.map((suggestion, index) => (
                    <li
                      key={suggestion.domain || index}
                      onClick={() => onSuggestionSelected(suggestion.name)}
                      style={{ padding: '10px', cursor: 'pointer', borderBottom: `1px solid ${colors.borderLight}` }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.primaryLight; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; }}
                    >
                      <img src={suggestion.icon} alt="" style={{ width: 20, height: 20, marginRight: 8, verticalAlign: 'middle' }} />
                      {suggestion.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* ✨ AI News Overview Section */}
          {(isFetchingNews || prospectNews || fetchedBranding || sourceList.length > 0) && (
            <div style={{ ...formGroupStyle, background: colors.backgroundLight, padding: '12px', borderRadius: '4px', border: `1px solid ${colors.borderLight}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ margin: 0, color: colors.primary, fontSize: '14px' }}>✨ Things to know</h4>
                <span style={{ fontSize: '11px', color: colors.textMuted, fontStyle: 'italic' }}>Please verify AI-generated content.</span>
              </div>
              {isFetchingNews && <p style={{ margin: 0, color: colors.textMuted, fontStyle: 'italic' }}>Fetching latest news...</p>}
              {!isFetchingNews && (prospectNews || fetchedBranding || sourceList.length > 0) && (
                <div style={{ color: colors.textDark, fontSize: '13px' }}>
                  {prospectNews && <AiNewsDisplay text={prospectNews} />}
                  {sourceList.length > 0 && (
                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '11px', color: colors.textMuted }}>Sources:</span>
                      {sourceList.map((source, index) => (
                        <a
                          key={source.url || index}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontSize: '11px',
                            color: colors.primary,
                            textDecoration: 'none',
                            border: `1px solid ${colors.borderLight}`,
                            borderRadius: 999,
                            padding: '2px 8px',
                            backgroundColor: colors.background,
                          }}
                        >
                          {getSourceLabel(source)}
                        </a>
                      ))}
                    </div>
                  )}
                  {fetchedBranding && (
                    <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={onApplyFetchedBranding}
                        style={{
                          ...brandingButtonStyle,
                          fontSize: '12px',
                          padding: '6px 10px',
                          backgroundColor: colors.primary,
                        }}
                      >
                        Apply fetched branding
                      </button>
                      {colorSwatches.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {colorSwatches.map((color) => (
                            <div
                              key={color.label}
                              title={`${color.label}: ${color.value}`}
                              style={{
                                width: '16px',
                                height: '16px',
                                borderRadius: '4px',
                                border: `1px solid ${colors.borderLight}`,
                                backgroundColor: color.value,
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {([
            ["Logo URL", logoUrl, withPreview(setLogoUrl), ""],
            ["Background Image URL", bgUrl, withPreview(setBgURL), ""],
          ] as [string, string, (v: string) => void, string][]).map(([lbl, val, onChange, ph]) => (
            <div key={lbl} style={formGroupStyle}>
              <label style={labelStyle}>{lbl}:</label>
              <input
                type="text"
                style={inputStyle}
                value={val}
                onChange={(e) => onChange(e.target.value)}
                placeholder={ph}
              />
            </div>
          ))}

          {/* colour pickers */}
          {[
            { key: "primaryColor", label: "Primary Branding Color", value: primaryColor, onChange: withPreview(setPrimaryColor) },
            { key: "textColor", label: "Text Branding Color", value: textColor, onChange: withPreview(setTextColor) },
            { key: "backgroundColor", label: "Background Color (Neutral)", value: backgroundColor, onChange: withPreview(setBackgroundColor) },
          ].map(({ key, label, value, onChange }) => (
            <div key={key} style={formGroupStyle}>
              <label style={labelStyle}>{label}:</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="color"
                  style={{ ...inputStyle, padding: 0, width: 50, height: 50, border: "none" }}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                />
                <input
                  type="text"
                  style={{
                    ...inputStyle,
                    width: 100,
                    borderColor: colorValidation[key] ? colors.danger : inputStyle.borderColor,
                  }}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder="#RRGGBB"
                />
              </div>
              {colorValidation[key] && (
                <p style={{ margin: "6px 0 0", color: colors.danger, fontSize: 12 }}>
                  {colorValidation[key]}
                </p>
              )}
            </div>
          ))}

          {/* floating nav colours */}
          <div style={{ ...formGroupStyle, display: "flex", alignItems: "flex-end", gap: "16px" }}>
            <div>
              <label style={labelStyle}>Floating Nav BG:</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="color"
                  style={{ ...inputStyle, padding: 0, width: 50, height: 50, border: "none" }}
                  value={floatingNavBgColor}
                  onChange={(e) => withPreview(setFloatingNavBgColor)(e.target.value)}
                />
                <input
                  type="text"
                  style={{
                    ...inputStyle,
                    width: 100,
                    borderColor: colorValidation.floatingNavBgColor ? colors.danger : inputStyle.borderColor,
                  }}
                  value={floatingNavBgColor}
                  onChange={(e) => withPreview(setFloatingNavBgColor)(e.target.value)}
                  placeholder="#FFFFFF"
                />
              </div>
              {colorValidation.floatingNavBgColor && (
                <p style={{ margin: "6px 0 0", color: colors.danger, fontSize: 12 }}>
                  {colorValidation.floatingNavBgColor}
                </p>
              )}
            </div>
            <div>
              <label style={labelStyle}>Floating Nav Text:</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="color"
                  style={{ ...inputStyle, padding: 0, width: 50, height: 50, border: "none" }}
                  value={floatingNavTextColor}
                  onChange={(e) => withPreview(setFloatingNavTextColor)(e.target.value)}
                />
                <input
                  type="text"
                  style={{
                    ...inputStyle,
                    width: 100,
                    borderColor: colorValidation.floatingNavTextColor ? colors.danger : inputStyle.borderColor,
                  }}
                  value={floatingNavTextColor}
                  onChange={(e) => withPreview(setFloatingNavTextColor)(e.target.value)}
                  placeholder="#000000"
                />
              </div>
              {colorValidation.floatingNavTextColor && (
                <p style={{ margin: "6px 0 0", color: colors.danger, fontSize: 12 }}>
                  {colorValidation.floatingNavTextColor}
                </p>
              )}
            </div>
          </div>

          {/* 🪧 Link Tiles widget colors — paired exactly like Floating Nav.
              Lives independent of primary/text because a tile's color is its
              own design choice (e.g. white primary + navy tiles). Bound to
              tileBgColor / tileTextColor state in App.tsx. */}
          <div style={{ ...formGroupStyle, display: "flex", alignItems: "flex-end", gap: "16px" }}>
            <div>
              <label style={labelStyle}>Link Tile BG:</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="color"
                  style={{ ...inputStyle, padding: 0, width: 50, height: 50, border: "none" }}
                  value={tileBgColor}
                  onChange={(e) => withPreview(setTileBgColor)(e.target.value)}
                />
                <input
                  type="text"
                  style={{
                    ...inputStyle,
                    width: 100,
                    borderColor: colorValidation.tileBgColor ? colors.danger : inputStyle.borderColor,
                  }}
                  value={tileBgColor}
                  onChange={(e) => withPreview(setTileBgColor)(e.target.value)}
                  placeholder="#164194"
                />
              </div>
              {colorValidation.tileBgColor && (
                <p style={{ margin: "6px 0 0", color: colors.danger, fontSize: 12 }}>
                  {colorValidation.tileBgColor}
                </p>
              )}
            </div>
            <div>
              <label style={labelStyle}>Link Tile Text:</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="color"
                  style={{ ...inputStyle, padding: 0, width: 50, height: 50, border: "none" }}
                  value={tileTextColor}
                  onChange={(e) => withPreview(setTileTextColor)(e.target.value)}
                />
                <input
                  type="text"
                  style={{
                    ...inputStyle,
                    width: 100,
                    borderColor: colorValidation.tileTextColor ? colors.danger : inputStyle.borderColor,
                  }}
                  value={tileTextColor}
                  onChange={(e) => withPreview(setTileTextColor)(e.target.value)}
                  placeholder="#FFFFFF"
                />
              </div>
              {colorValidation.tileTextColor && (
                <p style={{ margin: "6px 0 0", color: colors.danger, fontSize: 12 }}>
                  {colorValidation.tileTextColor}
                </p>
              )}
            </div>
          </div>

          {/* logo padding */}
          <div style={formGroupStyle}>
            <label style={labelStyle}>Logo padding (width × height px)</label>
            <div style={{ display: "flex", gap: 6 }}>
              {([
                [logoPadWidth, withPreview(setLogoPadWidth)],
                [logoPadHeight, withPreview(setLogoPadHeight)],
              ] as [number, (v: number) => void][]).map(([val, onChange], i) => (
                <input
                  key={i}
                  type="number"
                  style={{ ...inputStyle, width: 80 }}
                  value={val}
                  onChange={(e) => onChange(Number(e.target.value))}
                  onBlur={
                    isStaffbaseTab && previewActive ? onPreview : undefined
                  }
                />
              ))}
            </div>
          </div>
          {/* logo sizing checkbox */}
          <div style={formGroupStyle}>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                style={checkboxStyle}
                checked={changeLogoSize}
                onChange={(e) => setChangeLogoSize(e.target.checked)}
              />
              Customize logo size/position
            </label>
          </div>

          {/* logo sizing inputs (conditional) */}
          {changeLogoSize && (
            <div style={{...formGroupStyle, paddingLeft: '20px'}}>
              <label style={labelStyle}>Logo height & margin-top (px)</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="number"
                  style={{ ...inputStyle, width: 80 }}
                  value={logoHeight}
                  onChange={(e) => withPreview(setLogoHeight)(Number(e.target.value))}
                  onBlur={ isStaffbaseTab && previewActive ? onPreview : undefined }
                  placeholder="Height"
                />
                <input
                  type="number"
                  style={{ ...inputStyle, width: 80 }}
                  value={logoMarginTop}
                  onChange={(e) => withPreview(setLogoMarginTop)(Number(e.target.value))}
                  onBlur={ isStaffbaseTab && previewActive ? onPreview : undefined }
                  placeholder="Margin Top"
                />
              </div>
            </div>
          )}
          {/* background vertical offset */}
          <div style={formGroupStyle}>
            <label style={labelStyle}>Background image vertical %</label>
            <input
              type="number"
              min="-50"
              max="50"
              style={{ ...inputStyle, width: 80 }}
              value={bgVertical}
              onChange={(e) => withPreview(setBgVertical)(Number(e.target.value))}
              onBlur={
                isStaffbaseTab && previewActive ? onPreview : undefined
              }
            />
          </div>

          {/* Header Transparency Slider */}
          <div style={formGroupStyle}>
            <label style={labelStyle}>Header Transparency ({headerTransparency}%)</label>
            <input
              type="range"
              min="0"
              max="100"
              style={{ width: '100%' }}
              value={headerTransparency}
              onChange={(e) => withPreview(setHeaderTransparency)(Number(e.target.value))}
            />
          </div>

          {/* --- Action Buttons within Branding --- */}
          <div style={{ ...formGroupStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* Save Prospect Button */}
            {prospectName && (
              <button
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: saveConfirmed ? colors.success : colors.primary,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "5px",
                  transition: "color 0.2s ease",
                }}
                onClick={handleSaveClick}
              >
                {saveConfirmed ? (
                  <>✓ Saved!</>
                ) : (
                  <>
                    <BsSave2 size={18} />
                    Save this prospect
                  </>
                )}
              </button>
            )}

            {/* Multi-Branding Toggle Button */}
            <button
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: colors.primary,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "5px",
                marginLeft: 'auto',
              }}
              onClick={() => setMultiBrandingEnabled((prev) => !prev)}
            >
              <AiOutlineFormatPainter size={18} />
              {multiBrandingEnabled
                ? "Hide multi branding"
                : "Add multi branding"}
            </button>
          </div>

          {/* Conditionally render MultiBranding component */}
          {multiBrandingEnabled && (
            <MultiBranding
              apiToken={apiToken}
              branchId={branchId}
              brandings={multiBrandings}
              onAdd={onAddMultiBranding}
              onUpdate={onUpdateMultiBranding}
              onRemove={onRemoveMultiBranding}
              allGroups={allGroups}
              savedProspects={savedProspects}
            />
          )}

          {/* Admin Mode: Raw CSS Editor */}
          {isAdminMode && (
            <div style={{ ...formGroupStyle, marginTop: '15px' }}>
              <button
                onClick={() => setShowCustomCss(prev => !prev)}
                style={{
                  ...brandingButtonStyle,
                  fontSize: '12px',
                  background: showCustomCss ? colors.danger : colors.primary,
                }}
              >
                {showCustomCss ? 'Hide Raw CSS Editor' : 'Edit Raw CSS'}
              </button>
              {showCustomCss && (
                <div style={{ marginTop: '10px' }}>
                  <label style={labelStyle}>
                    Custom CSS Overrides:
                  </label>
                  <p style={{ fontSize: '11px', color: colors.textMuted, margin: '0 0 5px 0' }}>
                    This CSS will be appended to the end of the Replify block.
                  </p>
                  <textarea
                    style={{
                      ...inputStyle,
                      width: '100%',
                      minHeight: '150px',
                      maxHeight: '300px',
                      resize: 'vertical',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      whiteSpace: 'pre',
                      overflow: 'auto',
                    }}
                    value={customCss}
                    onChange={(e) => setCustomCss(e.target.value)}
                    placeholder="e.g., .my-custom-class { color: red !important; }"
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ───────── Articles + Actions (hidden in demo mode) ───────── */}
      {!hideArticlesAndActions && <>
      {/* ───────── Articles toggle ───────── */}
      <div style={formGroupStyle}>
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            style={checkboxStyle}
            checked={includeArticles}
            onChange={(e) => setIncludeArticles(e.target.checked)}
          />
          Generate articles
        </label>
      </div>

      {/* ── Article sub-options ── */}
      {includeArticles && (
        <div style={{ marginLeft: 16, marginBottom: 12, borderLeft: `2px solid ${colors.border}`, paddingLeft: 12 }}>

          {/* 📰 Rename news channels — moved to the TOP of the Generate articles
              section per UX request. Bolt-in port of staffbase-news-tool: uses
              the prospect intelligence Gemini already pulls (via the sparkle
              button on the prospect-name input) to contextualize the new
              channel titles. Confirms via window.confirm() before writing. */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="checkbox"
                style={checkboxStyle}
                checked={includeChannelRename}
                onChange={(e) => setIncludeChannelRename(e.target.checked)}
              />
              Rename news channels
            </label>
            {includeChannelRename && (
              <div style={{ marginTop: 6 }}>
                <label style={{ ...labelStyle, fontSize: 11 }}>Industry style</label>
                <select
                  style={{ ...inputStyle, padding: "4px 6px", marginBottom: 6, width: "100%" }}
                  value={channelRenameIndustry}
                  onChange={(e) => setChannelRenameIndustry(e.target.value)}
                >
                  <option value="auto">Auto (infer from prospect)</option>
                  {newsIndustryKeys().map((i) => (
                    <option key={i.key} value={i.key}>{i.label}</option>
                  ))}
                </select>
                <p style={{ margin: 0, fontSize: 11, color: colors.textMuted, lineHeight: 1.4 }}>
                  Gemini will propose new titles using the prospect's name and
                  the news it pulled. You'll get a confirmation preview before
                  any channel is renamed.
                </p>
              </div>
            )}
          </div>

          {/* AI Articles */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" style={checkboxStyle} checked={includeAiArticles} onChange={(e) => setIncludeAiArticles(e.target.checked)} />
              Generate AI articles
            </label>
            {includeAiArticles && (
              <div style={{ marginTop: 6 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <div style={{ flex: "0 0 70px" }}>
                    <label style={{ ...labelStyle, fontSize: 11 }}>Count</label>
                    <input
                      type="number"
                      min={1} max={20}
                      style={{ ...inputStyle, padding: "4px 6px" }}
                      value={aiArticleCount}
                      onChange={(e) => setAiArticleCount(Number(e.target.value))}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ ...labelStyle, fontSize: 11 }}>Languages</label>
                    {availableLocales && availableLocales.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                        {availableLocales.map((locale) => {
                          const selected = (aiLocales || []).includes(locale);
                          return (
                            <button
                              key={locale}
                              type="button"
                              onClick={() => {
                                if (selected) {
                                  setAiLocales((aiLocales || []).filter((l) => l !== locale));
                                } else {
                                  setAiLocales([...(aiLocales || []), locale]);
                                }
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 2,
                                padding: "2px 8px",
                                borderRadius: 4,
                                border: `1px solid ${selected ? colors.primary : colors.border}`,
                                background: selected ? colors.primary : "transparent",
                                color: selected ? colors.textOnPrimary : colors.text,
                                fontSize: 11,
                                cursor: "pointer",
                              }}
                            >
                              {selected && <IoIosCheckmark style={{ fontSize: 14 }} />}
                              {locale}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <input
                        type="text"
                        style={{ ...inputStyle, padding: "4px 6px" }}
                        value={(aiLocales || []).join(", ")}
                        onChange={(e) => setAiLocales(e.target.value.split(",").map((l) => l.trim()).filter(Boolean))}
                        placeholder="en_US, es_ES, de_DE"
                      />
                    )}
                  </div>
                </div>
                <label style={{ ...labelStyle, fontSize: 11 }}>Prospect name (optional)</label>
                <input
                  type="text"
                  style={{ ...inputStyle, padding: "4px 6px", marginBottom: 6 }}
                  value={prospectName}
                  onChange={(e) => setProspectName(e.target.value)}
                  placeholder="e.g. Google"
                />
                <label style={{ ...labelStyle, fontSize: 11 }}>Publish to channel</label>
                <FilterableChannelSelect
                  value={aiChannelId}
                  onChange={setAiChannelId}
                  channels={linkedinChannels}
                  filterValue={aiChannelFilter}
                  onFilterChange={setAiChannelFilter}
                  selectStyle={{ marginBottom: 6 }}
                />
                {aiChannelId === CREATE_NEW_CHANNEL_VALUE && (
                  <>
                    <label style={{ ...labelStyle, fontSize: 11 }}>New channel name</label>
                    <input
                      type="text"
                      style={{ ...inputStyle, padding: "4px 6px", marginBottom: 6 }}
                      value={aiNewChannelName}
                      onChange={(e) => setAiNewChannelName(e.target.value)}
                      placeholder="e.g. Company News"
                    />
                  </>
                )}
                <label style={{ ...labelStyle, fontSize: 11 }}>Topics / extra prompt (optional)</label>
                <textarea
                  style={{ ...inputStyle, resize: "vertical", minHeight: 52, fontSize: 12 }}
                  value={aiArticleTopics}
                  onChange={(e) => setAiArticleTopics(e.target.value)}
                  placeholder="e.g. benefits, safety, company culture"
                />

                {/* 📰 Advanced mode toggle — when ON, single-channel + manual
                    topics become hints to Gemini; multi-channel selector +
                    demo date appear. Branched at execution time in
                    handleCreateDemo → generateDistributedDemoArticles. */}
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${colors.borderLight}` }}>
                  <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
                    <input
                      type="checkbox"
                      style={checkboxStyle}
                      checked={aiAdvancedMode}
                      onChange={(e) => setAiAdvancedMode(e.target.checked)}
                    />
                    Advanced: distribute across channels + schedule around demo date
                  </label>
                  {aiAdvancedMode && (
                    <div style={{ marginTop: 8, marginLeft: 16, paddingLeft: 8, borderLeft: `2px solid ${colors.border}` }}>
                      <p style={{ margin: "0 0 8px", fontSize: 11, color: colors.textMuted, lineHeight: 1.4 }}>
                        Gemini picks per-channel article counts + topics from your prospect news.
                        Total count above drives volume; topic field above is a hint. All posts
                        (new + existing) in selected channels get realistic publish dates.
                      </p>

                      <label style={{ ...labelStyle, fontSize: 11 }}>
                        Channels to populate ({aiAdvancedChannelIds.length} of {linkedinChannels.length} selected)
                      </label>
                      <div style={{ maxHeight: 160, overflowY: "auto", border: `1px solid ${colors.borderMedium}`, borderRadius: 4, padding: 6, marginBottom: 8 }}>
                        {linkedinChannels.length === 0 ? (
                          <p style={{ margin: 0, fontSize: 11, color: colors.textMuted }}>Loading channels…</p>
                        ) : (
                          linkedinChannels.map((c) => (
                            <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, padding: "2px 0", cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={aiAdvancedChannelIds.includes(c.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setAiAdvancedChannelIds([...aiAdvancedChannelIds, c.id]);
                                  } else {
                                    setAiAdvancedChannelIds(aiAdvancedChannelIds.filter((id) => id !== c.id));
                                  }
                                }}
                              />
                              <span>{c.title}</span>
                              <span style={{ color: colors.textMuted, marginLeft: "auto" }}>({c.id.slice(-6)})</span>
                            </label>
                          ))
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                        <button
                          type="button"
                          onClick={() => setAiAdvancedChannelIds(linkedinChannels.map((c) => c.id))}
                          style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, border: `1px solid ${colors.border}`, background: "transparent", cursor: "pointer" }}
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => setAiAdvancedChannelIds([])}
                          style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, border: `1px solid ${colors.border}`, background: "transparent", cursor: "pointer" }}
                        >
                          None
                        </button>
                      </div>

                      <label style={{ ...labelStyle, fontSize: 11 }}>Demo date (posts cluster around this)</label>
                      <input
                        type="date"
                        style={{ ...inputStyle, padding: "4px 6px", marginBottom: 4, fontSize: 12 }}
                        value={aiAdvancedDemoDate}
                        onChange={(e) => setAiAdvancedDemoDate(e.target.value)}
                      />
                      <p style={{ margin: 0, fontSize: 11, color: colors.textMuted, lineHeight: 1.4 }}>
                        60% of posts land in the last 14 days before this date; the rest spread exponentially older.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* LinkedIn */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" style={checkboxStyle} checked={includeLinkedIn} onChange={(e) => setIncludeLinkedIn(e.target.checked)} />
              Import LinkedIn posts
            </label>
            {includeLinkedIn && (
              <div style={{ marginTop: 6 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ ...labelStyle, fontSize: 11 }}>LinkedIn Page URL</label>
                    <input
                      type="text"
                      style={{ ...inputStyle, padding: "4px 6px" }}
                      value={prospectLinkedInUrl}
                      onChange={(e) => setProspectLinkedInUrl(e.target.value)}
                      placeholder="https://linkedin.com/company/company-inc"
                    />
                  </div>
                  <div style={{ flex: "0 0 70px" }}>
                    <label style={{ ...labelStyle, fontSize: 11 }}>Count</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      style={{ ...inputStyle, padding: "4px 6px" }}
                      value={linkedInPostsCount}
                      onChange={(e) => setLinkedInPostsCount(Number(e.target.value))}
                    />
                  </div>
                </div>
                <label style={{ ...labelStyle, fontSize: 11 }}>Languages</label>
                {availableLocales && availableLocales.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2, marginBottom: 6 }}>
                    {availableLocales.map((locale) => {
                      const selected = (linkedinLocales || []).includes(locale);
                      return (
                        <button
                          key={locale}
                          type="button"
                          onClick={() => {
                            if (selected) {
                              setLinkedinLocales((linkedinLocales || []).filter((l) => l !== locale));
                            } else {
                              setLinkedinLocales([...(linkedinLocales || []), locale]);
                            }
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 2,
                            padding: "2px 8px",
                            borderRadius: 4,
                            border: `1px solid ${selected ? colors.primary : colors.border}`,
                            background: selected ? colors.primary : "transparent",
                            color: selected ? colors.textOnPrimary : colors.text,
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          {selected && <IoIosCheckmark style={{ fontSize: 14 }} />}
                          {locale}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    type="text"
                    style={{ ...inputStyle, padding: "4px 6px", marginBottom: 6 }}
                    value={(linkedinLocales || []).join(", ")}
                    onChange={(e) => setLinkedinLocales(e.target.value.split(",").map((l) => l.trim()).filter(Boolean))}
                    placeholder="en_US, es_ES, de_DE"
                  />
                )}
                <label style={{ ...labelStyle, fontSize: 11 }}>Import into channel</label>
                <FilterableChannelSelect
                  value={linkedinChannelId}
                  onChange={setLinkedinChannelId}
                  channels={linkedinChannels}
                  filterValue={linkedinChannelFilter}
                  onFilterChange={setLinkedinChannelFilter}
                />
                {linkedinChannelId === CREATE_NEW_CHANNEL_VALUE && (
                  <>
                    <label style={{ ...labelStyle, fontSize: 11 }}>New channel name</label>
                    <input
                      type="text"
                      style={{ ...inputStyle, padding: "4px 6px" }}
                      value={linkedinNewChannelName}
                      onChange={(e) => setLinkedinNewChannelName(e.target.value)}
                      placeholder="e.g. LinkedIn Updates"
                    />
                  </>
                )}
              </div>
            )}
          </div>

          {/* Blog scraping */}
          <div>
            <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" style={checkboxStyle} checked={includeBlogScrape} onChange={(e) => setIncludeBlogScrape(e.target.checked)} />
              Scrape blog
            </label>
            {includeBlogScrape && (
              <div style={{ marginTop: 6 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ ...labelStyle, fontSize: 11 }}>Blog URL</label>
                    <input
                      type="text"
                      style={{ ...inputStyle, padding: "4px 6px" }}
                      value={blogUrl}
                      onChange={(e) => setBlogUrl(e.target.value)}
                      placeholder="https://company.com/blog"
                    />
                  </div>
                  <div style={{ flex: "0 0 70px" }}>
                    <label style={{ ...labelStyle, fontSize: 11 }}>Count</label>
                    <input
                      type="number"
                      min={1} max={20}
                      style={{ ...inputStyle, padding: "4px 6px" }}
                      value={blogArticleCount}
                      onChange={(e) => setBlogArticleCount(Number(e.target.value))}
                    />
                  </div>
                </div>
                <label style={{ ...labelStyle, fontSize: 11 }}>Languages</label>
                {availableLocales && availableLocales.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2, marginBottom: 6 }}>
                    {availableLocales.map((locale) => {
                      const selected = (blogLocales || []).includes(locale);
                      return (
                        <button
                          key={locale}
                          type="button"
                          onClick={() => {
                            if (selected) {
                              setBlogLocales((blogLocales || []).filter((l) => l !== locale));
                            } else {
                              setBlogLocales([...(blogLocales || []), locale]);
                            }
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 2,
                            padding: "2px 8px",
                            borderRadius: 4,
                            border: `1px solid ${selected ? colors.primary : colors.border}`,
                            background: selected ? colors.primary : "transparent",
                            color: selected ? colors.textOnPrimary : colors.text,
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          {selected && <IoIosCheckmark style={{ fontSize: 14 }} />}
                          {locale}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    type="text"
                    style={{ ...inputStyle, padding: "4px 6px", marginBottom: 6 }}
                    value={(blogLocales || []).join(", ")}
                    onChange={(e) => setBlogLocales(e.target.value.split(",").map((l) => l.trim()).filter(Boolean))}
                    placeholder="en_US, es_ES, de_DE"
                  />
                )}
                <label style={{ ...labelStyle, fontSize: 11 }}>Publish to channel</label>
                <FilterableChannelSelect
                  value={blogChannelId}
                  onChange={setBlogChannelId}
                  channels={linkedinChannels}
                  filterValue={blogChannelFilter}
                  onFilterChange={setBlogChannelFilter}
                  selectStyle={{ marginBottom: 6 }}
                />
                {blogChannelId === CREATE_NEW_CHANNEL_VALUE && (
                  <>
                    <label style={{ ...labelStyle, fontSize: 11 }}>New channel name</label>
                    <input
                      type="text"
                      style={{ ...inputStyle, padding: "4px 6px", marginBottom: 6 }}
                      value={blogNewChannelName}
                      onChange={(e) => setBlogNewChannelName(e.target.value)}
                      placeholder="e.g. Blog Highlights"
                    />
                  </>
                )}
                <p style={{ margin: 0, fontSize: 11, color: colors.textMuted, lineHeight: 1.4 }}>
                  Runs last. Replify will open the blog tab and show instructions in the side panel.
                </p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ───────── Action buttons ───────── */}
      <div style={formGroupStyle}>
        {includeBranding && hasHexValidationErrors && (
          <p style={{ margin: "0 0 8px", color: colors.danger, fontSize: 12 }}>
            Fix invalid hex codes before continuing.
          </p>
        )}
        {isStaffbaseTab && includeBranding && (
          <>
            <button
              style={{
                ...brandingButtonStyle,
                backgroundColor: isStaffbaseTab
                  ? hoveredButton === "preview"
                    ? colors.primaryLight
                    : colors.primary
                  : "grey",
                cursor: isStaffbaseTab && !hasHexValidationErrors ? "pointer" : "not-allowed",
              }}
              onClick={previewActive ? onCancelPreview : onPreview}
              disabled={!isStaffbaseTab || hasHexValidationErrors}
              onMouseEnter={() => setHoveredButton("preview")}
              onMouseLeave={() => setHoveredButton(null)}
            >
              {previewActive ? "✖︎ Cancel Preview" : "Preview Branding"}
            </button>
            <button
              style={{
                ...brandingButtonStyle,
                backgroundColor: hoveredButton === "mobile-preview" ? colors.primaryLight : colors.primary,
                cursor: isStaffbaseTab && !hasHexValidationErrors ? "pointer" : "not-allowed",
              }}
              onClick={onMobilePreview}
              disabled={!isStaffbaseTab || hasHexValidationErrors}
              onMouseEnter={() => setHoveredButton("mobile-preview")}
              onMouseLeave={() => setHoveredButton(null)}
            >
              Mobile Preview
            </button>
          </>
        )}

        <button
          style={{
            ...brandingButtonStyle,
            backgroundColor:
              hoveredButton === "create" ? colors.primaryLight : colors.primary,
          }}
          disabled={(!includeBranding && !includeArticles) || (includeBranding && hasHexValidationErrors)}
          onClick={handleCreateClick}
          onMouseEnter={() => setHoveredButton("create")}
          onMouseLeave={() => setHoveredButton(null)}
        >
          {getCreateLabel()}
        </button>
      </div>
      </>}
    </>
  );
}
