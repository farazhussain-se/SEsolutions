// Copy email templates, sent emails, pages, surveys, forms, and news from one environment to another.

import React, { useState, useRef, useEffect } from "react";
import { colors } from "../styles/colors";
import {
  inputStyle,
  labelStyle,
  brandingButtonStyle,
  subDescriptionStyle,
} from "../styles";

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 12px",
  backgroundColor: colors.backgroundLight,
  border: `1px solid ${colors.border}`,
  borderRadius: 4,
  cursor: "pointer",
  marginBottom: 0,
  userSelect: "none",
};

const sectionBodyStyle = {
  border: `1px solid ${colors.border}`,
  borderTop: "none",
  borderRadius: "0 0 4px 4px",
  padding: "10px",
  marginBottom: "15px",
};

const chipStyle = {
  display: "inline-flex",
  alignItems: "center",
  backgroundColor: colors.backgroundInfo,
  border: `1px solid ${colors.primary}`,
  borderRadius: 12,
  padding: "3px 10px 3px 12px",
  fontSize: 12,
  color: colors.textDark,
  marginRight: 6,
  marginBottom: 6,
};

const chipRemoveBtnStyle = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: colors.textMuted,
  fontSize: 14,
  padding: "0 0 0 6px",
  lineHeight: 1,
};

