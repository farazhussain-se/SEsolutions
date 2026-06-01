
import { useState, useEffect, useRef, useMemo } from "react";
import type { ComponentProps } from "react";
import { FaLock, FaLockOpen, FaGithub } from "react-icons/fa";

/* ───── Hooks & utils ───── */
import useStaffbaseTab from "./hooks/useStaffbaseTab";
import useGitHubAuth from "./hooks/useGitHubAuth";

import useSavedTokens from "./hooks/useSavedTokens";
import type { DisplayToken } from "./hooks/useSavedTokens";
import useAnalyticsRedirects from "./hooks/useAnalyticsRedirects";
import useSavedProspects from "./hooks/useSavedProspects";
import useSavedDemos from "./hooks/useSavedDemos";
import useSavedPromptHistory from "./hooks/useSavedPromptHistory";
import type { PromptHistoryEntry } from "./hooks/useSavedPromptHistory";
import buildPreviewCss from "./utils/buildPreviewCss";
import { runSetup } from "./utils/setupRunner";
import {
  fetchCurrentCSS,
  postUpdatedCSS,
  resetDesktopTheme,
} from "./utils/staffbaseCss";
import {
  saveTokensToStorage
} from "./utils/tokenStorage";
import { automationScript } from "./utils/automationRunner";
import { normaliseLinkedInUrl, isLinkedInUrl, buildImagePayload, buildApiUrl as buildApiUrlHelper } from "./utils/helpers";
import { normalizeHex } from "./utils/colorUtils";
import { fetchProspectIntelligence, fetchDemoPlan, generatePostComments, generateChatPairs, generateBulkSurveyAnswers, generateFormAnswers } from "./utils/aiUtils";
import type { SourceItem } from "./utils/aiUtils";
import { parseBrandingFromCSS, parseMultiBrandingFromCSS } from "./utils/branding";
import { getGeminiProxyUrl } from "./utils/geminiProxy";
import { fetchSharedDemoPassword } from "./utils/sharedDemoPasswordProxy";
import { runInPageContext } from "./utils/automationOperations/tabInjection";
import { isContentPageUrl, previewSolutionsInPage } from "./utils/solutionsPreview";

/* ───── Constants & styles ───── */
import {
  LAUNCHPAD_DICT,
  blockRegex,
  DEFAULT_DOMAIN,
  ADMIN_ROLE,
  UNKNOWN_BRANCH_ID,
  DEFAULT_BRANDING,
  DEFAULT_QUICK_LINKS,
} from "./constants/appConstants";
import {
  responseStyle,
  containerStyle,
  brandingButtonStyle,
  subDescriptionStyle,
  logoStyle,
} from "./styles";
import { colors } from "./styles/colors"; // Import new colors
import { generateAndCreateArticles } from "./utils/automationOperations/articles";
import { scrapeAndCreateArticlesFromBlog } from "./utils/automationOperations/blogScraping";
import { importLinkedInArticles } from "./utils/automationOperations/articles";
import { setupMergeIntegration } from "./utils/automationOperations/mergeHRInstallation";

/* ───── Components ───── */
import SavedEnvironments from "./components/SavedEnvironments";
import ApiKeyModal from "./components/ApiKeyForm";
import BrandingForm from "./components/BrandingForm";
import EnvironmentSetupForm from "./components/EnvironmentSetupForm";
import UseEnvironmentOptions from "./components/UseEnvironmentOptions";
import RedirectAnalyticsForm from "./components/RedirectAnalyticsForm";
import SolutionsMonorepoPanel from "./components/SolutionsMonorepoPanel";
import FeedbackBanner from "./components/FeedbackBanner";
import ScrapeInstructionBanner from "./components/ScrapeInstructionBanner";
import { getBoundShortcut } from "./utils/commandShortcut";
import type { ScrapePrompt } from "./utils/automationOperations/types";
import UpdateUserForm from "./components/UpdateUserForm";
import type { UpdateUserFormUser } from "./components/UpdateUserForm";
import AutomationForm from "./components/AutomationForm";
// 🎭 Personas & 📰 News-Rename: bolt-in ports of Faraz's standalone Flask
// tools (staffbase-demo-group-tool + staffbase-news-tool). See each
// component's header docstring and ../utils/automationOperations/{personas,
// newsChannelRename}.ts for the ops + Staffbase API quirks.
import PersonasForm from "./components/PersonasForm";
import NewsChannelRenameForm from "./components/NewsChannelRenameForm";
import {
  listAllChannels as renameListChannels,
  planChannelRenames as renamePlanChannels,
  renameChannels as renameApplyChannels,
} from "./utils/automationOperations/newsChannelRename";
import type { AutomationUser, AutomationRunOptions, AutomationProgressData } from "./components/AutomationForm";
import AskGeminiOverlay from "./components/AskGeminiOverlay";
import CopierForm from "./components/CopierForm";
import HeartLoader from "./components/HeartLoader";
import DemoConfigForm from "./components/DemoConfigForm";
import type { GroupBranding } from "./components/MultiBranding";
import useQuickLinks from "./hooks/useQuickLinks";
import useFieldUpdates from "./hooks/useFieldUpdates";

const CREATE_NEW_CHANNEL_VALUE = "__create_new_channel__";
const DEFAULT_NEW_CHANNEL_NAME = "Top News";

/* ── Local types used only in App ─────────────────────────────────────────── */

interface UseOption {
  type: string | null;
  slug?: string;
  token?: string;
  branchId?: string | null;
  domain?: string;
}

interface FetchedBranding {
  logoUrl: string;
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
}

type MultiBrandingConfig = GroupBranding;

interface GroupItem {
  id: string;
  name: string;
}

interface ProgressData {
  tasksCompleted: number;
  totalTasks: number;
  currentUser?: string | null;
  currentStatus?: string | null;
  geminiTasksDone?: number;
}

interface ProspectSuggestion {
  name: string;
  [key: string]: unknown;
}

interface Channel {
  id: string;
  title: string;
}

interface UserItem {
  id: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  branchRole?: string;
  emails?: { primary?: boolean; value: string }[];
  [key: string]: unknown;
}

interface ProfileFieldSlugTitle {
  slug: string;
  title: string;
}

interface TabValidationState {
  status: "idle" | "checking" | "ok" | "error";
  message: string;
}

interface SavedDemo {
  id: string;
  prospectName?: string;
  logoUrl?: string;
  bgUrl?: string;
  primaryColor?: string;
  textColor?: string;
  backgroundColor?: string;
  floatingNavBgColor?: string;
  floatingNavTextColor?: string;
  logoPadWidth?: number;
  logoPadHeight?: number;
  bgVertical?: number;
  changeLogoSize?: boolean;
  logoHeight?: number;
  logoMarginTop?: number;
  headerTransparency?: number;
  vertical?: string;
  useCases?: string[];
  articleIds?: string[];
  aiArticleCount?: number;
  aiArticleTopics?: string;
  blogUrl?: string;
  createdAt?: number;
}

interface GeminiBrandingData {
  prospectName?: string;
  primaryColor?: string;
  textColor?: string;
  backgroundColor?: string;
  floatingNavBgColor?: string;
  floatingNavTextColor?: string;
  logoUrl?: string;
  bgUrl?: string;
  bgVertical?: number;
  headerTransparency?: number;
  logoHeight?: number;
  logoMarginTop?: number;
  logoPadWidth?: number;
  logoPadHeight?: number;
}

interface InspectMobilePreviewResult {
  innerWidth: number;
  innerHeight: number;
  outerWidth?: number;
  outerHeight?: number;
  screenWidth?: number;
  screenHeight?: number;
  simMode: string;
  simUserAgent: string;
  simTouch: number;
  simPointer: string;
  rootClassName: string;
  bodyClassName: string;
  hasPhoneShell: boolean;
  hasBootstrapLoader?: boolean;
}

