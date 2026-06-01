import buildPreviewCss from './buildPreviewCss';
import { fetchCurrentCSS, postUpdatedCSS } from './staffbaseCss';
import { normaliseLinkedInUrl, isLinkedInUrl, buildApiUrl, parseJsonArray } from './helpers';
import { getGeminiProxyUrl } from './geminiProxy';
import { fetchSharedDemoPassword } from './sharedDemoPasswordProxy';
import { ensureContrast } from './automationOperations/environment';
import { generateAndCreateArticles } from './automationOperations/articles';
import { addCommentsToArticles } from './automationOperations';

// --- Internal types for task runners ---
interface TaskParams {
  prospectName?: string;
  logoUrl?: string;
  logo?: string;
  primaryColor?: string;
  textColor?: string;
  floatingNavBg?: string;
  floatingNavText?: string;
  backgroundColor?: string;
  background?: string;
  bgUrl?: string;
  bg?: string;
  padW?: number;
  padH?: number;
  logoPadWidth?: number;
  logoPadHeight?: number;
  bgVertical?: number;
  bgVert?: number;
  headerTransparency?: number;
  changeLogoSize?: boolean;
  logoHeight?: number;
  logoMarginTop?: number;
  articleCount?: number;
  linkedInUrl?: string;
  locales?: string[];
  chatCount?: number;
  topics?: string[] | unknown;
  chatMode?: string;
  groupName?: string;
  groupId?: string | null;
  chatTitle?: string;
  participantIds?: string[];
  userIds?: string[];
  participantEmails?: string[];
  userEmails?: string[];
  users?: Record<string, unknown>[];
  participantCount?: number;
  operationsArgs?: Record<string, unknown>;
  articleIds?: string[];
  channelId?: string;
  userCount?: number;
  includeReplies?: boolean;
  adminUserId?: string;
  selectionStrategy?: string;
  fieldUpdates?: { field?: string; slug?: string; values?: unknown[] }[];
  [key: string]: unknown;
}
interface TaskOperation {
  function: string;
  args?: Record<string, unknown>;
}
interface RunnerTask {
  params?: TaskParams;
  operations?: TaskOperation[];
  type?: string;
  status?: string;
  title?: string;
  details?: string;
  colors?: string[];
  [key: string]: unknown;
}
interface TaskRunnerArgs {
  task: RunnerTask;
  environment?: string;
  apiToken?: string;
  branchId?: string;
  apiDomain?: string;
  onProgress?: (msg: string) => void;
  onError?: (msg: string) => void;
  adminUserId?: string;
}

const GEMINI_PROXY_URL = getGeminiProxyUrl();
const GEMINI_MODEL = 'gemini-2.5-flash';

const generateChatPairsWithProxy = async ({
  prospectName,
  count,
  topicsList,
  chatMode,
  groupName,
  language,
  apiToken,
  apiDomain,
}: {
  prospectName?: string;
  count: number;
  topicsList?: string[];
  chatMode?: string;
  groupName?: string;
  language?: string;
  apiToken?: string;
  apiDomain?: string;
}) => {
  const FALLBACK_CHATS = [
    { initiator: "Hey {name}, do you have a few minutes to discuss the project timeline?", reply: "Sure! I'm free now. Let me know what you need." },
    { initiator: "Quick question {name}, did you see the latest update from leadership?", reply: "Yes, just read through it. Looks like some big changes coming!" },
    { initiator: "{name}, are you attending the team meeting this afternoon?", reply: "I'll be there! Looking forward to it." },
    { initiator: "Hi {name}, could you send me the report when you get a chance?", reply: "Absolutely, I'll send it over in the next 10 minutes." },
    { initiator: "{name}, just wanted to check in on the status of your task.", reply: "It's going well! Should be done by end of day." },
    { initiator: "Hey {name}, do you know who's leading the new initiative?", reply: "I think it's Sarah from Product. Let me double-check though." },
    { initiator: "{name}, what do you think about the new policy?", reply: "I think it's a step in the right direction. Still some details to work out though." },
    { initiator: "Quick heads up {name}, the deadline got moved up to Friday.", reply: "Thanks for letting me know! I'll adjust my schedule." },
  ];

  if (!GEMINI_PROXY_URL) {
    return FALLBACK_CHATS.slice(0, count);
  }

  try {
    const companyContext = prospectName ? `of "${prospectName}"` : 'of a company';
    const topicsContext = topicsList && topicsList.length > 0 ? ` Topics to cover: ${topicsList.join(', ')}.` : '';
    const languageInstruction = language ? `\n\nIMPORTANT: Write ALL messages in ${language}. Do not use English unless ${language} is English.` : '';

    const prompt = `You are generating chat messages for a test environment. Employees work at the company ${prospectName || 'Acme'}. Your task is to act as employees ${companyContext} having brief, realistic conversations on an internal chat tool.${topicsContext}${languageInstruction}

Generate ${count} unique objects, each containing an "initiator" message and a "reply" message. The entire response must be a single, valid JSON array.

**Rules:**
1. **JSON Only**: The entire response must be a single JSON array of objects. Do not include markdown like \`\`\`json.
2. **Internal Tone**: Messages should sound like they are between colleagues. They can be about work, projects, or casual office topics.
3. **Placeholders**: The initiator message should include a "{name}" placeholder where the recipient's first name will be inserted.

**Example of a valid JSON output:**
[
  { "initiator": "Hey {name}, do you have the latest numbers for the Q3 forecast?", "reply": "Yep, just finalizing them now. I'll send them over in about 15 minutes." },
  { "initiator": "Quick question {name}, are you going to the all-hands meeting this afternoon?", "reply": "I have a conflict, unfortunately. Could you send me the key takeaways afterward?" }
]`;

    const response = await fetch(GEMINI_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiToken,
        apiDomain,
        model: GEMINI_MODEL,
        contents: [{ parts: [{ text: prompt + (topicsList?.length ? `\nTopics to weave in: ${topicsList.join(', ')}.` : '') + (chatMode === 'group' ? `\nAddress the group "${groupName || 'team'}".` : '') }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 8192 }
      })
    });

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const parsed = parseJsonArray(rawText);

    if (!parsed || parsed.length === 0) {
      return FALLBACK_CHATS.slice(0, count);
    }

    return parsed;
  } catch {
    return FALLBACK_CHATS.slice(0, count);
  }
};

const generateConversationWithProxy = async ({
  prospectName,
  conversationFlow,
  conversationContext,
  chatMode,
  language,
  apiToken,
  apiDomain,
}: {
  prospectName?: string;
  conversationFlow?: string[];
  conversationContext?: string;
  chatMode?: string;
  language?: string;
  apiToken?: string;
  apiDomain?: string;
}) => {
  const flow = Array.isArray(conversationFlow) ? conversationFlow.filter(Boolean) : [];
  const messageCount = flow.length || 1;
  const fallbackMessages = [
    "Hey team, wanted to touch base on our current priorities.",
    "Thanks for bringing this up! I've been meaning to discuss this.",
    "Agreed, I have some thoughts on this as well.",
    "Great to hear! Let's align on next steps.",
    "Sounds good, I'll follow up with more details.",
  ];

  if (!GEMINI_PROXY_URL || flow.length === 0) {
    return flow.map((sender, i) => ({ sender, message: fallbackMessages[i % fallbackMessages.length] }));
  }

  try {
    const participants = Array.from(new Set(flow));
    const flowDescription = flow.join(' → ');
    const languageInstruction = language ? `\n\nIMPORTANT: Write ALL messages in ${language}. Do not use English unless ${language} is English.` : '';

    const prompt = `You are generating a realistic chat conversation for a demo environment. ${prospectName ? `Employees work at ${prospectName}.` : ''}

**Participants:** ${participants.join(', ')}
**Conversation flow (who speaks in order):** ${flowDescription}
**Number of messages:** ${messageCount}
${conversationContext ? `**Topic/Context:** ${conversationContext}` : '**Topic:** General work discussion'}
${chatMode === 'group' ? '**Type:** Group chat - messages should feel like a group discussion' : '**Type:** Direct chat between two people'}

Generate exactly ${messageCount} messages following the exact order specified in the conversation flow. Each message should naturally follow the previous one, creating a coherent conversation.

**Rules:**
1. **JSON Only**: Return a single JSON array. No markdown, no code fences.
2. **Exact Order**: Follow the conversation flow EXACTLY - the first message is from "${flow[0]}", second from "${flow[1] || flow[0]}", etc.
3. **Natural Flow**: Each message should respond to or build on the previous message.
4. **Realistic Tone**: Sound like real colleagues chatting - casual but professional.
5. **Use "admin" for the admin user**: Don't replace "admin" with a name.${languageInstruction}`;

    const response = await fetch(GEMINI_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiToken,
        apiDomain,
        model: GEMINI_MODEL,
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: 8192 }
      })
    });

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const parsed = parseJsonArray(rawText);

    if (!parsed || parsed.length === 0) {
      return flow.map((sender, i) => ({ sender, message: fallbackMessages[i % fallbackMessages.length] }));
    }

    return parsed;
  } catch {
    return flow.map((sender, i) => ({ sender, message: fallbackMessages[i % fallbackMessages.length] }));
  }
};

