// components/DemoConfigForm.tsx
import { useState, useEffect } from "react";
import type { ComponentProps } from "react";
import { HiSparkles } from "react-icons/hi";
import { IoIosCheckmark } from "react-icons/io";
import {
  formGroupStyle,
  inputStyle,
  labelStyle,
  checkboxLabelStyle,
  checkboxStyle,
  brandingButtonStyle,
  panelStyle,
} from "../styles";
import { colors } from "../styles/colors";
import BrandingForm from "./BrandingForm";
import { DEMO_VERTICALS } from "../constants/appConstants";

interface UseCase {
  id: string;
  label: string;
  description?: string;
  requiresPicker?: string;
}

interface Survey {
  id: string;
  published?: boolean;
  config?: { localization?: Record<string, { title?: string }> };
}

interface FormItem {
  id: string;
  config?: { localization?: Record<string, { title?: string }> };
}

interface Channel {
  id: string;
  title: string;
}

interface ProspectSuggestion {
  domain?: string;
  name: string;
  icon?: string;
}

const USE_CASES: Record<string, UseCase[]> = {
  Manufacturing: [
    { id: "shift-viewing", label: "Shifts", description: "Preview the platform in a mobile-first context for frontline workers" },
    { id: "clock-in-out", label: "Clock In/Out", description: "Add the clock-in/out widget" },
    { id: "emergency-alerts", label: "Emergency Alerts", description: "Add an emergency alert banner" },
    { id: "tasks", label: "Tasks", description: "Add Manufacturing-related tasks" },
    { id: "feature-survey", label: "Feature a Survey", requiresPicker: "survey" },
    { id: "feature-form", label: "Feature a Form", requiresPicker: "form" },
  ],
  Healthcare: [
    { id: "shift-viewing", label: "Shift Viewing", description: "Preview the platform in a mobile-first context for frontline healthcare workers" },
  ],
  Education: [],
  Retail: [],
  "Financial Services": [],
  Technology: [],
  Government: [],
  "Non-Profit": [],
};

const PERSONAS: Record<string, string | null> = {
  Manufacturing: "Maria Santos",
  Healthcare: "David Park",
  Education: null,
  Retail: "Jasmine Cole",
  "Financial Services": "Chris Oduya",
  Technology: null,
  Government: null,
  "Non-Profit": null,
};

interface SectionPanelProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function SectionPanel({ title, isOpen, onToggle, children }: SectionPanelProps) {
  return (
    <div style={{ ...panelStyle, marginBottom: 10 }}>
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          marginBottom: isOpen ? 12 : 0,
          userSelect: "none",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13, color: colors.textDark }}>{title}</span>
        <span style={{ fontSize: 10, color: colors.textMuted }}>{isOpen ? "▲" : "▼"}</span>
      </div>
      {isOpen && children}
    </div>
  );
}

interface NewsSectionProps {
  includeArticles: boolean;
  setIncludeArticles: (v: boolean) => void;
  includeAiArticles: boolean;
  setIncludeAiArticles: (v: boolean) => void;
  aiArticleCount: number;
  setAiArticleCount: (v: number) => void;
  aiLocales: string[];
  setAiLocales: (v: string[]) => void;
  availableLocales?: string[];
  aiArticleTopics: string;
  setAiArticleTopics: (v: string) => void;
  aiChannelId: string;
  setAiChannelId: (v: string) => void;
  aiNewChannelName: string;
  setAiNewChannelName: (v: string) => void;
  includeLinkedIn: boolean;
  setIncludeLinkedIn: (v: boolean) => void;
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
  includeBlogScrape: boolean;
  setIncludeBlogScrape: (v: boolean) => void;
  blogUrl: string;
  setBlogUrl: (v: string) => void;
  blogArticleCount: number;
  setBlogArticleCount: (v: number) => void;
  blogChannelId: string;
  setBlogChannelId: (v: string) => void;
  blogNewChannelName: string;
  setBlogNewChannelName: (v: string) => void;
}