interface ItemRowProps { id: string; name: string; subtext?: string; isAdded: boolean; onAdd: () => void; }
function ItemRow({ id: _id, name, subtext, isAdded, onAdd }: ItemRowProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 10px",
        borderRadius: 4,
        backgroundColor: hovered ? colors.backgroundSubtle : "transparent",
        transition: "background-color 0.15s",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
        <div style={{ fontWeight: "500", fontSize: 13, color: colors.textDark, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {name}
        </div>
        {subtext && (
          <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: "monospace" }}>
            {subtext}
          </div>
        )}
      </div>
      <button
        style={{
          visibility: hovered || isAdded ? "visible" : "hidden",
          background: isAdded ? colors.backgroundSubtle : "none",
          border: `1px solid ${isAdded ? colors.border : colors.primary}`,
          color: isAdded ? colors.textMuted : colors.primary,
          borderRadius: 4,
          width: 24,
          height: 24,
          cursor: isAdded ? "default" : "pointer",
          fontSize: 16,
          lineHeight: "20px",
          padding: 0,
          flexShrink: 0,
          marginLeft: 8,
        }}
        onClick={() => !isAdded && onAdd()}
        title={isAdded ? "Already added" : "Add to copy list"}
      >
        {isAdded ? "✓" : "+"}
      </button>
    </div>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      placeholder="Search by name or ID…"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        ...inputStyle,
        fontSize: 12,
        padding: "6px 8px",
        marginBottom: 8,
        width: "calc(100% - 18px)",
      }}
    />
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiItem = { id: string; [key: string]: any };
interface SavedToken { slug: string; fullToken: string; domain?: string; }
interface CopierFormProps { sourceToken: string; sourceDomain: string; sourceSlug: string; savedTokens: SavedToken[]; }
export default function CopierForm({
  sourceToken,
  sourceDomain,
  sourceSlug,
  savedTokens,
}: CopierFormProps) {
  const [targetEnv, setTargetEnv] = useState("");
  const [swapped, setSwapped] = useState(false);

  // Incremented on every reset so in-flight fetches from the previous source are discarded
  const fetchGenRef = useRef(0);

  type CopyResult = { name: string; status: string; error?: string };
  type WidgetOption = { id: string; name: string };
  type WidgetItem = { sourceId: string; sourceName: string; targetOptions: WidgetOption[]; autoMatched: boolean };
  type WidgetGroup = { type: string; label: string; items: WidgetItem[] };
  type PageWidgetAnalysis = { loading: boolean; groups: WidgetGroup[]; error?: string };

  // Email templates state
  const [emailTemplates, setEmailTemplates] = useState<ApiItem[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [selectedTemplates, setSelectedTemplates] = useState<ApiItem[]>([]);
  const [showEmailSection, setShowEmailSection] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");

  // Sent emails state
  const [sentEmails, setSentEmails] = useState<ApiItem[]>([]);
  const [isLoadingSent, setIsLoadingSent] = useState(false);
  const [sentLoaded, setSentLoaded] = useState(false);
  const [sentError, setSentError] = useState<string | null>(null);
  const [selectedSentEmails, setSelectedSentEmails] = useState<ApiItem[]>([]);
  const [showSentSection, setShowSentSection] = useState(false);
  const [sentSearch, setSentSearch] = useState("");

  // Pages state
  const [pages, setPages] = useState<ApiItem[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [pagesLoaded, setPagesLoaded] = useState(false);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [selectedPages, setSelectedPages] = useState<ApiItem[]>([]);
  const [showPagesSection, setShowPagesSection] = useState(false);
  const [pageSearch, setPageSearch] = useState("");

  // Surveys state
  const [surveys, setSurveys] = useState<ApiItem[]>([]);
  const [isLoadingSurveys, setIsLoadingSurveys] = useState(false);
  const [surveysLoaded, setSurveysLoaded] = useState(false);
  const [surveysError, setSurveysError] = useState<string | null>(null);
  const [selectedSurveys, setSelectedSurveys] = useState<ApiItem[]>([]);
  const [showSurveysSection, setShowSurveysSection] = useState(false);
  const [surveySearch, setSurveySearch] = useState("");

  // News state
  const [newsItems, setNewsItems] = useState<ApiItem[]>([]);
  const [isLoadingNews, setIsLoadingNews] = useState(false);
  const [newsLoaded, setNewsLoaded] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [selectedNews, setSelectedNews] = useState<ApiItem[]>([]);
  const [showNewsSection, setShowNewsSection] = useState(false);
  const [newsSearch, setNewsSearch] = useState("");

  // Forms state
  const [forms, setForms] = useState<ApiItem[]>([]);
  const [isLoadingForms, setIsLoadingForms] = useState(false);
  const [formsLoaded, setFormsLoaded] = useState(false);
  const [formsError, setFormsError] = useState<string | null>(null);
  const [selectedForms, setSelectedForms] = useState<ApiItem[]>([]);
  const [showFormsSection, setShowFormsSection] = useState(false);
  const [formSearch, setFormSearch] = useState("");

  // Media/files state
  const [mediaItems, setMediaItems] = useState<ApiItem[]>([]);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<ApiItem[]>([]);
  const [showMediaSection, setShowMediaSection] = useState(false);
  const [mediaSearch, setMediaSearch] = useState("");

  // Journeys state
  const [journeys, setJourneys] = useState<ApiItem[]>([]);
  const [isLoadingJourneys, setIsLoadingJourneys] = useState(false);
  const [journeysLoaded, setJourneysLoaded] = useState(false);
  const [journeysError, setJourneysError] = useState<string | null>(null);
  const [selectedJourneys, setSelectedJourneys] = useState<ApiItem[]>([]);
  const [showJourneysSection, setShowJourneysSection] = useState(false);
  const [journeySearch, setJourneySearch] = useState("");
  const [journeyPage, setJourneyPage] = useState(0);

  // Journey group mapping: { [sourceJourneyId]: targetGroupId }
  const [journeyGroupMap, setJourneyGroupMap] = useState<Record<string, string>>({});
  const [targetGroups, setTargetGroups] = useState<ApiItem[]>([]);
  const [targetGroupsLoaded, setTargetGroupsLoaded] = useState(false);

  // Space selectors
  const [sourceSpaces, setSourceSpaces] = useState<ApiItem[]>([]);
  const [selectedSourceSpaceId, setSelectedSourceSpaceId] = useState("");
  const [targetSpaces, setTargetSpaces] = useState<ApiItem[]>([]);
  const [selectedTargetSpaceId, setSelectedTargetSpaceId] = useState("");

  // Pagination state (per section)
  const [templatePage, setTemplatePage] = useState(0);
  const [sentPage, setSentPage] = useState(0);
  const [pagePage, setPagePage] = useState(0);
  const [surveyPage, setSurveyPage] = useState(0);
  const [formPage, setFormPage] = useState(0);
  const [newsPage, setNewsPage] = useState(0);
  const [mediaPage, setMediaPage] = useState(0);

  // Page widget ID remapping
  const [pageWidgetAnalysis, setPageWidgetAnalysis] = useState<PageWidgetAnalysis | null>(null);
  // null | { loading: true } | { loading: false, groups: [{type, label, items:[{sourceId,sourceName,targetOptions,autoMatched}]}], error }
  const [pageWidgetMappings, setPageWidgetMappings] = useState<Record<string, string>>({});
  // { [sourceId]: targetId }

  // Copy execution state
  const [isCopying, setIsCopying] = useState(false);
  const [copyResults, setCopyResults] = useState<CopyResult[] | null>(null); // null = not run yet
  const [hoveredEnvChip, setHoveredEnvChip] = useState<string | null>(null);
  const [targetEnvFilter, setTargetEnvFilter] = useState("");
  const [targetEnvSearchFocused, setTargetEnvSearchFocused] = useState(false);

  const otherEnvs = savedTokens.filter((t) => t.slug !== sourceSlug);

  // Effective source/target based on swap state
  const targetEnvObj = savedTokens.find((t) => t.slug === targetEnv);
  const activeSourceSlug = swapped ? targetEnv : sourceSlug;
  const activeTargetSlug = swapped ? sourceSlug : targetEnv;
  const activeToken = swapped ? (targetEnvObj?.fullToken || "") : sourceToken;
  const activeDomain = swapped
    ? (targetEnvObj?.domain || "app.staffbase.com")
    : (sourceDomain || "app.staffbase.com");
  const domain = activeDomain;

  // Target credentials (opposite of active source)
  const copyTargetToken = swapped ? sourceToken : (targetEnvObj?.fullToken || "");
  const copyTargetDomain = swapped
    ? (sourceDomain || "app.staffbase.com")
    : (targetEnvObj?.domain || "app.staffbase.com");

  // Load source spaces whenever the active source changes
  useEffect(() => {
    if (!activeToken || !activeDomain) return;
    fetch(`https://${activeDomain}/api/spaces?limit=100`, {
      credentials: "omit",
      headers: { Authorization: `Basic ${activeToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setSourceSpaces(data.data || []); })
      .catch(() => {});
  }, [activeDomain, activeToken]);

  // Load target spaces whenever the target env changes
  useEffect(() => {
    if (!copyTargetToken || !copyTargetDomain) {
      setTargetSpaces([]);
      setSelectedTargetSpaceId("");
      return;
    }
    fetch(`https://${copyTargetDomain}/api/spaces?limit=100`, {
      credentials: "omit",
      headers: { Authorization: `Basic ${copyTargetToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          const spaces = data.data || [];
          setTargetSpaces(spaces);
          // Pre-select first space (All Employees) as default
          if (spaces.length > 0) setSelectedTargetSpaceId(spaces[0].id);
        }
      })
      .catch(() => {});
  }, [copyTargetDomain, copyTargetToken]);

  // Analyse selected pages for widget IDs that need remapping
  const pageSelectionKey = selectedPages.map(p => p.id).sort().join(',');
  useEffect(() => {
    if (!selectedPages.length || !targetEnv || !copyTargetToken || !copyTargetDomain) {
      setPageWidgetAnalysis(null);
      setPageWidgetMappings({});
      return;
    }

    // Extract IDs from page HTML (list response includes content)
    const channelIds = new Set<string>();    // channel-id, newspage-id, root-id → all resolve via /api/channels
    const installationIds = new Set<string>(); // installation-id → /api/installations/administrated
    const groupIds = new Set<string>();      // data-widget-visible-onlyif-groups, group-id in subscription blocks
    for (const page of selectedPages) {
      const html = Object.values(page.contents || {}).map((l: unknown) => (l as { content?: string })?.content || '').join(' ');
      for (const [, id] of html.matchAll(/data-widget-conf-channel-id="([^"]+)"/g)) channelIds.add(id);
      // newspage-id and root-id are news channel installations — look up via /api/channels
      for (const [, id] of html.matchAll(/data-widget-conf-(?:newspage|root)-id="([^"]+)"/g)) channelIds.add(id);
      for (const [, id] of html.matchAll(/data-widget-conf-installation-id="([^"]+)"/g)) installationIds.add(id);
      // Visibility targeting: comma-separated group IDs
      for (const [, ids] of html.matchAll(/data-widget-visible-onlyif-groups="([^"]+)"/g))
        for (const id of ids.split(',').map((s: string) => s.trim()).filter(Boolean)) groupIds.add(id);
      // Group subscription blocks
      for (const [, id] of html.matchAll(/\bgroup-id="([^"]+)"/g)) groupIds.add(id);
    }

    if (!channelIds.size && !installationIds.size && !groupIds.size) {
      setPageWidgetAnalysis({ loading: false, groups: [] });
      return;
    }

    setPageWidgetAnalysis({ loading: true, groups: [] });

    (async () => {
      try {
        const analysisGroups: WidgetGroup[] = [];

        if (channelIds.size) {
          const [srcRes, tgtRes] = await Promise.all([
            fetch(`https://${activeDomain}/api/channels?limit=200`, { credentials: 'omit', headers: { Authorization: `Basic ${activeToken}` } }),
            fetch(`https://${copyTargetDomain}/api/channels?limit=200`, { credentials: 'omit', headers: { Authorization: `Basic ${copyTargetToken}` } }),
          ]);
          const srcChannels: ApiItem[] = srcRes.ok ? ((await srcRes.json()).data || []) : [];
          const tgtChannels: ApiItem[] = tgtRes.ok ? ((await tgtRes.json()).data || []) : [];
          const tgtOptions: WidgetOption[] = tgtChannels.map((c: ApiItem) => ({ id: c.id, name: c.config?.localization?.en_US?.title || c.id }));
          const items: WidgetItem[] = [];
          for (const id of channelIds) {
            const src = srcChannels.find((c: ApiItem) => c.id === id);
            if (!src) continue; // deleted channel — skip
            const sourceName = src.config?.localization?.en_US?.title || id;
            const autoMatch = tgtOptions.find((t: WidgetOption) => t.name.toLowerCase() === sourceName.toLowerCase());
            items.push({ sourceId: id, sourceName, targetOptions: tgtOptions, autoMatched: !!autoMatch });
            setPageWidgetMappings(prev => ({ ...prev, [id]: autoMatch?.id || tgtOptions[0]?.id || '' }));
          }
          if (items.length) analysisGroups.push({ type: 'channel', label: 'News Channels & News Pages', items });
        }

        if (installationIds.size) {
          const [srcRes, tgtRes] = await Promise.all([
            fetch(`https://${activeDomain}/api/installations/administrated?limit=200`, { credentials: 'omit', headers: { Authorization: `Basic ${activeToken}` } }),
            fetch(`https://${copyTargetDomain}/api/installations/administrated?limit=200`, { credentials: 'omit', headers: { Authorization: `Basic ${copyTargetToken}` } }),
          ]);
          const srcInst: ApiItem[] = srcRes.ok ? ((await srcRes.json()).data || []) : [];
          const tgtInst: ApiItem[] = tgtRes.ok ? ((await tgtRes.json()).data || []) : [];
          const getInstName = (i: ApiItem) => i.config?.localization?.en_US?.title || i.config?.localization?.[Object.keys(i.config?.localization || {})[0]]?.title || i.id;
          const tgtOptions: WidgetOption[] = tgtInst.map((i: ApiItem) => ({ id: i.id, name: `[${i.pluginID}] ${getInstName(i)}` }));
          const items: WidgetItem[] = [];
          for (const id of installationIds) {
            const src = srcInst.find((i: ApiItem) => i.id === id);
            if (!src) continue;
            const sourceName = `[${src.pluginID}] ${getInstName(src)}`;
            const autoMatch = tgtOptions.find((t: WidgetOption) => t.name.toLowerCase() === sourceName.toLowerCase());
            const sameTypeOptions = tgtOptions.filter((t: WidgetOption) => t.name.startsWith(`[${src.pluginID}]`));
            const opts = sameTypeOptions.length ? sameTypeOptions : tgtOptions;
            items.push({ sourceId: id, sourceName, targetOptions: opts, autoMatched: !!autoMatch });
            setPageWidgetMappings(prev => ({ ...prev, [id]: autoMatch?.id || opts[0]?.id || '' }));
          }
          if (items.length) analysisGroups.push({ type: 'installation', label: 'Plugin Widgets', items });
        }

        if (groupIds.size) {
          const [srcRes, tgtRes] = await Promise.all([
            fetch(`https://${activeDomain}/api/branch/groups`, { credentials: 'omit', headers: { Authorization: `Basic ${activeToken}` } }),
            fetch(`https://${copyTargetDomain}/api/branch/groups`, { credentials: 'omit', headers: { Authorization: `Basic ${copyTargetToken}` } }),
          ]);
          const srcGroups: ApiItem[] = srcRes.ok ? ((await srcRes.json()).data || []) : [];
          const tgtGroups: ApiItem[] = tgtRes.ok ? ((await tgtRes.json()).data || []) : [];
          const tgtOptions: WidgetOption[] = tgtGroups.map((g: ApiItem) => ({ id: g.id, name: g.name || g.id }));
          const items: WidgetItem[] = [];
          for (const id of groupIds) {
            const src = srcGroups.find((g: ApiItem) => g.id === id);
            if (!src) continue;
            const sourceName = src.name || id;
            const autoMatch = tgtOptions.find((t: WidgetOption) => t.name.toLowerCase() === sourceName.toLowerCase());
            items.push({ sourceId: id, sourceName, targetOptions: tgtOptions, autoMatched: !!autoMatch });
            setPageWidgetMappings(prev => ({ ...prev, [id]: autoMatch?.id || tgtOptions[0]?.id || '' }));
          }
          if (items.length) analysisGroups.push({ type: 'group', label: 'Groups & Visibility', items });
        }

        setPageWidgetAnalysis({ loading: false, groups: analysisGroups });
      } catch (err) {
        setPageWidgetAnalysis({ loading: false, groups: [], error: err instanceof Error ? err.message : String(err) });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSelectionKey, targetEnv, swapped]);

  const getOrCreateReplifyGallery = async () => {
    const res = await fetch(`https://${copyTargetDomain}/api/email-service/galleries?limit=100`, {
      headers: { Authorization: `Basic ${copyTargetToken}` },
    });
    if (!res.ok) throw new Error(`Failed to list galleries (${res.status})`);
    const data = await res.json();
    const existing = (data.data || []).find((g: ApiItem) => g.name === "Replify Gallery");
    if (existing) return existing.id;

    const createRes = await fetch(`https://${copyTargetDomain}/api/email-service/galleries`, {
      method: "POST",
      headers: { Authorization: `Basic ${copyTargetToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Replify Gallery", description: "Copied templates", isAccessibleInAllSpaces: true }),
    });
    if (!createRes.ok) throw new Error(`Failed to create gallery (${createRes.status})`);
    const created = await createRes.json();
    return created.id;
  };

  const getOrCreateReplifyEmailFolder = async () => {
    // No folder list endpoint — find by checking folderIds from existing drafts
    const seenFolderIds = new Set();
    let next = null;
    let page = 0;
    do {
      const searchRes = await fetch(`https://${copyTargetDomain}/api/email-service/emails/search`, {
        method: "POST",
        credentials: "omit",
        headers: { Authorization: `Basic ${copyTargetToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "draft", limit: 100, ...(next ? { next } : {}) }),
      });
      if (!searchRes.ok) break;
      const searchData = await searchRes.json();
      next = searchData.next || null;
      for (const email of searchData.data || []) {
        const fid = email.folderId;
        if (!fid || seenFolderIds.has(fid)) continue;
        seenFolderIds.add(fid);
        const fRes = await fetch(`https://${copyTargetDomain}/api/email-service/folders/${fid}`, {
          credentials: "omit",
          headers: { Authorization: `Basic ${copyTargetToken}` },
        });
        if (fRes.ok) {
          const folder = await fRes.json();
          if (folder.title === "Replify Copies") return folder.id;
        }
      }
      page++;
    } while (next && page < 10);

    // Use the selected target space, or fall back to the first space (All Employees)
    let spaceId = selectedTargetSpaceId;
    if (!spaceId) {
      const spacesRes = await fetch(`https://${copyTargetDomain}/api/spaces`, {
        credentials: "omit",
        headers: { Authorization: `Basic ${copyTargetToken}` },
      });
      if (!spacesRes.ok) throw new Error(`Failed to fetch spaces (${spacesRes.status})`);
      const spacesData = await spacesRes.json();
      spaceId = (spacesData.data || [])[0]?.id;
    }
    if (!spaceId) throw new Error("No space found on target");

    const usersRes = await fetch(`https://${copyTargetDomain}/api/users?limit=100`, {
      credentials: "omit",
      headers: { Authorization: `Basic ${copyTargetToken}` },
    });
    if (!usersRes.ok) throw new Error(`Failed to fetch users (${usersRes.status})`);
    const usersData = await usersRes.json();
    const adminUser = (usersData.data || []).find(
      (u: ApiItem) => u.emails?.some((e: ApiItem) => e.value?.startsWith("admin+")) && u.branchRole === "WeBranchAdminRole"
    ) || (usersData.data || []).find((u: ApiItem) => u.branchRole === "WeBranchAdminRole");
    if (!adminUser) throw new Error("No admin user found on target");

    const createRes = await fetch(`https://${copyTargetDomain}/api/email-service/folders`, {
      method: "POST",
      credentials: "omit",
      headers: { Authorization: `Basic ${copyTargetToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        spaceId,
        title: "Replify Copies",
        restrictSending: false,
        senderAddresses: [spaceId],
        senderNames: [adminUser.id],
        audience: { branchId: spaceId, type: "branchAudience" },
        enableUnsubscriptionCategories: false,
      }),
    });
    if (!createRes.ok) throw new Error(`Failed to create folder (${createRes.status})`);
    const created = await createRes.json();
    return created.id;
  };

  const remapPikassoMedia = async (pikassoJson: string) => {
    const escaped = activeDomain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`https://${escaped}/api/media/[^"\\s]+`, "g");
    const urls = [...new Set(pikassoJson.match(pattern) || [])] as string[];
    if (urls.length === 0) return pikassoJson;

    let result = pikassoJson;
    for (const url of urls) {
      try {
        const imgRes = await fetch(url as string, {
          credentials: "omit",
          headers: { Authorization: `Basic ${activeToken}` },
        });
        if (!imgRes.ok) continue;

        const blob = await imgRes.blob();
        const fileName = (url.split("/").pop() || "").split("?")[0] || "image";
        const form = new FormData();
        form.append("file", blob, fileName);
        form.append("metadata", JSON.stringify({ type: "auto", fileName }));

        const uploadRes = await fetch(`https://${copyTargetDomain}/api/media`, {
          method: "POST",
          credentials: "omit",
          headers: { Authorization: `Basic ${copyTargetToken}` },
          body: form,
        });
        if (!uploadRes.ok) continue;

        const uploadData = await uploadRes.json();
        const newUrl = uploadData.resourceInfo?.url;
        if (!newUrl) continue;

        result = result.split(url).join(newUrl);
      } catch { /* intentional */ }
    }
    return result;
  };

  const applyWidgetMappings = (contentsMap: Record<string, { content?: string; [key: string]: unknown }>) => {
    if (!Object.keys(pageWidgetMappings).length) return contentsMap;
    const result: Record<string, { content?: string; [key: string]: unknown }> = {};
    for (const [locale, loc] of Object.entries(contentsMap)) {
      let html = loc?.content || '';
      // Replace widget IDs
      for (const [sourceId, targetId] of Object.entries(pageWidgetMappings)) {
        if (targetId && sourceId !== targetId) html = html.split(sourceId).join(targetId);
      }
      // Replace source domain in hrefs with target domain
      if (activeDomain && copyTargetDomain && activeDomain !== copyTargetDomain) {
        html = html.split(`https://${activeDomain}`).join(`https://${copyTargetDomain}`);
      }
      result[locale] = { ...loc, content: html };
    }
    return result;
  };

  const handleCopy = async () => {
    if (!selectedTemplates.length && !selectedSurveys.length && !selectedForms.length && !selectedNews.length && !selectedSentEmails.length && !selectedMedia.length && !selectedJourneys.length && !selectedPages.length) return;
    setIsCopying(true);
    setCopyResults(null);

    const results: CopyResult[] = [];

    // Find or create Replify Gallery (only needed for email templates)
    let galleryId;
    if (selectedTemplates.length > 0) {
      try {
        galleryId = await getOrCreateReplifyGallery();
      } catch (err) {
        setCopyResults([{ name: "Replify Gallery", status: "error", error: err instanceof Error ? err.message : String(err) }]);
        setIsCopying(false);
        return;
      }
    }

    for (const tmpl of selectedTemplates) {
      try {
        // 1. Fetch pikasso content from source
        const pikassoRes = await fetch(
          `https://${activeDomain}/api/email-service/templates/${tmpl.id}/contents/pikasso`,
          { credentials: "omit", headers: { Authorization: `Basic ${activeToken}` } }
        );
        if (!pikassoRes.ok) throw new Error(`Fetch content failed (${pikassoRes.status})`);
        const pikassoData = await pikassoRes.json();

        // 2. Create template in target
        const createRes = await fetch(`https://${copyTargetDomain}/api/email-service/templates`, {
          method: "POST",
          headers: { Authorization: `Basic ${copyTargetToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: tmpl.name,
            galleryId,
            renderingMode: tmpl.renderingMode || "designer",
          }),
        });
        if (!createRes.ok) throw new Error(`Create template failed (${createRes.status})`);
        const created = await createRes.json();

        // 3. Remap media URLs, then PUT pikasso content into new template
        const remappedJson = await remapPikassoMedia(JSON.stringify({ content: pikassoData.content }));
        const putRes = await fetch(
          `https://${copyTargetDomain}/api/email-service/templates/${created.id}/contents/pikasso`,
          {
            method: "PUT",
            headers: { Authorization: `Basic ${copyTargetToken}`, "Content-Type": "application/json" },
            body: remappedJson,
          }
        );
        if (!putRes.ok) throw new Error(`Upload content failed (${putRes.status})`);

        results.push({ name: tmpl.name, status: "success" });
      } catch (err) {
        results.push({ name: tmpl.name, status: "error", error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Copy surveys — config + questions
    for (const survey of selectedSurveys) {
      try {
        const createRes = await fetch(`https://${copyTargetDomain}/api/installations`, {
          method: "POST",
          credentials: "omit",
          headers: { Authorization: `Basic ${copyTargetToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            pluginID: "surveys",
            config: survey.config,
          }),
        });
        if (!createRes.ok) throw new Error(`Create survey failed (${createRes.status})`);
        const newSurvey = await createRes.json();

        // Initialize the surveys microservice for this installation (required before questions endpoint works)
        await fetch(`https://${copyTargetDomain}/api/surveys/installations/${newSurvey.id}`, {
          method: "POST",
          credentials: "omit",
          headers: { Authorization: `Basic ${copyTargetToken}`, "Content-Length": "0" },
        });

        // Fetch questions from source
        const qRes = await fetch(`https://${domain}/api/surveys/installations/${survey.id}/questions`, {
          credentials: "omit",
          headers: { Authorization: `Basic ${activeToken}` },
        });
        if (!qRes.ok) throw new Error(`Fetch questions failed (${qRes.status})`);
        const questions = await qRes.json();

        // Create each question in the new survey
        for (const q of Array.isArray(questions) ? questions : (questions.questions || [])) {
          // Strip option IDs — the target env generates its own
          const content: Record<string, { options?: { text: string }[]; [key: string]: unknown }> = JSON.parse(JSON.stringify(q.content));
          for (const lang of Object.values(content)) {
            if (Array.isArray(lang.options)) {
              lang.options = lang.options.map(({ text }: { text: string }) => ({ text }));
            }
          }
          const payload: Record<string, unknown> = { content, questionType: q.questionType };
          if (q.maxScale != null) payload.maxScale = q.maxScale;
          if (q.maxNumOptions != null) payload.maxNumOptions = q.maxNumOptions;

          await fetch(`https://${copyTargetDomain}/api/surveys/installations/${newSurvey.id}/questions`, {
            method: "POST",
            credentials: "omit",
            headers: { Authorization: `Basic ${copyTargetToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }

        results.push({ name: getSurveyName(survey), status: "success" });
      } catch (err) {
        results.push({ name: getSurveyName(survey), status: "error", error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Copy forms — fetch config then create and initialize schema on target
    for (const form of selectedForms) {
      try {
        const detailRes = await fetch(`https://${activeDomain}/api/installations/${form.id}`, {
          credentials: "omit",
          headers: { Authorization: `Basic ${activeToken}` },
        });
        if (!detailRes.ok) throw new Error(`Fetch form details failed (${detailRes.status})`);
        const detail = await detailRes.json();

        const createRes = await fetch(`https://${copyTargetDomain}/api/installations`, {
          method: "POST",
          credentials: "omit",
          headers: { Authorization: `Basic ${copyTargetToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ pluginID: "form", config: detail.config }),
        });
        if (!createRes.ok) throw new Error(`Create form failed (${createRes.status})`);
        const newForm = await createRes.json();

        // Initialize form schema on target using the same structure getSchemaPrivacyExposed returns.
        // We can't call getSchemaPrivacyExposed via Basic auth, so we construct the equivalent:
        // formTranslations is empty (new form), available_profile_fields from profilefields API.
        // Use the source form's locales so the form is set up for the right languages.
        const locales = Object.keys(detail.config?.localization || { en_US: true });
        try {
          const body = new URLSearchParams();
          for (const locale of locales) {
            body.append(`formTranslations[${locale}][options]`, JSON.stringify({ type: "object", fields: {} }));
            body.append(`formTranslations[${locale}][schema]`, JSON.stringify({ type: "object", required: false, properties: {} }));
          }
          await fetch(
            `https://${copyTargetDomain}/plugins/forms/${newForm.id}/studio?eyoAction=saveSchema`,
            {
              method: "POST",
              credentials: "omit",
              headers: {
                Authorization: `Basic ${copyTargetToken}`,
                "Content-Type": "application/x-www-form-urlencoded",
                "X-Requested-With": "XMLHttpRequest",
              },
              body: body.toString(),
            }
          );
        } catch { /* intentional */ }

        results.push({ name: getFormName(form), status: "success" });
      } catch (err) {
        results.push({ name: getFormName(form), status: "error", error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Copy news posts — match channel by name in target
    if (selectedNews.length > 0) {
      let targetChannels = [];
      try {
        const chRes = await fetch(`https://${copyTargetDomain}/api/channels?limit=200`, {
          credentials: "omit",
          headers: { Authorization: `Basic ${copyTargetToken}` },
        });
        if (chRes.ok) {
          const chData = await chRes.json();
          targetChannels = chData.data || [];
        }
      } catch { /* intentional */ }

      for (const post of selectedNews) {
        const postName = getNewsName(post);
        const sourceChannelName = post.channel?.config?.localization?.en_US?.title || "";
        const matchedChannel = targetChannels.find((c: ApiItem) => {
          const t = c.config?.localization?.en_US?.title || "";
          return t.toLowerCase() === sourceChannelName.toLowerCase();
        });

        if (!matchedChannel) {
          results.push({ name: postName, status: "error", error: `No matching channel "${sourceChannelName}" in target` });
          continue;
        }

        try {
          const en = post.contents?.en_US || {};
          const createRes = await fetch(`https://${copyTargetDomain}/api/channels/${matchedChannel.id}/posts`, {
            method: "POST",
            credentials: "omit",
            headers: { Authorization: `Basic ${copyTargetToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: {
                en_US: {
                  title: en.title || "",
                  teaser: en.teaser || "",
                  content: en.content || "",
                },
              },
            }),
          });
          if (!createRes.ok) throw new Error(`Create post failed (${createRes.status})`);
          results.push({ name: postName, status: "success" });
        } catch (err) {
          results.push({ name: postName, status: "error", error: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    // Copy sent emails — get or create "Replify Copies" folder, then draft + pikasso
    if (selectedSentEmails.length > 0) {
      let emailFolderId;
      try {
        emailFolderId = await getOrCreateReplifyEmailFolder();
      } catch (err) {
        setCopyResults([{ name: "Replify Copies folder", status: "error", error: err instanceof Error ? err.message : String(err) }]);
        setIsCopying(false);
        return;
      }

      for (const email of selectedSentEmails) {
        const emailName = email.title || email.id;
        try {
          // 1. Fetch pikasso from source sent email
          const pikassoRes = await fetch(
            `https://${activeDomain}/api/email-service/emails/${email.id}/contents/pikasso`,
            { credentials: "omit", headers: { Authorization: `Basic ${activeToken}` } }
          );
          if (!pikassoRes.ok) throw new Error(`Fetch pikasso failed (${pikassoRes.status})`);
          const pikassoData = await pikassoRes.json();

          // 2. Create draft on target
          const subject = email.settings?.subject || email.title || "";
          const createRes = await fetch(`https://${copyTargetDomain}/api/email-service/emails`, {
            method: "POST",
            headers: { Authorization: `Basic ${copyTargetToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              title: emailName,
              folderId: emailFolderId,
              renderingMode: email.renderingMode || "designer",
              settings: { subject },
            }),
          });
          if (!createRes.ok) throw new Error(`Create draft failed (${createRes.status})`);
          const draft = await createRes.json();

          // 3. Clean and PUT pikasso to draft
          const cleanPikasso = (obj: unknown): unknown => {
            if (Array.isArray(obj)) return obj.map(cleanPikasso);
            if (obj && typeof obj === "object") {
              return Object.fromEntries(
                Object.entries(obj)
                  .filter(([k, v]) => !(k === "personalizationFallbacks" && v === null))
                  .map(([k, v]) => [k, cleanPikasso(v)])
              );
            }
            return obj;
          };

          const rawPayload = JSON.stringify({
            contents: cleanPikasso(pikassoData.contents || {}),
            localesToDelete: [],
            personalizationFallbacks: pikassoData.personalizationFallbacks || {},
          });
          const payload = await remapPikassoMedia(rawPayload);

          const putRes = await fetch(
            `https://${copyTargetDomain}/api/email-service/emails/${draft.id}/contents/pikasso`,
            {
              method: "PUT",
              headers: { Authorization: `Basic ${copyTargetToken}`, "Content-Type": "application/json" },
              body: payload,
            }
          );
          if (!putRes.ok && putRes.status !== 204) throw new Error(`Upload pikasso failed (${putRes.status})`);

          results.push({ name: emailName, status: "success" });
        } catch (err) {
          results.push({ name: emailName, status: "error", error: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    // Copy media files
    for (const medium of selectedMedia) {
      const name = getMediaName(medium);
      try {
        const sourceUrl = medium.resourceInfo?.url;
        if (!sourceUrl) throw new Error("No source URL for media");

        const imgRes = await fetch(sourceUrl, {
          credentials: "omit",
          headers: { Authorization: `Basic ${activeToken}` },
        });
        if (!imgRes.ok) throw new Error(`Fetch media failed (${imgRes.status})`);

        const blob = await imgRes.blob();
        const form = new FormData();
        form.append("file", blob, medium.fileName || "file");
        form.append("metadata", JSON.stringify({ type: medium.resourceInfo?.type || "auto", fileName: medium.fileName || "file" }));

        const uploadRes = await fetch(`https://${copyTargetDomain}/api/media`, {
          method: "POST",
          credentials: "omit",
          headers: { Authorization: `Basic ${copyTargetToken}` },
          body: form,
        });
        if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`);

        results.push({ name, status: "success" });
      } catch (err) {
        results.push({ name, status: "error", error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Copy pages
    if (selectedPages.length > 0) {
      const targetSpaceId = selectedTargetSpaceId || targetSpaces[0]?.id;
      if (!targetSpaceId) {
        for (const page of selectedPages)
          results.push({ name: getPageName(page), status: "error", error: "No target space available" });
      } else {
        // Fetch all existing page titles in the target space for deduplication
        const existingTitles = new Set();
        try {
          let cursor = null;
          do {
            const url = new URL(`https://${copyTargetDomain}/api/pages`);
            url.searchParams.set("limit", "100");
            if (cursor) url.searchParams.set("cursor", cursor);
            const r = await fetch(url.toString(), { credentials: "omit", headers: { Authorization: `Basic ${copyTargetToken}` } });
            if (!r.ok) break;
            const d = await r.json();
            for (const p of d.data || []) {
              for (const loc of Object.values(p.contents || {})) {
                const locObj = loc as { title?: string } | null;
                if (locObj?.title) existingTitles.add(locObj.title.toLowerCase());
              }
            }
            cursor = d.cursor || null;
          } while (cursor);
        } catch { /* intentional */ }

        const uniqueTitle = (baseTitle: string) => {
          if (!existingTitles.has(baseTitle.toLowerCase())) return baseTitle;
          const candidate = `${baseTitle} (Replify Copy)`;
          if (!existingTitles.has(candidate.toLowerCase())) return candidate;
          let n = 2;
          while (existingTitles.has(`${baseTitle} (Replify Copy ${n})`.toLowerCase())) n++;
          return `${baseTitle} (Replify Copy ${n})`;
        };

        for (const page of selectedPages) {
          const name = getPageName(page);
          try {
            // Fetch full page content from source (list endpoint only has metadata)
            const fullPageRes = await fetch(`https://${activeDomain}/api/pages/${page.id}`, {
              credentials: "omit",
              headers: { Authorization: `Basic ${activeToken}` },
            });
            if (!fullPageRes.ok) throw new Error(`Fetch page content failed (${fullPageRes.status})`);
            const fullPage = await fullPageRes.json();

            // Build deduplicated + remapped contents
            const rawContents: Record<string, { content?: string; [key: string]: unknown }> = {};
            for (const [locale, loc] of Object.entries(fullPage.contents || {})) {
              const locObj = loc as { title?: string; content?: string; [key: string]: unknown } | null;
              const newTitle = uniqueTitle(locObj?.title || "");
              rawContents[locale] = { ...locObj, title: newTitle };
              existingTitles.add(newTitle.toLowerCase());
            }
            const contents = applyWidgetMappings(rawContents);
            const createRes = await fetch(`https://${copyTargetDomain}/api/pages`, {
              method: "POST",
              credentials: "omit",
              headers: { Authorization: `Basic ${copyTargetToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({ spaceId: targetSpaceId, published: !!fullPage.publishedAt, contents }),
            });
            if (!createRes.ok) throw new Error(`Create page failed (${createRes.status})`);
            results.push({ name, status: "success" });
          } catch (err) {
            results.push({ name, status: "error", error: err instanceof Error ? err.message : String(err) });
          }
        }
      }
    }

    // Copy journeys
    if (selectedJourneys.length > 0) {
      // Fetch target branch ID once
      let targetBranchId;
      try {
        const branchRes = await fetch(`https://${copyTargetDomain}/api/branch`, {
          credentials: "omit",
          headers: { Authorization: `Basic ${copyTargetToken}` },
        });
        if (!branchRes.ok) throw new Error(`Fetch branch failed (${branchRes.status})`);
        const branchData = await branchRes.json();
        targetBranchId = branchData.id;
      } catch (err) {
        for (const j of selectedJourneys) {
          results.push({ name: getJourneyName(j), status: "error", error: `Could not get target branch: ${err instanceof Error ? err.message : String(err)}` });
        }
        setCopyResults(results);
        setIsCopying(false);
        return;
      }

      for (const journey of selectedJourneys) {
        const journeyName = getJourneyName(journey);
        try {
          // Fetch steps from source
          const stepsRes = await fetch(`https://${domain}/api/branch/journeys/${journey.id}/posts`, {
            credentials: "omit",
            headers: { Authorization: `Basic ${activeToken}` },
          });
          if (!stepsRes.ok) throw new Error(`Fetch steps failed (${stepsRes.status})`);
          const stepsData = await stepsRes.json();
          const steps = Array.isArray(stepsData) ? stepsData : (stepsData.data || []);

          // Create journey installation in target
          const createRes = await fetch(`https://${copyTargetDomain}/api/spaces/${targetBranchId}/installations`, {
            method: "POST",
            credentials: "omit",
            headers: { Authorization: `Basic ${copyTargetToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              pluginID: "journeys",
              config: journey.config,
              accessorIDs: [selectedTargetSpaceId || targetBranchId],
            }),
          });
          if (!createRes.ok) throw new Error(`Create journey failed (${createRes.status})`);
          const newJourney = await createRes.json();
          const newJourneyId = newJourney.id;

          // Set journey type
          let typePayload;
          if (journey.journeyType === "joinGroup") {
            const targetGroupId = journeyGroupMap[journey.id];
            if (!targetGroupId) throw new Error("No target group selected for group-triggered journey");
            typePayload = {
              journeyType: "joinGroup",
              recipientIds: [targetGroupId],
              includeExisting: journey.includeExisting ?? false,
              multipleExecutions: journey.multipleExecutions ?? false,
            };
          } else {
            typePayload = { journeyType: journey.journeyType || "onboarding" };
          }

          const typeRes = await fetch(`https://${copyTargetDomain}/api/installations/${newJourneyId}`, {
            method: "POST",
            credentials: "omit",
            headers: { Authorization: `Basic ${copyTargetToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(typePayload),
          });
          if (!typeRes.ok) throw new Error(`Set journey type failed (${typeRes.status})`);

          // Add steps
          for (const step of steps) {
            await fetch(`https://${copyTargetDomain}/api/branch/journeys/${newJourneyId}/posts`, {
              method: "POST",
              credentials: "omit",
              headers: { Authorization: `Basic ${copyTargetToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: step.contents,
                dayOffset: step.dayOffset,
                timeOfDay: step.timeOfDay,
                notificationChannels: step.notificationChannels,
              }),
            });
          }

          // Publish
          await fetch(`https://${copyTargetDomain}/api/installations/${newJourneyId}`, {
            method: "POST",
            credentials: "omit",
            headers: { Authorization: `Basic ${copyTargetToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ published: "now" }),
          });

          results.push({ name: journeyName, status: "success" });
        } catch (err) {
          results.push({ name: journeyName, status: "error", error: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    setCopyResults(results);
    setIsCopying(false);
  };

  const resetLoadedData = () => {
    // Invalidate any in-flight fetches from the previous source
    fetchGenRef.current += 1;

    // Close all sections so they re-fetch fresh data when next opened
    setShowEmailSection(false); setShowSentSection(false); setShowPagesSection(false);
    setShowSurveysSection(false); setShowFormsSection(false); setShowNewsSection(false);
    setShowMediaSection(false); setShowJourneysSection(false);

    // Clear loaded data and loading flags
    setEmailTemplates([]); setTemplatesLoaded(false); setTemplatesError(null); setIsLoadingTemplates(false);
    setSentEmails([]); setSentLoaded(false); setSentError(null); setIsLoadingSent(false);
    setPages([]); setPagesLoaded(false); setPagesError(null); setIsLoadingPages(false);
    setSurveys([]); setSurveysLoaded(false); setSurveysError(null); setIsLoadingSurveys(false);
    setForms([]); setFormsLoaded(false); setFormsError(null); setIsLoadingForms(false);
    setNewsItems([]); setNewsLoaded(false); setNewsError(null); setIsLoadingNews(false);
    setMediaItems([]); setMediaLoaded(false); setMediaError(null); setIsLoadingMedia(false);
    setJourneys([]); setJourneysLoaded(false); setJourneysError(null); setIsLoadingJourneys(false);

    setSelectedTemplates([]); setSelectedSentEmails([]); setSelectedPages([]); setSelectedSurveys([]); setSelectedForms([]); setSelectedNews([]); setSelectedMedia([]); setSelectedJourneys([]);
    setTemplateSearch(""); setSentSearch(""); setPageSearch(""); setSurveySearch(""); setFormSearch(""); setNewsSearch(""); setMediaSearch(""); setJourneySearch("");
    setJourneyGroupMap({}); setTargetGroups([]); setTargetGroupsLoaded(false);
    setSelectedSourceSpaceId(""); setSelectedTargetSpaceId("");
    setPageWidgetAnalysis(null); setPageWidgetMappings({});
    setCopyResults(null);
  };

  const handleSwap = () => {
    setSwapped((prev) => !prev);
    resetLoadedData();
  };

  const handleTargetChange = (slug: string) => {
    setTargetEnv(slug);
    setSwapped(false);
    resetLoadedData();
  };

  const fetchEmailTemplates = async () => {
    const gen = fetchGenRef.current;
    setIsLoadingTemplates(true);
    setTemplatesError(null);
    try {
      const res = await fetch(`https://${domain}/api/email-service/templates?limit=100`, {
        credentials: "omit",
        headers: { Authorization: `Basic ${activeToken}` },
      });
      if (!res.ok) throw new Error(`Failed to fetch templates (${res.status})`);
      const data = await res.json();
      if (fetchGenRef.current !== gen) return;
      setEmailTemplates(data.data || []);
      setTemplatesLoaded(true);
    } catch (err) {
      if (fetchGenRef.current !== gen) return;
      setTemplatesError(err instanceof Error ? err.message : String(err));
    } finally {
      if (fetchGenRef.current === gen) setIsLoadingTemplates(false);
    }
  };

  const fetchSentEmails = async () => {
    const gen = fetchGenRef.current;
    setIsLoadingSent(true);
    setSentError(null);
    try {
      const res = await fetch(`https://${domain}/api/email-service/emails/search`, {
        method: "POST",
        credentials: "omit",
        headers: {
          Authorization: `Basic ${activeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "sent", limit: 100 }),
      });
      if (!res.ok) throw new Error(`Failed to fetch sent emails (${res.status})`);
      const data = await res.json();
      if (fetchGenRef.current !== gen) return;
      setSentEmails(data.data || []);
      setSentLoaded(true);
    } catch (err) {
      if (fetchGenRef.current !== gen) return;
      setSentError(err instanceof Error ? err.message : String(err));
    } finally {
      if (fetchGenRef.current === gen) setIsLoadingSent(false);
    }
  };

  const fetchPages = async () => {
    const gen = fetchGenRef.current;
    setIsLoadingPages(true);
    setPagesError(null);
    try {
      // Fetch all pages via cursor pagination
      const allPages = [];
      let cursor = null;
      do {
        const url = new URL(`https://${domain}/api/pages`);
        url.searchParams.set("limit", "100");
        if (cursor) url.searchParams.set("cursor", cursor);
        const res = await fetch(url.toString(), {
          credentials: "omit",
          headers: { Authorization: `Basic ${activeToken}` },
        });
        if (!res.ok) throw new Error(`Failed to fetch pages (${res.status})`);
        const data = await res.json();
        allPages.push(...(data.data || []));
        cursor = data.cursor || null;
      } while (cursor);

      if (fetchGenRef.current !== gen) return;
      setPages(allPages);
      setPagesLoaded(true);
    } catch (err) {
      if (fetchGenRef.current !== gen) return;
      setPagesError(err instanceof Error ? err.message : String(err));
    } finally {
      if (fetchGenRef.current === gen) setIsLoadingPages(false);
    }
  };

  const handleToggleEmailSection = () => {
    const next = !showEmailSection;
    setShowEmailSection(next);
    if (next && !templatesLoaded && !isLoadingTemplates) fetchEmailTemplates();
  };

  const handleToggleSentSection = () => {
    const next = !showSentSection;
    setShowSentSection(next);
    if (next && !sentLoaded && !isLoadingSent) fetchSentEmails();
  };

  const handleTogglePagesSection = () => {
    const next = !showPagesSection;
    setShowPagesSection(next);
    if (next && !pagesLoaded && !isLoadingPages) fetchPages();
  };

  const fetchSurveys = async () => {
    const gen = fetchGenRef.current;
    setIsLoadingSurveys(true);
    setSurveysError(null);
    try {
      const res = await fetch(
        `https://${domain}/api/installations/administrated?pluginID=surveys&limit=-1`,
        { credentials: "omit", headers: { Authorization: `Basic ${activeToken}` } }
      );
      if (!res.ok) throw new Error(`Failed to fetch surveys (${res.status})`);
      const data = await res.json();
      if (fetchGenRef.current !== gen) return;
      const published = (data.data || []).filter((s: ApiItem) => s.published !== false);
      setSurveys(published);
      setSurveysLoaded(true);
    } catch (err) {
      if (fetchGenRef.current !== gen) return;
      setSurveysError(err instanceof Error ? err.message : String(err));
    } finally {
      if (fetchGenRef.current === gen) setIsLoadingSurveys(false);
    }
  };

  const handleToggleSurveysSection = () => {
    const next = !showSurveysSection;
    setShowSurveysSection(next);
    if (next && !surveysLoaded && !isLoadingSurveys) fetchSurveys();
  };

  const fetchForms = async () => {
    const gen = fetchGenRef.current;
    setIsLoadingForms(true);
    setFormsError(null);
    try {
      const res = await fetch(
        `https://${domain}/api/plugins/form/installations/search?permission=manage&query=&limit=100&sort=updated_DESC`,
        { credentials: "omit", headers: { Authorization: `Basic ${activeToken}` } }
      );
      if (!res.ok) throw new Error(`Failed to fetch forms (${res.status})`);
      const data = await res.json();
      if (fetchGenRef.current !== gen) return;
      setForms((data.entries || []).map((e: ApiItem) => e.data));
      setFormsLoaded(true);
    } catch (err) {
      if (fetchGenRef.current !== gen) return;
      setFormsError(err instanceof Error ? err.message : String(err));
    } finally {
      if (fetchGenRef.current === gen) setIsLoadingForms(false);
    }
  };

  const fetchNews = async () => {
    const gen = fetchGenRef.current;
    setIsLoadingNews(true);
    setNewsError(null);
    try {
      const res = await fetch(
        `https://${domain}/api/posts?limit=100&sort=published_DESC&publicationState=published`,
        { credentials: "omit", headers: { Authorization: `Basic ${activeToken}` } }
      );
      if (!res.ok) throw new Error(`Failed to fetch news (${res.status})`);
      const data = await res.json();
      if (fetchGenRef.current !== gen) return;
      setNewsItems(Array.isArray(data) ? data : (data.data || []));
      setNewsLoaded(true);
    } catch (err) {
      if (fetchGenRef.current !== gen) return;
      setNewsError(err instanceof Error ? err.message : String(err));
    } finally {
      if (fetchGenRef.current === gen) setIsLoadingNews(false);
    }
  };

  const handleToggleNewsSection = () => {
    const next = !showNewsSection;
    setShowNewsSection(next);
    if (next && !newsLoaded && !isLoadingNews) fetchNews();
  };

  const handleToggleFormsSection = () => {
    const next = !showFormsSection;
    setShowFormsSection(next);
    if (next && !formsLoaded && !isLoadingForms) fetchForms();
  };

  const fetchMedia = async () => {
    const gen = fetchGenRef.current;
    setIsLoadingMedia(true);
    setMediaError(null);
    try {
      let all: ApiItem[] = [];
      let offset = 0;
      const limit = 100;
      while (true) {
        const res = await fetch(
          `https://${domain}/api/media?limit=${limit}&offset=${offset}`,
          { credentials: "omit", headers: { Authorization: `Basic ${activeToken}` } }
        );
        if (!res.ok) throw new Error(`Failed to fetch media (${res.status})`);
        const data = await res.json();
        if (fetchGenRef.current !== gen) return;
        const items = data.value?.data || data.data || [];
        all = all.concat(items);
        if (items.length < limit) break;
        offset += limit;
      }
      setMediaItems(all);
      setMediaLoaded(true);
    } catch (err) {
      if (fetchGenRef.current !== gen) return;
      setMediaError(err instanceof Error ? err.message : String(err));
    } finally {
      if (fetchGenRef.current === gen) setIsLoadingMedia(false);
    }
  };

  const handleToggleMediaSection = () => {
    const next = !showMediaSection;
    setShowMediaSection(next);
    if (next && !mediaLoaded && !isLoadingMedia) fetchMedia();
  };

  const fetchJourneys = async () => {
    const gen = fetchGenRef.current;
    setIsLoadingJourneys(true);
    setJourneysError(null);
    try {
      const res = await fetch(
        `https://${domain}/api/plugins/journeys/installations/search?permission=contribute&query=&limit=100&sort=updated_DESC`,
        { credentials: "omit", headers: { Authorization: `Basic ${activeToken}` } }
      );
      if (!res.ok) throw new Error(`Failed to fetch journeys (${res.status})`);
      const data = await res.json();
      if (fetchGenRef.current !== gen) return;
      setJourneys((data.entries || []).map((e: ApiItem) => e.data));
      setJourneysLoaded(true);
    } catch (err) {
      if (fetchGenRef.current !== gen) return;
      setJourneysError(err instanceof Error ? err.message : String(err));
    } finally {
      if (fetchGenRef.current === gen) setIsLoadingJourneys(false);
    }
  };

  const fetchTargetGroups = async () => {
    try {
      const res = await fetch(`https://${copyTargetDomain}/api/branch/groups`, {
        credentials: "omit",
        headers: { Authorization: `Basic ${copyTargetToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setTargetGroups(data.data || []);
      setTargetGroupsLoaded(true);
    } catch { /* intentional */ }
  };

  const handleToggleJourneysSection = () => {
    const next = !showJourneysSection;
    setShowJourneysSection(next);
    if (next && !journeysLoaded && !isLoadingJourneys) fetchJourneys();
  };

  const handleAddJourney = async (journey: ApiItem) => {
    if (selectedJourneys.find((j) => j.id === journey.id)) return;
    try {
      const detailRes = await fetch(`https://${domain}/api/installations/${journey.id}`, {
        credentials: "omit",
        headers: { Authorization: `Basic ${activeToken}` },
      });
      if (detailRes.ok) {
        const detail = await detailRes.json();
        const enriched: ApiItem = {
          ...journey,
          journeyType: detail.journeyType,
          recipientIds: detail.recipientIds || [],
          includeExisting: detail.includeExisting,
          multipleExecutions: detail.multipleExecutions,
        };
        if (detail.journeyType === "joinGroup" && detail.recipientIds?.[0]) {
          try {
            const groupsRes = await fetch(`https://${domain}/api/branch/groups`, {
              credentials: "omit",
              headers: { Authorization: `Basic ${activeToken}` },
            });
            if (groupsRes.ok) {
              const groupsData = await groupsRes.json();
              const sourceGroup = (groupsData.data || []).find((g: ApiItem) => g.id === detail.recipientIds[0]);
              enriched.sourceGroupName = sourceGroup?.name || detail.recipientIds[0];
            }
          } catch {
            enriched.sourceGroupName = detail.recipientIds[0];
          }
          if (!targetGroupsLoaded) fetchTargetGroups();
        }
        setSelectedJourneys((prev) => [...prev, enriched]);
      } else {
        setSelectedJourneys((prev) => [...prev, journey]);
      }
    } catch {
      setSelectedJourneys((prev) => [...prev, journey]);
    }
  };

  const getPageName = (page: ApiItem) => {
    const contents = page.contents || {};
    const first = contents.en_US || Object.values(contents)[0];
    return first?.title || page.id;
  };
  const getPageSubtext = (page: ApiItem) => {
    const spaceName = sourceSpaces.find((s: ApiItem) => s.id === page.spaceId)?.name;
    const created = page.createdAt ? new Date(page.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null;
    return [spaceName, created, page.id].filter(Boolean).join(" · ");
  };

  const getSentEmailName = (email: ApiItem) =>
    email.title || email.settings?.en_US?.subject || email.id;

  const applySearch = (items: ApiItem[], query: string, getName: (item: ApiItem) => string) => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        getName(item).toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
    );
  };

  const bySpace = (items: ApiItem[], getSpaceId: (item: ApiItem) => string) =>
    selectedSourceSpaceId ? items.filter((item) => getSpaceId(item) === selectedSourceSpaceId) : items;

  const filteredTemplates = applySearch(emailTemplates, templateSearch, (t) => t.name || "");
  const filteredSent = applySearch(sentEmails, sentSearch, getSentEmailName);
  const filteredPages = applySearch(bySpace(pages, (p) => p.spaceId), pageSearch, getPageName);
  const getSurveyName = (s: ApiItem) => s.config?.localization?.en_US?.title || s.id;
  const filteredSurveys = applySearch(bySpace(surveys, (s) => s.spaceID), surveySearch, getSurveyName);
  const getFormName = (f: ApiItem) => {
    const loc = f.config?.localization;
    if (loc) {
      if (loc.en_US?.title) return loc.en_US.title;
      const first = Object.values(loc)[0] as { title?: string } | undefined;
      if (first?.title) return first.title;
    }
    return f.id;
  };
  const filteredForms = applySearch(bySpace(forms, (f) => f.spaceID), formSearch, getFormName);
  const getNewsName = (post: ApiItem) =>
    post.contents?.en_US?.title || post.contents?.[Object.keys(post.contents || {})[0]]?.title || post.id;
  const getNewsSubtext = (post: ApiItem) => {
    const ch = post.channel?.config?.localization?.en_US?.title;
    return ch ? `${ch} · ${post.id}` : post.id;
  };
  const filteredNews = applySearch(bySpace(newsItems, (p) => p.channel?.spaceID), newsSearch, getNewsName);
  const getMediaName = (m: ApiItem) => m.fileName || m.label || m.id;
  const getMediaSubtext = (m: ApiItem) => {
    const type = m.resourceInfo?.type || "";
    const size = m.resourceInfo?.bytes ? `${Math.round(m.resourceInfo.bytes / 1024)} KB` : "";
    return [type, size, m.id].filter(Boolean).join(" · ");
  };
  const filteredMedia = applySearch(mediaItems, mediaSearch, getMediaName);
  const getJourneyName = (j: ApiItem) =>
    j.config?.localization?.en_US?.title ||
    (Object.values(j.config?.localization || {})[0] as { title?: string } | undefined)?.title ||
    j.id;
  const filteredJourneys = applySearch(bySpace(journeys, (j) => j.spaceID), journeySearch, getJourneyName);

  const hasSelections =
    selectedTemplates.length > 0 ||
    selectedSentEmails.length > 0 ||
    selectedPages.length > 0 ||
    selectedSurveys.length > 0 ||
    selectedForms.length > 0 ||
    selectedNews.length > 0 ||
    selectedMedia.length > 0 ||
    selectedJourneys.length > 0;

  const PAGE_SIZE = 20;

  interface RenderSectionProps {
    label: string;
    isOpen: boolean;
    onToggle: () => void;
    isLoading: boolean;
    error: string | null;
    loaded: boolean;
    items: ApiItem[];
    search: string;
    onSearch: (v: string) => void;
    selected: ApiItem[];
    onAdd: (item: ApiItem) => void;
    emptyText: string;
    getName: (item: ApiItem) => string;
    getSubtext: (item: ApiItem) => string;
    page: number;
    onPageChange: (p: number) => void;
  }
  const renderSection = ({
    label,
    isOpen,
    onToggle,
    isLoading,
    error,
    loaded,
    items,
    search,
    onSearch,
    selected,
    onAdd,
    emptyText,
    getName,
    getSubtext,
    page,
    onPageChange,
  }: RenderSectionProps) => {
    const totalPages = Math.ceil(items.length / PAGE_SIZE);
    const pageItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    return (
      <div style={{ marginBottom: 6 }}>
        <div style={sectionHeaderStyle} onClick={onToggle}>
          <span style={{ fontWeight: "bold", fontSize: 14 }}>{label}</span>
          <span style={{ fontSize: 12, color: colors.textMuted }}>{isOpen ? "▲" : "▼"}</span>
        </div>
        {isOpen && (
          <div style={sectionBodyStyle}>
            {isLoading && (
              <p style={{ fontSize: 13, color: colors.textMuted }}>Loading…</p>
            )}
            {error && (
              <p style={{ fontSize: 13, color: colors.danger }}>{error}</p>
            )}
            {!isLoading && loaded && (
              <>
                <SearchInput value={search} onChange={(v) => { onSearch(v); onPageChange(0); }} />
                {items.length === 0 ? (
                  <p style={{ fontSize: 13, color: colors.textMuted }}>{emptyText}</p>
                ) : (
                  <>
                    {pageItems.map((item) => (
                      <ItemRow
                        key={item.id}
                        id={item.id}
                        name={getName(item)}
                        subtext={getSubtext(item)}
                        isAdded={selected.some((s) => s.id === item.id)}
                        onAdd={() => onAdd(item)}
                      />
                    ))}
                    {totalPages > 1 && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: `1px solid ${colors.border}` }}>
                        <button
                          onClick={() => onPageChange(page - 1)}
                          disabled={page === 0}
                          style={{ background: "none", border: "none", cursor: page === 0 ? "default" : "pointer", color: page === 0 ? colors.textMuted : colors.primary, fontSize: 12, padding: "2px 6px" }}
                        >
                          ← Prev
                        </button>
                        <span style={{ fontSize: 12, color: colors.textMuted }}>
                          {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, items.length)} of {items.length}
                        </span>
                        <button
                          onClick={() => onPageChange(page + 1)}
                          disabled={page >= totalPages - 1}
                          style={{ background: "none", border: "none", cursor: page >= totalPages - 1 ? "default" : "pointer", color: page >= totalPages - 1 ? colors.textMuted : colors.primary, fontSize: 12, padding: "2px 6px" }}
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontSize: 13, color: colors.textMedium, marginTop: 0 }}>
        Copy content from{" "}
        <strong style={{ color: colors.textDark }}>{activeSourceSlug}</strong> into{" "}
        <strong style={{ color: targetEnv ? colors.textDark : colors.textMuted }}>
          {activeTargetSlug || "another environment"}
        </strong>.{" "}
        <button
          onClick={handleSwap}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: colors.primary,
            cursor: "pointer",
            fontSize: 13,
            textDecoration: "underline",
          }}
        >
          switch
        </button>
      </p>

      {/* Target Environment — chip picker */}
      <div style={{ marginBottom: targetEnv && targetSpaces.length > 1 ? 8 : 16 }}>
        <label style={{ ...labelStyle, marginBottom: 6 }}>Target Environment</label>
        {otherEnvs.length === 0 ? (
          <p style={{ fontSize: 12, color: colors.textMuted, margin: 0 }}>
            No other saved environments. Add one first.
          </p>
        ) : (
          <>
            {otherEnvs.length > 6 && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 20,
                border: `1.5px solid ${targetEnvSearchFocused ? colors.primary : colors.borderMedium}`,
                background: targetEnvSearchFocused ? `${colors.primary}08` : colors.backgroundLight,
                transition: "border-color 0.18s ease, background 0.18s ease",
                boxShadow: targetEnvSearchFocused ? `0 0 0 3px ${colors.primary}22` : "none",
                marginBottom: 7,
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={targetEnvSearchFocused ? colors.primary : colors.textMuted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: "stroke 0.18s ease" }}>
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text"
                  value={targetEnvFilter}
                  onChange={(e) => setTargetEnvFilter(e.target.value)}
                  onFocus={() => setTargetEnvSearchFocused(true)}
                  onBlur={() => setTargetEnvSearchFocused(false)}
                  placeholder="Filter environments…"
                  style={{ border: "none", outline: "none", background: "transparent", fontSize: 12, color: colors.textDark, width: "100%" }}
                />
                {targetEnvFilter && (
                  <button onClick={() => setTargetEnvFilter("")} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: colors.textMuted, lineHeight: 1, fontSize: 14, display: "flex" }}>×</button>
                )}
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {otherEnvs
                .filter(({ slug }) => !targetEnvFilter.trim() || slug.toLowerCase().includes(targetEnvFilter.trim().toLowerCase()))
                .map(({ slug }) => {
                  const isActive = targetEnv === slug;
                  const isHovered = hoveredEnvChip === slug;
                  return (
                    <button
                      key={slug}
                      onClick={() => handleTargetChange(isActive ? "" : slug)}
                      onMouseEnter={() => setHoveredEnvChip(slug)}
                      onMouseLeave={() => setHoveredEnvChip(null)}
                      style={{
                        padding: "4px 12px",
                        borderRadius: 20,
                        border: `1.5px solid ${isActive ? colors.primary : isHovered ? colors.primary : colors.borderMedium}`,
                        background: isActive ? colors.primary : isHovered ? `${colors.primary}12` : "transparent",
                        color: isActive ? colors.textOnPrimary : isHovered ? colors.primary : colors.textMuted,
                        fontSize: 12,
                        fontWeight: isActive ? 600 : 400,
                        cursor: "pointer",
                        letterSpacing: "0.02em",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {slug}
                    </button>
                  );
                })}
            </div>
          </>
        )}
      </div>

      {/* Target Space */}
      {targetEnv && targetSpaces.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ ...labelStyle, marginBottom: 4 }}>Target Space</label>
          <select
            style={{ ...inputStyle, backgroundColor: colors.background }}
            value={selectedTargetSpaceId}
            onChange={(e) => setSelectedTargetSpaceId(e.target.value)}
          >
            {targetSpaces.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Source Space Filter */}
      {sourceSpaces.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ ...labelStyle, marginBottom: 4 }}>Filter source by space</label>
          <select
            style={{ ...inputStyle, backgroundColor: colors.background }}
            value={selectedSourceSpaceId}
            onChange={(e) => setSelectedSourceSpaceId(e.target.value)}
          >
            <option value="">All spaces</option>
            {sourceSpaces.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}


      {renderSection({
        label: "Email Templates",
        isOpen: showEmailSection,
        onToggle: handleToggleEmailSection,
        isLoading: isLoadingTemplates,
        error: templatesError,
        loaded: templatesLoaded,
        items: filteredTemplates,
        search: templateSearch,
        onSearch: setTemplateSearch,
        selected: selectedTemplates,
        onAdd: (t) => {
          if (!selectedTemplates.find((s) => s.id === t.id))
            setSelectedTemplates((prev) => [...prev, t]);
        },
        emptyText: templateSearch ? "No templates match your search." : "No templates found.",
        getName: (t) => t.name || t.id,
        getSubtext: (t) => t.id,
        page: templatePage,
        onPageChange: setTemplatePage,
      })}

      {renderSection({
        label: "Sent Emails",
        isOpen: showSentSection,
        onToggle: handleToggleSentSection,
        isLoading: isLoadingSent,
        error: sentError,
        loaded: sentLoaded,
        items: filteredSent,
        search: sentSearch,
        onSearch: setSentSearch,
        selected: selectedSentEmails,
        onAdd: (e) => {
          if (!selectedSentEmails.find((s) => s.id === e.id))
            setSelectedSentEmails((prev) => [...prev, e]);
        },
        emptyText: sentSearch ? "No sent emails match your search." : "No sent emails found.",
        getName: getSentEmailName,
        getSubtext: (e) => e.id,
        page: sentPage,
        onPageChange: setSentPage,
      })}

      {renderSection({
        label: "Surveys",
        isOpen: showSurveysSection,
        onToggle: handleToggleSurveysSection,
        isLoading: isLoadingSurveys,
        error: surveysError,
        loaded: surveysLoaded,
        items: filteredSurveys,
        search: surveySearch,
        onSearch: setSurveySearch,
        selected: selectedSurveys,
        onAdd: (s) => {
          if (!selectedSurveys.find((x) => x.id === s.id))
            setSelectedSurveys((prev) => [...prev, s]);
        },
        emptyText: surveySearch ? "No surveys match your search." : "No surveys found.",
        getName: getSurveyName,
        getSubtext: (s) => s.id,
        page: surveyPage,
        onPageChange: setSurveyPage,
      })}

      {renderSection({
        label: "News",
        isOpen: showNewsSection,
        onToggle: handleToggleNewsSection,
        isLoading: isLoadingNews,
        error: newsError,
        loaded: newsLoaded,
        items: filteredNews,
        search: newsSearch,
        onSearch: setNewsSearch,
        selected: selectedNews,
        onAdd: (p) => {
          if (!selectedNews.find((x) => x.id === p.id))
            setSelectedNews((prev) => [...prev, p]);
        },
        emptyText: newsSearch ? "No posts match your search." : "No published posts found.",
        getName: getNewsName,
        getSubtext: getNewsSubtext,
        page: newsPage,
        onPageChange: setNewsPage,
      })}

      {renderSection({
        label: "Forms",
        isOpen: showFormsSection,
        onToggle: handleToggleFormsSection,
        isLoading: isLoadingForms,
        error: formsError,
        loaded: formsLoaded,
        items: filteredForms,
        search: formSearch,
        onSearch: setFormSearch,
        selected: selectedForms,
        onAdd: (f) => {
          if (!selectedForms.find((x) => x.id === f.id))
            setSelectedForms((prev) => [...prev, f]);
        },
        emptyText: formSearch ? "No forms match your search." : "No forms found.",
        getName: getFormName,
        getSubtext: (f) => f.id,
        page: formPage,
        onPageChange: setFormPage,
      })}

      {renderSection({
        label: "Pages",
        isOpen: showPagesSection,
        onToggle: handleTogglePagesSection,
        isLoading: isLoadingPages,
        error: pagesError,
        loaded: pagesLoaded,
        items: filteredPages,
        search: pageSearch,
        onSearch: setPageSearch,
        selected: selectedPages,
        onAdd: (p) => {
          if (!selectedPages.find((s) => s.id === p.id))
            setSelectedPages((prev) => [...prev, p]);
        },
        emptyText: pageSearch ? "No pages match your search." : "No pages found.",
        getName: getPageName,
        getSubtext: getPageSubtext,
        page: pagePage,
        onPageChange: setPagePage,
      })}

      {renderSection({
        label: "Media & Files",
        isOpen: showMediaSection,
        onToggle: handleToggleMediaSection,
        isLoading: isLoadingMedia,
        error: mediaError,
        loaded: mediaLoaded,
        items: filteredMedia,
        search: mediaSearch,
        onSearch: setMediaSearch,
        selected: selectedMedia,
        onAdd: (m) => {
          if (!selectedMedia.find((s) => s.id === m.id))
            setSelectedMedia((prev) => [...prev, m]);
        },
        emptyText: mediaSearch ? "No media match your search." : "No media found.",
        getName: getMediaName,
        getSubtext: getMediaSubtext,
        page: mediaPage,
        onPageChange: setMediaPage,
      })}

      {renderSection({
        label: "Journeys",
        isOpen: showJourneysSection,
        onToggle: handleToggleJourneysSection,
        isLoading: isLoadingJourneys,
        error: journeysError,
        loaded: journeysLoaded,
        items: filteredJourneys,
        search: journeySearch,
        onSearch: setJourneySearch,
        selected: selectedJourneys,
        onAdd: (j) => handleAddJourney(j),
        emptyText: journeySearch ? "No journeys match your search." : "No journeys found.",
        getName: getJourneyName,
        getSubtext: (j) => j.id,
        page: journeyPage,
        onPageChange: setJourneyPage,
      })}

      {/* Selected Items Queue */}
      {hasSelections && (
        <div
          style={{
            marginTop: 10,
            padding: 12,
            border: `1px solid ${colors.border}`,
            borderRadius: 4,
            backgroundColor: colors.backgroundLight,
          }}
        >
          <p style={{ margin: "0 0 10px", fontWeight: "bold", fontSize: 13 }}>
            Selected to copy
          </p>

          {selectedTemplates.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: colors.textMuted }}>
                Email Templates
              </p>
              <div style={{ display: "flex", flexWrap: "wrap" }}>
                {selectedTemplates.map((t) => (
                  <span key={t.id} style={chipStyle}>
                    {t.name || t.id}
                    <button
                      style={chipRemoveBtnStyle}
                      onClick={() => setSelectedTemplates((prev) => prev.filter((s) => s.id !== t.id))}
                    >✕</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {selectedSentEmails.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: colors.textMuted }}>
                Sent Emails
              </p>
              <div style={{ display: "flex", flexWrap: "wrap" }}>
                {selectedSentEmails.map((e) => (
                  <span key={e.id} style={chipStyle}>
                    {getSentEmailName(e)}
                    <button
                      style={chipRemoveBtnStyle}
                      onClick={() => setSelectedSentEmails((prev) => prev.filter((s) => s.id !== e.id))}
                    >✕</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {selectedNews.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: colors.textMuted }}>
                News
              </p>
              <div style={{ display: "flex", flexWrap: "wrap" }}>
                {selectedNews.map((p) => (
                  <span key={p.id} style={chipStyle}>
                    {getNewsName(p)}
                    <button
                      style={chipRemoveBtnStyle}
                      onClick={() => setSelectedNews((prev) => prev.filter((x) => x.id !== p.id))}
                    >✕</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {selectedMedia.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: colors.textMuted }}>Media & Files</p>
              <div style={{ display: "flex", flexWrap: "wrap" }}>
                {selectedMedia.map((m) => (
                  <span key={m.id} style={chipStyle}>
                    {getMediaName(m)}
                    <button
                      style={chipRemoveBtnStyle}
                      onClick={() => setSelectedMedia((prev) => prev.filter((x) => x.id !== m.id))}
                    >✕</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {selectedSurveys.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: colors.textMuted }}>Surveys</p>
              <div style={{ display: "flex", flexWrap: "wrap" }}>
                {selectedSurveys.map((s) => (
                  <span key={s.id} style={chipStyle}>
                    {getSurveyName(s)}
                    <button
                      style={chipRemoveBtnStyle}
                      onClick={() => setSelectedSurveys((prev) => prev.filter((x) => x.id !== s.id))}
                    >✕</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {selectedForms.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: colors.textMuted }}>
                Forms
              </p>
              <div style={{ display: "flex", flexWrap: "wrap" }}>
                {selectedForms.map((f) => (
                  <span key={f.id} style={chipStyle}>
                    {getFormName(f)}
                    <button
                      style={chipRemoveBtnStyle}
                      onClick={() => setSelectedForms((prev) => prev.filter((x) => x.id !== f.id))}
                    >✕</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {selectedPages.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: colors.textMuted }}>Pages</p>
              <div style={{ display: "flex", flexWrap: "wrap" }}>
                {selectedPages.map((p) => (
                  <span key={p.id} style={chipStyle}>
                    {getPageName(p)}
                    <button style={chipRemoveBtnStyle} onClick={() => setSelectedPages((prev) => prev.filter((s) => s.id !== p.id))}>✕</button>
                  </span>
                ))}
              </div>

              {/* Widget ID remapping panel */}
              {pageWidgetAnalysis?.loading && (
                <p style={{ margin: "6px 0 0", fontSize: 11, color: colors.textMuted }}>Analysing page content…</p>
              )}
              {pageWidgetAnalysis && !pageWidgetAnalysis.loading && pageWidgetAnalysis.groups?.length > 0 && (
                <div style={{ marginTop: 8, padding: "10px 12px", background: colors.backgroundLight, border: `1px solid ${colors.border}`, borderRadius: 4 }}>
                  <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: colors.textDark }}>Content references in selected pages</p>
                  <p style={{ margin: "0 0 10px", fontSize: 11, color: colors.textMuted }}>These widget IDs will be remapped to the target environment. Auto-matched by name — adjust if needed.</p>
                  {pageWidgetAnalysis.groups.map(group => (
                    <div key={group.type} style={{ marginBottom: 10 }}>
                      <p style={{ margin: "0 0 5px", fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{group.label}</p>
                      {group.items.map(item => (
                        <div key={item.sourceId} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, fontSize: 12 }}>
                          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: colors.textDark }} title={item.sourceName}>{item.sourceName}</span>
                          <span style={{ color: colors.textMuted, flexShrink: 0 }}>→</span>
                          <select
                            value={pageWidgetMappings[item.sourceId] || ""}
                            onChange={e => setPageWidgetMappings(prev => ({ ...prev, [item.sourceId]: e.target.value }))}
                            style={{ ...inputStyle, fontSize: 11, padding: "2px 6px", width: 180, flexShrink: 0 }}
                          >
                            {item.targetOptions.length === 0 && <option value="">No options found</option>}
                            {item.targetOptions.map(opt => (
                              <option key={opt.id} value={opt.id}>{opt.name}</option>
                            ))}
                          </select>
                          {item.autoMatched && <span style={{ color: colors.success, fontSize: 10, flexShrink: 0 }}>✓</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {pageWidgetAnalysis && !pageWidgetAnalysis.loading && pageWidgetAnalysis.groups?.length === 0 && !pageWidgetAnalysis.error && (
                <p style={{ margin: "4px 0 0", fontSize: 11, color: colors.textMuted }}>No remappable widget references found in this page.</p>
              )}
            </div>
          )}

          {selectedJourneys.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: colors.textMuted }}>Journeys</p>
              <div>
                {selectedJourneys.map((j) => (
                  <div key={j.id} style={{ marginBottom: 6 }}>
                    <span style={chipStyle}>
                      {getJourneyName(j)}
                      <button
                        style={chipRemoveBtnStyle}
                        onClick={() => {
                          setSelectedJourneys((prev) => prev.filter((x) => x.id !== j.id));
                          setJourneyGroupMap((prev) => { const next = { ...prev }; delete next[j.id]; return next; });
                        }}
                      >✕</button>
                    </span>
                    {j.journeyType === "joinGroup" && (
                      <div style={{ marginTop: 4, fontSize: 12, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ color: colors.textMuted }}>
                          Group trigger: <strong>{j.sourceGroupName || j.recipientIds?.[0] || "unknown"}</strong>
                        </span>
                        <span style={{ color: colors.textMuted }}>→</span>
                        <select
                          value={journeyGroupMap[j.id] || ""}
                          onChange={(e) => setJourneyGroupMap((prev) => ({ ...prev, [j.id]: e.target.value }))}
                          style={{ ...inputStyle, fontSize: 11, padding: "2px 6px", width: "auto" }}
                        >
                          <option value="">Select target group…</option>
                          {targetGroups.map((g) => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            style={{
              ...brandingButtonStyle,
              marginTop: 12,
              opacity: (targetEnv && !isCopying) ? 1 : 0.5,
              cursor: (targetEnv && !isCopying) ? "pointer" : "not-allowed",
            }}
            disabled={!targetEnv || isCopying}
            onClick={handleCopy}
            title={!targetEnv ? "Select a target environment first" : ""}
          >
            {isCopying ? "Copying…" : `Copy to ${activeTargetSlug || "target"}`}
          </button>
          {!targetEnv && (
            <p style={{ ...subDescriptionStyle, fontSize: 11 }}>
              Select a target environment above to enable copying.
            </p>
          )}

          {copyResults && (
            <div style={{ marginTop: 12 }}>
              {copyResults.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    marginBottom: 4,
                    color: r.status === "success" ? colors.success : colors.danger,
                  }}
                >
                  <span>{r.status === "success" ? "✅" : "❌"}</span>
                  <span>
                    <strong>{r.name}</strong>
                    {r.status === "error" && ` — ${r.error}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