const blockRegex = /\/\*\s*⇢\s*REPLIFY START\s*⇠\s*\*\/[\s\S]*?\/\*\s*⇢\s*REPLIFY END\s*⇠\s*\*\//i;


// Minimal helper to resolve the admin user ID if the overlay did not receive one
const fetchAdminUserId = async (apiToken: string, apiDomain: string) => {
  try {
    const resp = await fetch(`https://${apiDomain}/api/users?limit=100`, {
      headers: {
        'Authorization': `Basic ${apiToken}`,
      }
    });
    if (!resp.ok) throw new Error(`Status ${resp.status}`);
    const data = await resp.json();
    const admins = (data?.data || []).filter((u: Record<string, unknown>) => u.branchRole === 'WeBranchAdminRole');
    return admins[0]?.id || null;
  } catch (error) {
    console.warn('Failed to auto-fetch admin ID', error);
    return null;
  }
};

const fetchProfileFields = async (apiToken: string, apiDomain: string, branchId?: string) => {
  const url = branchId
    ? buildApiUrl(`/api/branches/${branchId}/profilefields`, apiDomain)
    : buildApiUrl('/api/profilefields', apiDomain);
  const resp = await fetch(url, { headers: { Authorization: `Basic ${apiToken}` } });
  if (!resp.ok) throw new Error(`Profile fields fetch failed (${resp.status})`);
  const data = await resp.json();
  if (Array.isArray(data?.data)) return data.data;
  if (data?.schema && typeof data.schema === 'object') {
    return Object.keys(data.schema).map(slug => {
      const field = data.schema[slug] || {};
      return {
        slug,
        title: field.localization?.en_US?.title || field.localization?.de_DE?.title || slug,
      };
    });
  }
  return [];
};


const buildLogoDevUrl = (prospectName = '') => {
  const cleaned = prospectName
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[^a-z0-9.-]/g, '');

  if (!cleaned) return '';

  const domain = cleaned.includes('.') ? cleaned : `${cleaned}.com`;
  return `https://img.logo.dev/${encodeURIComponent(domain)}?token=pk_f7bKMnRJR4a9cUWuNq1KUg&format=png&retina=true`;
};

/**
 * Chat automation script that runs in the page context
 * This will be injected into the Staffbase tab
 */
