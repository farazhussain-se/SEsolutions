import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { RiSparkling2Line } from 'react-icons/ri';
import { IoClose } from 'react-icons/io5';
import { IoChevronDown, IoChevronUp } from 'react-icons/io5';
import { IoCheckmarkSharp } from 'react-icons/io5';
import {
  floatingSparkleButtonStyle,
  geminiOverlayBackdropStyle,
  geminiOverlayCardStyle,
  geminiCloseButtonStyle,
  geminiHeaderStyle,
  geminiTitleStyle,
  geminiInputStyle,
  geminiInputMutedStyle,
  geminiFooterStyle,
  geminiSelectStyle,
  geminiTaskCardStyle,
  geminiActionButtonStyle,
  geminiFieldShellStyle,
  geminiSampleGridStyle,
} from '../styles';
import { colors } from '../styles/colors';
import { runPromptAutomation } from '../utils/promptAutomation';
import { executePlan } from '../utils/aiFunctionCalling';
import { fetchCurrentCSS } from '../utils/staffbaseCss';
import { parseBrandingFromCSS } from '../utils/branding';
import ProgressBar from './ProgressBar';
import HeartLoader from './HeartLoader';

// ─── Local types ─────────────────────────────────────────────────────────────

interface GeminiOperation {
  function: string;
  args?: Record<string, unknown>;
}

interface GeminiTask {
  title?: string;
  type?: string;
  status?: string;
  details?: string;
  colors?: string[];
  params?: Record<string, unknown>;
  operations?: GeminiOperation[];
  __key?: string;
  [key: string]: unknown;
}

interface GeminiPlan {
  userFacingSummary?: string;
  breakdown?: string[];
  operations?: GeminiOperation[];
  legacyTasks?: GeminiTask[];
  tasks?: GeminiTask[];
  [key: string]: unknown;
}

interface SavedEnvironment {
  slug?: string;
  domain?: string;
  branchId?: string;
  fullToken?: string;
  token?: string;
}

interface HistoryTask {
  title?: string;
  type?: string;
  details?: string;
}

interface HistoryPlan {
  userFacingSummary?: string;
  tasks?: HistoryTask[];
}

interface HistoryItem {
  id: string;
  promptText: string;
  timestamp: string | number;
  environment: string;
  plan?: HistoryPlan;
  executionLog?: {
    status: string;
    fullLog?: string;
  };
  brandingData?: Record<string, unknown> | null;
}

interface BlogScrapeConfirmation {
  blogUrl: string;
  resolve: () => void;
  reject: (err: Error) => void;
}

interface UseOption {
  type?: string;
  slug?: string;
}

interface AskGeminiOverlayProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  environments?: SavedEnvironment[];
  currentApiToken?: string;
  currentBranchId?: string;
  currentDomain?: string;
  currentAdminId?: string;
  isStaffbaseTab?: boolean;
  useOption?: UseOption | null;
  selectedEnvSlug?: string | null;
  prospectName?: string;
  onNavigateToBranding?: ((slug: string, data: unknown) => void) | null;
  promptHistory?: HistoryItem[];
  onAddToHistory?: ((item: unknown) => void) | null;
}

// ─────────────────────────────────────────────────────────────────────────────

const blockRegex = /\/\*\s*⇢\s*REPLIFY START\s*⇠\s*\*\/[\s\S]*?\/\*\s*⇢\s*REPLIFY END\s*⇠\s*\*\//i;

const LOG_PROMPT_URL = 'https://lhxtgvzdzumwjlnpieog.supabase.co/functions/v1/log-prompt-automation';

const SAMPLE_PROMPTS = [
  'Brand the environment like Ford and add AI chats + news about new vehicle launches.',
  'Apply Spotify branding and add LinkedIn articles about their latest news.',
  'Add Airbnb-related articles on travel inspiration.',
  'Use Nike branding and enable AI chats focused on upcoming events.',
  'Use chase branding and add ai articles and comments.',
  'Give me Starbucks branding plus AI chats about new beverages.',
  'Set Tesla branding and add articles about product updates.',
  'Apply Target branding and add AI chats for store feedback.',
  'Use Salesforce branding and update some users to sales reps.',
  'Set up Merge Integrations and the launchpad.',
  'Brand like Netflix and import their LinkedIn articles.',
];