function App() {
  // --------------------------------------------------
  //  STATE
  // --------------------------------------------------

  /* 🐙 GitHub Auth --------------------------------------------------------- */
  const gitHub = useGitHubAuth();
  const [showPATInput, setShowPATInput] = useState(false);
  const [patDraft, setPatDraft] = useState("");

  // Close PAT form on successful auth
  useEffect(() => {
    if (gitHub.status === 'authenticated') {
      setShowPATInput(false);
      setPatDraft('');
    }
  }, [gitHub.status]);

  /* 🛂  Auth & token–related ---------------------------------------------- */
  const [apiToken, setApiToken] = useState("");
  const [branchId, setBranchId] = useState("");
  const [apiDomain, setApiDomain] = useState(DEFAULT_DOMAIN);
  const apiDomainRef = useRef(DEFAULT_DOMAIN);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [savedTokens, setSavedTokens] = useSavedTokens();
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [showFullToken, setShowFullToken] = useState<string | null>(null); // which saved token is expanded
  const [useOption, setUseOption] = useState<UseOption | null>(null); // "select" | "existing" | "new"

  /* 🎨  Branding preview / colours --------------------------------------- */
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_BRANDING.primaryColor);
  const [textColor, setTextColor] = useState(DEFAULT_BRANDING.textColor);
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BRANDING.backgroundColor);
  const [floatingNavBgColor, setFloatingNavBgColor] = useState(DEFAULT_BRANDING.floatingNavBgColor);
  const [floatingNavTextColor, setFloatingNavTextColor] = useState(DEFAULT_BRANDING.floatingNavTextColor);
  const [logoUrl, setLogoUrl] = useState("");
  const [bgUrl, setBgURL] = useState("");
  const [logoPadWidth, setLogoPadWidth] = useState(0);
  const [logoPadHeight, setLogoPadHeight] = useState(0);
  const [bgVertical, setBgVertical] = useState(0);
  const [previewActive, setPreviewActive] = useState(false);
  const [brandingExists, setBrandingExists] = useState(false); // Replify block already in CSS?
  const [resetThemeOnDelete, setResetThemeOnDelete] = useState(false);
  const [changeLogoSize, setChangeLogoSize] = useState(false);
  const [logoHeight, setLogoHeight] = useState(DEFAULT_BRANDING.logoHeight);
  const [logoMarginTop, setLogoMarginTop] = useState(0);
  const [headerTransparency, setHeaderTransparency] = useState(DEFAULT_BRANDING.headerTransparency);
  /* 🥷 Admin Mode ---------------------------------------------------------- */
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [customCss, setCustomCss] = useState("");
  const [isGeminiOpen, setIsGeminiOpen] = useState(false);

  /* 🎨 Prospect saving --------------------------------------------------- */
  const [savedProspects, setSavedProspects] = useSavedProspects();
  const [savedDemos, updateDemos] = useSavedDemos();
  const [expandedDemoId, setExpandedDemoId] = useState<string | null>(null);
  const [detectedCssProspect, _setDetectedCssProspect] = useState<string | null>(null);
  const demoUseCasesRef = useRef<string[]>([]);

  /* 📝 Prompt history --------------------------------------------------- */
  const [promptHistory, _setPromptHistory, addPromptToHistory] = useSavedPromptHistory();
  
  /* 🎨 Multi-branding state --------------------------------------------------- */
  const [multiBrandings, setMultiBrandings] = useState<MultiBrandingConfig[]>([]);

  /* ✨ AI News Fetching State ------------------------------------------------ */
  const [prospectNews, setProspectNews] = useState("");
  const [fetchedBranding, setFetchedBranding] = useState<FetchedBranding | null>(null);
  const [newsSources, setNewsSources] = useState<SourceItem[]>([]);
  const [isFetchingNews, setIsFetchingNews] = useState(false);
  const [prospectSuggestions, setProspectSuggestions] = useState<ProspectSuggestion[]>([]);
  const [multiBrandingEnabled, setMultiBrandingEnabled] = useState(false);
  const [_multiBrandingTarget, _setMultiBrandingTarget] = useState<{ type: string | null; id: string | null }>({ type: null, id: null });
  const [allGroups, setAllGroups] = useState<GroupItem[]>([]);
  const handleAddMultiBranding = (newBrandingConfig: MultiBrandingConfig) => {
    // Adds a new group's branding config
    setMultiBrandings(prev => [...prev, newBrandingConfig]);
  };
  const handleUpdateMultiBranding = (updatedConfig: MultiBrandingConfig) => {
    // Updates an existing group's config
    setMultiBrandings(prev =>
      prev.map(mb => mb.groupId === updatedConfig.groupId ? updatedConfig : mb)
    );
  };
  const handleRemoveMultiBranding = (groupIdToRemove: string) => {
    // Removes a group's config
    setMultiBrandings(prev => prev.filter(mb => mb.groupId !== groupIdToRemove));
  };

  

  /* 📰  Articles ------------------------------------------------------------ */
  const [includeArticles, setIncludeArticles] = useState(true);
  // LinkedIn sub-option
  const [includeLinkedIn, setIncludeLinkedIn] = useState(false);
  const [prospectLinkedInUrl, setProspectLinkedInUrl] = useState("");
  const [linkedInPostsCount, setLinkedInPostsCount] = useState(3);
  const [linkedinChannels, setLinkedinChannels] = useState<Channel[]>([]);
  const [linkedinChannelId, setLinkedinChannelId] = useState(CREATE_NEW_CHANNEL_VALUE);
  const [linkedinNewChannelName, setLinkedinNewChannelName] = useState(DEFAULT_NEW_CHANNEL_NAME);
  // AI articles sub-option
  const [includeAiArticles, setIncludeAiArticles] = useState(false);
  const [aiArticleCount, setAiArticleCount] = useState(3);
  const [aiArticleTopics, setAiArticleTopics] = useState("");
  const [aiLocales, setAiLocales] = useState<string[]>(["en_US"]);
  const [linkedinLocales, setLinkedinLocales] = useState<string[]>(["en_US"]);
  const [blogLocales, setBlogLocales] = useState<string[]>(["en_US"]);
  const [availableLocales, setAvailableLocales] = useState<string[]>([]);
  const [scrapePrompt, setScrapePrompt] = useState<ScrapePrompt | null>(null);
  const [aiChannelId, setAiChannelId] = useState(CREATE_NEW_CHANNEL_VALUE);
  const [aiNewChannelName, setAiNewChannelName] = useState(DEFAULT_NEW_CHANNEL_NAME);
  // Blog scraping sub-option
  const [includeBlogScrape, setIncludeBlogScrape] = useState(false);
  // 📰 Bolt-in: rename news channels as part of Create Branding
  const [includeChannelRename, setIncludeChannelRename] = useState(false);
  const [channelRenameIndustry, setChannelRenameIndustry] = useState<string>("auto");
  const [blogUrl, setBlogUrl] = useState("");
  const [blogArticleCount, setBlogArticleCount] = useState(3);
  const [blogChannelId, setBlogChannelId] = useState(CREATE_NEW_CHANNEL_VALUE);
  const [blogNewChannelName, setBlogNewChannelName] = useState(DEFAULT_NEW_CHANNEL_NAME);

  /* 📈  Analytics / redirect toggles ---- */
  const [redirectOpen, setRedirectOpen] = useState(false);
  const {
    redirectState,
    handleToggleRedirect,
    handleNumberOfEmployeesChange,
    handleToggleGeneralOption,
    setAllowedDomains,
  } = useAnalyticsRedirects();

  /* ⚙️  Prospect / misc branding inputs ----------------------------------- */
  const [prospectName, setProspectName] = useState("");
  const [includeBranding, setIncludeBranding] = useState(true);
  const [updateThemeColors, setUpdateThemeColors] = useState(true);

  /* 🏗️  Environment setup toggles ---------------------------------------- */
  const [chatEnabled, setChatEnabled] = useState(false);
  const [microsoftEnabled, setMicrosoftEnabled] = useState(false);
  const [journeysEnabled, setJourneysEnabled] = useState(false);
  const [loggedInUserId, setLoggedInUserId] = useState<string | null>(null);
  const [campaignsEnabled, setCampaignsEnabled] = useState(false);
  const [customWidgetsChecked, setCustomWidgetsChecked] = useState(false);
  const [hrIntegrationChecked, setHrIntegrationChecked] = useState(false);
  const [mergeConfig, setMergeConfig] = useState({ field: '', email: '', password: '' });
  const [setupEmailChecked, setSetupEmailChecked] = useState(false);

  /* 📲  Launchpad & mobile quick links ------------------------------------ */
  const [launchpadSel, setLaunchpadSel] = useState<string[]>([]);
  const [isLaunchpadDropdownOpen, setIsLaunchpadDropdownOpen] = useState(false);
  const {
    mobileQuickLinks,
    quickLinksEnabled,
    setQuickLinksEnabled,
    handleQuickLinkChange,
    handleQuickLinkSwap,
    handleQuickLinkDelete,
    handleQuickLinkAdd,
  } = useQuickLinks(DEFAULT_QUICK_LINKS);

  /* 👥  User management ---------------------------------------------------- */
  const [usersList, setUsersList] = useState<UserItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userProfile, setUserProfile] = useState<Record<string, unknown> | null>(null);
  const {
    fieldsToUpdate,
    setFieldsToUpdate,
    handleFieldUpdate,
    handleAddField,
    handleRemoveField,
  } = useFieldUpdates();
  const [allProfileFields, setAllProfileFields] = useState<string[]>([]); // Holds slugs for user mgmt
  const [setupProfileFields, setSetupProfileFields] = useState<ProfileFieldSlugTitle[]>([]); // Holds {slug, title} for setup form
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const [userManagementView, setUserManagementView] = useState("selection");
  const [setupView, setSetupView] = useState("selection");
  // 🪧 Bolt-in: which sub-view of the "existing" (branding) mode is showing.
  // "branding" = the normal BrandingForm; "news-rename" = the channel-rename
  // wizard. Doesn't affect any other useOption.type.
  const [existingView, setExistingView] = useState<"branding" | "news-rename">("branding");
  const [tabValidation, setTabValidation] = useState<TabValidationState>({ status: 'idle', message: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageType, setImageType] = useState<"none" | "avatar" | "profileHeaderImage">("none");

  /* 🔄  UI / async status -------------------------------------------------- */
  const [isLoading, setIsLoading] = useState(false);
  const [isLoginAsUserLoading, setIsLoginAsUserLoading] = useState(false);
  const [response, setResponse] = useState("");

  /* 🌐  Browser-specific --------------------------------------------------- */
  const { isStaffbaseTab, tabUrl } = useStaffbaseTab(); // are we viewing a Staffbase page?

  /* 🌐  Progress tracking -------------------------------------------------- */
  const [automationRunning, setAutomationRunning] = useState(false);
  const [progressData, setProgressData] = useState<ProgressData>({
    tasksCompleted: 0,
    totalTasks: 0,
    currentUser: null,
    currentStatus: null,
    geminiTasksDone: 0,
  });

  /* 🎪 Demo config -------------------------------------------- */
  const [replifyId, setReplifyId] = useState<string | null>(null);
  const [isDetectingReplifyId, setIsDetectingReplifyId] = useState(false);
  const [demoVertical, setDemoVertical] = useState("");
  const [demoCompanySize, setDemoCompanySize] = useState(5000);
  const [isPlanningDemo, setIsPlanningDemo] = useState(false);

  const toSavedDemoArray = (demos: Record<string, unknown>[]): SavedDemo[] =>
    demos as unknown as SavedDemo[];

  const toGeminiBrandingData = (value: unknown): GeminiBrandingData | null => {
    if (!value || typeof value !== "object") return null;
    const data = value as Record<string, unknown>;
    return {
      prospectName: typeof data.prospectName === "string" ? data.prospectName : undefined,
      primaryColor: typeof data.primaryColor === "string" ? data.primaryColor : undefined,
      textColor: typeof data.textColor === "string" ? data.textColor : undefined,
      backgroundColor: typeof data.backgroundColor === "string" ? data.backgroundColor : undefined,
      floatingNavBgColor: typeof data.floatingNavBgColor === "string" ? data.floatingNavBgColor : undefined,
      floatingNavTextColor: typeof data.floatingNavTextColor === "string" ? data.floatingNavTextColor : undefined,
      logoUrl: typeof data.logoUrl === "string" ? data.logoUrl : undefined,
      bgUrl: typeof data.bgUrl === "string" ? data.bgUrl : undefined,
      bgVertical: typeof data.bgVertical === "number" ? data.bgVertical : undefined,
      headerTransparency: typeof data.headerTransparency === "number" ? data.headerTransparency : undefined,
      logoHeight: typeof data.logoHeight === "number" ? data.logoHeight : undefined,
      logoMarginTop: typeof data.logoMarginTop === "number" ? data.logoMarginTop : undefined,
      logoPadWidth: typeof data.logoPadWidth === "number" ? data.logoPadWidth : undefined,
      logoPadHeight: typeof data.logoPadHeight === "number" ? data.logoPadHeight : undefined,
    };
  };

  const selectedSlug = useOption?.slug ?? null;
  const whitelabeledDomains = useMemo(() => {
    const domains = savedTokens
      .map(t => (t.domain || "").trim().toLowerCase())
      .filter(d => d && d !== "app.staffbase.com");
    return Array.from(new Set(domains));
  }, [savedTokens]);

  useEffect(() => {
    setAllowedDomains(whitelabeledDomains);
  }, [whitelabeledDomains, setAllowedDomains]);

  useEffect(() => {
    if (useOption?.type === "select" && useOption?.token) {
      setIsDetectingReplifyId(true);
      const domain = useOption.domain || DEFAULT_DOMAIN;
      fetchCurrentCSS(useOption.token, domain)
        .then((css) => {
          const match = css.match(/\/\*\s*Replify ID:\s*(\S+)\s*\*\//);
          setReplifyId(match ? match[1] : null);
        })
        .catch(() => setReplifyId(null))
        .finally(() => setIsDetectingReplifyId(false));
    } else {
      setReplifyId(null);
      setIsDetectingReplifyId(false);
    }
  }, [useOption?.type, useOption?.token, useOption?.domain]);

  const updateApiDomain = (domain: string) => {
    const nextDomain = domain || DEFAULT_DOMAIN;
    apiDomainRef.current = nextDomain;
    setApiDomain(nextDomain);
  };

  const buildApiUrl = (path: string, domainOverride?: string) =>
    buildApiUrlHelper(path, domainOverride || apiDomainRef.current || DEFAULT_DOMAIN);

  const appendResponseLine = (line: string) => {
    if (!line) return;
    setResponse((prev) => (prev ? `${prev}\n${line}` : line));
  };

  const getDemoPreviewUrl = (domain = apiDomainRef.current, slug = useOption?.slug) => {
    const resolvedDomain = (domain || DEFAULT_DOMAIN).trim().toLowerCase();
    const resolvedSlug = (slug || "").trim().toLowerCase();

    if (resolvedSlug === "q1eira26" || resolvedDomain === "q1eira26.staffbase.com") {
      return `https://${resolvedDomain}/content/page/69ef3ccf44378e38d2e11171`;
    }

    return `https://${resolvedDomain}/content`;
  };

  const buildSimulatedMobilePreviewUrl = (previewUrl: string) => {
    const nextUrl = new URL(previewUrl);
    nextUrl.searchParams.set("replify_mobile_preview", "1");
    return nextUrl.toString();
  };

  const waitFor = (ms: number) =>
    new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });

  const injectMobilePreviewBanner = async (tabId: number) => {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        document.title = "Replify Simulated Mobile Preview";
        if (document.getElementById("replify-mobile-banner")) return;

        const banner = document.createElement("div");
        banner.id = "replify-mobile-banner";
        banner.style.cssText = [
          "position:fixed",
          "top:14px",
          "left:50%",
          "transform:translateX(-50%)",
          "background:#00A4FD",
          "color:#fff",
          "padding:7px 12px",
          "font-weight:600",
          "font-size:12px",
          "z-index:2147483647",
          "font-family:sans-serif",
          "border-radius:999px",
          "box-shadow:0 10px 24px rgba(0,0,0,0.18)",
          "text-align:center",
          "cursor:pointer",
          "user-select:none",
        ].join(";");
        banner.textContent = "Replify Simulated Mobile Preview";
        banner.title = "Click to hide";
        banner.addEventListener("click", () => banner.remove(), { once: true });
        document.documentElement.appendChild(banner);
      },
    });
  };

  const inspectMobilePreview = async (tabId: number): Promise<InspectMobilePreviewResult | null> => {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const root = document.documentElement;
        return {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          outerWidth: window.outerWidth,
          outerHeight: window.outerHeight,
          screenWidth: window.screen.width,
          screenHeight: window.screen.height,
          simMode: root.getAttribute("data-replify-mobile-sim") || "off",
          simUserAgent: root.getAttribute("data-replify-mobile-sim-user-agent") || "",
          simTouch: Number(root.getAttribute("data-replify-mobile-sim-touch") || "0"),
          simPointer: root.getAttribute("data-replify-mobile-sim-pointer") || "unknown",
          rootClassName: root.className,
          bodyClassName: document.body?.className || "",
          hasPhoneShell: !!document.getElementById("replify-mobile-sim-style"),
          hasBootstrapLoader: !!document.getElementById("replify-mobile-sim-bootstrap-loader"),
        };
      },
    });

    return (results?.[0]?.result as InspectMobilePreviewResult) || null;
  };

  const applyInlineMobilePreviewFallback = async (tabId: number) => {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if ((window as Window & { __replifyInlineMobilePreviewFallbackApplied?: boolean }).__replifyInlineMobilePreviewFallbackApplied) return;
        (window as Window & { __replifyInlineMobilePreviewFallbackApplied?: boolean }).__replifyInlineMobilePreviewFallbackApplied = true;

        const root = document.documentElement;
        const ROOT_REMOVE_CLASSES = ["desktop", "wide", "mouse", "mac"];
        const ROOT_ADD_CLASSES = ["mobile", "compact", "touch", "ios"];
        const BODY_REMOVE_CLASSES = ["using-mouse"];
        const BODY_ADD_CLASSES = ["using-touch"];

        const setPreviewAttributes = (mode = "inline-fallback") => {
          root.setAttribute("data-replify-mobile-sim", mode);
          root.setAttribute("data-replify-mobile-sim-touch", "5");
          root.setAttribute("data-replify-mobile-sim-pointer", "coarse");
          root.setAttribute("data-replify-mobile-sim-source", "popup-inline-fallback");
          root.setAttribute("data-replify-mobile-sim-root-classes", root.className);
        };

        const ensureViewportMeta = () => {
          let viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
          if (!viewport) {
            viewport = document.createElement("meta");
            viewport.name = "viewport";
            (document.head || document.documentElement).appendChild(viewport);
          }
          viewport.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
        };

        const ensureStyle = () => {
          if (document.getElementById("replify-mobile-sim-style")) return;

          const style = document.createElement("style");
          style.id = "replify-mobile-sim-style";
          style.textContent = `
            html[data-replify-mobile-sim] {
              --replify-phone-width: min(390px, calc(100vw - 44px));
              --replify-phone-height: min(844px, calc(100vh - 86px));
              --replify-phone-top-gap: 24px;
              --replify-phone-bottom-gap: 14px;
              --replify-phone-home-gap: 20px;
            }

            html[data-replify-mobile-sim],
            html[data-replify-mobile-sim] body {
              min-height: 100%;
              overflow-x: hidden !important;
              background:
                radial-gradient(circle at top, rgba(0, 164, 253, 0.18), transparent 44%),
                linear-gradient(180deg, #edf4f8 0%, #dfe8ee 100%) !important;
            }

            html[data-replify-mobile-sim] body {
              box-sizing: border-box;
              width: var(--replify-phone-width) !important;
              max-width: var(--replify-phone-width) !important;
              height: var(--replify-phone-height) !important;
              min-height: var(--replify-phone-height) !important;
              max-height: var(--replify-phone-height) !important;
              margin: var(--replify-phone-top-gap) auto var(--replify-phone-bottom-gap) !important;
              border: 10px solid #0f172a !important;
              border-radius: 34px !important;
              box-shadow:
                0 22px 54px rgba(15, 23, 42, 0.25),
                0 10px 22px rgba(15, 23, 42, 0.12) !important;
              background: #ffffff !important;
              position: relative !important;
              overflow-x: hidden !important;
              overflow-y: auto !important;
            }

            html[data-replify-mobile-sim] body::before {
              content: "";
              position: fixed;
              top: var(--replify-phone-top-gap);
              left: 50%;
              width: 118px;
              height: 24px;
              transform: translateX(-50%);
              border-radius: 0 0 16px 16px;
              background: #0f172a;
              z-index: 2147483645;
              pointer-events: none;
            }

            html[data-replify-mobile-sim] body::after {
              content: "";
              position: fixed;
              bottom: var(--replify-phone-home-gap);
              left: 50%;
              width: 132px;
              height: 5px;
              transform: translateX(-50%);
              border-radius: 999px;
              background: rgba(15, 23, 42, 0.35);
              z-index: 2147483645;
              pointer-events: none;
            }
          `;
          (document.head || document.documentElement).appendChild(style);
        };

        const enforceMobileClasses = () => {
          ROOT_REMOVE_CLASSES.forEach((className) => root.classList.remove(className));
          ROOT_ADD_CLASSES.forEach((className) => root.classList.add(className));

          if (document.body) {
            BODY_REMOVE_CLASSES.forEach((className) => document.body.classList.remove(className));
            BODY_ADD_CLASSES.forEach((className) => document.body.classList.add(className));
          }

          root.setAttribute("data-replify-mobile-sim-root-classes", root.className);
        };

        const injectPageBootstrap = () => {
          if (document.getElementById("replify-mobile-sim-bootstrap-loader")) return;
          const _chrome = (globalThis as Record<string, unknown>).chrome as typeof chrome | undefined;
          if (!_chrome?.runtime?.getURL) return;

          const script = document.createElement("script");
          script.id = "replify-mobile-sim-bootstrap-loader";
          script.src = _chrome.runtime.getURL("content/mobilePreviewPage.js");
          script.async = false;
          script.addEventListener("load", () => script.remove(), { once: true });
          script.addEventListener("error", () => script.remove(), { once: true });
          (document.head || document.documentElement).appendChild(script);
        };

        const apply = (mode = "inline-fallback") => {
          ensureViewportMeta();
          ensureStyle();
          enforceMobileClasses();
          setPreviewAttributes(mode);
          injectPageBootstrap();
        };

        apply();

        const observer = new MutationObserver(() => {
          apply(root.getAttribute("data-replify-mobile-sim") || "inline-fallback");
        });

        observer.observe(document.documentElement, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["class"],
        });
      },
    });
  };

  const ensureMobilePreviewSimulation = async (tabId: number, onLog?: (msg: string) => void) => {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content/mobilePreview.js"],
      });
      onLog?.("Injected mobile preview shim into popup tab.");
    } catch (error) {
      console.warn("[Replify] Mobile preview shim injection failed:", error);
      onLog?.(`⚠️ Could not inject mobile preview shim: ${error instanceof Error ? error.message : String(error)}`);
    }

    await waitFor(150);
    let metrics = await inspectMobilePreview(tabId);

    const shimMissing =
      !metrics ||
      metrics.simMode === "off" ||
      !metrics.hasPhoneShell ||
      !/\bmobile\b/.test(metrics.rootClassName || "") ||
      /\bdesktop\b/.test(metrics.rootClassName || "");

    if (shimMissing) {
      await applyInlineMobilePreviewFallback(tabId);
      onLog?.("Applied inline mobile preview fallback.");
      await waitFor(150);
      metrics = await inspectMobilePreview(tabId);
    }

    return metrics;
  };

  const openDemoPreview = async ({
    domain = apiDomainRef.current,
    slug = useOption?.slug,
    useCases = [] as string[],
    onLog,
  }: { domain?: string; slug?: string; useCases?: string[]; onLog?: (msg: string) => void } = {}) => {
    const previewUrl = getDemoPreviewUrl(domain, slug);
    const mobilePreviewUrl = buildSimulatedMobilePreviewUrl(previewUrl);

    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (currentTab?.id) {
      await chrome.tabs.update(currentTab.id, { url: previewUrl });
      onLog?.(`Desktop preview -> ${previewUrl}`);
    }

    if (!useCases.includes("shift-viewing")) {
      return { previewUrl, openedMobilePreview: false, simulationApplied: false };
    }

    const mobileWin = await chrome.windows.create({
      url: mobilePreviewUrl,
      type: "popup",
      width: 430,
      height: 932,
    });

    const mobileTabId = mobileWin.tabs?.[0]?.id;
    if (!mobileTabId) {
      throw new Error("Mobile preview window opened without a tab ID.");
    }

    const bannerListener = async (tabId: number, info: { status?: string }) => {
      if (tabId !== mobileTabId || info.status !== "complete") return;
      chrome.tabs.onUpdated.removeListener(bannerListener);
      try {
        const metrics = await ensureMobilePreviewSimulation(mobileTabId, onLog);
        await injectMobilePreviewBanner(mobileTabId);
        if (metrics) {
          const mobileUa = /iphone|mobile/i.test(metrics.simUserAgent);
          const looksMobile =
            !/\bdesktop\b/.test(metrics.rootClassName || "") &&
            /\bmobile\b/.test(metrics.rootClassName || "") &&
            (metrics.simTouch > 0 || metrics.simPointer === "coarse" || mobileUa);
          const summary =
            `Simulated mobile preview metrics: ${metrics.innerWidth}x${metrics.innerHeight}, ` +
            `sim=${metrics.simMode}, UA mobile=${mobileUa}, touch=${metrics.simTouch}, pointer=${metrics.simPointer}, ` +
            `root="${metrics.rootClassName}", body="${metrics.bodyClassName}"`;
          console.info("[Replify] " + summary, metrics);
          onLog?.(looksMobile ? `✅ ${summary}` : `⚠️ ${summary}`);
        }
      } catch (error) {
        console.warn("[Replify] Mobile preview banner injection failed:", error);
        onLog?.(`⚠️ Mobile preview verification failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    chrome.tabs.onUpdated.addListener(bannerListener);

    return { previewUrl, openedMobilePreview: true, simulationApplied: true };
  };

  const unpublishArticle = async (articleId: string, onLog?: (msg: string) => void) => {
    const basicToken = apiToken.trim();
    const jsonHeaders = {
      Authorization: `Basic ${basicToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    };
    const formHeaders = {
      Authorization: `Basic ${basicToken}`,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    };
    const basicAttempts = [
      {
        label: "POST /api/posts/:id/unpublish",
        run: () =>
          fetch(buildApiUrl(`/api/posts/${articleId}/unpublish`), {
            method: "POST",
            headers: formHeaders,
            credentials: "omit",
            body: "",
          }),
      },
      {
        label: "POST /api/articles/:id/unpublish",
        run: () =>
          fetch(buildApiUrl(`/api/articles/${articleId}/unpublish`), {
            method: "POST",
            headers: formHeaders,
            credentials: "omit",
            body: "",
          }),
      },
      {
        label: "DELETE /api/posts/:id/publish",
        run: () =>
          fetch(buildApiUrl(`/api/posts/${articleId}/publish`), {
            method: "DELETE",
            headers: formHeaders,
            credentials: "omit",
            body: "",
          }),
      },
      {
        label: "DELETE /api/articles/:id/publish",
        run: () =>
          fetch(buildApiUrl(`/api/articles/${articleId}/publish`), {
            method: "DELETE",
            headers: formHeaders,
            credentials: "omit",
            body: "",
          }),
      },
      {
        label: "PATCH /api/posts/:id",
        run: () =>
          fetch(buildApiUrl(`/api/posts/${articleId}`), {
            method: "PATCH",
            headers: jsonHeaders,
            credentials: "omit",
            body: JSON.stringify({
              published: false,
              notificationChannels: [],
            }),
          }),
      },
      {
        label: "PATCH /api/articles/:id",
        run: () =>
          fetch(buildApiUrl(`/api/articles/${articleId}`), {
            method: "PATCH",
            headers: jsonHeaders,
            credentials: "omit",
            body: JSON.stringify({
              published: false,
              contents: { en_US: { primaryMediaAltText: null, video: null } },
              notificationChannels: [],
            }),
          }),
      },
    ];

    const errors = [];

    for (const attempt of basicAttempts) {
      try {
        const response = await attempt.run();
        if (response.ok) {
          onLog?.(`Article ${articleId}: ${attempt.label} -> ${response.status}`);
          return { articleId, ok: true, method: attempt.label };
        }
        const text = await response.text().catch(() => "");
        onLog?.(`Article ${articleId}: ${attempt.label} -> ${response.status}${text ? ` ${text.slice(0, 120)}` : ""}`);
        errors.push(`${attempt.label} -> ${response.status}${text ? ` ${text.slice(0, 120)}` : ""}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onLog?.(`Article ${articleId}: ${attempt.label} -> ${msg}`);
        errors.push(`${attempt.label} -> ${msg}`);
      }
    }

    try {
      const pageResult = await runInPageContext({
        func: async (id, domain) => {
          const fetchText = async (response: Response) => {
            try {
              return await response.text();
            } catch {
              return "";
            }
          };

          try {
            const discover = await fetch(`https://${domain}/auth/discover`, {
              headers: { Accept: "application/vnd.staffbase.auth.discovery.v2+json" },
              credentials: "include",
            });
            const discovered = discover.ok ? await discover.json() : null;
            const csrfToken =
              discovered?.csrfToken ||
              document.querySelector<HTMLMetaElement>('meta[name="x-csrf-token"]')?.content ||
              "";

            const formHeaders = {
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
            };
            const jsonHeaders = {
              "Content-Type": "application/json; charset=UTF-8",
              ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
            };
            const attempts = [
              {
                label: "POST /api/posts/:id/unpublish",
                url: `https://${domain}/api/posts/${id}/unpublish`,
                method: "POST",
                headers: formHeaders,
                body: "",
              },
              {
                label: "POST /api/articles/:id/unpublish",
                url: `https://${domain}/api/articles/${id}/unpublish`,
                method: "POST",
                headers: formHeaders,
                body: "",
              },
              {
                label: "DELETE /api/posts/:id/publish",
                url: `https://${domain}/api/posts/${id}/publish`,
                method: "DELETE",
                headers: formHeaders,
                body: "",
              },
              {
                label: "DELETE /api/articles/:id/publish",
                url: `https://${domain}/api/articles/${id}/publish`,
                method: "DELETE",
                headers: formHeaders,
                body: "",
              },
              {
                label: "PATCH /api/posts/:id",
                url: `https://${domain}/api/posts/${id}`,
                method: "PATCH",
                headers: jsonHeaders,
                body: JSON.stringify({ published: false, notificationChannels: [] }),
              },
              {
                label: "PATCH /api/articles/:id",
                url: `https://${domain}/api/articles/${id}`,
                method: "PATCH",
                headers: jsonHeaders,
                body: JSON.stringify({
                  published: false,
                  contents: { en_US: { primaryMediaAltText: null, video: null } },
                  notificationChannels: [],
                }),
              },
            ];

            const failures = [];
            for (const attempt of attempts) {
              const response = await fetch(attempt.url, {
                method: attempt.method,
                headers: attempt.headers,
                credentials: "include",
                body: attempt.body,
              });
              if (response.ok) {
                return { ok: true, method: attempt.label };
              }
              const text = await fetchText(response);
              failures.push(`${attempt.label} -> ${response.status}${text ? ` ${text.slice(0, 120)}` : ""}`);
            }

            return { ok: false, errors: failures };
          } catch (error) {
            return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
          }
        },
        args: [articleId, apiDomainRef.current],
      });

      const pr = pageResult as { ok?: boolean; method?: string; errors?: string[] } | null;
      if (pr?.ok) {
        onLog?.(`Article ${articleId}: page context ${pr.method}`);
        return { articleId, ok: true, method: `page context ${pr.method}` };
      }

      if (pr?.errors?.length) {
        pr.errors.forEach((errorLine: string) => onLog?.(`Article ${articleId}: ${errorLine}`));
        errors.push(...pr.errors);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      onLog?.(`Article ${articleId}: page context -> ${msg}`);
      errors.push(`page context -> ${msg}`);
    }

    return {
      articleId,
      ok: false,
      error: errors[0] || "All unpublish attempts failed.",
      attempts: errors,
    };
  };

  // New handler to clear AI results when user starts typing a new prospect
  const handleProspectNameChange = (name: string) => {
    setProspectName(name);
    // Clear previous AI results to avoid confusion
    if (prospectNews) {
      setProspectNews("");
    }
    if (fetchedBranding) {
      setFetchedBranding(null);
    }
    if (newsSources.length) {
      setNewsSources([]);
    }
  };

  const fetchProspectSuggestions = async (query: string) => {
    if (query.length < 3) {
      setProspectSuggestions([]);
      return;
    }
    try {
      const url = new URL(`https://api.brandfetch.io/v2/search/${query}`);
      // The client ID 'c' is a public key for non-commercial use.
      url.searchParams.set('c', "1idl5t4I4YVu9p2ItXa");

      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) {
        setProspectSuggestions([]);
        return;
      }
      const data = await response.json();
      // Filter out any results without a name and take the top 5
      setProspectSuggestions((data || []).filter((item: ProspectSuggestion) => item.name).slice(0, 5));
    } catch (error) {
      console.error("Brandfetch search failed:", error);
      setProspectSuggestions([]);
    }
  };

  const handleSuggestionSelected = (name: string) => {
    setProspectName(name);
    setProspectSuggestions([]); // Hide suggestions
    // handleFetchIntelligence(name); // REMOVED: Intelligence fetch is now only triggered by the sparkle button.
  };

  const handleFetchIntelligence = async () => {
    if (prospectName && prospectName.trim().length >= 3) {
      setIsFetchingNews(true);
      setProspectNews(""); // Clear old news
      setFetchedBranding(null);
      setNewsSources([]);
      setProspectSuggestions([]); // Hide suggestions
      try {
        const intelligence = await fetchProspectIntelligence(prospectName, { apiToken, apiDomain: apiDomainRef.current });
        setProspectNews(intelligence.news || "");
        setFetchedBranding({
          logoUrl: intelligence.logoUrl || "",
          primaryColor: intelligence.primaryColor || "",
          textColor: intelligence.textColor || "",
          backgroundColor: intelligence.backgroundColor || "",
        });
        setNewsSources(intelligence.sources || []);
      } catch (error) {
        console.error("Failed to fetch prospect news:", error);
        setProspectNews(`Could not fetch intelligence: ${error instanceof Error ? error.message : String(error)}`);
        setFetchedBranding(null);
        setNewsSources([]);
      } finally {
        setIsFetchingNews(false);
      }
    }
  };

  const handleApplyFetchedBranding = () => {
    if (!fetchedBranding) return;
    setLogoUrl(fetchedBranding.logoUrl || "");
    setPrimaryColor(normalizeHex(fetchedBranding.primaryColor, "#000000"));
    setTextColor(normalizeHex(fetchedBranding.textColor, "#ffffff"));
    setBackgroundColor(normalizeHex(fetchedBranding.backgroundColor, "#F3F3F3"));
  };

  const handlePlanDemoWithGemini = async () => {
    if (!prospectName || prospectName.trim().length < 2) return;
    setIsPlanningDemo(true);
    setProspectSuggestions([]);
    try {
      const plan = await fetchDemoPlan(prospectName, { apiToken, apiDomain: apiDomainRef.current });

      if (plan.primaryColor) setPrimaryColor(normalizeHex(plan.primaryColor, primaryColor));
      if (plan.textColor) setTextColor(normalizeHex(plan.textColor, textColor));
      if (plan.backgroundColor) setBackgroundColor(normalizeHex(plan.backgroundColor, backgroundColor));
      if (plan.logoUrl) setLogoUrl(plan.logoUrl);
      if (plan.vertical) setDemoVertical(plan.vertical);
      if (plan.companySize) {
        setDemoCompanySize(plan.companySize);
        handleNumberOfEmployeesChange(String(plan.companySize));
      }
      if (plan.blogUrl) {
        setBlogUrl(plan.blogUrl);
        setIncludeBlogScrape(true);
        setIncludeArticles(true);
      }
      if (plan.aiTopics) setAiArticleTopics(plan.aiTopics);
    } catch (err) {
      setResponse(`❌ Gemini planning failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsPlanningDemo(false);
    }
  };

  useEffect(() => {
    // Only fetch if we're authenticated for an existing environment
    if (useOption?.type === "existing" && apiToken) {
      const fetchGroups = async () => {
        try {
          const response = await fetch(buildApiUrl("/api/branch/groups"), {
            headers: { Authorization: `Basic ${apiToken}` },
          });
          if (!response.ok) {
            console.error(`Failed to fetch groups: ${response.statusText}`);
            setAllGroups([]); // Set to empty array on failure
            return;
          }
          const result = await response.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const processedData: GroupItem[] = (result.data as any[])
            .map((group) => ({
              id: group.id as string,
              name: (group.config?.localization?.en_US?.title || group.name) as string,
            }))
            .sort((a: GroupItem, b: GroupItem) => a.name.localeCompare(b.name));
          setAllGroups(processedData);
        } catch (error) {
          console.error(error);
          setAllGroups([]);
        }
      };
      fetchGroups();
    }
  }, [useOption, apiToken]); // Re-run when these change



  // --------------------------------------------------
  //    Message Listeners and other simple effects
  // --------------------------------------------------
  useEffect(() => {
    const messageListener = (message: Record<string, unknown>) => {
      if (message.type === "automationProgress") {
        const payload = message.payload as { tasksCompleted: number; totalTasks: number; user?: string; status?: string };
        setProgressData((prev) => ({
          tasksCompleted: payload.tasksCompleted + (prev.geminiTasksDone ?? 0),
          totalTasks: payload.totalTasks + (prev.geminiTasksDone ?? 0),
          currentUser: payload.user || prev.currentUser,
          currentStatus: payload.status || prev.currentStatus,
          geminiTasksDone: prev.geminiTasksDone,
        }));
      } else if (message.type === "automationComplete") {
        setAutomationRunning(false);
        setResponse("✅ Automation has finished!");
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, []);

  // Load admin mode state from local storage on initial load
  useEffect(() => {
    const adminState = localStorage.getItem('replifyAdminMode') === 'true';
    setIsAdminMode(adminState);
  }, []);

  useEffect(() => {
    const shouldFetchChannels = includeLinkedIn || includeAiArticles || includeBlogScrape;
    if (!shouldFetchChannels || !apiToken || !branchId) return;

    const fetchNewsChannels = async () => {
      try {
        const token = apiToken.trim();
        const rawChannels = [];
        let cursor = null;
        let pageGuard = 0;

        while (pageGuard < 25) {
          const params = new URLSearchParams({
            limit: "100",
            sort: "priority_ASC",
            contentType: "articles",
          });
          if (cursor) params.set("cursor", cursor);

          const res = await fetch(
            buildApiUrl(`/api/branch/channels?${params.toString()}`),
            {
              headers: { Authorization: `Basic ${token}` },
              credentials: "omit",
            }
          );
          if (!res.ok) return;

          const data = await res.json();
          const pageItems = Array.isArray(data?.data) ? data.data : [];
          rawChannels.push(...pageItems);

          cursor = data?.cursor || null;
          if (!cursor || pageItems.length === 0) break;
          pageGuard += 1;
        }

        const channels = rawChannels
          .filter((c) => !c?.contentType || c.contentType === "articles")
          .map((c) => ({
            id: c.id,
            title:
              c.config?.localization?.en_US?.title ||
              c.localization?.en_US?.title ||
              c.title ||
              c.name ||
              c.id,
          }))
          .filter((c) => !!c.id);

        const dedupedChannels = Array.from(
          new Map(channels.map((c) => [c.id, c])).values()
        );
        setLinkedinChannels(dedupedChannels);

        const topNews = dedupedChannels.find((c) => c.title.toLowerCase().includes("top news"));
        const validChannelIds = new Set(dedupedChannels.map((c) => c.id));
        const defaultChannelId = topNews?.id || CREATE_NEW_CHANNEL_VALUE;

        const keepOrDefault = (currentId: string) => {
          if (!currentId || currentId === CREATE_NEW_CHANNEL_VALUE) return defaultChannelId;
          if (!validChannelIds.has(currentId)) return defaultChannelId;
          return currentId;
        };

        setLinkedinChannelId((prev) => keepOrDefault(prev));
        setAiChannelId((prev) => keepOrDefault(prev));
        setBlogChannelId((prev) => keepOrDefault(prev));
      } catch { /* intentional */ }
    };

    fetchNewsChannels();
  }, [includeLinkedIn, includeAiArticles, includeBlogScrape, apiToken, branchId]);

  useEffect(() => {
    if (!apiToken) return;
    const fetchLocales = async () => {
      try {
        const res = await fetch(buildApiUrl("/api/branch"), {
          headers: { Authorization: `Basic ${apiToken.trim()}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const locales = data.config?.availableLocales;
        if (Array.isArray(locales) && locales.length > 0) {
          setAvailableLocales(locales);
        }
      } catch { /* intentional */ }
    };
    fetchLocales();
  }, [apiToken]);

  const toggleAdminMode = () => {
    if (isAdminMode) {
      localStorage.setItem('replifyAdminMode', 'false');
      setIsAdminMode(false);
      setIsGeminiOpen(false);
      setResponse("🥷 Admin mode disabled.");
    } else {
      const password = prompt("Enter admin password:");
      if (password === "adminsecretpassword") {
        localStorage.setItem('replifyAdminMode', 'true');
        setIsAdminMode(true);
        setResponse("🥷 Admin mode enabled.");
      } else if (password) { // only alert if they entered something
        alert("Incorrect password.");
      }
    }
  };

  // Fetch the full profile for a single selected user.
  useEffect(() => {
    if (!selectedUserId || !apiToken) {
      setUserProfile(null);
      return;
    }
    const fetchUserProfile = async () => {
      setIsLoading(true);
      setResponse(`Fetching profile for user ${selectedUserId}...`);
      try {
        const response = await fetch(
          buildApiUrl(`/api/users/${selectedUserId}`),
          {
            headers: { Authorization: `Basic ${apiToken}` },
          }
        );
        if (!response.ok)
          throw new Error(`Failed to fetch profile: ${response.statusText}`);

        const data = await response.json();
        setUserProfile(data);

        setResponse("✅ Profile loaded. Select a field to update.");
      } catch (err) {
        setResponse(`❌ ${err instanceof Error ? err.message : String(err)}`);
        setUserProfile(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserProfile();
  }, [selectedUserId, apiToken]);

  const handleLoginAsUser = async () => {
    if (!selectedUserId) {
      setResponse("⚠️ Please select a user to log in as.");
      return;
    }
    if (!isStaffbaseTab) {
      setResponse("❌ This action can only be run on a Staffbase tab.");
      return;
    }

    const userToLogin = usersList.find((user) => user.id === selectedUserId);
    const identifier =
      userToLogin?.emails?.find((e) => e.primary)?.value ||
      userToLogin?.emails?.[0]?.value;

    if (!identifier) {
      setResponse(
        `❌ Could not find a primary email for user ID ${selectedUserId}.`
      );
      return;
    }

    setResponse(`Attempting to log in as ${identifier}...`);
    setIsLoading(true);
    setIsLoginAsUserLoading(true);

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      setResponse(`Fetching credentials for ${identifier}...`);
      const sharedDemoPassword = await fetchSharedDemoPassword({
        apiToken,
        apiDomain: apiDomainRef.current,
        slug: useOption?.slug,
      });
      setResponse(`Injecting login script for ${identifier}...`);

      const scriptToInject = (userIdentifier: string, password: string) => {
        const loginAndReload = async () => {
          try {
            const loginResponse = await fetch("/api/sessions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                identifier: userIdentifier,
                secret: password,
                locale: "en_US",
              }),
            });

            if (!loginResponse.ok) {
              const errorData = await loginResponse.json();
              throw new Error(
                `Login API failed with status ${loginResponse.status}: ${
                  errorData.message || "Unknown error"
                }`
              );
            }
            alert(
              `Successfully logged in as ${userIdentifier}. The page will now reload.`
            );
            window.location.reload();
          } catch (error) {
            console.error("Inject: Login script failed.", error);
            alert(
              `Failed to log in as ${userIdentifier}. See console for details. Error: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        };
        loginAndReload();
      };

      await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: scriptToInject as unknown as (...args: unknown[]) => unknown,
        args: [identifier, sharedDemoPassword],
      });

      setResponse(`✅ Login script injected for ${identifier}. Check the tab.`);
    } catch (err) {
      setResponse(`❌ Script injection failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoginAsUserLoading(false);
      setIsLoading(false);
    }
  };
  
    /**
   * Handles all profile updates: text fields, images, or both together.
   */
    const handleProfileUpdate = async () => {
      if (!selectedUserId || !adminUserId) {
        setResponse("⚠️ Please select a user. Admin ID is also required.");
        return;
      }
    if (!fieldsToUpdate.some(f => f.field && f.value) && (!selectedFile || imageType === "none")) {
        setResponse(
          "⚠️ Nothing to update. Select a field or choose an image and type (Avatar/Banner)."
        );
        return;
      }
      setIsLoading(true);
      setResponse("Processing update...");
  
      try {
        let profileChanges: Record<string, unknown> = {};

        if (selectedFile && imageType !== "none") {
          setResponse("Uploading image...");
          const mediaMeta = JSON.stringify({
            type: "image",
            fileName: selectedFile.name,
          });
          const uploadResponse = await fetch(
            buildApiUrl("/api/media"),
            {
              method: "POST",
              headers: {
                Authorization: `Basic ${apiToken}`,
                "Content-Type": selectedFile.type,
                "staffbase-media-meta": mediaMeta,
              },
              body: selectedFile,
            }
          );
  
          if (!uploadResponse.ok)
            throw new Error(`Media upload failed: ${uploadResponse.statusText}`);

          const { id: rawFileId } = await uploadResponse.json();
          if (!rawFileId) throw new Error("Media API did not return an ID.");

          const fileIdWithExt = `${rawFileId}.jpg`;
          profileChanges[imageType] = buildImagePayload(fileIdWithExt, apiDomain);
        }
  
        // Process multiple fields
        fieldsToUpdate.forEach(item => {
          if (item.field && item.value) {
            profileChanges[item.field] = item.value;
          }
        });

        setResponse("Updating user profile...");
        const finalBody = { profile: profileChanges };

        const updateUserResponse = await fetch(
          buildApiUrl(`/api/users/${selectedUserId}`),
          {
            method: "PUT",
            mode: "cors",
            credentials: "omit",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Basic ${apiToken}`,
              USERID: adminUserId,
            },
            body: JSON.stringify(finalBody),
          }
        );
  
        if (!updateUserResponse.ok) {
          const errorData = await updateUserResponse.json();
          throw new Error(
            `User update failed: ${
              errorData.message || updateUserResponse.statusText
            }`
          );
        }
        const updatedUserData = await updateUserResponse.json();
        setResponse(`✅ Profile updated successfully!`);
        setUserProfile(updatedUserData);
  
        setFieldsToUpdate([{ field: "", value: "" }]); // Reset fields
        setSelectedFile(null);
        setImageType("none");
      } catch (err) {
        setResponse(`❌ Update Failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsLoading(false);
      }
    };


  interface AppRunOptions {
    surveys?: boolean;
    forms?: boolean;
    reactions?: boolean;
    comments?: boolean;
    chats?: boolean;
    useAI?: boolean;
    selectedSurveyIds?: string[];
    selectedForms?: { id: string; name: string; version?: number }[];
    selectedPostIds?: string[];
    prospectName?: string;
    language?: string | null;
    locales?: string[];
    chatMode?: string;
    chatCount?: number;
    preGeneratedComments?: Record<string, unknown>;
    preGeneratedSurveyAnswers?: Record<string, unknown[]>;
    preGeneratedChatPairs?: unknown[];
    preGeneratedFormAnswers?: Record<string, unknown[]>;
  }

    const handleRunAutomation = async (selectedUserIds: string[], automationOptions: AppRunOptions) => {
      if (selectedUserIds.length === 0) {
        setResponse("⚠️ Please select at least one user.");
        return;
      }
      setAutomationRunning(true);
      setIsLoading(false);

      const selectedUsers = usersList.filter((user) =>
        selectedUserIds.includes(user.id)
      );
      if (selectedUsers.length === 0) {
        setResponse("❌ Error: Could not find user data for the current selection.");
        setIsLoading(false);
        return;
      }

      try {
        const runOptions: AppRunOptions = { ...automationOptions };

        // ── Count how many Gemini calls we'll make ──
        const numPostCalls   = ((runOptions.comments && runOptions.useAI && (runOptions.selectedPostIds?.length ?? 0) > 0)) ? (runOptions.selectedPostIds?.length ?? 0) : 0;
        const numSurveyCalls = ((runOptions.surveys && runOptions.useAI && (runOptions.selectedSurveyIds?.length ?? 0) > 0)) ? (runOptions.selectedSurveyIds?.length ?? 0) : 0;
        const numChatCall    = (runOptions.chats && runOptions.useAI && runOptions.prospectName) ? 1 : 0;
        const numFormCalls   = ((runOptions.forms && runOptions.useAI && (runOptions.selectedForms?.length ?? 0) > 0)) ? (runOptions.selectedForms?.length ?? 0) : 0;
        const totalGeminiTasks = numPostCalls + numSurveyCalls + numChatCall + numFormCalls;
        // Automation tasks per user (rough count — runner will send real totals later)
        const automationTasksPerUser = selectedUsers.length;
        const totalTasks = totalGeminiTasks + automationTasksPerUser;

        let geminiDone = 0;
        const tickGemini = (label: string) => {
          geminiDone++;
          setProgressData(prev => ({
            ...prev,
            tasksCompleted: geminiDone,
            geminiTasksDone: geminiDone,
            currentStatus: label,
          }));
        };

        setProgressData({
          tasksCompleted: 0,
          totalTasks,
          currentUser: null,
          currentStatus: "🌐 Opening automation tab…",
          geminiTasksDone: 0,
        });

        // ── 1. Open the new tab first ──
        const sharedDemoPassword = await fetchSharedDemoPassword({
          apiToken,
          apiDomain: apiDomainRef.current,
          slug: useOption?.slug,
        });

        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const origin = new URL(currentTab.url ?? '').origin;
        const rootUrl = `${origin}/`;
        const newTab = await chrome.tabs.create({ url: rootUrl, active: true });
        await chrome.tabs.update(newTab.id!, { autoDiscardable: false } as { url?: string });

        // Wait for the tab to finish loading before running Gemini calls
        await new Promise<void>((resolve) => {
          const tabListener = (tabId: number, changeInfo: { status?: string }) => {
            if (tabId === newTab.id && changeInfo.status === "complete") {
              chrome.tabs.onUpdated.removeListener(tabListener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(tabListener);
        });

        setProgressData(prev => ({ ...prev, currentStatus: "🤖 Preparing AI content…" }));

        // ── 2. Gemini pre-generation ──

        if (numPostCalls > 0) {
          runOptions.preGeneratedComments = {};
          try {
            const postsResponse = await fetch(
              buildApiUrlHelper("/api/posts?limit=20&sort=published_DESC&publicationState=published", apiDomain),
              { headers: { Authorization: `Basic ${apiToken}` } }
            );
            if (!postsResponse.ok) throw new Error(`Failed to load posts (${postsResponse.status})`);
            const { data } = await postsResponse.json();
            const selectedPosts = (data || []).filter((post: { id: string; contents?: { en_US?: { title?: string } } }) => runOptions.selectedPostIds?.includes(post.id));

            for (const post of selectedPosts) {
              try {
                tickGemini(`🤖 Generating AI comments for "${post.contents?.en_US?.title || post.id}"…`);
                const commentBank = await generatePostComments({
                  post,
                  userCount: selectedUsers.length,
                  prospectName: runOptions.prospectName,
                  language: runOptions.language || undefined,
                  apiToken,
                  apiDomain,
                });
                runOptions.preGeneratedComments[post.id] = commentBank;
              } catch (error) {
                console.error("Failed to generate AI comments for post", post.id, error);
              }
            }
          } catch (error) {
            console.error("AI comment pre-generation failed:", error);
          }
        }

        if (numSurveyCalls > 0) {
          runOptions.preGeneratedSurveyAnswers = {};
          for (const surveyId of (runOptions.selectedSurveyIds ?? [])) {
            try {
              tickGemini(`🤖 Generating AI responses for survey ${surveyId}…`);
              const qRes = await fetch(
                buildApiUrlHelper(`/api/surveys/installations/${surveyId}/questions`, apiDomain),
                { headers: { Authorization: `Basic ${apiToken}` } }
              );
              if (!qRes.ok) { console.warn(`Could not fetch questions for survey ${surveyId}`); continue; }
              const qData = await qRes.json();
              const questions = qData.questions || qData;
              if (!Array.isArray(questions) || questions.length === 0) continue;
              runOptions.preGeneratedSurveyAnswers[surveyId] = await generateBulkSurveyAnswers({
                questions,
                userCount: selectedUsers.length,
                surveyTitle: surveyId,
                prospectName: runOptions.prospectName,
                language: runOptions.language || undefined,
                apiToken,
                apiDomain,
              });
            } catch (err) {
              console.error(`Failed to pre-generate answers for survey ${surveyId}:`, err);
            }
          }
        }

        if (numChatCall > 0) {
          try {
            tickGemini('🤖 Generating AI chat pairs…');
            runOptions.preGeneratedChatPairs = await generateChatPairs({
              prospectName: runOptions.prospectName,
              count: selectedUsers.length,
              language: runOptions.language || undefined,
              apiToken,
              apiDomain,
            });
          } catch (error) {
            console.error("AI chat pre-generation failed:", error);
          }
        }

        if (numFormCalls > 0) {
          runOptions.preGeneratedFormAnswers = {};
          try {
            // Fetch schemas from the newly opened tab (it's logged in via cookie)
            const fetchFormSchemas = async (formIds: string[]) => {
                const schemas: Record<string, unknown> = {};
                for (const formId of formIds) {
                  try {
                    const res = await fetch(`/plugins/forms/${formId}?eyoAction=getSchemaPrivacyExposed`, {
                      headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    });
                    if (res.ok) schemas[formId] = await res.json();
                  } catch { /* intentional */ }
                }
                return schemas;
            };
            const schemaResults = await chrome.scripting.executeScript({
              target: { tabId: newTab.id! },
              func: fetchFormSchemas as unknown as (...args: unknown[]) => unknown,
              args: [(runOptions.selectedForms ?? []).map((f: { id: string; name: string }) => f.id)],
            });
            const formSchemas = (schemaResults[0]?.result as Record<string, { version_no?: number }>) || {};
            runOptions.selectedForms = (runOptions.selectedForms ?? []).map((f: { id: string; name: string; version?: number }) => ({
              ...f,
              version: formSchemas[f.id]?.version_no ?? 1,
            }));

            for (const form of (runOptions.selectedForms ?? [])) {
              const schema = formSchemas[form.id];
              if (!schema) { console.warn(`No schema for form ${form.id}`); continue; }
              try {
                tickGemini(`🤖 Generating AI form responses for "${form.name}"…`);
                runOptions.preGeneratedFormAnswers[form.id] = await generateFormAnswers({
                  schema: schema as Parameters<typeof generateFormAnswers>[0]['schema'],
                  userCount: selectedUsers.length,
                  formTitle: form.name,
                  prospectName: runOptions.prospectName,
                  language: runOptions.language || undefined,
                  apiToken,
                  apiDomain,
                });
              } catch (err) {
                console.error(`Failed to generate answers for form ${form.id}:`, err);
              }
            }
          } catch (error) {
            console.error("AI form pre-generation failed:", error);
          }
        }

        // ── 3. Inject automation script into the already-open tab ──
        setProgressData(prev => ({ ...prev, currentStatus: '⟳ Injecting automation script…' }));
        chrome.scripting.executeScript({
          target: { tabId: newTab.id! },
          func: automationScript as unknown as (...args: unknown[]) => unknown,
          args: [selectedUsers, apiToken, adminUserId, runOptions, getGeminiProxyUrl(), apiDomainRef.current, sharedDemoPassword],
        });
        setProgressData(prev => ({ ...prev, currentStatus: '✅ Script running in new tab…' }));

      } catch (err) {
        setResponse(`❌ Automation failed: ${err instanceof Error ? err.message : String(err)}`);
        setIsLoading(false);
        setAutomationRunning(false);
      }
    };

    const hasArticles = includeLinkedIn || includeAiArticles || includeBlogScrape;
    const getCreateLabel = () => {
      if (includeBranding && hasArticles) return "Create Branding and News";
      if (includeBranding) return "Create Branding";
      if (hasArticles) return "Create News";
      return "Nothing to create";
    };
  
    /* ──────────────────────────────────────────────────────────────
      BRANDING  (delete, preview on/off)
      ────────────────────────────────────────────────────────────── */
  
    /** Remove the entire Replify comment-block from the Staffbase CSS. */
  
    async function deleteBranding(options: { quiet?: boolean } = {}) {
      const { quiet = false } = options;
      if (!quiet) {
        setIsLoading(true);
        setResponse("Deleting branding...");
      }
      try {
        // Fetch current CSS to clean it for the legacy endpoint
        const css = await fetchCurrentCSS(apiToken, apiDomain);
        const cleanedCss = css ? css.replace(blockRegex, "").trim() : "";

        if (resetThemeOnDelete) {
          // If resetting, perform two actions in parallel:
          // 1. Reset the new Theme API by removing the desktop theme
          const themeResetPromise = resetDesktopTheme(apiToken, apiDomain);

          // 2. Update the old Branch Config API with cleaned CSS
          const legacyCssUpdatePromise = fetch(
            buildApiUrl(`/api/branches/${branchId}/config`),
            {
              method: "POST",
              headers: {
                Authorization: `Basic ${apiToken.trim()}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ customCSS: cleanedCss }),
            }
          );
  
          await Promise.all([themeResetPromise, legacyCssUpdatePromise]);
          const successMessage = "✅ Replify branding deleted and app/intranet theme was reset.";
          setBrandingExists(false);
          if (!quiet) setResponse(successMessage);
          return successMessage;
        } else {
          // If not resetting, just remove the CSS block from both systems
          if (!blockRegex.test(css)) {
            const emptyMessage = "Nothing to delete – no Replify CSS block found.";
            if (!quiet) setResponse(emptyMessage);
            return emptyMessage;
          }
          await postUpdatedCSS(apiToken, branchId, cleanedCss, undefined, apiDomain);
          const successMessage = "✅ Replify CSS block deleted.";
          setBrandingExists(false);
          if (!quiet) setResponse(successMessage);
          return successMessage;
        }
      } catch (err) {
        if (!quiet) setResponse(`❌ ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      } finally {
        if (!quiet) setIsLoading(false);
        setResetThemeOnDelete(false); // Reset checkbox after action
      }
    }

    const pullCurrentBranding = async () => {
      try {
        const css = await fetchCurrentCSS(apiToken, apiDomain);
        const brandingData = parseBrandingFromCSS(css, blockRegex);
        if (brandingData.prospectName) setProspectName(brandingData.prospectName);
        setPrimaryColor(brandingData.primaryColor || primaryColor);
        setTextColor(brandingData.textColor || textColor);
        setBackgroundColor(brandingData.backgroundColor || backgroundColor);
        setFloatingNavBgColor(
          brandingData.floatingNavBgColor || floatingNavBgColor
        );
        setFloatingNavTextColor(
          brandingData.floatingNavTextColor || floatingNavTextColor
        );
        setBgURL(brandingData.bgUrl || bgUrl);
        setLogoUrl(brandingData.logoUrl || logoUrl);
        setLogoPadHeight(brandingData.logoPadHeight || logoPadHeight);
        setLogoPadWidth(brandingData.logoPadWidth || logoPadWidth);
        setBgVertical(brandingData.bgVertical || bgVertical);
        setChangeLogoSize(brandingData.changeLogoSize || false);
        // Ensure that if changeLogoSize is false, we reset to defaults.
        if (!brandingData.changeLogoSize) {
          // Note: headerTransparency is independent of logo sizing
          setLogoHeight(100);
          setLogoMarginTop(0);
        }
        setLogoHeight(brandingData.logoHeight || 100);
        setLogoMarginTop(brandingData.logoMarginTop || 0);
        setResponse("✅ Pulled current branding into the form.");

        setHeaderTransparency(brandingData.headerTransparency ?? 70);
        // Now, try to pull multi-branding
        const multiBrandingData = parseMultiBrandingFromCSS(css, allGroups);
        if (multiBrandingData.length > 0) {
            setMultiBrandings(
              multiBrandingData.map((group) => ({
                ...group,
                primaryColor: group.primaryColor ?? undefined,
                textColor: group.textColor ?? undefined,
                backgroundColor: group.backgroundColor ?? undefined,
                floatingNavBgColor: group.floatingNavBgColor ?? undefined,
                floatingNavTextColor: group.floatingNavTextColor ?? undefined,
                logoUrl: group.logoUrl ?? undefined,
                bgUrl: group.bgUrl ?? undefined,
              }))
            );
          setMultiBrandingEnabled(true);
          setResponse(prev => prev + `\n✅ Pulled ${multiBrandingData.length} multi-branding configurations.`);
        } else {
          // Clear any existing multi-branding if none are found in the CSS
          setMultiBrandings([]); // This will clear the list in the UI
          setMultiBrandingEnabled(false); // Also hide the section if it's empty
        }
      } catch (err) {
        setResponse(`❌ ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    async function cancelPreview() {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        await chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: (styleId) => {
            const el = document.getElementById(styleId as string);
            if (el) el.remove();
          },
          args: ["replify-preview-styles"],
        });
        setPreviewActive(false);
        setResponse("Preview cancelled.");
      } catch (err) {
        setResponse(`Failed to cancel preview: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  
    /* ──────────────────────────────────────────────────────────────
      LAUNCHPAD SELECTION
      ────────────────────────────────────────────────────────────── */
  
    /** Toggle an item in the Launchpad multiselect. */
  
    const handleLaunchpadSelect = (option: string) => {
      if (option === "all") {
        setLaunchpadSel(["all"]);
        return;
      }
      const current = launchpadSel.filter((it) => it !== "all");
      setLaunchpadSel(
        current.includes(option)
          ? current.filter((it) => it !== option)
          : [...current, option]
      );
    };
  
  
    /* ──────────────────────────────────────────────────────────────
      AUTHENTICATION  (save/retrieve tokens)
      ────────────────────────────────────────────────────────────── */
  
    /* ──────────────────────────────────────────────────────────────
      SAVED-TOKEN INTERACTIONS
      ────────────────────────────────────────────────────────────── */
  
    /** Pre-configures the "New Environment" form with default email and user ID. */
  
    const prepareNewEnvironmentSetup = async (token: string, slug: string) => {
      if (!slug) {
        setResponse("⚠️ Slug not found, cannot set up default email.");
        return;
      }
      const defaultEmail = `admin+${slug}@staffbase.com`;
      setResponse(`Default email: ${defaultEmail}. Fetching user ID...`);
      try {
        const meResponse = await fetch(buildApiUrl("/api/users/me"), {
          headers: { Authorization: `Basic ${token}` },
        });
        if (!meResponse.ok) throw new Error("Failed to fetch current user ID");
        const meData = await meResponse.json();
        setLoggedInUserId(meData.id);
        setResponse(
          (prev) => prev + `\n✅ User ID for Journeys is ${meData.id}.`
        );
      } catch (error) {
        setResponse(
          (prev) =>
            prev +
            `\n⚠️ Could not fetch user ID for Journeys. Error: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    };
  
    /**
     * Fetches the branchId for a given token from the /api/spaces endpoint
     * and updates the state and localStorage.
     */
    const recoverBranchId = async (tokenToRecover: string, slugToUpdate: string) => {
      try {
        const spacesRes = await fetch(buildApiUrl("/api/spaces"), {
          headers: { Authorization: `Basic ${tokenToRecover}` },
        });
        if (!spacesRes.ok)
          throw new Error(`API returned status ${spacesRes.status}`);
  
        const firstSpace = (await spacesRes.json())?.data?.[0];
        const recoveredId =
          firstSpace?.accessors?.branch?.id || firstSpace?.branchID;
  
        if (!recoveredId)
          throw new Error("Could not find branch ID in the spaces API response.");
  
        // Update state and localStorage with the recovered ID
        setSavedTokens((currentTokens) => {
          const updatedTokens = currentTokens.map((t) =>
            t.slug === slugToUpdate ? { ...t, branchId: recoveredId } : t
          );
          // Persist the fix so we don't have to do this again
          saveTokensToStorage(updatedTokens as unknown as import('./utils/tokenStorage').StoredToken[]);
          return updatedTokens;
        });
  
        return recoveredId;
      } catch {
        // Throw the user-friendly error message you requested
        throw new Error(
          "Error fetching branch ID. Remove the environment and try again with an admin API key. Apologies for the error."
        );
      }
    };
  
    /** "Set Up" or "Brand" button inside <UseEnvironmentOptions>. */
    const handleUseOptionClick = async ({
      mode,
      token,
      branchId: initialBranchId,
    }: { mode: string; token: string; branchId: string | null | undefined }) => {
      // Use a try/catch block to handle potential recovery errors
      try {
        const effectiveDomain = useOption?.domain || DEFAULT_DOMAIN;
        updateApiDomain(effectiveDomain);
        let currentBranchId = initialBranchId;
  
        // If branchId is missing (null) or the old invalid string
        if (!currentBranchId || currentBranchId === UNKNOWN_BRANCH_ID) {
          setIsLoading(true);
          setResponse(
            "Legacy environment detected. Attempting to recover branch ID..."
          );
  
          // Call the recovery function
          currentBranchId = await recoverBranchId(token, useOption?.slug ?? '');
          setResponse(`✅ Branch ID recovered successfully!`);
          setIsLoading(false);
        }

        // --- The rest of the function proceeds as normal, using currentBranchId ---
        setApiToken(token);
        setBranchId(currentBranchId ?? '');
        setIsAuthenticated(true);
        setUseOption({
          type: mode,
          slug: useOption?.slug,
          token,
          branchId: currentBranchId,
          domain: effectiveDomain,
        });
        setUserManagementView("selection");
        setSetupView("selection");

        if (mode === "new") {
          prepareNewEnvironmentSetup(token, useOption?.slug ?? '');
          fetchAllProfileFields(token, currentBranchId ?? '', useOption?.slug ?? '');
        } else if (mode === "setup") {
          // No prep needed yet — user will choose Installation or Copier
        } else if (mode === "users") {
          fetchUsers(token);
          fetchAllProfileFields(token, currentBranchId ?? '', useOption?.slug ?? '');
        } else if (mode === "demo") {
          // No additional prep — DemoConfigForm uses shared App state
        } else if (mode === "load-demo" || mode === "revert") {
          // Auto-detect the currently active config from the CSS prospect comment
          // try {
          //   const css = await fetchCurrentCSS(token, effectiveDomain);
          //   const match = css?.match(/\/\* prospect:([^\n*]+?) \*\//);
          //   setDetectedCssProspect(match?.[1]?.trim() || null);
          // } catch { setDetectedCssProspect(null); }
        } else if (mode === "existing") {
          try {
            const css = await fetchCurrentCSS(token, effectiveDomain);
            const hasBlock =
              /\/\*\s*⇢\s*REPLIFY START[\s\S]*?REPLIFY END\s*⇠\s*\*\//.test(css);
            setBrandingExists(hasBlock);
          } catch {
            setBrandingExists(false);
          }
        } else if (mode === "monorepo") {
          // No prep needed — the panel's tabs fetch their own data.
        }

        setResponse(
          mode === "existing"
            ? "Using saved environment – ready to brand!"
            : mode === "users"
            ? "Ready for user management!"
            : mode === "demo"
            ? "Configure your demo below."
            : mode === "load-demo"
            ? "Select a saved demo to load."
            : mode === "revert"
            ? "Remove all Replify customizations from this environment."
            : mode === "setup"
            ? "Choose what you'd like to set up."
            : mode === "monorepo"
            ? "Browse widget embed URLs or inject Global JS snippets from the solutions-monorepo."
            : "Using saved environment – ready to set up!"
        );
      } catch (err) {
        setResponse(`❌ ${err instanceof Error ? err.message : String(err)}`);
        setIsLoading(false);
      }
    };
  
    /** Delete button next to a saved token. */
  
    const handleDeleteToken = (slug: string) => {
      const filtered = savedTokens.filter((t) => t.slug !== slug);
      setSavedTokens(filtered);
      setShowFullToken(null);
    };

  const handleToggleStar = (slug: string) => {
    setSavedTokens(prev =>
      prev.map(t =>
        t.slug === slug
          ? { ...t, starred: !t.starred }
          : t
      )
      );
      setShowFullToken(null);
    };
  
    const handleShowFullToken = (slug: string) =>
      setShowFullToken((cur) => (cur === slug ? null : slug));
  
      /* ──────────────────────────────────────────────────────────────
    BRAND / NEWS CREATION
    ────────────────────────────────────────────────────────────── */

  /**
   * Create or update demo resources:
   * 1. Inject / replace Replify CSS block and optionally update theme colors.
   * 2. Trigger sb-news LinkedIn scraper (optional).
   */

  async function handleCreateDemo() {
    setIsLoading(true);
    const collectedArticleIds: string[] = [];
    try {
      /* ---------- 0️⃣  Pre-flight: warn about unbound keyboard shortcuts -- */
      // Chrome doesn't let us force-bind shortcuts; we can only suggest. Tell
      // the user up front if blog/LinkedIn scraping will need them to use the
      // right-click menu (because their shortcut isn't bound).
      const willScrapeBlog = includeBlogScrape && !!blogUrl;
      const willScrapeLinkedIn = includeLinkedIn && isLinkedInUrl(prospectLinkedInUrl);
      if (willScrapeBlog || willScrapeLinkedIn) {
        const [blogShortcut, linkedinShortcut] = await Promise.all([
          willScrapeBlog ? getBoundShortcut('scrape-blog') : Promise.resolve(null),
          willScrapeLinkedIn ? getBoundShortcut('scrape-linkedin') : Promise.resolve(null),
        ]);
        const unbound: string[] = [];
        if (willScrapeBlog && !blogShortcut) unbound.push('blog');
        if (willScrapeLinkedIn && !linkedinShortcut) unbound.push('LinkedIn');
        if (unbound.length > 0) {
          setResponse(
            `⚠️ No keyboard shortcut bound for ${unbound.join(' and ')} scraping. ` +
            `You'll need to right-click and choose the menu item, or bind a key at chrome://extensions/shortcuts.`
          );
        }
      }

      /* ---------- 1️⃣  CSS block & Theme Colors -------------------------- */
      if (includeBranding) {
        setResponse("Processing branding request…");

        const existingCss = await fetchCurrentCSS(apiToken, apiDomain);
        const trimmedCss = existingCss ? existingCss.trim() : "";
        if (!trimmedCss) {
          const errorMessage = "Branding aborted: fetched CSS is empty. Existing CSS was not replaced.";
          console.error("[handleCreateDemo] Empty CSS fetch; aborting branding update.", { apiDomain, branchId });
          throw new Error(errorMessage);
        }
  
        const newCssBody = buildPreviewCss({
          primary: primaryColor,
          text: textColor,
          background: backgroundColor,
          floatingNavBg: floatingNavBgColor,
          floatingNavText: floatingNavTextColor,
          bg: bgUrl,
          logo: logoUrl,
          padW: logoPadWidth,
          padH: logoPadHeight,
          bgVert: bgVertical,
          headerTransparency,
          changeLogoSize,
          logoHeight,
          logoMarginTop,
          prospectName,
      }, multiBrandings, customCss);
  
        const newBlock = `/* ⇢ REPLIFY START ⇠ */\n${newCssBody}\n/* ⇢ REPLIFY END ⇠ */`;
        const finalCss = blockRegex.test(trimmedCss)
          ? trimmedCss.replace(blockRegex, newBlock)
          : `${trimmedCss}\n\n${newBlock}`;

        const colorConfig = updateThemeColors
          ? {
              primary: primaryColor,
              text: textColor,
              background: backgroundColor,
              floatingNavText: floatingNavTextColor,
              floatingNavBg: floatingNavBgColor,
            }
          : null;

        await postUpdatedCSS(apiToken, branchId, finalCss, colorConfig ?? undefined, apiDomain);

        setBrandingExists(true);
        const successMessage = updateThemeColors
          ? "✅ Demo CSS and theme colors updated!"
          : "✅ Demo CSS updated!";
        setResponse(successMessage);
      }

      /* ---------- 1️⃣b 📰 Rename news channels (bolt-in, prospect-aware) ---
         Runs between CSS and articles. Uses the prospect intelligence
         (prospectName + prospectNews) Gemini already pulled to flavor the
         new channel names. Pops a window.confirm() preview before writing,
         matching the existing approval pattern used for blog/LinkedIn. */

      if (includeChannelRename) {
        setResponse((p) => p + "\nListing channels for rename…");
        const renameCtx = {
          apiToken: apiToken.trim(),
          apiDomain,
          onProgress: (msg: string) => setResponse((p) => p + `\n${msg}`),
        };
        const allChannels = await renameListChannels(renameCtx);
        if (allChannels.length === 0) {
          setResponse((p) => p + "\n⚠️ No channels found to rename — skipping.");
        } else {
          const plan = await renamePlanChannels(
            {
              industryKey: channelRenameIndustry,
              channels: allChannels,
              prospect: { name: prospectName, news: prospectNews },
            },
            renameCtx,
          );
          if (plan.length === 0) {
            setResponse((p) => p + "\n⚠️ Gemini returned no rename suggestions — skipping.");
          } else {
            const previewLines = plan.slice(0, 5).map((p) => `  ${p.oldTitle} → ${p.newTitle}`).join("\n");
            const overflow = plan.length > 5 ? `\n…and ${plan.length - 5} more` : "";
            const ok = window.confirm(
              `Replify will rename ${plan.length} news channel(s) on this tenant.\n\n` +
              `Preview (first 5):\n${previewLines}${overflow}\n\n` +
              `Originals are NOT backed up. Continue?`,
            );
            if (!ok) {
              setResponse((p) => p + "\n⏭️  Channel rename skipped by user.");
            } else {
              const renameReport = await renameApplyChannels({ plan }, renameCtx);
              setResponse((p) =>
                p + `\n✅ Renamed ${renameReport.channelsRenamed} channel(s)` +
                (renameReport.channelsFailed > 0 ? ` (${renameReport.channelsFailed} failed)` : "")
              );
            }
          }
        }
      }

      /* ---------- 2️⃣ AI-generated articles (runs first — same tab context) */

      if (includeAiArticles) {
        setResponse((p) => p + "\nGenerating AI articles…");
        const topics = aiArticleTopics
          ? aiArticleTopics.split(",").map((t) => t.trim()).filter(Boolean)
          : [prospectName || "company news"];
        const aiRequestedChannelName = (aiNewChannelName || DEFAULT_NEW_CHANNEL_NAME).trim() || DEFAULT_NEW_CHANNEL_NAME;
        const aiResult = await generateAndCreateArticles(
          {
            topics,
            count: aiArticleCount,
            channelName: aiRequestedChannelName,
            channelId: aiChannelId !== CREATE_NEW_CHANNEL_VALUE ? aiChannelId : undefined,
            prospectName,
            locales: aiLocales
          },
          {
            apiToken: apiToken.trim(),
            apiDomain,
            branchId,
            onProgress: (msg) => setResponse((p) => p + `\n${msg}`),
          }
        );
        if (aiResult?.articleIds) collectedArticleIds.push(...aiResult.articleIds);
        setResponse((p) => p + "\n✅ AI articles created.");
      }

      /* ---------- 3️⃣ LinkedIn articles (synchronous, in-extension scrape) - */

      if (includeLinkedIn && isLinkedInUrl(prospectLinkedInUrl)) {
        const fixedUrl = normaliseLinkedInUrl(prospectLinkedInUrl);
        if (fixedUrl !== prospectLinkedInUrl) setProspectLinkedInUrl(fixedUrl);

        let targetChannelId = linkedinChannelId;
        if (!targetChannelId || targetChannelId === CREATE_NEW_CHANNEL_VALUE) {
          const linkedinRequestedChannelName = (linkedinNewChannelName || DEFAULT_NEW_CHANNEL_NAME).trim() || DEFAULT_NEW_CHANNEL_NAME;
          const channelTitle =
            prospectName && linkedinRequestedChannelName.toLowerCase() === DEFAULT_NEW_CHANNEL_NAME.toLowerCase()
              ? `${DEFAULT_NEW_CHANNEL_NAME} // ${prospectName || "Demo"}`
              : linkedinRequestedChannelName;
          const crtPayload = {
            pluginID: "news",
            contentType: "articles",
            accessorIDs: [branchId],
            config: { localization: { en_US: { title: channelTitle } } },
          };
          const crt = await fetch(buildApiUrl(`/api/spaces/${branchId}/installations`), {
            method: "POST",
            headers: { Authorization: `Basic ${apiToken.trim()}`, "Content-Type": "application/json" },
            body: JSON.stringify(crtPayload),
          });
          if (!crt.ok) throw new Error(`failed to create channel (${crt.status})`);
          targetChannelId = (await crt.json()).id;
        }

        setResponse((p) => p + "\n📋 Opening LinkedIn tab — right-click → \"Replify: Scrape this LinkedIn page\"…");
        const linkedinResult = await importLinkedInArticles(
          {
            linkedInUrl: fixedUrl,
            articleCount: linkedInPostsCount || 5,
            channelId: targetChannelId!,
            locales: linkedinLocales,
          },
          {
            apiToken: apiToken.trim(),
            apiDomain,
            branchId,
            onProgress: (msg) => setResponse((p) => p + `\n${msg}`),
            onScrapeStatusChange: setScrapePrompt,
            onLinkedInScrapeConfirmation: async (targetUrl) => {
              const ok = window.confirm(
                `Replify will open this LinkedIn page:\n${targetUrl}\n\n` +
                `⚠️ You must be logged into LinkedIn for the scrape to work.\n` +
                `🔒 Replify will NOT post anything to your LinkedIn — read only.\n\n` +
                `When the tab opens, right-click on the page and choose "Replify: Scrape this LinkedIn page".\n\n` +
                `Continue?`
              );
              if (!ok) throw new Error('LinkedIn scraping cancelled by user.');
            },
          }
        );
        if (linkedinResult?.articleIds?.length) {
          collectedArticleIds.push(...linkedinResult.articleIds);
          setResponse((p) => p + `\nTracked ${linkedinResult.articleIds.length} LinkedIn article ID(s) for revert.`);
        }
      }

      /* ---------- 4️⃣ Blog scraping (last — requires user interaction) ---- */

      if (includeBlogScrape && blogUrl) {
        setResponse((p) => p + "\n📋 Opening blog tab — right-click → \"Replify: Scrape this blog\"…");
        const blogRequestedChannelName = (blogNewChannelName || DEFAULT_NEW_CHANNEL_NAME).trim() || DEFAULT_NEW_CHANNEL_NAME;
        const blogResult = await scrapeAndCreateArticlesFromBlog(
          {
            blogUrl,
            articleCount: blogArticleCount,
            channelName: blogRequestedChannelName,
            channelId: blogChannelId !== CREATE_NEW_CHANNEL_VALUE ? blogChannelId : undefined,
            prospectName,
            locales: blogLocales,
          },
          {
            apiToken: apiToken.trim(),
            apiDomain,
            branchId,
            onProgress: (msg) => setResponse((p) => p + `\n${msg}`),
            onScrapeStatusChange: setScrapePrompt,
            onBlogScrapeConfirmation: async (targetBlogUrl) => {
              const ok = window.confirm(
                `Replify will open this blog page:\n${targetBlogUrl}\n\n` +
                `When the tab opens, right-click on the page and choose "Replify: Scrape this blog".\n\n` +
                `Continue?`
              );
              if (!ok) {
                throw new Error('Blog scraping cancelled by user.');
              }
            },
          }
        );
        if (blogResult?.articleIds?.length) {
          collectedArticleIds.push(...blogResult.articleIds);
          setResponse((p) => p + `\nTracked ${blogResult.articleIds.length} blog article ID(s) for revert.`);
        } else {
          setResponse((p) => p + "\n⚠️ Blog articles were created, but no article IDs were returned to track for revert.");
        }
        setResponse((p) => p + "\n✅ Blog articles created.");
      }

      if (includeLinkedIn) {
        setResponse((p) => p + "\n✅ LinkedIn articles created.");
      }

      /* ---------- 5️⃣  Save configuration to localStorage ------------------ */
      const configId = prospectName?.toLowerCase().trim().replace(/\s+/g, "-") || `demo-${Date.now()}`;
      updateDemos((prev) => {
        const entry = {
          id: configId,
          prospectName,
          logoUrl, bgUrl,
          primaryColor, textColor, backgroundColor,
          floatingNavBgColor, floatingNavTextColor,
          logoPadWidth, logoPadHeight, bgVertical, changeLogoSize,
          logoHeight, logoMarginTop, headerTransparency,
          vertical: demoVertical,
          useCases: [...demoUseCasesRef.current],
          articleIds: [...collectedArticleIds],
          createdAt: Date.now(),
        };
        const idx = prev.findIndex((d) => d.id === configId);
        if (idx !== -1) { const next = [...prev]; next[idx] = entry; return next; }
        return [...prev, entry];
      });

      /* ---------- 6️⃣  Refresh preview surface ----------------------------- */
      try {
        const previewState = await openDemoPreview({
          domain: apiDomain,
          slug: useOption?.slug,
          useCases: demoUseCasesRef.current,
          onLog: appendResponseLine,
        });
        setResponse((p) =>
          p +
          `\nPreview opened at ${previewState.previewUrl}.` +
          (previewState.openedMobilePreview
            ? `\n📱 Simulated mobile preview window opened${previewState.simulationApplied ? "." : ", but the simulation did not fully initialize."}`
            : "")
        );
      } catch (e) {
        // Non-fatal — branding was already applied
        console.warn("[Replify] Post-create navigation failed:", e);
      }
    } catch (err) {
      setResponse(`❌ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }

  /* ──────────────────────────────────────────────────────────────
  
   LIVE CSS PREVIEW
  
   ────────────────────────────────────────────────────────────── */

  /** Inject (or update) a <style> tag with the current colour config. */

  async function handlePreview() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const css = buildPreviewCss({
        primary: primaryColor,
        text: textColor,
        background: backgroundColor,
        floatingNavBg: floatingNavBgColor,
        floatingNavText: floatingNavTextColor,
        bg: bgUrl,
        logo: logoUrl,
        padW: logoPadWidth,
        padH: logoPadHeight,
        bgVert: bgVertical,
        headerTransparency,
        changeLogoSize,
        logoHeight,
        logoMarginTop,        
      },
      multiBrandings,
      customCss
    );

      setPreviewActive(true);
      const injectStyle = (cssText: string, styleId: string) => {
        let style = document.getElementById(styleId);
        if (!style) {
          style = document.createElement("style");
          style.id = styleId;
          document.head.appendChild(style);
        }
        style.textContent = cssText;
      };
      await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: injectStyle as unknown as (...args: unknown[]) => unknown,
        args: [css, "replify-preview-styles"],
      });
      setResponse("Preview applied. Refresh the tab to clear it");
    } catch (err) {
      setResponse(`Preview failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handlePreviewInPage(url: string) {
    const result = await previewSolutionsInPage(url);
    if (!result.ok) {
      setResponse(`Preview in page failed: ${result.error ?? result.action ?? "unknown error"}`);
    } else {
      setResponse(result.action === "updated" ? "Solutions widget updated in page." : "Solutions widget injected into page.");
    }
  }

  async function handleMobilePreview() {
    try {
      const [currentTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!currentTab?.id) {
        throw new Error("No active tab found for mobile preview.");
      }

      const css = buildPreviewCss(
        {
          primary: primaryColor,
          text: textColor,
          background: backgroundColor,
          floatingNavBg: floatingNavBgColor,
          floatingNavText: floatingNavTextColor,
          bg: bgUrl,
          logo: logoUrl,
          padW: logoPadWidth,
          padH: logoPadHeight,
          bgVert: bgVertical,
          headerTransparency,
          changeLogoSize,
          logoHeight,
          logoMarginTop,
        },
        multiBrandings,
        customCss
      );

      const previewUrl = getDemoPreviewUrl(apiDomain, useOption?.slug);
      const mobilePreviewUrl = buildSimulatedMobilePreviewUrl(previewUrl);
      const mobileWin = await chrome.windows.create({
        url: mobilePreviewUrl,
        type: "popup",
        width: 430,
        height: 932,
      });

      const mobileTabId = mobileWin.tabs?.[0]?.id;
      if (!mobileTabId) {
        throw new Error("Mobile preview window opened without a tab ID.");
      }

      const listener = (tabId: number, changeInfo: { status?: string }) => {
        if (tabId !== mobileTabId || changeInfo.status !== "complete") return;

        chrome.tabs.onUpdated.removeListener(listener);

        (async () => {
          const injectStyleMobile = (cssText: string, styleId: string) => {
            let style = document.getElementById(styleId);
            if (!style) {
              style = document.createElement("style");
              style.id = styleId;
              document.head.appendChild(style);
            }
            style.textContent = cssText;
          };
          try {
            await chrome.scripting.executeScript({
              target: { tabId: mobileTabId },
              func: injectStyleMobile as unknown as (...args: unknown[]) => unknown,
              args: [css, "replify-preview-styles"],
            });

            await ensureMobilePreviewSimulation(mobileTabId);
            await injectMobilePreviewBanner(mobileTabId);
            setResponse("Mobile preview window opened.");
          } catch (previewErr) {
            setResponse(`Mobile preview failed: ${previewErr instanceof Error ? previewErr.message : String(previewErr)}`);
          }
        })();
      };

      chrome.tabs.onUpdated.addListener(listener);
    } catch (err) {
      setResponse(`Mobile preview failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /* ──────────────────────────────────────────────────────────────
     USER MANAGEMENT
     ────────────────────────────────────────────────────────────── */

  /** * Fetches all users, finds the first admin ID for updates,
   * and cleans up usernames for display.
   */

  const fetchUsers = async (token: string) => {
    setIsLoading(true);
    setResponse("Fetching users...");
    try {
      const response = await fetch(buildApiUrl("/api/users"), {
        credentials: "omit",
        headers: { Authorization: `Basic ${token}` },
      });
      if (!response.ok)
        throw new Error(`Failed to fetch users: ${response.statusText}`);
      const data = await response.json();
      const allUsers: UserItem[] = data.data || [];
      const adminUser = allUsers.find(
        (user: UserItem) => user.branchRole === ADMIN_ROLE
      );
      if (adminUser) {
        setAdminUserId(adminUser.id);
      } else {
        setAdminUserId(null);
        setResponse(
          (prev) => prev + "\n⚠️ No admin user found. Updates will be disabled."
        );
      }
      const cleanedUsers = allUsers.map((user: UserItem) => {
        const cleanedUsername =
          typeof user.username === "string"
            ? user.username.replace(/^\(|\)$/g, "")
            : user.username;
        return { ...user, username: cleanedUsername };
      });
      setUsersList(cleanedUsers);
      setResponse("✅ Users loaded. Ready for user management.");
    } catch (err) {
      setResponse(`❌ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAllProfileFields = async (token: string, initialBranchId: string, slug: string) => {
    const fieldsToExclude = ["avatar", "profileHeaderImage", "apitoken"];

    const makeRequest = (id: string) =>
      fetch(buildApiUrl(`/api/branches/${id}/profilefields`), {
        headers: { Authorization: `Basic ${token}` },
      });

    try {
      let response = await makeRequest(initialBranchId);

      // If the first attempt fails, start the recovery and retry logic.
      if (!response.ok) {
        setResponse((prev) => prev + "\n⚠️ Profile fields fetch failed. Attempting to recover branch ID...");

        // a) Call spaces API to verify login and get correct branch ID
        const spacesRes = await fetch(buildApiUrl("/api/spaces"), {
          headers: { Authorization: `Basic ${token}` },
        });

        if (!spacesRes.ok) {
          throw new Error(`Recovery failed: Could not contact spaces API (${spacesRes.statusText}).`);
        }

        const firstSpace = (await spacesRes.json())?.data?.[0];
        if (!firstSpace) {
          throw new Error("Recovery failed: No spaces found for this API key.");
        }

        const currentSlug = firstSpace?.accessors?.branch?.slug;

        // a) Confirm the slug from the API matches the selected environment
        if (currentSlug !== slug) {
          // c) If it doesn't match, inform the user they are logged into the wrong account.
          throw new Error(`Login Mismatch: You seem to be logged into the account for "${currentSlug}", but are trying to use the environment for "${slug}". Please log in to the correct Staffbase account and try again.`);
        }

        // b) Slugs match, so get the correct branch ID and overwrite the old one.
        const newBranchId = firstSpace?.accessors?.branch?.id || firstSpace?.branchID;
        if (!newBranchId) {
          throw new Error("Recovery failed: Could not extract a valid branch ID from the spaces API.");
        }

        // Overwrite the broken branchId in the UI state and browser storage
        setBranchId(newBranchId);
        setSavedTokens((currentTokens) => {
          const updatedTokens = currentTokens.map((t) =>
            t.slug === slug ? { ...t, branchId: newBranchId } : t
          );
          saveTokensToStorage(updatedTokens as unknown as import('./utils/tokenStorage').StoredToken[]); // Persist the fix
          return updatedTokens;
        });

        setResponse((prev) => prev + "\n✅ Branch ID recovered. Retrying fetch...");

        // Retry the API call with the newly recovered branchId
        response = await makeRequest(newBranchId);

        // If the second attempt fails, there's a deeper issue.
        if (!response.ok) {
          throw new Error("There appears to be a persistent issue with the branch ID for your environment. Please remove it and add it again.");
        }
      }

      const data = await response.json();

      interface SchemaField { readOnly?: boolean; slug: string; localization?: { en_US?: { title?: string } }; }
      const filteredFields = (Object.values(data.schema) as SchemaField[]).filter(
        (field) =>
          !field.readOnly &&
          !fieldsToExclude.includes(field.slug) &&
          field.localization?.en_US?.title
      );

      // Set slugs for User Management
      const slugs: string[] = filteredFields.map((field) => field.slug);
      setAllProfileFields(slugs);

      // Set {slug, title} objects for Environment Setup
      const setupFields: ProfileFieldSlugTitle[] = filteredFields.map((field) => ({
        slug: field.slug,
        title: field.localization!.en_US!.title!,
      }));
      setSetupProfileFields(setupFields);

    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      setResponse((prev) => prev + `\n❌ ${err instanceof Error ? err.message : String(err)}`);
    }
  };


  /* ──────────────────────────────────────────────────────────────
    TAB VALIDATION — checks active tab is logged into the right env
    ────────────────────────────────────────────────────────────── */

  const checkTabValidation = async (expectedDomain: string | undefined) => {
    setTabValidation({ status: 'checking', message: 'Checking active tab…' });
    try {
      const validateTabInPage = async (domain: string) => {
        try {
          const tabDomain = window.location.hostname;
          if (!tabDomain.includes(domain)) {
            return { ok: false, error: `Active tab is on "${tabDomain}", not "${domain}". Open ${domain} in a tab first.` };
          }
          const res = await fetch(`https://${tabDomain}/auth/discover`, {
            credentials: 'include',
            headers: { Accept: 'application/vnd.staffbase.auth.discovery.v2+json' },
          });
          if (res.status === 401) return { ok: false, error: `Not logged in to ${domain}. Sign in first.` };
          if (!res.ok) return { ok: false, error: `Auth check failed (${res.status}). Make sure you're signed in.` };
          return { ok: true, tabDomain };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      };
      const rawResult = await runInPageContext({
        func: validateTabInPage as unknown as (...args: unknown[]) => unknown,
        args: [expectedDomain],
      });
      const result = rawResult as { ok?: boolean; tabDomain?: string; error?: string } | null | undefined;
      if (result?.ok) {
        setTabValidation({ status: 'ok', message: `Logged in to ${result.tabDomain}` });
      } else {
        setTabValidation({ status: 'error', message: result?.error || 'Validation failed' });
      }
    } catch (err) {
      setTabValidation({ status: 'error', message: err instanceof Error ? err.message : 'Could not validate tab' });
    }
  };

  /* ──────────────────────────────────────────────────────────────
    ENVIRONMENT CREATION (NEW IMPLEMENTATION)
    ────────────────────────────────────────────────────────────── */

  async function handleSetupNewEnv() {
    setResponse("Processing setup request...");
    setIsLoading(true);

    try {
      // 1. Direct setup operations (chat, microsoft, launchpad, widgets, quicklinks, journeys, campaigns)
      const hasDirectSetup =
        chatEnabled ||
        microsoftEnabled ||
        (journeysEnabled && loggedInUserId) ||
        campaignsEnabled ||
        launchpadSel.length > 0 ||
        quickLinksEnabled ||
        customWidgetsChecked ||
        setupEmailChecked;

      let setupReport: Record<string, unknown> = {};

      if (hasDirectSetup) {
        setupReport = await runSetup({
          domain: apiDomain,
          token: apiToken,
          branchId: useOption?.branchId ?? '',
          chat: chatEnabled,
          microsoft: microsoftEnabled,
          campaigns: campaignsEnabled,
          launchpad: launchpadSel.length > 0 ? launchpadSel : [],
          customWidgets: customWidgetsChecked,
          mobileQuickLinks: quickLinksEnabled
            ? Object.fromEntries(
                mobileQuickLinks
                  .filter((l) => l.name.trim())
                  .map((l) => [l.name, { title: l.title, position: l.position }])
              )
            : null,
          journeys:
            journeysEnabled && loggedInUserId
              ? { user: loggedInUserId, desired: ["all"] }
              : null,
          emailTemplates: setupEmailChecked,
          onProgress: (msg) => setResponse(msg),
        });
      }

      type SetupVal = { added: string[]; alreadyExist: string[]; errors: string[] | Record<string, string>; notAdded?: string[]; success?: Record<string, number> | string[]; created?: string[]; };
      const lines = Object.entries(setupReport as Record<string, SetupVal | string>).map(([key, val]) => {
        if (typeof val === "string") return `${key}: ${val}`;

        // Per-feature summary
        if (key === "chat") return `chat: ${val}`;
        if (key === "microsoft") {
          const { added, alreadyExist, errors } = val as { added: string[]; alreadyExist: string[]; errors: string[] };
          const parts = [];
          if (added.length) parts.push(`${added.length} added`);
          if (alreadyExist.length) parts.push(`${alreadyExist.length} already existed`);
          if (errors.length) parts.push(`${errors.length} errors`);
          return `microsoft: ${parts.join(", ") || "nothing to do"}`;
        }
        if (key === "launchpad") {
          return `launchpad: ${val.added.length} apps added${(val.notAdded?.length ?? 0) ? `, ${val.notAdded?.length} failed` : ""}`;
        }
        if (key === "customWidgets") {
          return `custom widgets: ${val.added.length} registered${(Array.isArray(val.errors) ? val.errors.length : Object.keys(val.errors).length) ? `, errors` : ""}`;
        }
        if (key === "mobileQuickLinks") {
          const errCount = Object.keys(val.errors).length;
          return `quick links: ${(val.success as unknown[])?.length ?? 0} set${errCount ? `, ${errCount} errors` : ""}`;
        }
        if (key === "journeys") {
          const errKeys = Object.entries(val.errors as Record<string, unknown>).filter(([, v]) => Array.isArray(v) ? v.length > 0 : true);
          return `journeys: ${(val.created ?? []).join(", ")}${errKeys.length ? ` | warnings: ${errKeys.map(([k]) => k).join(", ")}` : ""}`;
        }
        if (key === "campaigns") {
          const created = Object.keys(val.success as Record<string, unknown> ?? {}).length;
          const errCount = Object.keys(val.errors as Record<string, unknown> ?? {}).length;
          return `campaigns: ${created} created${errCount ? `, ${errCount} errors` : ""}`;
        }
        if (key === "emailTemplates") {
          const parts = [];
          if (val.added.length) parts.push(`${val.added.length} added`);
          if (val.alreadyExist.length) parts.push(`${val.alreadyExist.length} already existed`);
          if (val.errors.length) parts.push(`${val.errors.length} errors`);
          return `email templates: ${parts.join(", ") || "nothing to do"}`;
        }
        if (key === "mergeIntegrations") return `merge integrations: ${val}`;
        return `${key}: ${JSON.stringify(val)}`;
      });
      setResponse(`Setup Complete:\n${lines.join("\n")}`);

      // Workday HR integration runs after main setup
      if (hrIntegrationChecked && mergeConfig.email && mergeConfig.password) {
        setResponse('Setting up Workday integration…');
        try {
          await setupMergeIntegration({
            domain: apiDomain,
            integrationName: 'Workday',
            fieldTitle: mergeConfig.field,
            credentials: { email: mergeConfig.email, password: mergeConfig.password },
            apiToken,
            onProgress: (msg) => setResponse(msg),
          });
        } catch (mergeErr) {
          setResponse(`Workday setup failed: ${mergeErr instanceof Error ? mergeErr.message : String(mergeErr)}`);
        }
      }
    } catch (err) {
      setResponse(`Setup failed: ${err instanceof Error ? err.message : String(err)}`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }


  /* ──────────────────────────────────────────────────────────────
       UI UTILS & RENDER
   ────────────────────────────────────────────────────────────── */

  const DEMO_MODES = ["demo", "load-demo", "revert"];
  const renderBreadcrumbs = () => (
    <div style={{ marginBottom: 20 }}>
      <button
        style={{
          background: "none",
          border: "none",
          color: colors.primary,
          cursor: "pointer",
          padding: 0,
          fontSize: 14,
        }}
        onClick={() => {
          if (DEMO_MODES.includes(useOption?.type ?? '')) {
            setUseOption({ type: "select", slug: useOption?.slug, token: useOption?.token, branchId: useOption?.branchId, domain: useOption?.domain });
          } else {
            setUseOption({ type: null });
            setUserManagementView("selection");
          }
        }}
      >
        {DEMO_MODES.includes(useOption?.type ?? '') ? "← Back to Options" : "← Back to Environments"}
      </button>
    </div>
  );

  const renderUserMgmtBreadcrumbs = () => (
    <div style={{ marginBottom: 20 }}>
      <button
        style={{
          background: "none",
          border: "none",
          color: colors.primary,
          cursor: "pointer",
          padding: 0,
          fontSize: 14,
        }}
        onClick={() => setUserManagementView("selection")}
      >
        ← Back to User Options
      </button>
    </div>
  );

  const renderSetupBreadcrumbs = () => (
    <div style={{ marginBottom: 20 }}>
      <button
        style={{
          background: "none",
          border: "none",
          color: colors.primary,
          cursor: "pointer",
          padding: 0,
          fontSize: 14,
        }}
        onClick={() => setSetupView("selection")}
      >
        ← Back to Set Up Options
      </button>
    </div>
  );

  // ==================================================================
  // NEW PROSPECT HANDLERS
  // ==================================================================
  
  const handleSaveProspect = () => {
    if (!prospectName.trim()) {
      setResponse("⚠️ Please enter a prospect name before saving.");
      return;
    }

    const newProspect = {
      id: prospectName.trim().toLowerCase().replace(/\s+/g, "-"),
      prospectName,
      logoUrl,
      bgUrl,
      primaryColor,
      textColor,
      backgroundColor,
      floatingNavBgColor,
      floatingNavTextColor,
      logoPadWidth,
      logoPadHeight,
      bgVertical,
      changeLogoSize,
      logoHeight,
      logoMarginTop,
      headerTransparency,
    };

    setSavedProspects((prev) => {
      const existingIndex = prev.findIndex((p) => p.id === newProspect.id);
      if (existingIndex !== -1) {
        // Update existing prospect
        const updated = [...prev];
        updated[existingIndex] = newProspect;
        return updated;
      }
      // Add new prospect
      return [...prev, newProspect];
    });

    setResponse(`✅ Prospect "${prospectName}" saved!`);
  };

  const handleLoadProspect = (prospect: Record<string, unknown>) => {
    setProspectName(String(prospect.prospectName ?? ''));
    setLogoUrl(String(prospect.logoUrl ?? ''));
    setBgURL(String(prospect.bgUrl ?? ''));
    setPrimaryColor(String(prospect.primaryColor ?? ''));
    setTextColor(String(prospect.textColor ?? ''));
    setBackgroundColor(String(prospect.backgroundColor ?? ''));
    setFloatingNavBgColor(String(prospect.floatingNavBgColor ?? ''));
    setFloatingNavTextColor(String(prospect.floatingNavTextColor ?? ''));
    setLogoPadWidth(Number(prospect.logoPadWidth ?? 0));
    setLogoPadHeight(Number(prospect.logoPadHeight ?? 0));
    setBgVertical(Number(prospect.bgVertical ?? 0));
    setChangeLogoSize(Boolean(prospect.changeLogoSize));
    setLogoHeight(Number(prospect.logoHeight ?? 100));
    setLogoMarginTop(Number(prospect.logoMarginTop ?? 0));
    setHeaderTransparency(Number(prospect.headerTransparency ?? 70));
    setResponse(`🎨 Loaded branding for "${prospect.prospectName}".`);
  };

  const handleDeleteProspect = (prospectId: string) => {
    setSavedProspects((prev) => prev.filter((p) => p.id !== prospectId));
    setResponse("🗑️ Prospect deleted.");
  };

  // ── HARDCODED DEMO ENTRIES ─────────────────────────────────────────────────
  // These always appear in the Load Saved Demo list regardless of localStorage.
  // To remove an entry, delete it from this array.
  const HARDCODED_DEMOS: SavedDemo[] = [
    {
      id: "optum", prospectName: "Optum",
      logoUrl: "https://cdn.prod.website-files.com/66b658d7e612a0ad2d4a84fc/66d78f20fde2ae84afdc6040_optum-healthcare-logo.png",
      bgUrl: "", primaryColor: "#FBF8F2", textColor: "#fd6328", backgroundColor: "#FBF8F2",
      floatingNavBgColor: "#FFFFFF", floatingNavTextColor: "#000000",
      logoPadWidth: 34, logoPadHeight: 0, bgVertical: 0, changeLogoSize: false,
      logoHeight: 100, logoMarginTop: 0, headerTransparency: 70,
      vertical: "Healthcare", useCases: ["shift-viewing"], aiArticleCount: 2,
      aiArticleTopics: "patient care innovation, digital health, workforce wellbeing", blogUrl: "",
    },
  ];
  // ── END HARDCODED DEMO ENTRIES ─────────────────────────────────────────────

  const handleRevertWithUnpublish = async () => {
    setIsLoading(true);
    try {
      const allConfigs = [...HARDCODED_DEMOS, ...toSavedDemoArray(savedDemos)];
      const activeConfig = detectedCssProspect
        ? allConfigs.find((c) => (c.prospectName as string | undefined)?.toLowerCase() === detectedCssProspect.toLowerCase())
        : null;
      const responseLines: string[] = [];

      if ((activeConfig?.articleIds as string[] | undefined)?.length) {
        const articleIds = [...new Set((activeConfig?.articleIds as string[]).filter(Boolean))];
        setResponse(`Unpublishing ${articleIds.length} article(s) for "${activeConfig?.prospectName as string | undefined}"…`);
        const results = await Promise.all(articleIds.map((id) => unpublishArticle(id, appendResponseLine)));
        const okResults = results.filter((result) => result.ok);
        const failedResults = results.filter((result) => !result.ok);
        responseLines.push(
          okResults.length > 0
            ? `✅ ${okResults.length}/${results.length} article(s) unpublished.`
            : `⚠️ Could not unpublish articles (${results.length} attempted).`
        );
        if (failedResults.length > 0) {
          responseLines.push(
            `Failed: ${failedResults
              .slice(0, 2)
              .map((result) => `${result.articleId} (${result.error})`)
              .join(" | ")}`
          );
        }
      } else if (activeConfig) {
        responseLines.push(`ℹ️ Found "${activeConfig.prospectName}", but this saved config has no tracked article IDs to unpublish.`);
      } else if (detectedCssProspect && !activeConfig) {
        responseLines.push(`ℹ️ No saved config found for "${detectedCssProspect}" — no articles to unpublish.`);
      } else if (!detectedCssProspect) {
        responseLines.push("ℹ️ No active configuration detected in CSS — nothing to unpublish.");
      }

      const brandingMessage = await deleteBranding({ quiet: true });
      if (brandingMessage) responseLines.push(brandingMessage);
      setResponse(responseLines.join("\n"));
    } catch (err) {
      setResponse(`❌ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyDemoConfig = async (demo: SavedDemo) => {
    setIsLoading(true);
    try {
      setResponse(`Applying "${demo.prospectName}" configuration…`);
      const existingCss = await fetchCurrentCSS(apiToken, apiDomain);
      const trimmedCss = (existingCss || "").trim();
      if (!trimmedCss) throw new Error("Could not fetch current CSS — aborting.");

      const newCssBody = buildPreviewCss({
        primary: demo.primaryColor ?? '',
        text: demo.textColor ?? '',
        background: demo.backgroundColor ?? '',
        floatingNavBg: demo.floatingNavBgColor ?? '',
        floatingNavText: demo.floatingNavTextColor ?? '',
        bg: demo.bgUrl || "",
        logo: demo.logoUrl || "",
        padW: demo.logoPadWidth ?? 0,
        padH: demo.logoPadHeight ?? 0,
        bgVert: demo.bgVertical ?? 0,
        headerTransparency: demo.headerTransparency ?? DEFAULT_BRANDING.headerTransparency,
        changeLogoSize: demo.changeLogoSize ?? false,
        logoHeight: demo.logoHeight ?? DEFAULT_BRANDING.logoHeight,
        logoMarginTop: demo.logoMarginTop ?? 0,
        prospectName: demo.prospectName,
      }, [], "");

      const newBlock = `/* ⇢ REPLIFY START ⇠ */\n${newCssBody}\n/* ⇢ REPLIFY END ⇠ */`;
      const finalCss = blockRegex.test(trimmedCss)
        ? trimmedCss.replace(blockRegex, newBlock)
        : `${trimmedCss}\n\n${newBlock}`;
      await postUpdatedCSS(apiToken, branchId, finalCss, undefined, apiDomain);

      const previewState = await openDemoPreview({
        domain: apiDomain,
        slug: useOption?.slug,
        useCases: demo.useCases || [],
        onLog: appendResponseLine,
      });

      setResponse(
        `✅ Loaded "${demo.prospectName}".` +
          `\nBranding applied without recreating or republishing articles.` +
          `\nPreview opened at ${previewState.previewUrl}.` +
          (previewState.openedMobilePreview
            ? `\n📱 Simulated mobile preview window opened${previewState.simulationApplied ? "." : ", but the simulation did not fully initialize."}`
            : "")
      );
    } catch (err) {
      setResponse(`❌ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const showBlockingLoader = isLoading || isFetchingNews;

  const savedEnvironmentTokens: ComponentProps<typeof SavedEnvironments>["savedTokens"] =
    savedTokens.map((token: DisplayToken) => ({
      slug: token.slug ?? "",
      truncatedToken: token.truncatedToken,
      fullToken: token.fullToken,
      branchId: token.branchId ?? null,
      starred: token.starred,
      domain: token.domain,
    }));

  const automationUsers: AutomationUser[] = usersList.map((user) => ({
    id: user.id,
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    username: user.username,
  }));

  const updateUserFormUsers: UpdateUserFormUser[] = automationUsers;

  const automationProgressData: AutomationProgressData = {
    tasksCompleted: progressData.tasksCompleted,
    totalTasks: progressData.totalTasks,
    currentUser: progressData.currentUser ?? undefined,
    currentStatus: progressData.currentStatus ?? undefined,
  };

  const handleAutomationRun = (userIds: string[], options: AutomationRunOptions) => {
    void handleRunAutomation(userIds, options);
  };

  const askGeminiEnvironments: ComponentProps<typeof AskGeminiOverlay>["environments"] =
    savedTokens
      .filter((token) => !!token.slug)
      .map((token) => ({
        slug: token.slug,
        domain: token.domain,
        branchId: token.branchId ?? undefined,
        fullToken: token.fullToken,
      }));

  const askGeminiPromptHistory: ComponentProps<typeof AskGeminiOverlay>["promptHistory"] =
    promptHistory.map((entry: PromptHistoryEntry) => {
      type AskGeminiHistoryItem = NonNullable<ComponentProps<typeof AskGeminiOverlay>["promptHistory"]>[number];
      return {
      id: entry.id,
      promptText: String(entry.promptText ?? ""),
      timestamp: typeof entry.timestamp === "number" ? entry.timestamp : Date.now(),
      environment: String(entry.environment ?? ""),
      plan: entry.plan as AskGeminiHistoryItem["plan"],
      executionLog: entry.executionLog as AskGeminiHistoryItem["executionLog"],
      brandingData: (entry.brandingData as Record<string, unknown> | null | undefined) ?? null,
      };
    });

  const handleAddPromptHistory: NonNullable<ComponentProps<typeof AskGeminiOverlay>["onAddToHistory"]> = (item) => {
    if (item && typeof item === "object") {
      addPromptToHistory(item as Record<string, unknown>);
    }
  };

  return (
    <div style={containerStyle}>
      {showBlockingLoader && (
        <div
          aria-live="polite"
          aria-busy="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: colors.primaryOverlay20,
          }}
        >
          <HeartLoader size={110} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <img
          src="https://eirastaffbase.github.io/replify/replifyLogo.svg"
          alt="Replify Logo"
          style={logoStyle}
        />
        {/* GitHub auth button — left side */}
        <button
          onClick={() => {
            if (gitHub.status === 'authenticated') {
              void gitHub.logout();
            } else {
              setShowPATInput((v) => {
                if (!v) {
                  const today = new Date().toISOString().slice(0, 10);
                  void chrome.tabs.create({ url: `https://github.com/settings/tokens/new?scopes=repo,read:org&description=Replify%20${today}` });
                }
                return !v;
              });
            }
          }}
          title={
            gitHub.status === 'authenticated'
              ? `Signed in as @${gitHub.user?.login} — click to sign out`
              : gitHub.status === 'expired'
              ? 'Token expired — click to reconnect'
              : 'Connect GitHub'
          }
          style={{
            position: 'absolute',
            left: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '18px',
            color: gitHub.status === 'authenticated' ? colors.primary : gitHub.status === 'expired' ? '#ef4444' : colors.textDark,
          }}
        >
          <FaGithub aria-label="GitHub" />
        </button>
        <button
          onClick={toggleAdminMode}
          title="Toggle Admin Mode"
          style={{
            position: 'absolute',
            right: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '18px',
            color: isAdminMode ? colors.primary : colors.textDark
          }}
        >
          {isAdminMode ? <FaLockOpen aria-label="Admin mode on" /> : <FaLock aria-label="Admin mode off" />}
        </button>
      </div>
      {/* GitHub token expired notice */}
      {gitHub.status === 'expired' && !showPATInput && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: '#ef4444', textAlign: 'center' }}>
          Token expired — click the GitHub icon to reconnect.
        </p>
      )}
      {/* GitHub PAT input */}
      {showPATInput && gitHub.status !== 'authenticated' && (
        <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: 12 }}>
          <p style={{ margin: '0 0 6px', fontWeight: 600, color: colors.textDark }}>Connect GitHub</p>
          <p style={{ margin: '0 0 8px', color: colors.textMuted, fontSize: 11 }}>
            A GitHub tab just opened — generate your token, copy it, and paste it below.
          </p>
          <input
            type="password"
            placeholder="ghp_…"
            value={patDraft}
            onChange={(e) => setPatDraft(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', marginBottom: 6, padding: '6px 8px', fontSize: 12, border: `1px solid ${colors.border}`, borderRadius: 4 }}
          />
          <button
            onClick={() => {
              if (!patDraft.trim()) return;
              void gitHub.submitToken(patDraft.trim());
            }}
            disabled={!patDraft.trim() || gitHub.status === 'validating'}
            style={{ padding: '5px 12px', fontSize: 12, cursor: 'pointer', background: colors.primary, color: '#fff', border: 'none', borderRadius: 4, marginBottom: 8, opacity: patDraft.trim() ? 1 : 0.5 }}
          >
            {gitHub.status === 'validating' ? 'Validating…' : 'Connect'}
          </button>
          {gitHub.status === 'error' && (
            <p style={{ margin: '0', color: colors.errorText ?? '#c00', fontSize: 11 }}>{gitHub.error}</p>
          )}
          <p style={{ margin: '6px 0 0', color: colors.textMuted, fontSize: 10 }}>
            🔒 Your token is stored only in your browser's local storage and is never sent to any server.
          </p>
        </div>
      )}
      <div style={{ marginBottom: 12 }} />
      <ScrapeInstructionBanner prompt={scrapePrompt} />
      <FeedbackBanner />
      <div style={{ marginBottom: 12 }} />
      <SavedEnvironments
        savedTokens={savedEnvironmentTokens}
        showFull={showFullToken}
        selectedSlug={selectedSlug}
        onUse={({ slug, token, branchId, domain }) => {
          const resolvedDomain = domain || DEFAULT_DOMAIN;
          updateApiDomain(resolvedDomain);
          setUseOption({ type: "select", slug, token, branchId, domain: resolvedDomain });
        }
        }
        onCancel={() => setUseOption(null)}
        onToggle={handleShowFullToken}
        onDelete={handleDeleteToken}
        onStar={handleToggleStar}
        onAdd={() => setShowApiKeyInput(true)}
      />

      {!selectedSlug && (
      <RedirectAnalyticsForm
        open={redirectOpen}
        onToggleOpen={() => setRedirectOpen((o) => !o)}
        state={redirectState}
        onToggleType={handleToggleRedirect}
        onNumberOfEmployeesChange={(count: number) => handleNumberOfEmployeesChange(String(count))}
        onToggleAllowAllStaffbase={(checked) => handleToggleGeneralOption("allowAllStaffbase", checked)}
      />
      )}

      {useOption?.type && renderBreadcrumbs()}

      <ApiKeyModal
        isOpen={showApiKeyInput}
        onClose={() => setShowApiKeyInput(false)}
        onSave={(entry) => {
          setSavedTokens((prev) => {
            if (prev.find((t) => t.slug === entry.slug)) {
              return prev.map((t) =>
                t.slug === entry.slug
                  ? { ...t, branchId: t.branchId || entry.branchId, hasNewUI: entry.hasNewUI, domain: t.domain || entry.domain }
                  : t
              );
            }
            return [...prev, entry];
          });
          updateApiDomain(entry.domain);
          setBranchId(entry.branchId ?? '');
          setUseOption({ type: "select", slug: entry.slug, token: entry.token, branchId: entry.branchId, domain: entry.domain });
          setShowApiKeyInput(false);
        }}
      />

      {useOption?.type === "select" && (
        <UseEnvironmentOptions
          slug={useOption.slug ?? ''}
          replifyId={replifyId ?? undefined}
          isDetectingId={isDetectingReplifyId}
          isAdminMode={isAdminMode}
          isGitHubAuthenticated={gitHub.status === 'authenticated'}
          onChoose={(mode) =>
            handleUseOptionClick({
              mode,
              token: useOption?.token ?? '',
              branchId: useOption?.branchId,
            })
          }
        />
      )}

      {isAuthenticated && useOption?.type === "demo" && (
        <DemoConfigForm
          prospectName={prospectName}
          setProspectName={handleProspectNameChange}
          prospectSuggestions={prospectSuggestions}
          onFetchSuggestions={fetchProspectSuggestions}
          onSuggestionSelected={handleSuggestionSelected}
          vertical={demoVertical}
          setVertical={setDemoVertical}
          companySize={demoCompanySize}
          setCompanySize={(size) => { setDemoCompanySize(size); handleNumberOfEmployeesChange(String(size)); }}
          apiToken={apiToken}
          apiDomain={apiDomain}
          onPlanWithGemini={handlePlanDemoWithGemini}
          isPlanning={isPlanningDemo}
          brandingProps={{
            savedProspects,
            onSaveProspect: handleSaveProspect,
            onLoadProspect: handleLoadProspect,
            onDeleteProspect: handleDeleteProspect,
            prospectNews,
            isFetchingNews,
            onFetchNews: handleFetchIntelligence,
            fetchedBranding: fetchedBranding ?? undefined,
            newsSources,
            onApplyFetchedBranding: handleApplyFetchedBranding,
            prospectSuggestions,
            onFetchSuggestions: fetchProspectSuggestions,
            onSuggestionSelected: handleSuggestionSelected,
            multiBrandingEnabled,
            setMultiBrandingEnabled,
            multiBrandings: multiBrandings as unknown as import('./components/MultiBranding').GroupBranding[],
            onAddMultiBranding: handleAddMultiBranding as unknown as (b: import('./components/MultiBranding').GroupBranding) => void,
            onUpdateMultiBranding: handleUpdateMultiBranding as unknown as (b: import('./components/MultiBranding').GroupBranding) => void,
            onRemoveMultiBranding: handleRemoveMultiBranding,
            allGroups,
            isAdminMode,
            customCss,
            setCustomCss,
            isStaffbaseTab,
            includeBranding,
            setIncludeBranding,
            updateThemeColors,
            setUpdateThemeColors,
            brandingExists,
            resetThemeOnDelete,
            setResetThemeOnDelete,
            previewActive,
            onPreview: handlePreview,
            onMobilePreview: handleMobilePreview,
            onCancelPreview: cancelPreview,
            getCreateLabel,
            prospectName,
            setProspectName: handleProspectNameChange,
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
            logoMarginTop,
            setLogoMarginTop,
            headerTransparency,
            setHeaderTransparency,
            onCreateDemo: handleCreateDemo,
            onDeleteBranding: deleteBranding,
            onPullBranding: pullCurrentBranding,
            } as unknown as Parameters<typeof DemoConfigForm>[0]["brandingProps"]}
          newsProps={{
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
            linkedinLocales, setLinkedinLocales,
            linkedInPostsCount, setLinkedInPostsCount,
            blogLocales, setBlogLocales,
            includeBlogScrape, setIncludeBlogScrape,
            blogUrl, setBlogUrl,
            blogArticleCount, setBlogArticleCount,
            blogChannelId, setBlogChannelId,
            blogNewChannelName, setBlogNewChannelName,
          }}
          onCreateDemo={handleCreateDemo}
          isLoading={isLoading}
          onUseCasesChange={(cases) => { demoUseCasesRef.current = cases; }}
        />
      )}

      {isAuthenticated && useOption?.type === "load-demo" && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: colors.textMuted, marginBottom: 12 }}>
            Select a saved demo configuration to load into the form.
          </p>
          {HARDCODED_DEMOS.length === 0 && savedDemos.length === 0 && (
            <p style={{ fontSize: 12, color: colors.textMuted }}>No saved demos yet.</p>
          )}
          {[...HARDCODED_DEMOS, ...toSavedDemoArray(savedDemos)].map((demo, i) => {
            const isHardcoded = i < HARDCODED_DEMOS.length;
            const isExpanded = expandedDemoId === demo.id;
            const isActive = detectedCssProspect &&
              demo.prospectName?.toLowerCase() === detectedCssProspect.toLowerCase();
            return (
              <div
                key={demo.id}
                style={{
                  padding: "10px 12px", marginBottom: 8,
                  border: `1px solid ${isActive ? colors.primary : colors.borderMedium}`,
                  borderRadius: 6, background: colors.backgroundLight,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    {demo.logoUrl && (
                      <img src={demo.logoUrl} alt="" style={{ width: 36, height: 24, objectFit: "contain", flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: colors.textDark }}>{demo.prospectName}</span>
                        {isActive && (
                          <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: colors.primary, color: "#fff", letterSpacing: "0.04em" }}>
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: colors.textMuted }}>{demo.vertical || "Unknown vertical"}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 5, flexShrink: 0, marginLeft: 8 }}>
                    <button
                      onClick={() => setExpandedDemoId(isExpanded ? null : demo.id)}
                      style={{ padding: "4px 8px", borderRadius: 4, border: `1px solid ${colors.border}`, background: "transparent", color: colors.textMuted, fontSize: 11, cursor: "pointer" }}
                    >
                      {isExpanded ? "Less" : "More"}
                    </button>
                    <button
                      onClick={() => handleApplyDemoConfig(demo)}
                      style={{ padding: "4px 10px", borderRadius: 4, border: "none", background: colors.primary, color: colors.textOnPrimary, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                    >
                      Load
                    </button>
                    {!isHardcoded && (
                      <button
                        onClick={() => updateDemos((prev) => prev.filter((d) => d.id !== demo.id))}
                        style={{ padding: "4px 8px", borderRadius: 4, border: `1px solid ${colors.danger}`, background: "transparent", color: colors.danger, fontSize: 11, cursor: "pointer" }}
                        title="Delete configuration"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${colors.borderLight}`, fontSize: 12 }}>
                    {(demo.useCases?.length ?? 0) > 0 ? (
                      <>
                        <div style={{ fontWeight: 600, color: colors.textMuted, marginBottom: 4, fontSize: 11 }}>Use cases</div>
                        <ul style={{ margin: 0, paddingLeft: 16, color: colors.textDark }}>
                          {(demo.useCases ?? []).map((uc) => <li key={uc} style={{ marginBottom: 2 }}>{uc}</li>)}
                        </ul>
                      </>
                    ) : (
                      <span style={{ color: colors.textMuted }}>No use cases configured.</span>
                    )}
                    {(demo.articleIds?.length ?? 0) > 0 && (
                      <div style={{ marginTop: 6, color: colors.textMuted, fontSize: 11 }}>
                        {(demo.articleIds?.length ?? 0)} article{(demo.articleIds?.length ?? 0) !== 1 ? "s" : ""} tracked
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 12px", marginTop: 4,
              border: `1px dashed ${colors.border}`, borderRadius: 6,
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: colors.textDark }}>Revert to Default Setup</div>
              <div style={{ fontSize: 11, color: colors.textMuted }}>No prospect saved</div>
            </div>
            <button
              onClick={() => setUseOption((prev) => ({ ...prev, type: "revert" }))}
              style={{ padding: "5px 12px", borderRadius: 4, border: `1px solid ${colors.danger}`, background: "transparent", color: colors.danger, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              Select
            </button>
          </div>
        </div>
      )}

      {isAuthenticated && useOption?.type === "revert" && (
        <div style={{ marginBottom: 20 }}>
          {detectedCssProspect ? (
            <p style={{ fontSize: 13, color: colors.textMedium, marginBottom: 12 }}>
              Detected active configuration: <strong>{detectedCssProspect}</strong>.
              This will remove the Replify CSS block and unpublish any tracked articles.
            </p>
          ) : (
            <p style={{ fontSize: 13, color: colors.textMedium, marginBottom: 12 }}>
              This will remove all Replify customizations from <strong>{useOption.slug}</strong>.
            </p>
          )}
          {(() => {
            const allConfigs = [...HARDCODED_DEMOS, ...toSavedDemoArray(savedDemos)];
            const activeConfig = detectedCssProspect
              ? allConfigs.find((c) => c.prospectName?.toLowerCase() === detectedCssProspect.toLowerCase())
              : null;
            return (activeConfig?.articleIds?.length ?? 0) > 0 ? (
              <p style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>
                {activeConfig!.articleIds!.length} article{activeConfig!.articleIds!.length !== 1 ? "s" : ""} will be unpublished.
              </p>
            ) : null;
          })()}
          <button
            onClick={handleRevertWithUnpublish}
            disabled={isLoading}
            style={{
              padding: "10px 16px", borderRadius: 4, border: "none",
              background: isLoading ? colors.uiGray : colors.danger,
              color: colors.textOnPrimary, fontWeight: 600, fontSize: 14,
              cursor: isLoading ? "not-allowed" : "pointer", width: "100%",
            }}
          >
            {isLoading ? "Reverting…" : "Remove All Replify Customizations"}
          </button>
        </div>
      )}

      {isAuthenticated && useOption?.type === "users" && (
        <>
          {userManagementView !== "selection" && renderUserMgmtBreadcrumbs()}

          {userManagementView === "selection" && (
            <div style={{ marginTop: "10px" }}>
              <button
                style={brandingButtonStyle}
                onClick={() => setUserManagementView("automation")}
              >
                Automation
              </button>
              <p style={subDescriptionStyle}>
                Populate the platform with comments, reactions, chats, and
                survey responses.
              </p>
              <button
                style={{ ...brandingButtonStyle, marginTop: "20px" }}
                onClick={() => setUserManagementView("profile")}
              >
                Manage Users
              </button>
              <p style={subDescriptionStyle}>
                Update user profiles, change avatars/banners, or log in as a
                specific user.
              </p>
              {/* 🎭 Personas & Groups (bolt-in from staffbase-demo-group-tool) */}
              <button
                style={{ ...brandingButtonStyle, marginTop: "20px" }}
                onClick={() => setUserManagementView("personas")}
              >
                Personas &amp; Groups
              </button>
              <p style={subDescriptionStyle}>
                Industry-driven rewrite: Gemini classifies users into comms /
                corporate / frontline roles and creates 8 themed groups.
              </p>
            </div>
          )}

          {userManagementView === "automation" && (
            <AutomationForm
              users={automationUsers}
              apiToken={apiToken}
              isStaffbaseTab={isStaffbaseTab}
              onRun={handleAutomationRun}
              automationRunning={automationRunning}
              progressData={automationProgressData}
              apiDomain={apiDomain}
              availableLocales={availableLocales}
            />
          )}
          {/* 🎭 Personas & Groups (industry-driven user+group rewrite) */}
          {userManagementView === "personas" && (
            <PersonasForm
              apiToken={apiToken}
              apiDomain={apiDomain}
              onLog={appendResponseLine}
            />
          )}
          {userManagementView === "profile" && (
            <UpdateUserForm
              users={updateUserFormUsers}
              selectedUserId={selectedUserId}
              onUserSelect={setSelectedUserId}
              userProfile={userProfile}
              isLoading={isLoading}
              isLoginAsUserLoading={isLoginAsUserLoading}
              onLoginAsUser={handleLoginAsUser}
              fieldsToUpdate={fieldsToUpdate}
              onFieldUpdate={handleFieldUpdate}
              onAddField={handleAddField}
              onRemoveField={handleRemoveField}
              allProfileFields={allProfileFields}
              selectedFile={selectedFile}
              onFileChange={setSelectedFile}
              imageType={imageType}
              onImageTypeChange={(type: string) => setImageType(type as 'none' | 'avatar' | 'profileHeaderImage')}
              onProfileUpdate={handleProfileUpdate}
            />
          )}
        </>
      )}
  {/* ─────────── SOLUTIONS MONOREPO ─────────── */}
  {isAuthenticated && useOption?.type === "monorepo" && (
    <SolutionsMonorepoPanel
      staffbaseToken={useOption.token ?? ''}
      tabUrl={tabUrl}
      apiDomain={apiDomain}
      isOnContentPage={isContentPageUrl(tabUrl)}
      onPreviewInPage={handlePreviewInPage}
    />
  )}
  {/* ─────────── BRAND EXISTING ENV ─────────── */}
  {/* 🪧 Bolt-in: an existingView tab strip toggles between the original
       BrandingForm and the NewsChannelRenameForm (ported from
       staffbase-news-tool). Both share apiToken/apiDomain. */}
  {isAuthenticated && useOption?.type === "existing" && (
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <button
        style={{
          ...brandingButtonStyle,
          flex: 1,
          background: existingView === "branding" ? colors.primary : colors.uiGray,
        }}
        onClick={() => setExistingView("branding")}
      >
        Branding
      </button>
      <button
        style={{
          ...brandingButtonStyle,
          flex: 1,
          background: existingView === "news-rename" ? colors.primary : colors.uiGray,
        }}
        onClick={() => setExistingView("news-rename")}
      >
        Rename News Channels
      </button>
    </div>
  )}
  {isAuthenticated && useOption?.type === "existing" && existingView === "news-rename" && (
    <NewsChannelRenameForm
      apiToken={apiToken}
      apiDomain={apiDomain}
      onLog={appendResponseLine}
    />
  )}
  {isAuthenticated && useOption?.type === "existing" && existingView === "branding" && (
    <BrandingForm
      /* Prospect saving */
      savedProspects={savedProspects}
      onSaveProspect={handleSaveProspect}
      onLoadProspect={handleLoadProspect}
      onDeleteProspect={handleDeleteProspect}

      /* AI News */
      prospectNews={prospectNews}
      isFetchingNews={isFetchingNews}
      onFetchNews={handleFetchIntelligence}
      fetchedBranding={fetchedBranding ?? undefined}
      newsSources={newsSources}
      onApplyFetchedBranding={handleApplyFetchedBranding}
      /* Autocomplete */
      prospectSuggestions={prospectSuggestions}
      onFetchSuggestions={fetchProspectSuggestions}
      onSuggestionSelected={handleSuggestionSelected}

      /* Multi-branding */
      multiBrandingEnabled={multiBrandingEnabled}
      setMultiBrandingEnabled={setMultiBrandingEnabled}
      multiBrandings={multiBrandings}
      onAddMultiBranding={handleAddMultiBranding}
      onUpdateMultiBranding={handleUpdateMultiBranding}
      onRemoveMultiBranding={handleRemoveMultiBranding}
      allGroups={allGroups}

      /* Admin Mode */
      isAdminMode={isAdminMode}
      customCss={customCss}
      setCustomCss={setCustomCss}

      /* flags & handlers */
      isStaffbaseTab={isStaffbaseTab}
      updateThemeColors={updateThemeColors}
      setUpdateThemeColors={setUpdateThemeColors}
      includeBranding={includeBranding}
      setIncludeBranding={setIncludeBranding}
      brandingExists={brandingExists}
      resetThemeOnDelete={resetThemeOnDelete}
      setResetThemeOnDelete={setResetThemeOnDelete}
      /* live preview */
      previewActive={previewActive}
      onPreview={handlePreview}
      onMobilePreview={handleMobilePreview}
      onCancelPreview={cancelPreview}
      /* helpers */
      getCreateLabel={getCreateLabel}
      /* prospect / style state */
      prospectName={prospectName}
      setProspectName={handleProspectNameChange} // Use the new handler
      logoUrl={logoUrl}
      setLogoUrl={setLogoUrl}
      bgUrl={bgUrl}
      setBgURL={setBgURL}
      primaryColor={primaryColor}
      setPrimaryColor={setPrimaryColor}
      textColor={textColor}
      setTextColor={setTextColor}
      backgroundColor={backgroundColor}
      setBackgroundColor={setBackgroundColor}
      floatingNavBgColor={floatingNavBgColor}
      setFloatingNavBgColor={setFloatingNavBgColor}
      floatingNavTextColor={floatingNavTextColor}
      setFloatingNavTextColor={setFloatingNavTextColor}
      logoPadWidth={logoPadWidth}
      setLogoPadWidth={setLogoPadWidth}
      logoPadHeight={logoPadHeight}
      setLogoPadHeight={setLogoPadHeight}
      bgVertical={bgVertical}
      setBgVertical={setBgVertical}
      changeLogoSize={changeLogoSize}
      setChangeLogoSize={setChangeLogoSize}
      logoHeight={logoHeight}
      setLogoHeight={setLogoHeight}
      logoMarginTop={logoMarginTop}
      setLogoMarginTop={setLogoMarginTop}
      headerTransparency={headerTransparency}
      setHeaderTransparency={setHeaderTransparency}
      /* articles */
      includeArticles={includeArticles}
      setIncludeArticles={setIncludeArticles}
      includeLinkedIn={includeLinkedIn}
      setIncludeLinkedIn={setIncludeLinkedIn}
      prospectLinkedInUrl={prospectLinkedInUrl}
      setProspectLinkedInUrl={setProspectLinkedInUrl}
      linkedinChannels={linkedinChannels}
      linkedinChannelId={linkedinChannelId}
      setLinkedinChannelId={setLinkedinChannelId}
      linkedinNewChannelName={linkedinNewChannelName}
      setLinkedinNewChannelName={setLinkedinNewChannelName}
      linkedinLocales={linkedinLocales}
      setLinkedinLocales={setLinkedinLocales}
      linkedInPostsCount={linkedInPostsCount}
      setLinkedInPostsCount={setLinkedInPostsCount}
      blogLocales={blogLocales}
      setBlogLocales={setBlogLocales}
      includeAiArticles={includeAiArticles}
      setIncludeAiArticles={setIncludeAiArticles}
      aiArticleCount={aiArticleCount}
      setAiArticleCount={setAiArticleCount}
      aiArticleTopics={aiArticleTopics}
      setAiArticleTopics={setAiArticleTopics}
      aiLocales={aiLocales}
      setAiLocales={setAiLocales}
      availableLocales={availableLocales}
      aiChannelId={aiChannelId}
      setAiChannelId={setAiChannelId}
      aiNewChannelName={aiNewChannelName}
      setAiNewChannelName={setAiNewChannelName}
      includeBlogScrape={includeBlogScrape}
      includeChannelRename={includeChannelRename}
      setIncludeChannelRename={setIncludeChannelRename}
      channelRenameIndustry={channelRenameIndustry}
      setChannelRenameIndustry={setChannelRenameIndustry}
      setIncludeBlogScrape={setIncludeBlogScrape}
      blogUrl={blogUrl}
      setBlogUrl={setBlogUrl}
      blogArticleCount={blogArticleCount}
      setBlogArticleCount={setBlogArticleCount}
      blogChannelId={blogChannelId}
      setBlogChannelId={setBlogChannelId}
      blogNewChannelName={blogNewChannelName}
      setBlogNewChannelName={setBlogNewChannelName}
      /* action */
      onCreateDemo={handleCreateDemo}
      onDeleteBranding={deleteBranding}
      onPullBranding={pullCurrentBranding}
/>
  )}

      {/* ─────────── SET UP (selection → installation | copier) ─────────── */}
      {isAuthenticated && useOption?.type === "setup" && (
        <>
          {setupView !== "selection" && renderSetupBreadcrumbs()}

          {setupView === "selection" && (
            <div style={{ marginTop: "10px" }}>
              <button
                style={brandingButtonStyle}
                onClick={() => {
                    prepareNewEnvironmentSetup(useOption.token ?? '', useOption.slug ?? '');
                    fetchAllProfileFields(useOption.token ?? '', useOption.branchId ?? '', useOption.slug ?? '');
                  setSetupView("installation");
                  checkTabValidation(useOption.domain);
                  }}
              >
                Initial Setup Options
              </button>
              <p style={subDescriptionStyle}>
                Enable Chat, Journeys, Campaigns, and configure launchpad items.
              </p>
              <button
                style={{ ...brandingButtonStyle, marginTop: "20px" }}
                onClick={() => setSetupView("copier")}
              >
                Copier
              </button>
              <p style={subDescriptionStyle}>
                Copy email templates or pages from this environment to another.
              </p>
            </div>
          )}

          {setupView === "installation" && (
            <EnvironmentSetupForm
              chatEnabled={chatEnabled}
              setChatEnabled={setChatEnabled}
              microsoftEnabled={microsoftEnabled}
              setMicrosoftEnabled={setMicrosoftEnabled}
              journeysEnabled={journeysEnabled}
              setJourneysEnabled={setJourneysEnabled}
              campaignsEnabled={campaignsEnabled}
              setCampaignsEnabled={setCampaignsEnabled}
              launchpadSel={launchpadSel}
              items={LAUNCHPAD_DICT}
              openLaunchpad={isLaunchpadDropdownOpen}
              onToggleLaunchpadOpen={() => setIsLaunchpadDropdownOpen((open) => !open)}
              onToggleLaunchpadItem={handleLaunchpadSelect}
              quickLinksEnabled={quickLinksEnabled}
              setQuickLinksEnabled={setQuickLinksEnabled}
              mobileQuickLinks={mobileQuickLinks}
              onQuickLinkChange={handleQuickLinkChange}
              onQuickLinkSwap={handleQuickLinkSwap}
              onQuickLinkDelete={handleQuickLinkDelete}
              onQuickLinkAdd={handleQuickLinkAdd}
              customWidgetsChecked={customWidgetsChecked}
              setCustomWidgetsChecked={setCustomWidgetsChecked}
              setupEmailChecked={setupEmailChecked}
              setSetupEmailChecked={setSetupEmailChecked}
              allProfileFields={setupProfileFields}
              hrIntegrationChecked={hrIntegrationChecked}
              setHrIntegrationChecked={setHrIntegrationChecked}
                domain={useOption?.domain ?? ''}
                slug={useOption?.slug ?? ''}
              mergeConfig={mergeConfig}
                onMergeConfigChange={(config) =>
                  setMergeConfig({
                    field: config.field ?? '',
                    email: config.email ?? '',
                    password: config.password ?? '',
                  })
                }
              tabValidation={tabValidation}
              onRevalidate={() => checkTabValidation(useOption?.domain)}
              onSetup={handleSetupNewEnv}
            />
          )}

          {setupView === "copier" && (
            <CopierForm
                sourceToken={useOption.token ?? ''}
                sourceDomain={useOption.domain ?? ''}
                sourceSlug={useOption.slug ?? ''}
                savedTokens={savedTokens
                  .filter((token) => typeof token.slug === 'string' && typeof token.fullToken === 'string')
                  .map((token) => ({
                    slug: token.slug ?? '',
                    fullToken: token.fullToken ?? '',
                    domain: token.domain,
                  }))}
            />
          )}
        </>
      )}

      {/* ─────────── SET-UP BRAND-NEW ENV ─────────── */}
      {isAuthenticated && useOption?.type === "new" && (
        <EnvironmentSetupForm
          /* toggles */
          chatEnabled={chatEnabled}
          setChatEnabled={setChatEnabled}
          microsoftEnabled={microsoftEnabled}
          setMicrosoftEnabled={setMicrosoftEnabled}
          journeysEnabled={journeysEnabled}
          setJourneysEnabled={setJourneysEnabled}
          campaignsEnabled={campaignsEnabled}
          setCampaignsEnabled={setCampaignsEnabled}
          /* launchpad */
          launchpadSel={launchpadSel}
          items={LAUNCHPAD_DICT}
          openLaunchpad={isLaunchpadDropdownOpen}
          onToggleLaunchpadOpen={() =>
            setIsLaunchpadDropdownOpen((open) => !open)
          }
          onToggleLaunchpadItem={handleLaunchpadSelect}
          /* mobile quick links */
          quickLinksEnabled={quickLinksEnabled}
          setQuickLinksEnabled={setQuickLinksEnabled}
          mobileQuickLinks={mobileQuickLinks}
          onQuickLinkChange={handleQuickLinkChange}
          onQuickLinkSwap={handleQuickLinkSwap}
          onQuickLinkDelete={handleQuickLinkDelete}
          onQuickLinkAdd={handleQuickLinkAdd}
          /* widgets */
          customWidgetsChecked={customWidgetsChecked}
          setCustomWidgetsChecked={setCustomWidgetsChecked}
          setupEmailChecked={setupEmailChecked}
          setSetupEmailChecked={setSetupEmailChecked}
          allProfileFields={setupProfileFields}
          /* hr integration */
          hrIntegrationChecked={hrIntegrationChecked}
          setHrIntegrationChecked={setHrIntegrationChecked}
          domain={useOption?.domain ?? ''}
          slug={useOption?.slug ?? ''}
          mergeConfig={mergeConfig}
          onMergeConfigChange={(config) =>
            setMergeConfig({
              field: config.field ?? '',
              email: config.email ?? '',
              password: config.password ?? '',
            })
          }
          tabValidation={tabValidation}
          onRevalidate={() => checkTabValidation(useOption?.domain)}
          /* submit */
          onSetup={handleSetupNewEnv}
        />
      )}

      {/* ─────────── SERVER RESPONSES ─────────── */}
      <AskGeminiOverlay
        isOpen={isGeminiOpen}
        environments={askGeminiEnvironments}
        currentApiToken={apiToken}
        currentBranchId={branchId}
        currentDomain={apiDomain}
          currentAdminId={adminUserId ?? undefined}
        isStaffbaseTab={isStaffbaseTab}
          useOption={
            useOption
              ? {
                  type: useOption.type ?? undefined,
                  slug: useOption.slug ?? undefined,
                }
              : null
          }
        selectedEnvSlug={useOption?.slug ?? null}
        prospectName={prospectName}
        promptHistory={askGeminiPromptHistory}
        onAddToHistory={handleAddPromptHistory}
        onOpen={() => setIsGeminiOpen(true)}
        onClose={() => setIsGeminiOpen(false)}
        onNavigateToBranding={async (envSlug, brandingData = null) => {
          const matchedEnv = savedTokens.find(t => t.slug === envSlug);
          if (matchedEnv) {
            const token: string = matchedEnv.fullToken ?? '';
            const domain = matchedEnv.domain || DEFAULT_DOMAIN;
            setUseOption({
              type: "existing",
              slug: matchedEnv.slug ?? '',
              token,
              branchId: matchedEnv.branchId,
              domain,
            });
            setApiToken(token);
            setBranchId(matchedEnv.branchId ?? '');
            updateApiDomain(domain);
            setIsAuthenticated(true);

            // If brandingData is provided, use it to pre-populate the form
            const parsedBrandingData = toGeminiBrandingData(brandingData);
            if (parsedBrandingData) {
              setBrandingExists(true);
              if (parsedBrandingData.prospectName) setProspectName(parsedBrandingData.prospectName);
              if (parsedBrandingData.primaryColor) setPrimaryColor(parsedBrandingData.primaryColor);
              if (parsedBrandingData.textColor) setTextColor(parsedBrandingData.textColor);
              if (parsedBrandingData.backgroundColor) setBackgroundColor(parsedBrandingData.backgroundColor);
              if (parsedBrandingData.floatingNavBgColor) setFloatingNavBgColor(parsedBrandingData.floatingNavBgColor);
              if (parsedBrandingData.floatingNavTextColor) setFloatingNavTextColor(parsedBrandingData.floatingNavTextColor);
              if (parsedBrandingData.logoUrl) setLogoUrl(parsedBrandingData.logoUrl);
              if (parsedBrandingData.bgUrl) setBgURL(parsedBrandingData.bgUrl);
              if (parsedBrandingData.bgVertical != null) setBgVertical(parsedBrandingData.bgVertical);
              if (parsedBrandingData.headerTransparency != null) setHeaderTransparency(parsedBrandingData.headerTransparency);
              if (parsedBrandingData.logoHeight != null) {
                setChangeLogoSize(true);
                setLogoHeight(parsedBrandingData.logoHeight);
              }
              if (parsedBrandingData.logoMarginTop != null) setLogoMarginTop(parsedBrandingData.logoMarginTop);
              if (parsedBrandingData.logoPadWidth != null) setLogoPadWidth(parsedBrandingData.logoPadWidth);
              if (parsedBrandingData.logoPadHeight != null) setLogoPadHeight(parsedBrandingData.logoPadHeight);
            } else {
              // No brandingData provided - detect and pull from CSS
              setTimeout(async () => {
                try {
                  const css = await fetchCurrentCSS(token, domain);
                  const hasBlock = /\/\*\s*⇢\s*REPLIFY START[\s\S]*?REPLIFY END\s*⇠\s*\*\//.test(css);
                  setBrandingExists(hasBlock);
                  if (hasBlock) {
                    await pullCurrentBranding();
                  }
                } catch (e) {
                  console.error('[App] Failed to detect/pull branding:', e);
                  setBrandingExists(false);
                }
              }, 150);
            }
          }
          setIsGeminiOpen(false);
        }}
      />
      {response && <pre style={responseStyle}>{response}</pre>}
    </div>
  );
}

export default App;