const chatAutomationScript = async (apiToken: string, apiDomain: string, adminUserId: string, chatCount: number, prospectName: string, topics: string[], geminiApiKey: string, sharedDemoPassword: string, chatParams: Record<string, unknown> = {}) => {
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const resolvedApiDomain = (apiDomain || window.location.hostname || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .trim();

  const log = (msg: string, type = 'info') => {
    const styles: Record<string, string> = {
      info: 'color: #00A4FD; font-weight: bold;',
      success: 'color: #00C851; font-weight: bold;',
      error: 'color: #FF4444; font-weight: bold;',
      warn: 'color: #FFBB33; font-weight: bold;',
    };
  };

  const getFreshCsrfToken = async () => {
    const response = await fetch('/auth/discover', {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.staffbase.auth.discovery.v2+json',
        'Content-Type': 'application/json',
      }
    });
    if (!response.ok) {
      log(`CSRF endpoint failed with ${response.status}, extracting from meta tag`, 'warn');
      const meta = document.querySelector('meta[name="x-csrf-token"]') as HTMLMetaElement | null;
      return meta?.content || '';
    }
    const data = await response.json();
    return data?.csrfToken || '';
  };

  const findPrimaryEmail = (user: Record<string, unknown>) => {
    const emails = user?.emails as { primary?: boolean; value: string }[] | undefined;
    return emails?.find(e => e.primary)?.value
      || emails?.[0]?.value
      || (user?.email as string | undefined)
      || null;
  };

  const normalizeName = (val = '') => (val || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const buildInitials = (val = '') => normalizeName(val).split(' ').filter(Boolean).map(part => part[0]).join('');

  const fetchGroupMembers = async (groupId: string, headers: Record<string, string>) => {
    const resp = await fetch(`/api/groups/${groupId}/members/search?limit=200`, {
      headers: {
        ...headers,
        'Accept': 'application/vnd.staffbase.accessors.group.members-search.v1+json'
      }
    });
    if (!resp.ok) throw new Error(`Group member fetch failed (${resp.status})`);
    const data = await resp.json();
    return (data?.entries || []).map((entry: Record<string, unknown>) => {
      const d = (entry.data || {}) as Record<string, unknown>;
      const email = (d.email as { value?: string | null } | undefined)?.value || null;
      return {
        id: d.id,
        firstName: '',
        lastName: '',
        emails: email ? [{ value: email, primary: true }] : [],
      };
    });
  };

  const fetchGroups = async (headers: Record<string, string>) => {
    const resp = await fetch('/api/groups?limit=200', { headers });
    if (!resp.ok) throw new Error(`Groups fetch failed (${resp.status})`);
    const data = await resp.json();
    return data?.data || [];
  };

  const findBestGroup = (groups: { id?: string; name?: string }[] = [], query = '') => {
    const qNorm = normalizeName(query);
    const qInit = buildInitials(query);
    return groups.find(g => {
      const nameNorm = normalizeName(g.name || '');
      const nameInit = buildInitials(g.name || '');
      return (
        nameNorm === qNorm ||
        nameInit === qNorm ||
        nameNorm.includes(qNorm) ||
        nameInit === qInit
      );
    });
  };

  /**
   * Generate a full conversation thread with custom flow
   * @param {Object} params - { prospectName, participants, conversationFlow, conversationContext, geminiKey, chatMode }
   * @returns {Array} Array of { sender, message } objects
   */
  const generateConversation = async (params: {
    prospectName?: string;
    participants?: { firstName?: string; name?: string }[];
    conversationFlow?: string[];
    conversationContext?: string;
    proxyUrl?: string;
    chatMode?: string;
    language?: string | null;
    geminiKey?: string;
  }) => {
    const {
      prospectName,
      participants = [],
      conversationFlow = [],
      conversationContext = '',
      proxyUrl,
      chatMode = 'group',
      language = null,
    } = params;

    // Fallback conversation
    const FALLBACK_CONVERSATION = [
      { sender: 'admin', message: "Hey team, wanted to touch base on our current priorities." },
      { sender: participants[0]?.firstName || 'User1', message: "Thanks for bringing this up! I've been meaning to discuss this." },
      { sender: participants[1]?.firstName || 'User2', message: "Agreed, I have some thoughts on this as well." },
      { sender: 'admin', message: "Great to hear! Let's align on next steps." },
      { sender: participants[0]?.firstName || 'User1', message: "Sounds good, I'll follow up with more details." },
    ];

    if (!proxyUrl) {
      log('No Gemini proxy URL, using fallback conversation', 'warn');
      return conversationFlow.length ?
        conversationFlow.map((sender, i) => ({ sender, message: FALLBACK_CONVERSATION[i % FALLBACK_CONVERSATION.length].message })) :
        FALLBACK_CONVERSATION;
    }

    try {
      const participantNames = participants.map(p => p.firstName || p.name || 'Unknown').filter(Boolean);
      const allParticipants = ['admin', ...participantNames];

      // Build the conversation flow - if not provided, create a default back-and-forth
      let flow = conversationFlow;
      if (!flow || flow.length === 0) {
        // Default: admin starts, then each participant replies once
        flow = ['admin', ...participantNames];
      }

      const flowDescription = flow.join(' → ');
      const messageCount = flow.length;
      const languageInstruction = language ? `\n\nIMPORTANT: Write ALL messages in ${language}. Do not use English unless ${language} is English.` : '';

      const prompt = `You are generating a realistic chat conversation for a demo environment. ${prospectName ? `Employees work at ${prospectName}.` : ''}

**Participants:** ${allParticipants.join(', ')}
**Conversation flow (who speaks in order):** ${flowDescription}
**Number of messages:** ${messageCount}
${conversationContext ? `**Topic/Context:** ${conversationContext}` : '**Topic:** General work discussion'}
${chatMode === 'group' ? '**Type:** Group chat - messages should feel like a group discussion' : '**Type:** Direct chat between two people'}

Generate exactly ${messageCount} messages following the exact order specified in the conversation flow. Each message should naturally follow the previous one, creating a coherent conversation.

**Rules:**
1. **JSON Only**: Return a single JSON array. No markdown, no code fences.
2. **Exact Order**: Follow the conversation flow EXACTLY - the first message is from "${flow[0]}", second from "${flow[1] || flow[0]}", etc.
3. **Natural Flow**: Each message should respond to or build on the previous message.
4. **Realistic Tone**: Sound like real colleagues chatting - casual but professional.
5. **Use "admin" for the admin user**: Don't replace "admin" with a name.${languageInstruction}

**Example output for flow ["admin", "Maria", "Patrick", "admin"]:**
[
  { "sender": "admin", "message": "Hey team, quick sync on the Q4 timeline?" },
  { "sender": "Maria", "message": "Sure! I was just reviewing the milestones. We might need to adjust the launch date." },
  { "sender": "Patrick", "message": "I agree with Maria. The dev timeline is tight. Can we push by a week?" },
  { "sender": "admin", "message": "That works. Let's update the roadmap and loop in stakeholders." }
]`;

      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiToken,
          apiDomain: resolvedApiDomain,
          model: 'gemini-2.5-flash',
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.85, maxOutputTokens: 8192 }
        })
      });

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      const parsed = JSON.parse(rawText.replace(/```json\n?/g, '').replace(/```\n?/g, ''));

      if (!parsed || parsed.length === 0) {
        log('Gemini returned empty array, using fallback', 'warn');
        return FALLBACK_CONVERSATION.slice(0, messageCount);
      }

      log(`Generated ${parsed.length} messages for conversation`, 'success');
      return parsed;
    } catch (error) {
      log(`Gemini API failed: ${error instanceof Error ? error.message : String(error)}, using fallback`, 'warn');
      return FALLBACK_CONVERSATION;
    }
  };

  // Original generateChatPairs - generates initiator/reply pairs with {name} placeholders
  const generateChatPairs = async (prospectName: string, count: number, proxyUrl: string, topicsList: string[], chatMode: string, groupName: string) => {
    // Fallback static chat bank
    const FALLBACK_CHATS = [
      { initiator: "Hey {name}, do you have a few minutes to discuss the project timeline?", reply: "Sure! I'm free now. Let me know what you need." },
      { initiator: "Quick question {name}, did you see the latest update from leadership?", reply: "Yes, just read through it. Looks like some big changes coming!" },
      { initiator: "{name}, are you attending the team meeting this afternoon?", reply: "I'll be there! Looking forward to it." },
      { initiator: "Hi {name}, could you send me the report when you get a chance?", reply: "Absolutely, I'll send it over in the next 10 minutes." },
      { initiator: "{name}, just wanted to check in on the status of your task.", reply: "It's going well! Should be done by end of day." },
      { initiator: "Hey {name}, do you know who's leading the new initiative?", reply: "I think it's Sarah from Product. Let me double-check though." },
      { initiator: "{name}, what do you think about the new policy?", reply: "I think it's a step in the right direction. Still some details to work out though." },
      { initiator: "Quick heads up {name}, the deadline got moved up to Friday.", reply: "Thanks for letting me know! I'll adjust my schedule." },
    ];

    if (!proxyUrl) {
      log('No Gemini proxy URL, using fallback chats', 'warn');
      return FALLBACK_CHATS.slice(0, count);
    }

    try {
      const companyContext = prospectName ? `of "${prospectName}"` : 'of a company';
      const topicsContext = topicsList && topicsList.length > 0 ? ` Topics to cover: ${topicsList.join(', ')}.` : '';

      const prompt = `You are generating chat messages for a test environment. Employees work at the company ${prospectName || 'Acme'}. Your task is to act as employees ${companyContext} having brief, realistic conversations on an internal chat tool.${topicsContext}

Generate ${count} unique objects, each containing an "initiator" message and a "reply" message. The entire response must be a single, valid JSON array.

**Rules:**
1. **JSON Only**: The entire response must be a single JSON array of objects. Do not include markdown like \`\`\`json.
2. **Internal Tone**: Messages should sound like they are between colleagues. They can be about work, projects, or casual office topics.
3. **Placeholders**: The initiator message should include a "{name}" placeholder where the recipient's first name will be inserted.

**Example of a valid JSON output:**
[
  { "initiator": "Hey {name}, do you have the latest numbers for the Q3 forecast?", "reply": "Yep, just finalizing them now. I'll send them over in about 15 minutes." },
  { "initiator": "Quick question {name}, are you going to the all-hands meeting this afternoon?", "reply": "I have a conflict, unfortunately. Could you send me the key takeaways afterward?" }
]`;

      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiToken,
          apiDomain: resolvedApiDomain,
          model: 'gemini-2.5-flash',
          contents: [{ parts: [{ text: prompt + (topicsList?.length ? `\nTopics to weave in: ${topicsList.join(', ')}.` : '') + (chatMode === 'group' ? `\nAddress the group "${groupName || 'team'}".` : '') }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 8192 }
        })
      });

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      const parsed = JSON.parse(rawText.replace(/```json\n?/g, '').replace(/```\n?/g, ''));

      if (!parsed || parsed.length === 0) {
        log('Gemini returned empty array, using fallback', 'warn');
        return FALLBACK_CHATS.slice(0, count);
      }

      return parsed;
    } catch (error) {
      log(`Gemini API failed: ${error instanceof Error ? error.message : String(error)}, using fallback chats`, 'warn');
      return FALLBACK_CHATS.slice(0, count);
    }
  };

  try {
    log('🚀 Starting chat automation...');

    const csrfToken = await getFreshCsrfToken();
    log('✅ Got CSRF token');

    // Use the admin token for all requests (no need to login)
    const headers = {
      'Authorization': `Basic ${apiToken}`,
      'USERID': adminUserId,
      'x-csrf-token': csrfToken,
      'Content-Type': 'application/json'
    };

    // Get users
    const usersResponse = await fetch('/api/users?limit=200', { headers });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usersData = await usersResponse.json() as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allUsers: any[] = usersData.data || [];
    log(`Found ${allUsers.length} users in environment`);

    let adminId = adminUserId;
    log(`Admin user ID: ${adminId}`);
    const adminUser = allUsers.find(u => u.id === adminId);
    const adminEmail = findPrimaryEmail(adminUser);

    log(`[chat] Incoming chatParams: ${JSON.stringify(chatParams)}`);
    log(`[chat] Initial groupName/groupId: ${chatParams.groupName || 'none'} / ${chatParams.groupId || 'none'}`);

    // Merge params with any enriched args (if passed in) for safety
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mergedParams: any = { ...chatParams, ...((chatParams.operationsArgs as Record<string, unknown>) || {}) };
    log(`[chat] Merged params: ${JSON.stringify(mergedParams)}`);

    const chatMode = mergedParams.chatMode || 'direct';
    let groupId = mergedParams.groupId || null;
    let groupName = mergedParams.groupName || '';
    let resolvedGroupName = groupName;
    let chatTitle = mergedParams.chatTitle || '';
    const explicitParticipantIds = mergedParams.participantIds || mergedParams.userIds || [];
    const explicitParticipantEmails = mergedParams.participantEmails || mergedParams.userEmails || [];
    const providedUsers = Array.isArray(mergedParams.users) ? mergedParams.users : [];
    const participantCount = mergedParams.participantCount || chatCount;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chatUsers: any[] = [];
    if (chatMode === 'group') {
      let resolutionError = null;
      try {
        // 1) Prefer explicit users array from plan (validate against real users; drop hallucinated)
        if (providedUsers.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const matchProvidedUser = (u: any) => {
            const email = (u.email || '').toLowerCase();
            const first = (u.firstName || u.name || '').toLowerCase();
            const last = (u.lastName || '').toLowerCase();
            let match =
              allUsers.find((au) => au.id === u.id) ||
              (email ? allUsers.find((au) => (findPrimaryEmail(au) || '').toLowerCase() === email) : null);
            if (!match && first) {
              match = allUsers.find((au) => {
                const full = `${au.firstName || ''} ${au.lastName || ''}`.toLowerCase().trim();
                return full.includes(first) || (au.firstName || '').toLowerCase() === first;
              });
            }
            if (!match && last) {
              match = allUsers.find((au) => (au.lastName || '').toLowerCase() === last);
            }
            return match || null;
          };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          chatUsers = providedUsers.map((u: any) => matchProvidedUser(u)).filter(Boolean);
          const dropped = providedUsers.length - chatUsers.length;
          log(
            `[chat] After provided users validation, chatUsers: ${chatUsers
              .map((u) => `${u.id}|${findPrimaryEmail(u) || 'no-email'}`)
              .join(', ') || 'none'}${dropped ? ` (dropped ${dropped} invalid users)` : ''}`
          );
        }

        // 2) Participant IDs provided
        if (chatUsers.length === 0 && explicitParticipantIds.length > 0) {
          chatUsers = allUsers.filter(u => explicitParticipantIds.includes(u.id));
          log(`Using ${chatUsers.length} explicit participant IDs`);
        }

        // 3) Participant emails provided
        if (chatUsers.length === 0 && explicitParticipantEmails.length > 0) {
          chatUsers = allUsers.filter(u => explicitParticipantEmails.includes(findPrimaryEmail(u)));
          log(`Using ${chatUsers.length} explicit participant emails`);
        }

        // 4) If groupId provided, use it directly and skip name lookup
        if (chatUsers.length === 0 && groupId) {
          try {
            const groupMembers = await fetchGroupMembers(groupId, headers);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            chatUsers = groupMembers.filter((u: any) => u.id !== adminId);
            resolvedGroupName = groupName || resolvedGroupName;
            log(`Loaded ${groupMembers.length} members from groupId ${groupId}`);
            // Clear any resolution error when groupId works
            resolutionError = null;
          } catch (err) {
            resolutionError = err instanceof Error ? err.message : String(err);
            log(`Group member fetch failed for ${groupId}: ${resolutionError}`, 'warn');
          }
        }

        // 5) Named group provided (only when no groupId or previous branch failed)
        if (chatUsers.length === 0 && groupName) {
          const groups = await fetchGroups(headers);
          log(`[chat] Fetched ${groups.length} groups; looking for "${groupName}"`);
          const matched = findBestGroup(groups, groupName);
          if (matched) {
            resolvedGroupName = matched.name || groupName;
            groupId = groupId || matched.id;
            const groupMembers = await fetchGroupMembers(matched.id!, headers);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            chatUsers = groupMembers.filter((u: any) => u.id !== adminId);
            log(`Loaded ${groupMembers.length} members from group ${resolvedGroupName} (${matched.id})`);
          } else {
            // If group name provided but not found AND we have explicit participants, proceed with participants and clear groupName
            if (explicitParticipantIds.length || explicitParticipantEmails.length || providedUsers.length) {
              log(`Group "${groupName}" not found; using provided participants and no group name`, 'warn');
              groupName = '';
              resolvedGroupName = '';
              groupId = null;
            } else {
              resolutionError = `Group "${groupName}" not found in context`;
              log(resolutionError, 'warn');
              // Fallback: treat groupName as chatTitle and select default participants
              groupId = null;
              const nonAdmins = allUsers.filter((u) => u.id !== adminId && u.branchRole !== 'WeBranchAdminRole').slice(0, participantCount);
              chatUsers = nonAdmins;
              if (chatUsers.length) {
                resolvedGroupName = '';
                chatTitle = chatTitle || groupName || resolvedGroupName;
                log(`[chat] Using fallback participants (count=${chatUsers.length}) and treating "${groupName}" as chatTitle`);
              }
            }
          }
        }

        // 6) If still no participants and groupId was provided but failed, stop fallback
      } catch (err) {
        resolutionError = err instanceof Error ? err.message : String(err);
        log(`Group resolution failed: ${resolutionError}`, 'warn');
      }

      const beforeFilterCount = chatUsers.length;
      chatUsers = chatUsers.filter((u) => u.id !== adminId);
      if (beforeFilterCount !== chatUsers.length) {
        log(`[chat] Admin filtered out. Remaining participants: ${chatUsers.map(u => `${u.id}|${findPrimaryEmail(u) || 'no-email'}`).join(', ') || 'none'}`);
      }
      if (chatUsers.length === 0) {
        const errDetails = {
          providedUsers: providedUsers,
          explicitParticipantIds,
          explicitParticipantEmails,
          mergedParams,
        };
        const msg = `[chat] Failed to resolve group participants${resolutionError ? ` (${resolutionError})` : ''}. Merged params: ${JSON.stringify(errDetails, null, 2)}`;
        log(msg, 'error');
        throw new Error(msg);
      }
    } else {
      // Filter out admin from chat recipients
      chatUsers = allUsers.filter(u => u.id !== adminId).slice(0, chatCount);
      log(`Selected ${chatUsers.length} users for chats`);
    }

    // Get chat installation ID
    const installationsResponse = await fetch('/api/installations/administrated?pluginID=chat', { headers });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const installations: any[] = ((await installationsResponse.json()) as any).data || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chatInstallation = installations.find((i: any) => i.pluginID === 'chat');

    if (!chatInstallation) {
      throw new Error('Chat plugin not found in this environment');
    }

    log(`Chat installation ID: ${chatInstallation.id}`);

    // Check if back-and-forth mode is requested (conversationFlow provided)
    const conversationFlow = mergedParams.conversationFlow || [];
    const useBackAndForth = conversationFlow.length > 0;

    if (useBackAndForth) {
      // ========== NEW: Back-and-forth conversation mode ==========
      log('Using back-and-forth conversation mode...');
      const conversationContext = mergedParams.conversationContext || topics?.join(', ') || '';

      // Helper to find user by name (case-insensitive, partial match)
      const findUserByName = (name: string) => {
        if (!name || name.toLowerCase() === 'admin') return null; // null means admin
        const nameLower = name.toLowerCase();
        return chatUsers.find(u => {
          const firstName = (u.firstName || '').toLowerCase();
          const fullName = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase().trim();
          return firstName === nameLower || fullName.includes(nameLower) || nameLower.includes(firstName);
        });
      };

      // Generate conversation using flow-based approach
      log('Generating AI conversation...');
      const preparedConversation = Array.isArray(chatParams['preparedConversation'])
        ? chatParams['preparedConversation'] as unknown[]
        : null;
      const conversation = preparedConversation && preparedConversation.length > 0
        ? preparedConversation
        : await generateConversation({
          prospectName,
          participants: chatUsers,
          conversationFlow,
          conversationContext,
          geminiKey: geminiApiKey,
          chatMode,
        });
      log(`Generated ${conversation.length} messages`, 'success');

      if (!conversation || conversation.length === 0) {
        throw new Error('Failed to generate conversation. Please try again.');
      }

      let conversationId = null;

      // Create the conversation first
      if (chatMode === 'group') {
        const participantIDs = groupId ? [groupId] : chatUsers.map(u => u.id);
        const createResponse = await fetch(`/api/installations/${chatInstallation.id}/conversations`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ type: 'group', participantIDs })
        });
        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          throw new Error(`Failed to create group chat: ${createResponse.status} ${errorText}`);
        }
        const convoData = await createResponse.json();
        conversationId = convoData?.conversationID || convoData?.id;
        if (!conversationId) {
          throw new Error('Failed to resolve conversation id after group creation');
        }

        const finalChatTitle = chatTitle || mergedParams.chatTitle || groupName || resolvedGroupName;
        // Name the chat if requested
        if (finalChatTitle) {
          try {
            const titleRes = await fetch(`/api/conversations/${conversationId}/settings`, {
              method: 'PUT',
              headers,
              body: JSON.stringify({ title: finalChatTitle })
            });
            if (titleRes.ok) {
              log(`✅ Named group chat: ${finalChatTitle}`);
            } else {
              const txt = await titleRes.text();
              log(`⚠️ Failed to name chat (${titleRes.status}): ${txt}`, 'warn');
            }
          } catch (err) {
            log(`⚠️ Error naming chat: ${err instanceof Error ? err.message : String(err)}`, 'warn');
          }
        }
        log(`✅ Created group conversation: ${conversationId}`);
      }

      // Track who we're currently logged in as
      let currentLoggedInUser = 'admin';
      let currentCsrfToken = csrfToken;

      // Helper to login as a specific user
      const loginAs = async (user: Record<string, unknown>) => {
        const identifier = findPrimaryEmail(user);
        if (!identifier) {
          log(`Cannot login as ${user.firstName || user.id} - no email`, 'error');
          return false;
        }
        log(`Logging in as ${user.firstName || user.id}...`);
        const loginResponse = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, secret: sharedDemoPassword, locale: 'en_US' })
        });
        if (!loginResponse.ok) {
          log(`Failed to login as ${user.firstName || user.id}`, 'error');
          return false;
        }
        await sleep(1000);
        currentCsrfToken = await getFreshCsrfToken();
        currentLoggedInUser = (user.firstName as string | undefined) || (user.id as string) || 'user';
        log(`✅ Logged in as ${currentLoggedInUser}`);
        return true;
      };

      // Helper to login back as admin
      const loginAsAdminFlow = async () => {
        const fallbackEmail = (() => {
          const domain = window.location.hostname;
          const slug = domain.split('.')[0];
          return `admin+${slug}@staffbase.com`;
        })();
        const adminIdentifiers = [adminEmail, adminUser?.username, adminUser?.name, fallbackEmail].filter(Boolean);
        for (const identifier of adminIdentifiers) {
          const loginResponse = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, secret: sharedDemoPassword, locale: 'en_US' })
          });
          if (loginResponse.ok) {
            await sleep(1000);
            currentCsrfToken = await getFreshCsrfToken();
            currentLoggedInUser = 'admin';
            log(`✅ Logged in as admin`);
            return true;
          }
        }
        log(`⚠️ Failed to login as admin`, 'warn');
        return false;
      };

      // Execute the conversation flow
      log(`Executing conversation with ${conversation.length} messages...`);
      for (let i = 0; i < conversation.length; i++) {
        const msg = conversation[i];
        const senderName = msg.sender || 'admin';
        const messageText = msg.message;
        const isAdmin = senderName.toLowerCase() === 'admin';

        log(`Message ${i + 1}/${conversation.length}: ${senderName} says "${messageText.substring(0, 50)}..."`);

        // Switch user if needed
        if (isAdmin && currentLoggedInUser !== 'admin') {
          await loginAsAdminFlow();
        } else if (!isAdmin) {
          const targetUser = findUserByName(senderName);
          if (!targetUser) {
            log(`⚠️ User "${senderName}" not found in participants, skipping message`, 'warn');
            continue;
          }
          if (currentLoggedInUser !== (targetUser.firstName || targetUser.id)) {
            const success = await loginAs(targetUser);
            if (!success) continue;
          }
        }

        // Send the message
        if (chatMode === 'group') {
          const sendResponse = await fetch(`/api/conversations/${conversationId}/messages`, {
            method: 'POST',
            headers: isAdmin && currentLoggedInUser === 'admin' ? headers : { 'Content-Type': 'application/json', 'x-csrf-token': currentCsrfToken },
            body: JSON.stringify({ message: messageText })
          });
          if (sendResponse.ok) {
            log(`✅ ${senderName}: message sent`);
          } else {
            const errTxt = await sendResponse.text();
            log(`❌ Failed to send message from ${senderName}: ${sendResponse.status} ${errTxt}`, 'error');
          }
        } else {
          // Direct chat mode with back-and-forth
          const targetUser = chatUsers[0];
          if (isAdmin) {
            if (!conversationId) {
              const endpoint = `/api/installations/${chatInstallation.id}/conversations/direct/${targetUser.id}`;
              const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ message: messageText }) });
              if (response.ok) {
                const respJson = await response.json();
                conversationId = respJson?.conversationID || respJson?.id;
                log(`✅ Admin: started direct chat`);
              } else {
                log(`❌ Failed to start direct chat`, 'error');
              }
            } else {
              const sendResponse = await fetch(`/api/conversations/${conversationId}/messages`, { method: 'POST', headers, body: JSON.stringify({ message: messageText }) });
              if (sendResponse.ok) log(`✅ Admin: message sent`);
              else log(`❌ Failed to send admin message`, 'error');
            }
          } else {
            if (conversationId) {
              const sendResponse = await fetch(`/api/conversations/${conversationId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-csrf-token': currentCsrfToken },
                body: JSON.stringify({ message: messageText })
              });
              if (sendResponse.ok) log(`✅ ${senderName}: message sent`);
              else log(`❌ Failed to send message from ${senderName}`, 'error');
            }
          }
        }
        await sleep(800);
      }

      // Log back in as admin at the end
      if (currentLoggedInUser !== 'admin') {
        log('Logging back in as admin...');
        await loginAsAdminFlow();
      }

    } else {
      // ========== ORIGINAL: Standard chat mode (1:1 or group with single replies) ==========

      // Generate AI chat pairs
      log('Generating AI chat pairs...');
      const preparedChatPairs = Array.isArray(chatParams.preparedChatPairs)
        ? chatParams.preparedChatPairs
        : null;
      const chatPairs = preparedChatPairs && preparedChatPairs.length > 0
        ? preparedChatPairs
        : await generateChatPairs(prospectName, chatUsers.length || 1, geminiApiKey, topics, chatMode, groupName);
      log(`Generated ${chatPairs.length} chat pairs`, 'success');

      if (!chatPairs || chatPairs.length === 0) {
        throw new Error('Failed to generate chat pairs. Please try again.');
      }

      const pendingReplies = [];
      log('Admin sending initial chats...');

      if (chatMode === 'group') {
        const participantIDs = groupId ? [groupId] : chatUsers.map(u => u.id);
        const createResponse = await fetch(`/api/installations/${chatInstallation.id}/conversations`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ type: 'group', participantIDs })
        });
        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          throw new Error(`Failed to create group chat: ${createResponse.status} ${errorText}`);
        }
        const convoData = await createResponse.json();
        const conversationId = convoData?.conversationID || convoData?.id;
        if (!conversationId) {
          throw new Error('Failed to resolve conversation id after group creation');
        }
        const finalChatTitle = chatTitle || mergedParams.chatTitle || groupName || resolvedGroupName;
        if (finalChatTitle) {
          try {
            const titleRes = await fetch(`/api/conversations/${conversationId}/settings`, {
              method: 'PUT',
              headers,
              body: JSON.stringify({ title: finalChatTitle })
            });
            if (titleRes.ok) {
              log(`✅ Named group chat: ${finalChatTitle}`);
            } else {
              const txt = await titleRes.text();
              log(`⚠️ Failed to name chat (${titleRes.status}): ${txt}`, 'warn');
            }
          } catch (err) {
            log(`⚠️ Error naming chat: ${err instanceof Error ? err.message : String(err)}`, 'warn');
          }
        }
        const firstPair = chatPairs[0];
        const audienceName = resolvedGroupName || groupName || 'team';
        const initialMessage = firstPair?.initiator?.replace('{name}', audienceName) || `Hello ${audienceName}!`;

        const sendInitial = await fetch(`/api/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ message: initialMessage })
        });
        if (sendInitial.ok) {
          log(`✅ Sent group chat intro (${conversationId})`);
        } else {
          const errTxt = await sendInitial.text();
          throw new Error(`Failed to send group intro: ${sendInitial.status} ${errTxt}`);
        }

        // queue replies from participants
        const replyUsers = chatUsers.slice(0, participantCount);
        replyUsers.forEach((user, idx) => {
          const pair = chatPairs[idx % chatPairs.length];
          pendingReplies.push({ user, replyText: pair?.reply || 'Sounds good!', conversationId });
        });
      } else {
        // Direct (1:1) chats - create separate conversation with each user
        for (let i = 0; i < chatUsers.length; i++) {
          const user = chatUsers[i];
          const chatPair = chatPairs[i % chatPairs.length];
          if (!chatPair || !chatPair.initiator) {
            log(`Skipping ${user.firstName || user.id} - invalid chat pair`, 'warn');
            continue;
          }
          const messageText = chatPair.initiator.replace('{name}', user.firstName || 'there');

          const endpoint = `/api/installations/${chatInstallation.id}/conversations/direct/${user.id}`;
          const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({ message: messageText })
          });

          if (response.ok) {
            const respJson = await response.json();
            log(`✅ Sent chat to ${user.firstName || user.id}`);
            pendingReplies.push({
              user,
              replyText: chatPair.reply,
              chatInstallationId: chatInstallation.id,
              conversationId: respJson?.conversationID || respJson?.id
            });
          } else {
            const errorText = await response.text();
            log(`❌ Failed to send chat to ${user.firstName || user.id}: ${response.status} ${errorText}`, 'error');
          }

          await sleep(500);
        }
      }

      log(`${pendingReplies.length} chats sent. Now logging in as users to reply...`);

      // Login as each user and reply
      for (const item of pendingReplies) {
        const { user, replyText } = item;
        const identifier = findPrimaryEmail(user);

        if (!identifier) {
          log(`Skipping ${user.firstName || user.id} - no email`, 'warn');
          continue;
        }

        log(`Logging in as ${user.firstName || user.id}...`);
        const loginResponse = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, secret: sharedDemoPassword, locale: 'en_US' })
        });

        if (!loginResponse.ok) {
          log(`Failed to login as ${user.firstName || user.id}`, 'error');
          continue;
        }

        await sleep(1000);
        const userCsrfToken = await getFreshCsrfToken();

        if (chatMode === 'group') {
          const replyResponse = await fetch(`/api/conversations/${item.conversationId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': userCsrfToken },
            body: JSON.stringify({ message: replyText })
          });
          if (replyResponse.ok) {
            log(`✅ ${user.firstName || user.id} replied in group chat`);
          } else {
            log(`❌ Failed to send group reply from ${user.firstName || user.id}`, 'error');
          }
        } else {
          let conversationId = item.conversationId;
          if (!conversationId) {
            const convoResponse = await fetch(`/api/installations/${item.chatInstallationId}/conversations`, {
              headers: { 'x-csrf-token': userCsrfToken }
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const conversations: any[] = ((await convoResponse.json()) as any).data || [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const adminConvo = conversations.find((c: any) => c.members?.some((m: any) => m.userID === adminId));
            conversationId = adminConvo?.conversationID;
          }

          if (conversationId) {
            const replyResponse = await fetch(`/api/conversations/${conversationId}/messages`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-csrf-token': userCsrfToken },
              body: JSON.stringify({ message: replyText })
            });
            if (replyResponse.ok) {
              log(`✅ ${user.firstName || user.id} replied to admin`);
            } else {
              log(`❌ Failed to send reply from ${user.firstName || user.id}`, 'error');
            }
          }
        }

        await sleep(500);
      }

      // Log back in as admin
      log('Logging back in as admin...');
      const fallbackEmail = (() => {
        const domain = window.location.hostname;
        const slug = domain.split('.')[0];
        return `admin+${slug}@staffbase.com`;
      })();
      const adminIdentifiers = [adminEmail, adminUser?.username, adminUser?.name, fallbackEmail].filter(Boolean);

      let adminLoggedIn = false;
      for (const identifier of adminIdentifiers) {
        log(`Attempting admin re-login as ${identifier}...`);
        const adminLoginResponse = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, secret: sharedDemoPassword, locale: 'en_US' })
        });

        if (adminLoginResponse.ok) {
          log(`✅ Logged back in as admin (${identifier})`, 'success');
          adminLoggedIn = true;
          break;
        } else {
          const body = await adminLoginResponse.text().catch(() => '');
          log(`⚠️ Admin re-login attempt failed for ${identifier}: ${adminLoginResponse.status} ${body}`, 'warn');
        }
      }

      if (!adminLoggedIn) {
        log('⚠️ Admin re-login failed after all attempts, but chats are complete', 'warn');
      }
    }

    log('🎉 Chat automation complete!', 'success');

    // Notify extension to close this tab
    setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (chrome as any).runtime?.sendMessage({ type: 'closeCurrentTab' });
    }, 2000);

  } catch (error) {
    log(`❌ Error: ${error instanceof Error ? error.message : String(error)}`, 'error');

    // Notify extension to close tab even on error
    setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (chrome as any).runtime?.sendMessage({ type: 'closeCurrentTab' });
    }, 3000);
  }
};

/**
 * Branding task runner - applies AI-generated branding to the environment
 */
export const runBrandingTask = async ({ task, environment: _environment, apiToken, branchId, apiDomain, onProgress, onError }: TaskRunnerArgs) => {
  try {
    if (!apiToken || !apiDomain || !branchId) {
      throw new Error('apiToken, apiDomain, and branchId are required for branding task');
    }

    const prospectName = task.params?.prospectName;
    if (!prospectName) {
      throw new Error('Prospect name is required for branding task');
    }

    // Handle transparency - could be 0.9 (decimal) or 90 (integer)
    let headerTransparency = task.params?.headerTransparency ?? 70;
    if (headerTransparency > 0 && headerTransparency <= 1) {
      // Convert decimal to percentage (0.9 → 90)
      headerTransparency = Math.round(headerTransparency * 100);
    }
    // Ensure it's within valid range
    headerTransparency = Math.max(0, Math.min(100, headerTransparency));

    // Gemini MUST provide colors in the plan - we don't fetch them separately
    if (!task.colors || task.colors.length < 2) {
      throw new Error('Gemini did not provide brand colors in the plan. Please regenerate the plan.');
    }

    onProgress?.(`Using colors from plan: ${task.colors.join(', ')}`);

    // Use Gemini's colors - no fetching!
    const logoUrl = task.params?.logoUrl || buildLogoDevUrl(prospectName);

    onProgress?.('Building branding CSS with color contrast checks');

    // Use colors from Gemini plan (with any param overrides)
    const primaryColor = task.params?.primaryColor || task.colors[0];
    const textColor = ensureContrast(primaryColor, task.params?.textColor || task.colors[1]);

    // Ensure floating nav colors have good contrast
    const floatingNavBg = task.params?.floatingNavBg || task.params?.backgroundColor || task.colors[2] || '#F5F5F5';
    const floatingNavText = ensureContrast(floatingNavBg, task.params?.floatingNavText || task.colors[1]);


    // Build the CSS with the branding data
    const existingCss = await fetchCurrentCSS(apiToken!, apiDomain!);
    const trimmedCss = existingCss ? existingCss.trim() : "";
    if (!trimmedCss) {
      const errorMessage = 'Branding aborted: fetched CSS is empty. Existing CSS was not replaced.';
      console.error('[runBrandingTask] Empty CSS fetch; aborting branding update.', { apiDomain, branchId });
      throw new Error(errorMessage);
    }

    // Merge any additional params from Gemini with defaults
    const cssConfig = {
      primary: primaryColor,
      text: textColor,
      background: task.params?.background || floatingNavBg,
      floatingNavBg: floatingNavBg,
      floatingNavText: floatingNavText,
      bg: task.params?.bgUrl || task.params?.bg || '',
      logo: task.params?.logoUrl || task.params?.logo || logoUrl,
      padW: task.params?.logoPadWidth || task.params?.padW || 0,
      padH: task.params?.logoPadHeight || task.params?.padH || 0,
      bgVert: task.params?.bgVertical || task.params?.bgVert || 50,
      headerTransparency: headerTransparency,
      changeLogoSize: task.params?.changeLogoSize || false,
      logoHeight: task.params?.logoHeight || 100,
      logoMarginTop: task.params?.logoMarginTop || 0,
      prospectName,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newCssBody = buildPreviewCss(cssConfig as any, [], '');

    const newBlock = `/* ⇢ REPLIFY START ⇠ */\n${newCssBody}\n/* ⇢ REPLIFY END ⇠ */`;
    const finalCss = blockRegex.test(trimmedCss)
      ? trimmedCss.replace(blockRegex, newBlock)
      : `${trimmedCss}\n\n${newBlock}`;

    const colorConfig = {
      primary: primaryColor as string,
      text: (textColor || '#000000') as string,
      background: floatingNavBg as string,
      floatingNavText: (floatingNavText || '#000000') as string,
      floatingNavBg: floatingNavBg as string,
    };

    onProgress?.('Applying branding to environment');
    await postUpdatedCSS(apiToken!, branchId!, finalCss, colorConfig, apiDomain!);

    onProgress?.(`✅ Branding applied with ${headerTransparency}% header transparency`);
  } catch (error) {
    onError?.(error instanceof Error ? error.message : 'Failed to apply branding');
    throw error;
  }
};

/**
 * LinkedIn articles task runner - scrapes and imports LinkedIn posts
 */
export const runLinkedInArticlesTask = async ({ task, environment: _environment, apiToken, branchId, apiDomain, onProgress, onError }: TaskRunnerArgs) => {
  try {
    const prospectName = task.params?.prospectName || task.title?.match(/([A-Z][a-z]+)/)?.[0] || 'Company';
    const articleCount = task.params?.articleCount || 10;
    const linkedInUrl = task.params?.linkedInUrl;
    const locales = Array.isArray(task.params?.locales) ? task.params.locales : ['en_US'];

    if (!isLinkedInUrl(linkedInUrl)) {
      throw new Error('LinkedIn URL is required for importing articles. Gemini should have provided this in the task params.');
    }

    onProgress?.(`Found LinkedIn profile: ${linkedInUrl}`);

    const fixedUrl = normaliseLinkedInUrl(linkedInUrl);

    onProgress?.('Finding or creating "Top News" channel');

    // Find or create "Top News" channel
    let topNewsChannelId = null;
    try {
      const r = await fetch(
        `https://${apiDomain}/api/spaces/${branchId}/installations?pluginID=news`,
        { headers: { Authorization: `Basic ${apiToken!.trim()}` } }
      );

      if (r.ok) {
        const hit = ((await r.json()) as { data?: { id: string; config?: { localization?: { en_US?: { title?: string } } } }[] })?.data?.find((i) =>
          i.config?.localization?.en_US?.title
            ?.toLowerCase()
            .includes("top news")
        );
        if (hit) topNewsChannelId = hit.id;
      }
    } catch (e) {
      console.error('Error finding Top News channel:', e);
    }

    if (!topNewsChannelId) {
      const channelLocalization = Object.fromEntries(
        locales.map((locale: string) => [locale, { title: `Top News // ${prospectName}` }])
      );
      if (!channelLocalization['en_US']) channelLocalization['en_US'] = { title: `Top News // ${prospectName}` };
      const payload = {
        pluginID: "news",
        contentType: "articles",
        accessorIDs: [branchId],
        config: { localization: channelLocalization },
      };
      const crt = await fetch(
        `https://${apiDomain}/api/spaces/${branchId}/installations`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${apiToken!.trim()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );
      if (!crt.ok)
        throw new Error(`Failed to create "Top News" channel (${crt.status})`);
      topNewsChannelId = (await crt.json()).id;
    }

    onProgress?.(`Scraping ${articleCount} LinkedIn posts from your logged-in session…`);

    const { importLinkedInArticles } = await import('./automationOperations/articles');
    const result = await importLinkedInArticles(
      {
        linkedInUrl: fixedUrl,
        articleCount,
        channelId: topNewsChannelId!,
      },
      {
        apiToken: apiToken!.trim(),
        apiDomain: apiDomain!,
        branchId: branchId!,
        onProgress,
      }
    );

    onProgress?.(`✅ Imported ${result.createdCount} LinkedIn article(s) into Top News.`);
  } catch (error) {
    onError?.(error instanceof Error ? error.message : 'Failed to import LinkedIn articles');
    throw error;
  }
};