const AskGeminiOverlay = ({
  isOpen,
  onOpen,
  onClose,
  environments = [],
  currentApiToken,
  currentBranchId,
  currentDomain,
  currentAdminId,
  isStaffbaseTab = false,
  useOption = null,
  selectedEnvSlug = null,
  prospectName = '',
  onNavigateToBranding = null,
  promptHistory = [],
  onAddToHistory = null,
}: AskGeminiOverlayProps) => {
  const getDefaultPrompt = (name: string) => {
    if (!name) return '';
    return `Brand the environment for ${name}, add some chats between employees, and 2 news articles into the Top News channel`;
  };
  const [promptText, setPromptText] = useState('');
  const [isLauncherHovering, setIsLauncherHovering] = useState(false);
  const [isCloseHovering, setIsCloseHovering] = useState(false);
  const [selectedEnv, setSelectedEnv] = useState('__current__');
  const [plan, setPlan] = useState<GeminiPlan | null>(null);
  const [planPromptText, setPlanPromptText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasEditedAfterPlan, setHasEditedAfterPlan] = useState(false);
  const [samplePrompts, setSamplePrompts] = useState<string[]>([]);
  const [showSamples, setShowSamples] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionState, setExecutionState] = useState('idle'); // idle | running | complete
  const [executionProgress, setExecutionProgress] = useState('');
  const [currentTask, setCurrentTask] = useState('');
  const [progressData, setProgressData] = useState({ tasksCompleted: 0, totalTasks: 0 });
  const [isLogExpanded, setIsLogExpanded] = useState(true);
  const [completionFlash, setCompletionFlash] = useState(false);
  const [showCompletionActions, setShowCompletionActions] = useState(false);
  const [taskStatuses, setTaskStatuses] = useState<Record<string, string>>({});
  const [taskKeys, setTaskKeys] = useState<string[]>([]);
  const [taskAliasMap, setTaskAliasMap] = useState<Record<string, string>>({});
  const [operationTaskMap, setOperationTaskMap] = useState<Record<string, string>>({});
  const [currentLogId, setCurrentLogId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState('new'); // 'new' | 'history'
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);
  const [latestBrandingData, setLatestBrandingData] = useState<Record<string, unknown> | null>(null);
  const [blogScrapeConfirmation, setBlogScrapeConfirmation] = useState<BlogScrapeConfirmation | null>(null); // { blogUrl, resolve, reject }
  const [loadingMessage, setLoadingMessage] = useState('');
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logSectionRef = useRef<HTMLDivElement | null>(null);
  const lastActiveTaskRef = useRef<string | null>(null);
  const successColor = colors.success;
  const dangerColor = colors.danger;
  const showGeminiBlockingLoader = isLoading && !isExecuting;

  useEffect(() => {
    // Default to current environment if available, otherwise first saved environment
    if (currentApiToken && currentBranchId) {
      setSelectedEnv('__current__');
    } else if (environments.length > 0) {
      const first = environments[0];
      const label = first.slug || first.domain || first.branchId || '';
      setSelectedEnv(label);
    }
  }, [environments, currentApiToken, currentBranchId]);

  const selectEnvFromActiveTab = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) return;
      const url = new URL(tab.url);
      const host = url.hostname.toLowerCase();
      const slug = host.split('.')[0];


      // If we are on app.staffbase.com, try to resolve the real slug/domain from /api/spaces
      if (host === 'app.staffbase.com' && currentApiToken) {
        try {
          const spacesRes = await fetch(`https://${host}/api/spaces`, {
            headers: { Authorization: `Basic ${currentApiToken}` }
          });
          if (spacesRes.ok) {
            const spacesData = await spacesRes.json();
            const firstSpace = spacesData?.data?.[0];
            const spaceSlug = firstSpace?.accessors?.branch?.slug;
            const spaceDomain = firstSpace?.domain || host;
            if (spaceSlug) {
              const matchedSpace = environments.find(env => {
                const envDomain = (env.domain || '').toLowerCase();
                const envSlug = (env.slug || '').toLowerCase();
                return envDomain === spaceDomain.toLowerCase() || envSlug === spaceSlug.toLowerCase();
              });
              if (matchedSpace) {
                const val = matchedSpace.slug || matchedSpace.domain || matchedSpace.branchId || '';
                setSelectedEnv(val);
                return;
              }
            }
          } else {
          }
        } catch (spacesErr) {
          console.warn('[AskGeminiOverlay] Failed to resolve spaces:', spacesErr);
        }
      }

      // Try to match saved environments by domain or slug
      const matched = environments.find(env => {
        const envDomain = (env.domain || '').toLowerCase();
        const envSlug = (env.slug || '').toLowerCase();
        return envDomain === host || envSlug === slug;
      });

      if (matched) {
        setSelectedEnv(matched.slug || matched.domain || matched.branchId || '');
      } else if (currentApiToken && currentBranchId) {
        // Fall back to current environment if available
        setSelectedEnv('__current__');
      }
    } catch (err) {
      console.warn('Could not auto-select environment from active tab:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      selectEnvFromActiveTab();
      shuffleSamples();
      setShowSamples(false);
      // Set default prompt if there's a prospect name and no existing prompt
      if (prospectName && !promptText.trim()) {
        setPromptText(getDefaultPrompt(prospectName));
      }
    }
  // Intentionally only fires when the overlay opens — adding promptText/prospectName would
  // re-run on every keystroke and overwrite user edits; selectEnvFromActiveTab changes
  // identity every render and shouldn't re-trigger this one-time setup effect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (plan) {
      const initialStatuses: Record<string, string> = {};
      const keys: string[] = [];
      const displayTasks = getDisplayTasks(plan).map((task, idx) => ({
        ...task,
        __key: buildTaskKey(task.title, task.type, idx),
      }));
      displayTasks.forEach((task) => {
        const key = task.__key;
        if (key) {
          initialStatuses[key] = 'pending';
          keys.push(key);
        }
      });
      setTaskStatuses(initialStatuses);
      setTaskKeys(keys);
      const aliasMap = buildTaskAliasMap(displayTasks, plan.operations || []);
      const opMap = buildOperationTaskMap(displayTasks, plan.operations || []);
      setTaskAliasMap(aliasMap);
      setOperationTaskMap(opMap);
    } else {
      setTaskStatuses({});
      setTaskKeys([]);
      setTaskAliasMap({});
    }
  // buildTaskKey/buildTaskAliasMap/buildOperationTaskMap are defined inline and change
  // identity every render — adding them as deps would re-run this on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  useEffect(() => {
    return () => {
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
      }
    };
  }, []);

  const handleNewPromptAction = () => {
    setPromptText('');
    setPlan(null);
    setPlanPromptText('');
    setHasEditedAfterPlan(false);
    setExecutionProgress('');
    setProgressData({ tasksCompleted: 0, totalTasks: 0 });
    setCurrentTask('');
    setIsExecuting(false);
    setExecutionState('idle');
    setShowCompletionActions(false);
    setShowSamples(false);
    setTaskStatuses({});
    setTaskAliasMap({});
    setTaskKeys([]);
    setCurrentLogId(null);
    lastActiveTaskRef.current = null;
  };

  const scrollToLog = () => {
    setIsLogExpanded(true);
    setShowCompletionActions(false);
    setTimeout(() => {
      if (logSectionRef.current) {
        logSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
      }
    }, 120);
  };

  const shuffleSamples = () => {
    const shuffled = [...SAMPLE_PROMPTS].sort(() => Math.random() - 0.5);
    setSamplePrompts(shuffled.slice(0, 8));
  };

  // Hide sparkle button when user is in a sub-screen (not home)
  const isOnHomeScreen = !useOption?.type || useOption?.type === 'select';

  // Set default environment when a slug is selected
  useEffect(() => {
    if (selectedEnvSlug && environments.length > 0) {
      const matchingEnv = environments.find(env => env.slug === selectedEnvSlug);
      if (matchingEnv) {
        setSelectedEnv(selectedEnvSlug);
      }
    }
  }, [selectedEnvSlug, environments]);

  const getDisplayTasks = (planData: GeminiPlan): GeminiTask[] => planData?.legacyTasks || planData?.tasks || [];

  const normalizeTaskBase = (title = '', type = '') => {
    return (title || type || '').toLowerCase().replace(/[^a-z0-9]+/gi, ' ').trim();
  };
  const buildTaskKey = (title = '', type = '', idx = 0) => {
    const base = normalizeTaskBase(title, type) || `task-${idx}`;
    return `${base}-i${idx}`;
  };

  const buildTaskAliasMap = (tasks: GeminiTask[] = [], operations: GeminiOperation[] = []): Record<string, string> => {
    const aliases: Record<string, string> = {};

    const addAlias = (alias: string | undefined, key: string | undefined) => {
      if (!alias || !key) return;
      if (!aliases[alias]) {
        aliases[alias] = key;
      }
    };

    const typeToOps: Record<string, string[]> = {
      branding: ['applyfullbranding', 'branding', 'applybranding'],
      chats: ['runfullchatworkflow', 'createchats', 'createaichats', 'chatautomationworkflow'],
      articles: ['generatearticles', 'createarticles', 'newsarticles', 'generateandcreatearticles'],
      linkedinarticles: ['importlinkedinarticlesfull', 'linkedinarticles', 'importlinkedinarticles'],
      userfields: ['updateuserfields', 'userfields'],
      comments: ['addcommentstoarticles', 'addcommentstoarticle', 'comments', 'articlecomments'],
    };

    tasks.forEach((task) => {
      const base = normalizeTaskBase(task.title, task.type);
      addAlias(base, task.__key);
        if (task.type) {
          const typeBase = normalizeTaskBase('', task.type);
          addAlias(typeBase, task.__key);
          const mappedOps = typeToOps[typeBase];
          if (mappedOps) {
            mappedOps.forEach((m) => addAlias(m, task.__key));
          }
        }

        // For chat tasks, add aliases for chatTitle/groupName/topic so progress lines can match the right card
        if (task.type === 'chats') {
        const chatTokens = [
          task.params?.chatTitle,
          task.params?.groupName,
          task.params?.topic,
          ...(task.params?.topics as unknown[] || []),
          task.operations?.[0]?.args?.chatTitle,
          task.operations?.[0]?.args?.groupName,
          task.operations?.[0]?.args?.topic,
          ...(task.operations?.[0]?.args?.topics as unknown[] || []),
        ].filter(Boolean);
        chatTokens.forEach((token) => addAlias(normalizeTaskBase(String(token)), task.__key));
        }
        // For article/channel tasks, add aliases for channelName and article topics/titles
        if (task.type === 'articles' || task.type === 'linkedinArticles') {
          const articleTokens = [
            task.params?.channelName,
            ...(task.params?.topics as unknown[] || []),
            task.operations?.[0]?.args?.channelName,
            ...(task.operations?.[0]?.args?.topics as unknown[] || []),
          ].filter(Boolean);
          articleTokens.forEach((token) => addAlias(normalizeTaskBase(String(token)), task.__key));
        }
      });

      operations.forEach((op, idx) => {
        const opName = (op.function || '').toLowerCase();
        if (!opName) return;
        const idxTask = tasks[idx];
        const taskMatchByType = tasks.find(t => opName.includes(normalizeTaskBase('', t.type)));
        const key = idxTask?.__key || taskMatchByType?.__key;
        addAlias(opName, key);

        // Map channelName to task keys for article/channel ops
        const chanToken = normalizeTaskBase(String(op.args?.channelName || ''));
        if (chanToken) {
          const chanTask = tasks.find(t =>
            normalizeTaskBase(String(t.params?.channelName || '')).includes(chanToken) ||
            normalizeTaskBase(t.title || '').includes(chanToken)
          );
          if (chanTask?.__key) addAlias(chanToken, chanTask.__key);
        }
      });

    return aliases;
  };

  const buildOperationTaskMap = (tasks: GeminiTask[] = [], operations: GeminiOperation[] = []): Record<string, string> => {
    const map: Record<string, string> = {};
    operations.forEach((op, idx) => {
      const opName = (op.function || '').toLowerCase();
      const key = tasks[idx]?.__key || tasks.find(t => opName.includes(normalizeTaskBase('', t.type)))?.__key;
      if (opName && key && !map[opName]) {
        map[opName] = key;
      }
      // Map channel-specific ops to matching article tasks by channel name
      const chanToken = normalizeTaskBase(String(op.args?.channelName || ''));
      if (chanToken) {
        const taskMatch = tasks.find(t =>
          normalizeTaskBase(String(t.params?.channelName || '')).includes(chanToken) ||
          normalizeTaskBase(t.title || '').includes(chanToken)
        );
        if (taskMatch?.__key) {
          map[`${opName}:${chanToken}`] = taskMatch.__key;
        }
      }
    });
    return map;
  };

  const getTaskCardStateStyle = (state: string): React.CSSProperties => {
    if (state === 'running') {
      return {
        border: `2px solid ${colors.primary}`,
        boxShadow: '0 0 0 1px rgba(0, 164, 253, 0.28), 0 12px 30px rgba(0,0,0,0.35)',
        background: 'linear-gradient(140deg, rgba(0,164,253,0.12), rgba(0,164,253,0.06))',
        position: 'relative',
        overflow: 'hidden',
      };
    }
    if (state === 'complete') {
      return {
        border: `2px solid ${successColor}`,
        boxShadow: '0 0 0 1px rgba(45, 219, 143, 0.22), 0 12px 30px rgba(0,0,0,0.38)',
        background: 'linear-gradient(140deg, rgba(45,219,143,0.12), rgba(45,219,143,0.06))',
      };
    }
    if (state === 'failed') {
      return {
        border: `2px solid ${dangerColor}`,
        boxShadow: '0 0 0 1px rgba(255, 107, 107, 0.25), 0 12px 30px rgba(0,0,0,0.38)',
        background: 'linear-gradient(140deg, rgba(255,107,107,0.12), rgba(255,107,107,0.06))',
      };
    }
    return {};
  };

  // Get environment context for execution
  const getExecutionContext = () => {
    let apiToken, branchId, apiDomain, slug;

    if (selectedEnv === '__current__') {
      apiToken = currentApiToken;
      branchId = currentBranchId;
      apiDomain = currentDomain;
      slug = selectedEnvSlug;
    } else {
      const envObj = environments.find(e =>
        (e.slug === selectedEnv) ||
        (e.domain === selectedEnv) ||
        (e.branchId === selectedEnv)
      );
      if (envObj) {
        apiToken = envObj.fullToken || envObj.token;
        branchId = envObj.branchId;
        apiDomain = envObj.domain;
        slug = envObj.slug;
      }
    }

    // Fallback: derive slug from domain (e.g. "q1eira26.staffbase.com" → "q1eira26")
    if (!slug && apiDomain) {
      slug = apiDomain.split('.')[0];
    }

    return {
      apiToken,
      branchId,
      apiDomain: apiDomain || 'app.staffbase.com',
      slug,
      adminUserId: currentAdminId,
      environment: selectedEnv,
      onBlogScrapeConfirmation: async (blogUrl: string) => {
        return new Promise<void>((resolve, reject) => {
          setBlogScrapeConfirmation({ blogUrl, resolve, reject });
        });
      },
    };
  };

  const updateTaskStatusFromMessage = (message: string) => {
    if (!plan) return;
    const tasks = displayTasks;
    if (!tasks || tasks.length === 0 || !message) return;

    const lowerMsg = message.toLowerCase();
    const runningMatch = lowerMsg.match(/running:\s*([^\n]+)/i);
    const startMatch = lowerMsg.match(/starting:\s*([^\n]+)/i);
    const completeMatch = lowerMsg.match(/completed[:\s-]*\s*([^\n]+)/i);
    const failMatch = lowerMsg.match(/failed:\s*([^\n]+)/i);
    const titleFromMsg = runningMatch?.[1] || startMatch?.[1] || completeMatch?.[1] || failMatch?.[1];
    const normalizedFromMsg = titleFromMsg ? normalizeTaskBase(titleFromMsg) : null;
    const isStart = !!startMatch || !!runningMatch;
    const isComplete = !!completeMatch;
    // Only treat as failed for breaking errors (not per-user hiccups)
    const isFailed = !!failMatch && (
      message.trim().startsWith('❌') ||
      lowerMsg.includes('fatal') ||
      lowerMsg.includes('unable to') ||
      executionState === 'failed'
    );

    const aliasMatch = normalizedFromMsg ? taskAliasMap[normalizedFromMsg] : null;
    const opMatch = normalizedFromMsg ? operationTaskMap[normalizedFromMsg] : null;

    const channelTokens = tasks
      .map(t => String(t.params?.channelName || t.title || ''))
      .filter(Boolean)
      .map(tok => normalizeTaskBase(tok))
      .filter(Boolean);

    // Skip generic execution line
    if (!normalizedFromMsg && lowerMsg.includes('executing') && lowerMsg.includes('operations')) {
      return;
    }

    let matchKey = aliasMatch
      || opMatch
      || (normalizedFromMsg ? taskKeys.find((k) => normalizedFromMsg && k.includes(normalizedFromMsg)) : null);

    // If no direct op match, try operation+channel token combos
    if (!matchKey && normalizedFromMsg) {
      const opChanEntry = Object.entries(operationTaskMap || {}).find(([opKey]) => {
        if (!opKey.startsWith(`${normalizedFromMsg}:`)) return false;
        const token = opKey.split(':')[1];
        return token && lowerMsg.includes(token);
      });
      if (opChanEntry) {
        matchKey = opChanEntry[1];
      }
    }

    // If still no match, and message mentions a channel token, map to that task
    if (!matchKey && channelTokens.length) {
      const hitToken = channelTokens.find(tok => tok && lowerMsg.includes(tok));
      if (hitToken) {
        const chanTask = tasks.find(t =>
          normalizeTaskBase(String(t.params?.channelName || t.title || '')).includes(hitToken)
        );
        if (chanTask?.__key) {
          matchKey = chanTask.__key;
        }
      }
    }

    // Fuzzy alias match: if no direct hit, try partial inclusion against alias keys
    if (!matchKey && normalizedFromMsg && Object.keys(taskAliasMap).length) {
      const fuzzyKey = Object.keys(taskAliasMap).find((alias) =>
        normalizedFromMsg.includes(alias) || alias.includes(normalizedFromMsg)
      );
      if (fuzzyKey) {
        matchKey = taskAliasMap[fuzzyKey];
      }
    }
    let hintUsed = null;

    if (!matchKey) {
      // Fallback: match by known task types in message
      const typeHints = [
        { hint: 'branding', type: 'branding' },
        { hint: 'chat automation', type: 'chats' },
        { hint: 'chat', type: 'chats' },
        { hint: 'article', type: 'articles' },
        { hint: 'linkedin', type: 'linkedinarticles' },
        { hint: 'field', type: 'userfields' },
        { hint: 'user', type: 'userfields' },
        { hint: 'comment', type: 'comments' },
      ];
      const found = typeHints.find(({ hint }) => lowerMsg.includes(hint));
      if (found) {
        matchKey = taskKeys.find((k) => k.includes(found.type));
        hintUsed = found.type;
      }
      // Last resort: if there's exactly one chats task, route generic chat messages to it
      if (!matchKey && found?.type === 'chats') {
        const chatKeys = taskKeys.filter((k) => k.includes('chats') || k.includes('chat'));
        if (chatKeys.length === 1) {
          matchKey = chatKeys[0];
          hintUsed = 'singleChatTask';
        }
      }
      // If message mentions "operations" or "routing chat operations", also map to chats task when only one chat task exists
      if (!matchKey && lowerMsg.includes('chat operations')) {
        const chatKeys = taskKeys.filter((k) => k.includes('chats') || k.includes('chat'));
        if (chatKeys.length === 1) {
          matchKey = chatKeys[0];
          hintUsed = 'chatOperations';
        }
      }
    }

    // If still no match and we have a last active task, keep updating it for intermediate lines
    if (!matchKey && lastActiveTaskRef.current) {
      matchKey = lastActiveTaskRef.current;
      hintUsed = hintUsed || 'lastActive';
    }

    if (!matchKey) {
      return;
    }

    const taskEntry = tasks.find(t => t.__key === matchKey);
    const currentStatus = taskStatuses[matchKey];

    // If this task is already complete and we get another start for a similar op,
    // try to route to another pending task of the same type/channel to avoid regressions.
    if (isStart && currentStatus === 'complete' && taskEntry?.type) {
      const chanToken = normalizeTaskBase(String(taskEntry.params?.channelName || taskEntry.title || ''));
      const pendingSameType = tasks.find(t =>
        t.__key !== matchKey &&
        t.type === taskEntry.type &&
        taskStatuses[t.__key as string] !== 'complete' &&
        (!chanToken || normalizeTaskBase(String(t.params?.channelName || t.title || '')).includes(chanToken))
      ) || tasks.find(t => t.type === taskEntry.type && taskStatuses[t.__key as string] !== 'complete');
      if (pendingSameType) {
        matchKey = pendingSameType.__key;
      }
    }

    if (isStart || isComplete || isFailed) {
      lastActiveTaskRef.current = matchKey;
    }

    setTaskStatuses((prev) => {
      const next = { ...prev };
      if (isStart) next[matchKey] = 'running';
      if (isComplete) next[matchKey] = 'complete';
      if (isFailed) next[matchKey] = 'failed';
      return next;
    });
  };

  const handleRunPrompt = async () => {
    if (!promptText.trim()) {
      setError('Type a prompt to continue.');
      return;
    }
    setIsLoading(true);
    setError('');
    setPlan(null);
    setPlanPromptText('');
    setHasEditedAfterPlan(false);
    setExecutionState('idle');
    setShowCompletionActions(false);
    setCompletionFlash(false);
    setCurrentLogId(null);
    lastActiveTaskRef.current = null;
    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
    setExecutionProgress('');
    try {
      const ctx = getExecutionContext();

      setLoadingMessage('🔐 Authenticating with Gemini…');
      const result = await runPromptAutomation({
        prompt: promptText,
        environment: selectedEnv || 'Primary environment',
        apiToken: ctx.apiToken,
        branchId: ctx.branchId,
        apiDomain: ctx.apiDomain,
        onPhaseChange: setLoadingMessage,
      });
      setPlan(result);
      setPlanPromptText(promptText);
      setShowSamples(false);

      // Log the prompt and plan (non-blocking)
      fetch(LOG_PROMPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPrompt: promptText,
          environment: selectedEnv || 'Primary environment',
          tasks: result.legacyTasks || result.tasks,
          operations: result.operations,
          userFacingSummary: result.userFacingSummary,
          breakdown: result.breakdown,
        }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.id) {
            setCurrentLogId(data.id);
          }
        })
        .catch(err => console.error('[AskGeminiOverlay] Failed to log prompt:', err));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg || 'Unable to reach Gemini.');

      // Log the error (non-blocking)
      fetch(LOG_PROMPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPrompt: promptText,
          environment: selectedEnv || 'Primary environment',
          error: errMsg,
        }),
      }).catch(() => {});
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmAndRun = async () => {
    if (!plan) {
      setError('No plan to execute');
      return;
    }

    const ctx = getExecutionContext();

    if (!ctx.apiToken || !ctx.branchId) {
      setError(`Environment is missing required credentials. Found: token=${!!ctx.apiToken}, branchId=${!!ctx.branchId}`);
      return;
    }

    setIsExecuting(true);
    setExecutionState('running');
    setShowCompletionActions(false);
    setExecutionProgress('');
    setError('');
    setCurrentTask('');
    setCompletionFlash(false);
    setLatestBrandingData(null);
    lastActiveTaskRef.current = null;
    setTaskStatuses({});
    setTaskKeys([]);
    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }

    // Calculate total operations/tasks for progress
    const operationCount = plan.operations?.length || 0;
    const taskCount = (plan.tasks || plan.legacyTasks || []).filter(t => t.status !== 'unsupported').length;
    const totalSteps = operationCount || taskCount;
    setProgressData({ tasksCompleted: 0, totalTasks: totalSteps });
    // reset task status map to pending at start of execution
    const resetStatuses: Record<string, string> = {};
    const resetKeys: string[] = [];
    getDisplayTasks(plan).forEach((task, idx) => {
      const key = buildTaskKey(task.title, task.type, idx);
      resetStatuses[key] = 'pending';
      resetKeys.push(key);
    });
    setTaskStatuses(resetStatuses);
    setTaskKeys(resetKeys);

    let completedCount = 0;
    const onProgress = (message: string) => {
      setExecutionProgress(prev => prev + '\n' + message);
      setCurrentTask(message);
      updateTaskStatusFromMessage(message);

      // Track completion for top-level operations
      if (message.startsWith('✅ Completed:')) {
        completedCount++;
        setProgressData({ tasksCompleted: completedCount, totalTasks: totalSteps });
        return;
      }

      // For single-operation plans (e.g. addCommentsToArticles), show sub-step progress
      // by parsing "Processing article X/Y..." messages
      if (totalSteps === 1 && completedCount === 0) {
        const articleMatch = message.match(/Processing article (\d+)\/(\d+)/i);
        if (articleMatch) {
          const current = parseInt(articleMatch[1], 10);
          const total = parseInt(articleMatch[2], 10);
          setProgressData({ tasksCompleted: current - 1, totalTasks: total });
        }
      }
    };

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await executePlan(plan as any, ctx as any, onProgress) as any;

      if (result.success) {
        onProgress('\n\n✅ All operations completed successfully!');
        setCurrentTask('All operations completed');
        setExecutionState('complete');
        setCompletionFlash(true);
        setShowCompletionActions(true);
        completionTimerRef.current = setTimeout(() => {
          setCompletionFlash(false);
        }, 2000);

        // Update log with execution success
        if (currentLogId) {
          fetch(LOG_PROMPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              logId: currentLogId,
              executed: true,
              executionSuccess: true,
            }),
          }).catch(() => {});
        }

        // Pull branding data from CSS when branding was part of the request
        let brandingData = null;
        if (hasBrandingTask && ctx.apiToken && ctx.apiDomain) {
          try {
            const css = await fetchCurrentCSS(ctx.apiToken, ctx.apiDomain);
            const parsed = parseBrandingFromCSS(css, blockRegex);
            brandingData = {
              prospectName: parsed.prospectName,
              primaryColor: parsed.primaryColor,
              textColor: parsed.textColor,
              backgroundColor: parsed.backgroundColor,
              floatingNavBgColor: parsed.floatingNavBgColor,
              floatingNavTextColor: parsed.floatingNavTextColor,
              logoUrl: parsed.logoUrl,
              bgUrl: parsed.bgUrl,
              bgVertical: parsed.bgVertical,
              headerTransparency: parsed.headerTransparency,
              logoHeight: parsed.logoHeight,
              logoMarginTop: parsed.logoMarginTop,
              logoPadWidth: parsed.logoPadWidth,
              logoPadHeight: parsed.logoPadHeight,
              changeLogoSize: parsed.changeLogoSize,
            };
          } catch (e) {
            console.warn('[AskGeminiOverlay] Failed to pull branding from CSS:', e);
          }
        }

        setLatestBrandingData(hasBrandingTask ? brandingData : null);

        // Save to prompt history
        if (onAddToHistory) {
          onAddToHistory({
            promptText: planPromptText || promptText,
            environment: selectedEnv,
            plan: {
              userFacingSummary: plan.userFacingSummary,
              breakdown: plan.breakdown,
              tasks: plan.legacyTasks || plan.tasks,
            },
            executionLog: {
              status: 'complete',
              fullLog: executionProgress,
              completedTasks: progressData.tasksCompleted,
              totalTasks: progressData.totalTasks,
            },
            hasBrandingTask,
            brandingData,
          });
        }
      } else if (result.errors?.length) {
        onProgress(`\n\n⚠️ Completed with ${result.errors.length} error(s)`);
        setExecutionState('failed');

        // Update log with execution errors
        if (currentLogId) {
          fetch(LOG_PROMPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              logId: currentLogId,
              executed: true,
              executionSuccess: false,
              executionErrors: result.errors,
            }),
          }).catch(() => {});
        }

        // Save to prompt history even if errors occurred
        if (onAddToHistory) {
          onAddToHistory({
            promptText: planPromptText || promptText,
            environment: selectedEnv,
            plan: {
              userFacingSummary: plan.userFacingSummary,
              breakdown: plan.breakdown,
              tasks: plan.legacyTasks || plan.tasks,
            },
            executionLog: {
              status: 'failed',
              fullLog: executionProgress,
              completedTasks: progressData.tasksCompleted,
              totalTasks: progressData.totalTasks,
              errors: result.errors,
            },
            hasBrandingTask: false,
            brandingData: null,
          });
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg || 'An error occurred during execution');
      onProgress(`\n\n❌ Error: ${errMsg}`);
      setExecutionState('failed');

      // Update log with execution error
      if (currentLogId) {
        fetch(LOG_PROMPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            logId: currentLogId,
            executed: true,
            executionSuccess: false,
            executionErrors: [{ message: errMsg }],
          }),
        }).catch(() => {});
      }

      // Save to prompt history even if execution threw an error
      if (onAddToHistory && plan) {
        onAddToHistory({
          promptText: planPromptText || promptText,
          environment: selectedEnv,
          plan: {
            userFacingSummary: plan.userFacingSummary,
            breakdown: plan.breakdown,
            tasks: plan.legacyTasks || plan.tasks,
          },
          executionLog: {
            status: 'failed',
            fullLog: executionProgress,
            completedTasks: progressData.tasksCompleted,
            totalTasks: progressData.totalTasks,
            errors: [{ message: errMsg }],
          },
          hasBrandingTask: false,
          brandingData: null,
        });
      }
    } finally {
      setIsExecuting(false);
    }
  };

  const hasPrompt = promptText.trim().length > 0;
  const notInStaffbaseTab = !isStaffbaseTab;
  const primaryDisabled = !hasPrompt || isLoading || isExecuting || notInStaffbaseTab || Boolean(plan && !hasEditedAfterPlan);
  const confirmDisabled = !plan || isLoading || isExecuting || !hasPrompt || notInStaffbaseTab;
  const staffbaseTooltip = notInStaffbaseTab ? 'You must be in a Staffbase tab to perform any actions' : '';
  const primaryLabel = plan && hasEditedAfterPlan ? 'Modify plan' : 'Generate plan';
  const lowerPrompt = promptText.toLowerCase();
  const specialFeatures = ['widget', 'widgets', 'stock ticker', 'ticker', 'page layout', 'layouts', 'new page', 'new pages'];
  const specialRequested = specialFeatures.filter((feature) => lowerPrompt.includes(feature));
  const isPlanMuted = plan && hasEditedAfterPlan;
  const overlayStatus = executionState;
  const showInputArea = !isExecuting && !showCompletionActions;
  const overlayCardDynamicStyle = overlayStatus === 'running'
    ? {
      border: `2px solid ${colors.primary}`,
      boxShadow: '0 0 0 2px rgba(0, 164, 253, 0.35), 0 30px 80px rgba(0, 0, 0, 0.55)',
      background: 'linear-gradient(145deg, rgba(15,31,56,0.97), rgba(16,37,68,0.94))',
    }
    : overlayStatus === 'complete'
      ? {
        border: `2px solid ${successColor}`,
        boxShadow: '0 0 0 2px rgba(45, 219, 143, 0.32), 0 30px 80px rgba(0, 0, 0, 0.6)',
        background: 'linear-gradient(145deg, rgba(18,39,38,0.9), rgba(16,37,68,0.92))',
      }
      : overlayStatus === 'failed'
        ? {
          border: `2px solid ${dangerColor}`,
          boxShadow: '0 0 0 2px rgba(255, 107, 107, 0.32), 0 30px 80px rgba(0, 0, 0, 0.6)',
          background: 'linear-gradient(145deg, rgba(40,18,24,0.9), rgba(16,37,68,0.92))',
        }
        : {};
  const taskStatusValues = Object.values(taskStatuses);
  const aggregateTaskState = taskStatusValues.length
    ? (taskStatusValues.some((v) => v === 'failed')
      ? 'failed'
      : taskStatusValues.some((v) => v === 'running')
        ? 'running'
        : taskStatusValues.every((v) => v === 'complete')
          ? 'complete'
          : 'pending')
    : overlayStatus;

  const BRANDING_OPERATION_NAMES = new Set([
    'applyBrandColors',
    'setLogo',
    'setHeaderTransparency',
    'setBackground',
    'setLogoSize',
    'commitBranding',
    'applyFullBranding',
  ]);

  // Check if branding was part of the executed plan
  const hasBrandingTask = Boolean(plan && (
    (plan.legacyTasks || plan.tasks || []).some(
      task => task.type === 'branding' || (task.title || '').toLowerCase().includes('branding')
    ) ||
    (plan.operations || []).some(op => {
      const opName = (op.function || '').toString();
      return BRANDING_OPERATION_NAMES.has(opName) || opName.toLowerCase().includes('brand');
    })
  ));

  // Get the slug for the selected environment
  const getSelectedEnvSlug = () => {
    if (selectedEnv === '__current__') {
      return selectedEnvSlug || useOption?.slug;
    }
    const envObj = environments.find(e =>
      (e.slug === selectedEnv) ||
      (e.domain === selectedEnv) ||
      (e.branchId === selectedEnv)
    );
    return envObj?.slug;
  };

  // Get tasks for display (prefer legacyTasks for UI, or tasks)
  const displayTasks = (plan ? getDisplayTasks(plan) : []).map((task, idx) => ({
    ...task,
    __key: buildTaskKey(task.title, task.type, idx),
  }));

  const ContentBody = ({ task }: { task: GeminiTask & { __key: string } }) => {
    const isBrandingTask = task.type === 'branding' || (task.title || '').toLowerCase().includes('branding');
    const taskState = taskStatuses[task.__key];
    const showModifyBranding = isBrandingTask && (executionState === 'complete' || taskState === 'complete') && onNavigateToBranding;

    return (
      <>
        <p style={{ margin: '0 0 6px', fontWeight: 600 }}>{task.title}</p>
        <p style={{ margin: 0, fontSize: '13px', color: 'rgba(232, 241, 255, 0.8)' }}>
          {task.details}
        </p>
        {Array.isArray(task.colors) && task.colors.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            {task.colors.map((color) => (
              <div
                key={color}
                title={color}
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: color,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                }}
              />
            ))}
          </div>
        )}
        {task.status === 'unsupported' && (
          <p style={{ ...geminiFooterStyle, marginTop: '8px', color: colors.warning }}>
            Not available yet, please give us your feedback.
          </p>
        )}
        {showModifyBranding && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const envSlug = getSelectedEnvSlug();
              if (envSlug) onNavigateToBranding(envSlug, latestBrandingData);
            }}
            style={{
              marginTop: '12px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: `1px solid ${colors.overlayBorder}`,
              background: 'rgba(255,255,255,0.1)',
              color: colors.overlayText,
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.18)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          >
            Modify branding
          </button>
        )}
      </>
    );
  };

  return (
    <>
      {!isOpen && isOnHomeScreen && (
        <button
          style={{
            ...floatingSparkleButtonStyle,
            transform: isLauncherHovering ? 'translateY(-2px)' : floatingSparkleButtonStyle.transform,
            boxShadow: isLauncherHovering ? '0 18px 42px rgba(0, 164, 253, 0.48)' : floatingSparkleButtonStyle.boxShadow,
          }}
          onMouseEnter={() => setIsLauncherHovering(true)}
          onMouseLeave={() => setIsLauncherHovering(false)}
          onClick={onOpen}
          title="Ask Gemini"
          aria-label="Open Gemini overlay"
        >
          <RiSparkling2Line size={24} color={colors.textOnPrimary} />
        </button>
      )}

      {isOpen && (
        <div style={geminiOverlayBackdropStyle}>
          <div style={{ ...geminiOverlayCardStyle, ...overlayCardDynamicStyle, transition: 'border 0.2s ease, box-shadow 0.2s ease, background 0.25s ease', position: 'relative' }}>
            {showGeminiBlockingLoader && (
              <div
                aria-live="polite"
                aria-busy="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 30,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: colors.primaryOverlay20,
                  borderRadius: '18px',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <HeartLoader size={110} />
                {loadingMessage && (
                  <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.85)', textAlign: 'center', maxWidth: 180 }}>
                    {loadingMessage}
                  </p>
                )}
              </div>
              </div>
            )}
            <button
              style={{
                ...geminiCloseButtonStyle,
                transform: isCloseHovering ? 'translateY(-2px)' : 'translateY(0)',
                background: isCloseHovering ? 'rgba(255, 255, 255, 0.12)' : geminiCloseButtonStyle.background,
              }}
              onClick={onClose}
              onMouseEnter={() => setIsCloseHovering(true)}
              onMouseLeave={() => setIsCloseHovering(false)}
              aria-label="Close Gemini overlay"
            >
              <IoClose size={18} />
            </button>

            {executionState === 'complete' && (
              <div style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: successColor,
                boxShadow: '0 0 0 6px rgba(45, 219, 143, 0.2)',
                display: 'grid',
                placeItems: 'center',
              }}>
                <IoCheckmarkSharp size={22} color="#ffffff" />
              </div>
            )}

            {completionFlash && (
              <div style={{
                position: 'absolute',
                top: '70px',
                right: '32px',
                padding: '10px 14px',
                borderRadius: '14px',
                background: 'rgba(45, 219, 143, 0.18)',
                border: `1px solid rgba(45, 219, 143, 0.6)`,
                color: colors.successLight,
                fontWeight: 700,
                letterSpacing: '0.3px',
                boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
              }}>
                Completed! Close tab
              </div>
            )}

            {showCompletionActions && executionState === 'complete' && (
              <div
                onClick={(e) => { if (e.target === e.currentTarget) setShowCompletionActions(false); }}
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0, 20, 40, 0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: '14px',
                  zIndex: 1000,
                  backdropFilter: 'blur(8px)',
                  cursor: 'pointer',
                }}>
                <p style={{ margin: 0, fontWeight: 700, letterSpacing: '0.2px', color: colors.overlayText }}>Completed! What next?</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '220px' }}>
                  <button
                    onClick={() => { setShowCompletionActions(false); onClose(); }}
                    style={{
                      ...geminiActionButtonStyle,
                      background: 'rgba(255,255,255,0.12)',
                      color: colors.overlayText,
                      border: `1px solid ${colors.overlayBorder}`,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.18)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                  >
                    Go back
                  </button>
                  {hasBrandingTask && onNavigateToBranding && (
                    <button
                      onClick={() => {
                        const envSlug = getSelectedEnvSlug();
                        if (envSlug) onNavigateToBranding(envSlug, latestBrandingData);
                      }}
                      style={{
                        ...geminiActionButtonStyle,
                        background: 'rgba(255,255,255,0.08)',
                        color: colors.overlayText,
                        border: `1px solid ${colors.overlayBorder}`,
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.14)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                    >
                      Update branding
                    </button>
                  )}
                  <button
                    onClick={scrollToLog}
                    style={{
                      ...geminiActionButtonStyle,
                      background: 'rgba(255,255,255,0.08)',
                      color: colors.overlayText,
                      border: `1px solid ${colors.overlayBorder}`,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.14)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                  >
                    View log
                  </button>
                  <button
                    onClick={handleNewPromptAction}
                    style={{
                      ...geminiActionButtonStyle,
                      background: colors.primary,
                      color: colors.textOnPrimary,
                      border: 'none',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = colors.primaryLight}
                    onMouseLeave={(e) => e.currentTarget.style.background = colors.primary}
                  >
                    New prompt
                  </button>
                </div>
              </div>
            )}

            <div style={{ ...geminiHeaderStyle, marginTop: '40px' }}>
              <RiSparkling2Line size={22} color={colors.primary} />
              <div>
                <p style={geminiTitleStyle}>prompt-based automation</p>
              </div>
            </div>

            {/* Tab toggle for New prompt / History */}
            {promptHistory.length > 0 && !isExecuting && !showCompletionActions && (
              <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                <button
                  onClick={() => { setViewMode('new'); setSelectedHistoryItem(null); }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: viewMode === 'new' ? colors.primary : 'rgba(255,255,255,0.08)',
                    color: viewMode === 'new' ? colors.textOnPrimary : colors.overlayText,
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 600,
                    transition: 'background 0.15s ease',
                  }}
                >
                  New prompt
                </button>
                <button
                  onClick={() => setViewMode('history')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: viewMode === 'history' ? colors.primary : 'rgba(255,255,255,0.08)',
                    color: viewMode === 'history' ? colors.textOnPrimary : colors.overlayText,
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 600,
                    transition: 'background 0.15s ease',
                  }}
                >
                  History ({promptHistory.length})
                </button>
              </div>
            )}

            {/* History view */}
            {viewMode === 'history' && !selectedHistoryItem && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {promptHistory.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedHistoryItem(item)}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '12px',
                      border: `1px solid ${colors.overlayBorder}`,
                      background: 'rgba(255,255,255,0.04)',
                      color: colors.overlayText,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                  >
                    <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: '14px' }}>
                      {item.promptText.length > 80 ? item.promptText.slice(0, 80) + '...' : item.promptText}
                    </p>
                    <p style={{ margin: 0, fontSize: '12px', color: colors.overlayTextFaint }}>
                      {new Date(item.timestamp).toLocaleDateString()} {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {' • '}{item.environment}
                      {item.executionLog?.status === 'complete' && ' • ✅ Completed'}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {/* Selected history item detail view */}
            {viewMode === 'history' && selectedHistoryItem && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <button
                  onClick={() => setSelectedHistoryItem(null)}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${colors.overlayBorder}`,
                    background: 'rgba(255,255,255,0.06)',
                    color: colors.overlayText,
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  ← Back to history
                </button>
                <div style={{
                  ...geminiTaskCardStyle,
                  background: 'linear-gradient(140deg, rgba(0, 164, 253, 0.12), rgba(0, 164, 253, 0.05))',
                  borderColor: 'rgba(0, 164, 253, 0.3)',
                }}>
                  <p style={{ margin: '0 0 8px', fontWeight: 600 }}>{selectedHistoryItem.promptText}</p>
                  {selectedHistoryItem.plan?.userFacingSummary && (
                    <p style={{ margin: '0 0 8px', fontSize: '13px', color: 'rgba(232, 241, 255, 0.85)' }}>
                      {selectedHistoryItem.plan.userFacingSummary}
                    </p>
                  )}
                  <p style={{ margin: 0, fontSize: '12px', color: colors.overlayTextFaint }}>
                    {new Date(selectedHistoryItem.timestamp).toLocaleDateString()} {new Date(selectedHistoryItem.timestamp).toLocaleTimeString()}
                    {' • '}{selectedHistoryItem.environment}
                  </p>
                </div>

                {/* Show tasks from history */}
                {(selectedHistoryItem.plan?.tasks?.length ?? 0) > 0 && (
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {(selectedHistoryItem.plan?.tasks ?? []).map((task, idx) => (
                      <div key={idx} style={{
                        ...geminiTaskCardStyle,
                        border: `2px solid ${successColor}`,
                        background: 'linear-gradient(140deg, rgba(45,219,143,0.08), rgba(45,219,143,0.03))',
                      }}>
                        <p style={{ margin: '0 0 4px', fontWeight: 600 }}>{task.title}</p>
                        {task.details && (
                          <p style={{ margin: 0, fontSize: '13px', color: 'rgba(232, 241, 255, 0.8)' }}>{task.details}</p>
                        )}
                        {/* Modify branding button for branding tasks */}
                        {(task.type === 'branding' || (task.title || '').toLowerCase().includes('branding')) && onNavigateToBranding && (
                          <button
                            onClick={() => {
                              const envSlug = selectedHistoryItem.environment === '__current__'
                                ? (selectedEnvSlug || useOption?.slug)
                                : environments.find(e => e.slug === selectedHistoryItem.environment || e.domain === selectedHistoryItem.environment)?.slug;
                              if (envSlug) onNavigateToBranding(envSlug, selectedHistoryItem.brandingData || null);
                            }}
                            style={{
                              marginTop: '10px',
                              padding: '8px 14px',
                              borderRadius: '8px',
                              border: `1px solid ${colors.overlayBorder}`,
                              background: 'rgba(255,255,255,0.08)',
                              color: colors.overlayText,
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 600,
                            }}
                          >
                            Modify branding
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Execution log */}
                {selectedHistoryItem.executionLog?.fullLog && (
                  <div style={{
                    padding: '12px',
                    background: 'rgba(0, 164, 253, 0.05)',
                    border: '1px solid rgba(0, 164, 253, 0.2)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                    color: colors.overlayText,
                    maxHeight: '200px',
                    overflowY: 'auto',
                    fontFamily: 'monospace',
                  }}>
                    {selectedHistoryItem.executionLog.fullLog}
                  </div>
                )}
              </div>
            )}

            <div style={{ ...geminiFieldShellStyle, display: viewMode === 'new' ? 'flex' : 'none' }}>
              {showInputArea ? (
                <>
                  <select
                    value={selectedEnv}
                    onChange={(e) => setSelectedEnv(e.target.value)}
                    style={geminiSelectStyle}
                  >
                    {currentApiToken && currentBranchId && (
                      <option value="__current__">Current Environment</option>
                    )}
                    {environments.length === 0 && !currentApiToken && (
                      <option>No environment available</option>
                    )}
                    {environments.map((env) => (
                      <option key={env.slug || env.branchId || env.domain} value={env.slug || env.domain || env.branchId}>
                        {env.slug || env.domain || env.branchId || 'Environment'}
                      </option>
                    ))}
                  </select>

                  <div style={{ position: 'relative', width: '100%' }}>
                    <textarea
                      value={promptText}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setPromptText(nextValue);
                        if (plan) {
                          const original = planPromptText.trim();
                          const current = nextValue.trim();
                          setHasEditedAfterPlan(original ? original !== current : true);
                        }
                      }}
                      onFocus={() => {
                        if (!showSamples) {
                          shuffleSamples();
                          setShowSamples(true);
                        }
                      }}
                      style={{
                        ...geminiInputStyle,
                        ...(isLoading || (plan && !hasEditedAfterPlan) ? geminiInputMutedStyle : {}),
                      }}
                      placeholder="ask gemini"
                      aria-label="Ask Gemini"
                      disabled={isLoading}
                    />
                    {promptText.trim() && !isLoading && (
                      <button
                        onClick={() => {
                          setPromptText('');
                          setPlan(null);
                          setPlanPromptText('');
                          setHasEditedAfterPlan(false);
                        }}
                        style={{
                          position: 'absolute',
                          bottom: '10px',
                          right: '10px',
                          background: 'rgba(255,255,255,0.12)',
                          border: 'none',
                          borderRadius: '50%',
                          width: '22px',
                          height: '22px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: colors.overlayText,
                          transition: 'background 0.15s ease',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                        title="Clear prompt"
                        aria-label="Clear prompt"
                      >
                        <IoClose size={14} />
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button
                      onClick={handleRunPrompt}
                      style={{
                        ...geminiActionButtonStyle,
                        background: primaryDisabled ? '#2a3b5c' : colors.primary,
                        color: primaryDisabled ? '#c5d0e0' : colors.textOnPrimary,
                        cursor: primaryDisabled ? 'not-allowed' : 'pointer',
                        transition: 'background 0.2s ease, transform 0.15s ease',
                        opacity: notInStaffbaseTab ? 0.6 : 1,
                      }}
                      disabled={primaryDisabled}
                      title={staffbaseTooltip}
                      onMouseEnter={(e) => { if (!primaryDisabled) e.currentTarget.style.background = colors.primaryLight; }}
                      onMouseLeave={(e) => { if (!primaryDisabled) e.currentTarget.style.background = colors.primary; }}
                      onMouseDown={(e) => { if (!primaryDisabled) e.currentTarget.style.transform = 'translateY(1px)'; }}
                      onMouseUp={(e) => { if (!primaryDisabled) e.currentTarget.style.transform = 'translateY(0)'; }}
                    >
                      {isLoading ? 'Thinking…' : primaryLabel}
                    </button>
                    {plan && !hasEditedAfterPlan && (
                      <button
                        onClick={handleConfirmAndRun}
                        style={{
                          ...geminiActionButtonStyle,
                          background: confirmDisabled ? '#2a3b5c' : 'rgba(255,255,255,0.06)',
                          color: confirmDisabled ? '#c5d0e0' : colors.overlayText,
                          border: `1px solid ${colors.overlayBorder}`,
                          cursor: confirmDisabled ? 'not-allowed' : 'pointer',
                          transition: 'background 0.2s ease, transform 0.15s ease',
                          opacity: notInStaffbaseTab ? 0.6 : 1,
                        }}
                        disabled={confirmDisabled}
                        title={staffbaseTooltip}
                        onMouseEnter={(e) => { if (!confirmDisabled) e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
                        onMouseLeave={(e) => { if (!confirmDisabled) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                        onMouseDown={(e) => { if (!confirmDisabled) e.currentTarget.style.transform = 'translateY(1px)'; }}
                        onMouseUp={(e) => { if (!confirmDisabled) e.currentTarget.style.transform = 'translateY(0)'; }}
                      >
                        {isExecuting ? 'Executing...' : 'Confirm & run'}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ padding: '14px 16px', borderRadius: '14px', border: `1px dashed ${colors.overlayBorder}`, background: 'rgba(255,255,255,0.04)', color: colors.overlayText, fontSize: '14px', letterSpacing: '0.2px' }}>
                  Executing tasks… inputs are hidden until completion.
                </div>
              )}

              {showSamples && samplePrompts.length > 0 && !plan && (
                <div
                  style={{
                    width: '100%',
                    marginTop: '4px',
                    opacity: showSamples ? 1 : 0,
                    transform: showSamples ? 'translateY(0)' : 'translateY(8px)',
                    transition: 'opacity 0.25s ease, transform 0.25s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <p style={{ ...geminiFooterStyle, margin: 0, letterSpacing: '0.3px' }}>Need inspiration? Try a sample prompt:</p>
                    <button
                      style={{
                        ...geminiActionButtonStyle,
                        minWidth: 'auto',
                        padding: '8px 12px',
                        background: 'rgba(255,255,255,0.08)',
                        border: `1px solid ${colors.overlayBorder}`,
                        color: colors.overlayText,
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                      onClick={shuffleSamples}
                    >
                      Shuffle
                    </button>
                  </div>
                  <div style={geminiSampleGridStyle}>
                    {samplePrompts.map((sample, idx) => (
                      <button
                        key={sample}
                        onClick={() => {
                          setPromptText(sample);
                          if (plan) {
                            const original = planPromptText.trim();
                            const current = sample.trim();
                            setHasEditedAfterPlan(original ? original !== current : true);
                          }
                        }}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '12px',
                          border: `1px solid ${colors.overlayBorder}`,
                          background: idx % 2 === 0 ? 'linear-gradient(140deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))' : 'linear-gradient(140deg, rgba(0,164,253,0.08), rgba(255,255,255,0.04))',
                          color: colors.overlayText,
                          cursor: 'pointer',
                          fontSize: '13px',
                          textAlign: 'left',
                          boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
                          transition: 'transform 0.15s ease, box-shadow 0.15s ease, background 0.3s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 10px 26px rgba(0,0,0,0.22)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.18)';
                        }}
                        onMouseDown={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                        onMouseUp={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }}
                      >
                        {sample}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <p style={{ ...geminiFooterStyle, color: '#ffb4b4' }}>{error}</p>
            )}

            {specialRequested.length > 0 && (
              <p style={{ ...geminiFooterStyle, color: colors.warning }}>
                This feature is actively being worked on and will be out in the next release of prompt-based automation ({specialRequested.join(', ')}).
              </p>
            )}

            {/* New: Display userFacingSummary and breakdown */}
            {plan && plan.userFacingSummary && (
              <div style={{
                ...geminiTaskCardStyle,
                background: 'linear-gradient(140deg, rgba(0, 164, 253, 0.12), rgba(0, 164, 253, 0.05))',
                borderColor: 'rgba(0, 164, 253, 0.3)',
                marginBottom: '12px',
                ...getTaskCardStateStyle(aggregateTaskState),
                transition: 'all 0.25s ease',
                opacity: isPlanMuted ? 0.45 : 1,
                filter: isPlanMuted ? 'grayscale(0.3)' : 'none',
                overflow: 'visible',
              }}>
                <p style={{ margin: '0 0 10px', fontWeight: 600, fontSize: '15px', lineHeight: '1.5' }}>
                  {plan.userFacingSummary}
                </p>
                {plan.breakdown && plan.breakdown.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'rgba(232, 241, 255, 0.85)' }}>
                    {plan.breakdown.map((item, idx) => (
                      <li key={idx} style={{ marginBottom: '4px' }}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Legacy task cards display */}
            {plan && displayTasks.length > 0 && (
              <div style={{ display: 'grid', gap: '12px' }}>
                {displayTasks.map((task, idx) => {
                  const state = taskStatuses[task.__key] || 'pending';
                  const isRunning = isExecuting && state === 'running';
                  const cardStyle = isRunning
                    ? {
                      ...geminiTaskCardStyle,
                      ...getTaskCardStateStyle(state),
                      background: 'transparent',
                      boxShadow: 'none',
                      padding: '2px',
                    }
                    : {
                      ...geminiTaskCardStyle,
                      ...getTaskCardStateStyle(state),
                    };
                  return (
                    <div
                      key={task.__key || `${task.title}-${idx}`}
                      className={isRunning ? 'ag-snake-card' : 'ag-task-card'}
                      style={{
                        ...cardStyle,
                        transition: 'all 0.25s ease',
                        opacity: isPlanMuted ? 0.45 : 1,
                        filter: isPlanMuted ? 'grayscale(0.3)' : 'none',
                      }}
                    >
                      {isRunning ? (
                        <div className="ag-snake-content">
                          <ContentBody task={task} />
                        </div>
                      ) : (
                        <div style={{ position: 'relative', zIndex: 1 }}>
                          <ContentBody task={task} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {isExecuting && progressData.totalTasks > 0 && (
              <div style={{ marginTop: '16px' }}>
                <ProgressBar
                  progressData={{
                    tasksCompleted: progressData.tasksCompleted,
                    totalTasks: progressData.totalTasks,
                    currentUser: undefined,
                    currentStatus: currentTask,
                  }}
                  initialTimeEstimate={0}
                  theme="dark"
                />
              </div>
            )}

            {executionProgress && (
              <div style={{ marginTop: '16px' }} ref={logSectionRef}>
                <button
                  onClick={() => setIsLogExpanded(!isLogExpanded)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'rgba(0, 164, 253, 0.1)',
                    border: '1px solid rgba(0, 164, 253, 0.3)',
                    borderRadius: '8px',
                    color: colors.overlayText,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  <span>Execution Log</span>
                  {isLogExpanded ? <IoChevronUp size={18} /> : <IoChevronDown size={18} />}
                </button>
                {isLogExpanded && (
                  <div style={{
                    marginTop: '8px',
                    padding: '12px',
                    background: 'rgba(0, 164, 253, 0.05)',
                    border: '1px solid rgba(0, 164, 253, 0.2)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                    color: colors.overlayText,
                    maxHeight: '200px',
                    overflowY: 'auto',
                    fontFamily: 'monospace',
                  }}>
                    {executionProgress}
                  </div>
                )}
              </div>
            )}

            <p style={geminiFooterStyle}>
              Be cautious with AI features; make sure you have time before your demo to review and confirm everything looks good after applying.
            </p>
            <p style={{ ...geminiFooterStyle, marginTop: '4px' }}>
              Note: your prompts help us build this feature out faster. Please share feedback while we improve this. Your assistance is greatly appreciated.
            </p>
          </div>
        </div>
      )}

      {/* Blog Scrape Confirmation Modal */}
      {blogScrapeConfirmation && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: '#1a2332',
            padding: '32px',
            borderRadius: '12px',
            maxWidth: '550px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <h3 style={{
              margin: '0 0 20px 0',
              fontSize: '20px',
              fontWeight: '600',
              color: '#ffffff'
            }}>
              Ready to Scrape Blog
            </h3>
            <p style={{
              margin: '0 0 12px 0',
              color: '#b8c5d6',
              fontSize: '14px'
            }}>
              Replify will open this blog in a new tab:
            </p>
            <code style={{
              display: 'block',
              padding: '12px',
              background: '#0f1722',
              borderRadius: '6px',
              margin: '0 0 16px 0',
              wordBreak: 'break-all',
              color: '#4fc3f7',
              fontSize: '13px',
              border: '1px solid rgba(79, 195, 247, 0.2)'
            }}>
              {blogScrapeConfirmation.blogUrl}
            </code>
            <div style={{
              background: 'rgba(102, 126, 234, 0.1)',
              border: '1px solid rgba(102, 126, 234, 0.3)',
              borderRadius: '6px',
              padding: '12px 16px',
              margin: '0 0 16px 0'
            }}>
              <p style={{
                margin: '0 0 12px 0',
                color: '#fff',
                fontSize: '14px',
                fontWeight: '600'
              }}>
                📋 After the blog opens, choose ONE of these:
              </p>
              <ol style={{
                margin: '0',
                paddingLeft: '20px',
                color: '#b8c5d6',
                fontSize: '13px',
                lineHeight: '1.8'
              }}>
                <li><strong style={{ color: '#fff' }}>Right-click</strong> on the blog page → select <strong style={{ color: '#4fc3f7' }}>"Replify: Scrape this blog"</strong></li>
                <li>OR press <strong style={{ color: '#fff' }}>Ctrl+Shift+S</strong> (Mac: <strong style={{ color: '#fff' }}>Cmd+Shift+S</strong>)</li>
              </ol>
            </div>
            <p style={{
              margin: '0 0 24px 0',
              color: '#8a95a6',
              fontSize: '12px',
              lineHeight: '1.4',
              fontStyle: 'italic'
            }}>
              You have 90 seconds to trigger the scrape.
            </p>
            <div style={{
              display: 'flex',
              gap: '12px'
            }}>
              <button
                onClick={() => {
                  blogScrapeConfirmation.reject(new Error('User cancelled scrape'));
                  setBlogScrapeConfirmation(null);
                }}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  background: 'transparent',
                  color: '#b8c5d6',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // User confirmed - resolve and continue with scraping
                  blogScrapeConfirmation.resolve();
                  setBlogScrapeConfirmation(null);
                }}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
                }}
              >
                Scrape Now
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AskGeminiOverlay;

// Keyframes for animated border (injected via style tag)
const styleSheetId = 'ask-gemini-overlay-animations';
if (typeof document !== 'undefined' && !document.getElementById(styleSheetId)) {
  const style = document.createElement('style');
  style.id = styleSheetId;
  style.innerHTML = `
    @keyframes rotateBorder {
      from { transform: translate(-50%, -50%) rotate(0deg); }
      to { transform: translate(-50%, -50%) rotate(360deg); }
    }
    
    /* THE OUTER CARD (The Mask) */
    .ag-snake-card {
      position: relative;
      overflow: hidden !important;
      z-index: 0;
      /* The padding here defines the BORDER THICKNESS */
      padding: 2px !important;
      border: none !important;
    }

    /* THE SPINNING GRADIENT */
    .ag-snake-card::before {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
      width: 250%;
      height: 250%;
      background: conic-gradient(
        transparent 0deg,
        transparent 60deg,
        transparent 90deg,
        #00a4fd 360deg
      );
      transform: translate(-50%, -50%);
      animation: rotateBorder 3s linear infinite;
      z-index: -1;
    }

    /* THE INNER CONTENT (Solid Background) */
    .ag-snake-content {
      background: #131f32; /* Needs to match your card background color */
      width: 100%;
      box-sizing: border-box;
      border-radius: 10px; /* Slightly smaller than parent radius */
      padding: 16px; /* Move your original padding here */
      position: relative;
      z-index: 1;
    }
  `;
  document.head.appendChild(style);
}