interface DemoConfigFormProps {
  apiToken?: string;
  apiDomain?: string;
  prospectName: string;
  setProspectName: (v: string) => void;
  prospectSuggestions: ProspectSuggestion[];
  onFetchSuggestions: (v: string) => void;
  onSuggestionSelected: (name: string) => void;
  vertical: string;
  setVertical: (v: string) => void;
  companySize: number;
  setCompanySize: (v: number) => void;
  onPlanWithGemini: () => void;
  isPlanning: boolean;
  brandingProps: ComponentProps<typeof BrandingForm>;
  newsProps: NewsSectionProps;
  onCreateDemo: () => void;
  isLoading: boolean;
  onUseCasesChange?: (useCases: string[]) => void;
}

export default function DemoConfigForm({
  apiToken,
  apiDomain,
  prospectName,
  setProspectName,
  prospectSuggestions,
  onFetchSuggestions,
  onSuggestionSelected,
  vertical,
  setVertical,
  companySize,
  setCompanySize,
  onPlanWithGemini,
  isPlanning,
  brandingProps,
  newsProps,
  onCreateDemo,
  isLoading,
  onUseCasesChange,
}: DemoConfigFormProps) {
  const [openSections, setOpenSections] = useState({ useCase: true, branding: true, news: true });
  const [hoveredPlan, setHoveredPlan] = useState(false);
  const [hoveredCreate, setHoveredCreate] = useState(false);
  const [selectedUseCases, setSelectedUseCases] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [forms, setForms] = useState<FormItem[]>([]);
  const [isLoadingSurveys, setIsLoadingSurveys] = useState(false);
  const [isLoadingForms, setIsLoadingForms] = useState(false);
  const [surveysLoaded, setSurveysLoaded] = useState(false);
  const [formsLoaded, setFormsLoaded] = useState(false);
  const [selectedSurveyId, setSelectedSurveyId] = useState("");
  const [selectedFormId, setSelectedFormId] = useState("");

  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  const canPlan = !isPlanning && prospectName && prospectName.trim().length >= 2;

  useEffect(() => {
    if (!selectedUseCases.includes("feature-survey") || surveysLoaded || isLoadingSurveys || !apiToken) return;
    setIsLoadingSurveys(true);
    fetch(`https://${apiDomain}/api/installations/administrated?pluginID=surveys&limit=-1`, {
      credentials: "omit",
      headers: { Authorization: `Basic ${apiToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { data?: Survey[] } | null) => {
        const published = (data?.data || []).filter((s) => s.published !== false);
        setSurveys(published);
        setSurveysLoaded(true);
        if (published.length > 0) setSelectedSurveyId(published[0].id);
      })
      .catch(() => {})
      .finally(() => setIsLoadingSurveys(false));
  }, [selectedUseCases, surveysLoaded, isLoadingSurveys, apiToken, apiDomain]);

  useEffect(() => {
    if (!selectedUseCases.includes("feature-form") || formsLoaded || isLoadingForms || !apiToken) return;
    setIsLoadingForms(true);
    fetch(`https://${apiDomain}/api/plugins/form/installations/search?permission=manage&query=&limit=100&sort=updated_DESC`, {
      credentials: "omit",
      headers: { Authorization: `Basic ${apiToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { entries?: Array<{ data: FormItem }> } | null) => {
        const fetched = (data?.entries || []).map((e) => e.data);
        setForms(fetched);
        setFormsLoaded(true);
        if (fetched.length > 0) setSelectedFormId(fetched[0].id);
      })
      .catch(() => {})
      .finally(() => setIsLoadingForms(false));
  }, [selectedUseCases, formsLoaded, isLoadingForms, apiToken, apiDomain]);

  const getSurveyName = (s: Survey) =>
    s.config?.localization?.en_US?.title || s.id;

  const getFormName = (f: FormItem) => {
    const loc = f.config?.localization;
    if (loc?.en_US?.title) return loc.en_US.title;
    const first = loc ? Object.values(loc)[0] : null;
    return first?.title || f.id;
  };

  const getUseCaseDescription = (uc: UseCase) => {
    if (uc.id === "feature-survey") {
      const s = surveys.find((x) => x.id === selectedSurveyId);
      return s ? `Feature "${getSurveyName(s)}" on the homepage` : "Feature a survey on the homepage";
    }
    if (uc.id === "feature-form") {
      const f = forms.find((x) => x.id === selectedFormId);
      return f ? `Feature "${getFormName(f)}" on the homepage` : "Feature a form on the homepage";
    }
    return uc.description;
  };

  const availableUseCases: UseCase[] = USE_CASES[vertical] || [];
  const persona: string | null = PERSONAS[vertical] || null;

  const handleProspectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setProspectName(val);
    onFetchSuggestions(val);
    setShowSuggestions(true);
  };

  const handleSuggestionClick = (name: string) => {
    onSuggestionSelected(name);
    setShowSuggestions(false);
  };

  const toggleUseCase = (id: string) => {
    setSelectedUseCases((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      onUseCasesChange?.(next);
      return next;
    });
  };

  const selectedDetails = availableUseCases.filter((uc) => selectedUseCases.includes(uc.id));

  return (
    <div style={{ marginBottom: 20 }}>

      {/* ── Use Case Builder ── */}
      <SectionPanel title="Use Case Builder" isOpen={openSections.useCase} onToggle={() => toggleSection("useCase")}>

        {/* Company name */}
        <div style={{ ...formGroupStyle, position: "relative" }}>
          <label style={labelStyle}>Company name</label>
          <input
            type="text"
            style={inputStyle}
            value={prospectName}
            onChange={handleProspectChange}
            onFocus={() => prospectSuggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="e.g. Acme Corp"
          />
          {showSuggestions && prospectSuggestions.length > 0 && (
            <div style={{
              position: "absolute",
              zIndex: 10,
              background: colors.background,
              border: `1px solid ${colors.border}`,
              borderRadius: 4,
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              left: 0,
              right: 0,
              top: 62,
            }}>
              {prospectSuggestions.map((s, i) => (
                <div
                  key={s.domain || i}
                  onMouseDown={() => handleSuggestionClick(s.name)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "8px 12px",
                    cursor: "pointer",
                    borderBottom: `1px solid ${colors.borderLight}`,
                    fontSize: 13,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = colors.backgroundLight; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  {s.icon && <img src={s.icon} alt="" style={{ width: 20, height: 20, marginRight: 8 }} />}
                  {s.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Autofill with Gemini */}
        <div style={{ marginBottom: 14 }}>
          <button
            onClick={onPlanWithGemini}
            disabled={!canPlan}
            onMouseEnter={() => setHoveredPlan(true)}
            onMouseLeave={() => setHoveredPlan(false)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 13px",
              border: "none",
              borderRadius: 4,
              cursor: canPlan ? "pointer" : "not-allowed",
              backgroundColor: hoveredPlan && canPlan ? colors.primaryLight : colors.primary,
              color: colors.textOnPrimary,
              fontSize: 12,
              fontWeight: 600,
              opacity: canPlan ? 1 : 0.5,
              transition: "background-color 0.2s ease",
            }}
          >
            <HiSparkles />
            {isPlanning ? "Planning…" : "Autofill with Gemini"}
          </button>
          <p style={{ margin: "5px 0 0", fontSize: 11, color: colors.textMuted }}>
            Fills vertical, company size, branding, blog URL, and article topics.
          </p>
        </div>

        {/* Number of Employees */}
        <div style={formGroupStyle}>
          <label style={labelStyle}>Number of employees</label>
          <input
            type="number"
            min={1}
            style={inputStyle}
            value={companySize}
            onChange={(e) => setCompanySize(Number(e.target.value))}
            placeholder="e.g. 5000"
          />
        </div>

        {/* Vertical */}
        <div style={formGroupStyle}>
          <label style={labelStyle}>Industry vertical</label>
          <select
            style={inputStyle}
            value={vertical}
            onChange={(e) => { setVertical(e.target.value); setSelectedUseCases([]); onUseCasesChange?.([]); }}
          >
            <option value="">Select a vertical…</option>
            {DEMO_VERTICALS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        {/* Use case multiselect */}
        {vertical && availableUseCases.length > 0 && (
          <div style={formGroupStyle}>
            <label style={labelStyle}>Use cases</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {availableUseCases.map((uc) => {
                const selected = selectedUseCases.includes(uc.id);
                return (
                  <button
                    key={uc.id}
                    type="button"
                    onClick={() => toggleUseCase(uc.id)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 4,
                      border: `1px solid ${selected ? colors.primary : colors.border}`,
                      background: selected ? colors.primary : "transparent",
                      color: selected ? colors.textOnPrimary : colors.textDark,
                      fontSize: 12,
                      cursor: "pointer",
                      fontWeight: selected ? 600 : 400,
                      transition: "all 0.15s ease",
                    }}
                  >
                    {uc.label}
                  </button>
                );
              })}
            </div>

            {selectedUseCases.includes("feature-survey") && (
              <div style={{ marginBottom: 8 }}>
                <label style={{ ...labelStyle, fontSize: 11 }}>Which survey to feature?</label>
                {isLoadingSurveys ? (
                  <p style={{ fontSize: 11, color: colors.textMuted, margin: 0 }}>Loading surveys…</p>
                ) : (
                  <select style={{ ...inputStyle, fontSize: 12 }} value={selectedSurveyId} onChange={(e) => setSelectedSurveyId(e.target.value)}>
                    {surveys.length === 0 && <option value="">No surveys found</option>}
                    {surveys.map((s) => <option key={s.id} value={s.id}>{getSurveyName(s)}</option>)}
                  </select>
                )}
              </div>
            )}
            {selectedUseCases.includes("feature-form") && (
              <div style={{ marginBottom: 8 }}>
                <label style={{ ...labelStyle, fontSize: 11 }}>Which form to feature?</label>
                {isLoadingForms ? (
                  <p style={{ fontSize: 11, color: colors.textMuted, margin: 0 }}>Loading forms…</p>
                ) : (
                  <select style={{ ...inputStyle, fontSize: 12 }} value={selectedFormId} onChange={(e) => setSelectedFormId(e.target.value)}>
                    {forms.length === 0 && <option value="">No forms found</option>}
                    {forms.map((f) => <option key={f.id} value={f.id}>{getFormName(f)}</option>)}
                  </select>
                )}
              </div>
            )}

            {selectedDetails.length > 0 && (
              <div style={{
                padding: "10px 12px",
                background: colors.backgroundLight,
                border: `1px solid ${colors.borderLight}`,
                borderRadius: 4,
                fontSize: 12,
              }}>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {selectedDetails.map((uc) => (
                    <li key={uc.id} style={{ marginBottom: 4, color: colors.textDark, lineHeight: 1.4 }}>
                      {getUseCaseDescription(uc)}
                    </li>
                  ))}
                  {persona && (
                    <li style={{ marginBottom: 4, color: colors.textDark, lineHeight: 1.4 }}>
                      Replify will update the menu for {persona} to show all relevant pages
                    </li>
                  )}
                </ul>
                {persona && (
                  <p style={{ margin: "8px 0 0", fontSize: 11, color: colors.textMuted, lineHeight: 1.4 }}>
                    Note: your user must be in the relevant group or logged in as <strong>{persona}</strong> to see these updates.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {vertical && availableUseCases.length === 0 && (
          <p style={{ fontSize: 11, color: colors.textMuted, marginTop: -8 }}>
            Use cases for {vertical} coming soon.
          </p>
        )}
      </SectionPanel>

      {/* ── Branding ── */}
      <SectionPanel title="Branding" isOpen={openSections.branding} onToggle={() => toggleSection("branding")}>
        <BrandingForm {...brandingProps} hideArticlesAndActions={true} />
      </SectionPanel>

      {/* ── News ── */}
      <SectionPanel title="News" isOpen={openSections.news} onToggle={() => toggleSection("news")}>
        <NewsSection {...newsProps} />
      </SectionPanel>

      <button
        onClick={onCreateDemo}
        disabled={isLoading}
        onMouseEnter={() => setHoveredCreate(true)}
        onMouseLeave={() => setHoveredCreate(false)}
        style={{
          ...brandingButtonStyle,
          width: "100%",
          marginTop: 6,
          backgroundColor: hoveredCreate && !isLoading ? colors.primaryLight : colors.primary,
          opacity: isLoading ? 0.6 : 1,
          cursor: isLoading ? "not-allowed" : "pointer",
        }}
      >
        {isLoading ? "Creating demo…" : "Create Demo"}
      </button>

    </div>
  );
}

// ── Standalone News section ──
const CREATE_NEW_CHANNEL_VALUE = "__create_new_channel__";

interface FilterableChannelSelectProps {
  value: string;
  onChange: (v: string) => void;
  channels: Channel[];
  filterValue: string;
  onFilterChange: (v: string) => void;
  createOptionLabel?: string;
  selectStyle?: React.CSSProperties;
}

const FilterableChannelSelect = ({
  value,
  onChange,
  channels,
  filterValue,
  onFilterChange,
  createOptionLabel = "+ Create new channel",
  selectStyle = {},
}: FilterableChannelSelectProps) => {
  const norm = (filterValue || "").trim().toLowerCase();
  const all = channels || [];
  const filtered = !norm ? all : all.filter((c) => (c.title || "").toLowerCase().includes(norm));
  const sel = all.find((c) => c.id === value);
  const opts = sel && !filtered.some((c) => c.id === sel.id) ? [sel, ...filtered] : filtered;
  return (
    <>
      <input type="text" style={{ ...inputStyle, padding: "4px 6px", marginBottom: 6, fontSize: 12 }} value={filterValue} onChange={(e) => onFilterChange(e.target.value)} placeholder="Filter channels" />
      <select style={{ ...inputStyle, paddingRight: 8, ...selectStyle }} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value={CREATE_NEW_CHANNEL_VALUE}>{createOptionLabel}</option>
        {opts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
    </>
  );
};

function NewsSection({
  includeArticles, setIncludeArticles,
  includeAiArticles, setIncludeAiArticles,
  aiArticleCount, setAiArticleCount,
  aiLocales, setAiLocales,
  availableLocales,
  aiArticleTopics, setAiArticleTopics,
  aiChannelId, setAiChannelId,
  aiNewChannelName, setAiNewChannelName,
  includeLinkedIn, setIncludeLinkedIn,
  prospectLinkedInUrl, setProspectLinkedInUrl,
  linkedinChannels,
  linkedinChannelId, setLinkedinChannelId,
  linkedinNewChannelName, setLinkedinNewChannelName,
  includeBlogScrape, setIncludeBlogScrape,
  blogUrl, setBlogUrl,
  blogArticleCount, setBlogArticleCount,
  blogChannelId, setBlogChannelId,
  blogNewChannelName, setBlogNewChannelName,
}: NewsSectionProps) {
  const [aiChannelFilter, setAiChannelFilter] = useState("");
  const [linkedinChannelFilter, setLinkedinChannelFilter] = useState("");
  const [blogChannelFilter, setBlogChannelFilter] = useState("");

  return (
    <>
      <div style={formGroupStyle}>
        <label style={checkboxLabelStyle}>
          <input type="checkbox" style={checkboxStyle} checked={includeArticles} onChange={(e) => setIncludeArticles(e.target.checked)} />
          Generate articles
        </label>
      </div>

      {includeArticles && (
        <div style={{ marginLeft: 16, marginBottom: 12, borderLeft: `2px solid ${colors.border}`, paddingLeft: 12 }}>

          {/* AI articles */}
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
                    <input type="number" min={1} max={20} style={{ ...inputStyle, padding: "4px 6px" }} value={aiArticleCount} onChange={(e) => setAiArticleCount(Number(e.target.value))} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ ...labelStyle, fontSize: 11 }}>Languages</label>
                    {availableLocales && availableLocales.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                        {availableLocales.map((locale) => {
                          const selected = (aiLocales || []).includes(locale);
                          return (
                            <button key={locale} type="button"
                              onClick={() => { if (selected) setAiLocales((aiLocales || []).filter((l) => l !== locale)); else setAiLocales([...(aiLocales || []), locale]); }}
                              style={{ display: "flex", alignItems: "center", gap: 2, padding: "2px 8px", borderRadius: 4, border: `1px solid ${selected ? colors.primary : colors.border}`, background: selected ? colors.primary : "transparent", color: selected ? colors.textOnPrimary : colors.text, fontSize: 11, cursor: "pointer" }}>
                              {selected && <IoIosCheckmark style={{ fontSize: 14 }} />}{locale}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <input type="text" style={{ ...inputStyle, padding: "4px 6px" }} value={(aiLocales || []).join(", ")} onChange={(e) => setAiLocales(e.target.value.split(",").map((l) => l.trim()).filter(Boolean))} placeholder="en_US, es_ES" />
                    )}
                  </div>
                </div>
                <label style={{ ...labelStyle, fontSize: 11 }}>Publish to channel</label>
                <FilterableChannelSelect value={aiChannelId} onChange={setAiChannelId} channels={linkedinChannels} filterValue={aiChannelFilter} onFilterChange={setAiChannelFilter} selectStyle={{ marginBottom: 6 }} />
                {aiChannelId === CREATE_NEW_CHANNEL_VALUE && (
                  <>
                    <label style={{ ...labelStyle, fontSize: 11 }}>New channel name</label>
                    <input type="text" style={{ ...inputStyle, padding: "4px 6px", marginBottom: 6 }} value={aiNewChannelName} onChange={(e) => setAiNewChannelName(e.target.value)} placeholder="e.g. Company News" />
                  </>
                )}
                <label style={{ ...labelStyle, fontSize: 11 }}>Topics / extra prompt (optional)</label>
                <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 52, fontSize: 12 }} value={aiArticleTopics} onChange={(e) => setAiArticleTopics(e.target.value)} placeholder="e.g. benefits, safety, company culture" />
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
                <label style={{ ...labelStyle, fontSize: 11 }}>LinkedIn Page URL</label>
                <input type="text" style={{ ...inputStyle, marginBottom: 6 }} value={prospectLinkedInUrl} onChange={(e) => setProspectLinkedInUrl(e.target.value)} placeholder="https://linkedin.com/company/company-inc" />
                <label style={{ ...labelStyle, fontSize: 11 }}>Import into channel</label>
                <FilterableChannelSelect value={linkedinChannelId} onChange={setLinkedinChannelId} channels={linkedinChannels} filterValue={linkedinChannelFilter} onFilterChange={setLinkedinChannelFilter} />
                {linkedinChannelId === CREATE_NEW_CHANNEL_VALUE && (
                  <>
                    <label style={{ ...labelStyle, fontSize: 11 }}>New channel name</label>
                    <input type="text" style={{ ...inputStyle, padding: "4px 6px" }} value={linkedinNewChannelName} onChange={(e) => setLinkedinNewChannelName(e.target.value)} placeholder="e.g. LinkedIn Updates" />
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
                    <input type="text" style={{ ...inputStyle, padding: "4px 6px" }} value={blogUrl} onChange={(e) => setBlogUrl(e.target.value)} placeholder="https://company.com/blog" />
                  </div>
                  <div style={{ flex: "0 0 70px" }}>
                    <label style={{ ...labelStyle, fontSize: 11 }}>Count</label>
                    <input type="number" min={1} max={20} style={{ ...inputStyle, padding: "4px 6px" }} value={blogArticleCount} onChange={(e) => setBlogArticleCount(Number(e.target.value))} />
                  </div>
                </div>
                <label style={{ ...labelStyle, fontSize: 11 }}>Publish to channel</label>
                <FilterableChannelSelect value={blogChannelId} onChange={setBlogChannelId} channels={linkedinChannels} filterValue={blogChannelFilter} onFilterChange={setBlogChannelFilter} selectStyle={{ marginBottom: 6 }} />
                {blogChannelId === CREATE_NEW_CHANNEL_VALUE && (
                  <>
                    <label style={{ ...labelStyle, fontSize: 11 }}>New channel name</label>
                    <input type="text" style={{ ...inputStyle, padding: "4px 6px", marginBottom: 6 }} value={blogNewChannelName} onChange={(e) => setBlogNewChannelName(e.target.value)} placeholder="e.g. Blog Highlights" />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