export const runChatsTask = async ({ task, environment: _environment, apiToken, branchId: _branchId, apiDomain, adminUserId, onProgress, onError }: TaskRunnerArgs) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mergedParams: any = { ...(task.params || {}), ...(task.operations?.[0]?.args || {}) };
    const chatCount = mergedParams.chatCount || 5;
    const prospectName = mergedParams.prospectName || '';
    const topics = mergedParams.topics || [];
    const chatMode = mergedParams.chatMode || 'direct';
    const conversationFlow = mergedParams.conversationFlow || [];
    const conversationContext = mergedParams.conversationContext || topics?.join(', ') || '';
    const groupName = mergedParams.groupName || '';
    const participantCount = mergedParams.participantCount || chatCount;
    const providedChatPairs = Array.isArray(mergedParams.chatPairs) ? mergedParams.chatPairs : null;
    const language = mergedParams.language || null;

    const preparedConversation = conversationFlow.length
      ? await generateConversationWithProxy({
        prospectName,
        conversationFlow,
        conversationContext,
        chatMode,
        language,
        apiToken,
        apiDomain,
      })
      : null;
    const preparedChatPairs = conversationFlow.length
      ? null
      : (providedChatPairs || await generateChatPairsWithProxy({
        prospectName,
        count: Math.max(participantCount, chatCount, 1),
        topicsList: topics,
        chatMode,
        groupName,
        language,
        apiToken,
        apiDomain,
      }));

    if (!adminUserId) {
      onProgress?.('Admin ID missing from overlay, auto-detecting from /api/users...');
      const fetchedAdminId = await fetchAdminUserId(apiToken!, apiDomain || 'app.staffbase.com');
      if (fetchedAdminId) {
        adminUserId = fetchedAdminId;
        onProgress?.(`Using detected admin ID: ${adminUserId}`);
      } else {
        throw new Error('Admin user ID is missing. Load users first so we know which admin to impersonate.');
      }
    }

    onProgress?.(`Setting up ${chatCount} AI chats${prospectName ? ' for ' + prospectName : ''}...`);
    onProgress?.('Fetching environment credentials...');
    const sharedDemoPassword = await fetchSharedDemoPassword({
      apiToken,
      apiDomain,
      slug: (mergedParams.slug as string | undefined) || _environment,
    });

    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!currentTab?.id) {
      throw new Error('No active tab available for chat automation');
    }

    onProgress?.('Injecting chat automation script in this tab...');

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await chrome.tabs.update(currentTab.id, { autoDiscardable: false } as any);
    } catch {
      // Non-fatal if we cannot adjust discardable flag
    }

    await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: chatAutomationScript as unknown as (...args: unknown[]) => unknown,
      args: [
        apiToken,
        apiDomain,
        adminUserId,
        chatCount,
        prospectName,
        topics,
        '',
        sharedDemoPassword,
        {
          ...mergedParams,
          operationsArgs: task.operations?.[0]?.args || {},
          preparedChatPairs,
          preparedConversation,
        }
      ],
    });

    onProgress?.('✅ Chat automation script injected and running');

  } catch (error) {
    onError?.(error instanceof Error ? error.message : 'Failed to run chat automation');
    throw error;
  }
};

export const runArticlesTask = async ({ task, environment: _environment, apiToken, branchId, apiDomain, onProgress, onError }: TaskRunnerArgs) => {
  try {
    const prospectName = task.params?.prospectName;
    const count = (task.params?.count as number | undefined) || (task.params?.articleCount as number | undefined) || 3;
    const topics = Array.isArray(task.params?.topics) ? (task.params!.topics as string[]) : (task.params?.topics ? [task.params.topics as string] : ['company news']);
    const locales = Array.isArray(task.params?.locales) ? (task.params!.locales as string[]) : ['en_US'];
    const channelName = (task.params?.channelName as string | undefined) || 'Top News';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx: any = {
      apiToken: apiToken!.trim(),
      apiDomain,
      branchId,
      geminiProxyUrl: GEMINI_PROXY_URL,
      onProgress,
    };

    // Multibranding support: if multiBrandings provided, run for each brand's channel
    const multiBrandings = Array.isArray(task.params?.multiBrandings) ? task.params.multiBrandings : null;

    if (multiBrandings) {
      for (const brand of multiBrandings) {
        const brandChannel = brand.channelName || `${brand.name || channelName} News`;
        onProgress?.(`Generating articles for brand "${brand.name || brandChannel}"…`);
        await generateAndCreateArticles(
          { topics, count, channelName: brandChannel, prospectName: brand.name || prospectName, locales },
          ctx
        );
      }
    } else {
      await generateAndCreateArticles({ topics, count, channelName, prospectName, locales }, ctx);
    }

    onProgress?.('✅ Articles created.');
  } catch (err) {
    onError?.(err instanceof Error ? err.message : 'Failed to create articles');
    throw err;
  }
};

export const runUserFieldsTask = async ({ task, environment: _environment, apiToken, apiDomain, adminUserId, branchId, onProgress, onError }: TaskRunnerArgs) => {
  try {
    const userCount = task.params?.userCount || 3;
    const userIds = Array.isArray(task.params?.userIds) ? task.params.userIds : [];
    const userEmails = Array.isArray(task.params?.userEmails) ? task.params.userEmails : [];
    const fieldUpdates = Array.isArray(task.params?.fieldUpdates) ? task.params.fieldUpdates : [];
    const selectionStrategy = task.params?.selectionStrategy || 'first';

    if (!apiToken) {
      throw new Error('API token missing for user field updates.');
    }
    if (!fieldUpdates.length) {
      throw new Error('No field updates provided. Add fieldUpdates array in plan.');
    }

    // Ensure we have admin USERID for the PUT request (mirror UpdateUserForm logic)
    if (!adminUserId) {
      onProgress?.('Admin ID missing, fetching users to find an admin (UpdateUserForm-style)...');
      try {
        const usersRes = await fetch(buildApiUrl('/api/users?limit=200', apiDomain!), { headers: { Authorization: `Basic ${apiToken!}` } });
        if (usersRes.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const allUsers: any[] = ((await usersRes.json()) as any)?.data || [];
          const adminUser = allUsers.find((u: Record<string, unknown>) => u.branchRole === 'WeBranchAdminRole');
          if (adminUser?.id) {
            adminUserId = adminUser.id;
            onProgress?.(`Using detected admin ID: ${adminUserId}`);
          } else {
            onProgress?.('⚠️ No admin user found while fetching users; USERID header may be missing');
          }
        } else {
          onProgress?.(`⚠️ Failed to fetch users for admin detection: ${usersRes.status}`);
        }
      } catch (err) {
        onProgress?.(`⚠️ Error fetching users for admin detection: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    onProgress?.(`Updating user fields for ${userIds.length || userEmails.length || userCount} users...`);

    const headers = {
      'Authorization': `Basic ${apiToken}`,
      'Content-Type': 'application/json',
    };

    // Fetch available profile fields to validate
    let profileFields: { slug: string; title?: unknown }[] = [];
    try {
      profileFields = await fetchProfileFields(apiToken!, apiDomain!, branchId);
      onProgress?.(`Found ${profileFields.length} profile fields: ${profileFields.map((f) => f.slug).join(', ')}`);
    } catch (err) {
      onProgress?.(`⚠️ Could not fetch profile fields: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Fetch users
    const usersRes = await fetch(buildApiUrl('/api/users?limit=200', apiDomain!), { headers });
    if (!usersRes.ok) {
      throw new Error(`Failed to fetch users (${usersRes.status})`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const users: any[] = ((await usersRes.json()) as any)?.data || [];

    const findPrimaryEmail = (user: Record<string, unknown>) => {
      const emails = user?.emails as { primary?: boolean; value: string }[] | undefined;
      return emails?.find(e => e.primary)?.value || emails?.[0]?.value || null;
    };

    const targetUsers = (() => {
      if (userIds.length) {
        return users.filter(u => userIds.includes(u.id));
      }
      if (userEmails.length) {
        return users.filter((u: Record<string, unknown>) => { const email = findPrimaryEmail(u); return email ? userEmails.includes(email) : false; });
      }
      const eligible = users;
      if (selectionStrategy === 'random') {
        const shuffled = [...eligible].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, userCount);
      }
      return eligible.slice(0, userCount);
    })();

    if (!targetUsers.length) {
      throw new Error('No matching users found for field update.');
    }

    const pendingUpdates: { user: Record<string, unknown>; profile: Record<string, unknown> }[] = [];
    fieldUpdates.forEach((item) => {
      if (Array.isArray(item?.values) && item.values.length < targetUsers.length) {
        onProgress?.(`⚠️ Field "${item.field}" has ${item.values.length} values for ${targetUsers.length} users; trailing users may be skipped`);
      }
      if (!Array.isArray(item?.values) || !item.values.length) {
        onProgress?.(`⚠️ Field "${item.field}" has no values array; skipping unless a value is provided`);
      }
    });
    const normalise = (val: unknown) => (val || '').toString().toLowerCase().trim();

    let success = 0;
    targetUsers.forEach((user: Record<string, unknown>, idx: number) => {
      const perUserProfile = fieldUpdates.reduce((acc: Record<string, unknown>, item) => {
        if (!item?.field) return acc;
        const requested = normalise(item.field);
        const matched = profileFields.find((f: { slug: string; title?: unknown }) =>
          normalise(f.slug) === requested || normalise((f.title as Record<string, string> | undefined)?.en_US || f.title) === requested
        );
        if (!matched?.slug) return acc;
        const values = Array.isArray(item.values) ? item.values : [];
        const value = values[idx] ?? values[values.length - 1];
        if (typeof value === 'undefined') return acc;
        acc[matched.slug] = value;
        return acc;
      }, {});

      if (!Object.keys(perUserProfile).length) {
        onProgress?.(`⚠️ Skipping ${user.firstName || user.username || user.id}: no matched field/value for this user`);
        return;
      }

      pendingUpdates.push({ user, profile: perUserProfile });
    });

    if (!pendingUpdates.length) {
      throw new Error('No field/value pairs to apply after matching slugs.');
    }

    for (const { user, profile } of pendingUpdates) {
      const resp = await fetch(buildApiUrl(`/api/users/${user.id as string}`, apiDomain!), {
        method: 'PUT',
        mode: 'cors',
        credentials: 'omit',
        headers: {
          ...headers,
          ...(adminUserId ? { USERID: adminUserId } : {}),
        },
        body: JSON.stringify({ profile }),
      });
      if (resp.ok) {
        success++;
        onProgress?.(`✅ Updated ${user.firstName || user.username || user.id} with ${Object.keys(profile).join(', ')}`);
      } else {
        const txt = await resp.text();
        onProgress?.(`❌ Failed to update ${user.firstName || user.username || user.id}: ${resp.status} ${txt}`);
      }
    }

    onProgress?.(`Finished user field updates: ${success}/${pendingUpdates.length} succeeded.`);
  } catch (error) {
    onError?.(error instanceof Error ? error.message : 'Failed to update user fields');
    throw error;
  }
};

export const runUnsupportedTask = async ({ task, environment }: { task: RunnerTask; environment?: string }) => {
  // Unsupported placeholder: log for visibility
  console.warn('Unsupported task', { task, environment });
};

/**
 * Comments task runner - adds AI-generated comments to articles
 */
export const runCommentsTask = async ({ task, environment: _environment, apiToken, branchId, apiDomain, adminUserId, onProgress, onError }: TaskRunnerArgs) => {
  try {
    const articleIds = task.params?.articleIds || [];
    const channelId = task.params?.channelId;
    const users = task.params?.users || [];
    const userCount = task.params?.userCount || 5;
    const prospectName = task.params?.prospectName || '';
    const includeReplies = task.params?.includeReplies !== false;
    const preferredAdminId = task.params?.adminUserId || adminUserId;

    if (!articleIds.length && !channelId) {
      throw new Error('Either articleIds or channelId must be provided for comments');
    }

    onProgress?.(`Adding AI comments to ${articleIds.length || 'channel'} articles...`);

    // Best-effort fetch to restore admin session after automation
    let adminUser = null;
    try {
      const usersRes = await fetch(`https://${apiDomain || 'app.staffbase.com'}/api/users?limit=200`, {
        headers: { Authorization: `Basic ${apiToken}` },
      });
      if (usersRes.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allUsers: any[] = ((await usersRes.json()) as any)?.data || [];
        adminUser = allUsers.find((u: Record<string, unknown>) => u.id === preferredAdminId) ||
          allUsers.find((u: Record<string, unknown>) => u.branchRole === 'WeBranchAdminRole') ||
          null;
      }
    } catch (err) {
      onProgress?.(`⚠️ Could not prefetch admin user: ${err instanceof Error ? err.message : String(err)}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx: any = {
      apiToken,
      branchId,
      apiDomain: apiDomain || 'app.staffbase.com',
      onProgress,
      adminUser,
      adminUserId: preferredAdminId,
    };

    const result = await addCommentsToArticles({
      articleIds,
      channelId,
      users,
      userCount,
      prospectName,
      includeReplies,
    }, ctx);

    onProgress?.(`✅ Added ${result.totalCommentsPosted} comments to ${result.articlesProcessed} articles`);
  } catch (error) {
    onError?.(error instanceof Error ? error.message : 'Failed to add comments');
    throw error;
  }
};
