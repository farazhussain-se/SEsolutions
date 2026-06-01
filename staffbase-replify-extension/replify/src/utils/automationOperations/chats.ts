/**
 * Chat operations - atomic functions for chat automation
 */

import {
  getCsrfToken,
  fetchUsers,
  fetchGroupMembers,
  fetchGroups,
  findPrimaryEmail,
  sleep,
  callGemini,
  getSharedDemoPassword,
} from './environment';
import type { OperationContext } from './types';

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

const normalizeName = (val = '') => (val || '').toLowerCase().replace(/\s+/g, ' ').trim();
const buildInitials = (val = '') => normalizeName(val).split(' ').filter(Boolean).map((p) => p[0]).join('');

/**
 * Generate chat content using AI
 * @param {Object} args - { topic, count, context, companyName, chatMode, groupName }
 * @param {Object} ctx - context
 */
export const generateChatContent = async (
  args: { topic?: string; count?: number; context?: string; companyName?: string; chatMode?: string; groupName?: string },
  ctx: OperationContext
) => {
  const {
    topic,
    count = 5,
    context = '',
    companyName = 'Acme',
    chatMode = 'direct',
    groupName = '',
  } = args;
  const { onProgress } = ctx;

  onProgress?.(`Generating ${count} AI chat messages about "${topic || 'work topics'}"...`);

  const prompt = `You are generating chat messages for a test environment. Employees work at the company ${companyName}. Your task is to act as employees of "${companyName}" having brief, realistic conversations on an internal chat tool.${context ? ` Context: ${context}.` : ''}${topic ? ` Topics to cover: ${topic}.` : ''}

Generate ${count} unique objects, each containing an "initiator" message and a "reply" message. The entire response must be a single, valid JSON array.

**Rules:**
1. **JSON Only**: The entire response must be a single JSON array of objects. Do not include markdown like \`\`\`json.
2. **Internal Tone**: Messages should sound like they are between colleagues. They can be about work, projects, or casual office topics.
3. **Placeholders**: The initiator message should include a "{name}" placeholder where the recipient's first name will be inserted.
${chatMode === 'group' ? `4. **Group Context**: These are for a group chat named "${groupName || 'team'}". Address the group naturally.` : ''}

**Example of a valid JSON output:**
[
  { "initiator": "Hey {name}, do you have the latest numbers for the Q3 forecast?", "reply": "Yep, just finalizing them now. I'll send them over in about 15 minutes." },
  { "initiator": "Quick question {name}, are you going to the all-hands meeting this afternoon?", "reply": "I have a conflict, unfortunately. Could you send me the key takeaways afterward?" }
]`;

  try {
    const { rawText } = await callGemini({ prompt, temperature: 0.9, maxOutputTokens: 8192 }, ctx);
    const parsed = JSON.parse(rawText);

    if (!parsed || parsed.length === 0) {
      onProgress?.('AI returned empty, using fallback chats');
      return { chatPairs: FALLBACK_CHATS.slice(0, count) };
    }

    return { chatPairs: parsed };
  } catch (error) {
    onProgress?.(`AI generation failed: ${error instanceof Error ? error.message : String(error)}, using fallback`);
    return { chatPairs: FALLBACK_CHATS.slice(0, count) };
  }
};

/**
 * Get chat installation ID
 * @param {Object} args - {}
 * @param {Object} ctx - context
 */
export const getChatInstallation = async (_args: Record<string, unknown>, ctx: OperationContext) => {
  const { apiToken, onProgress } = ctx;

  const csrfToken = await getCsrfToken();
  const headers = {
    Authorization: `Basic ${apiToken}`,
    'x-csrf-token': csrfToken,
  };

  const installationsResponse = await fetch('/api/installations/administrated?pluginID=chat', { headers });
  const installations = (await installationsResponse.json()).data || [];
  const chatInstallation = installations.find((i: { pluginID?: string }) => i.pluginID === 'chat');

  if (!chatInstallation) {
    throw new Error('Chat plugin not found in this environment');
  }

  onProgress?.(`Found chat installation: ${chatInstallation.id}`);
  return { chatInstallationId: chatInstallation.id };
};

/**
 * Select chat participants
 * @param {Object} args - { chatMode, groupId, groupName, participantIds, participantEmails, participantCount, excludeAdminId }
 * @param {Object} ctx - context
 */
export const selectChatParticipants = async (
  args: {
    chatMode?: string;
    groupId?: string;
    groupName?: string;
    participantIds?: string[];
    participantEmails?: string[];
    participantCount?: number;
    excludeAdminId?: string;
  },
  ctx: OperationContext
) => {
  const {
    chatMode = 'direct',
    groupId,
    groupName,
    participantIds = [],
    participantEmails = [],
    participantCount = 5,
    excludeAdminId,
  } = args;
  const { apiToken: _apiToken, onProgress } = ctx;

  const { users: allUsers } = await fetchUsers({ limit: 200 }, ctx);
  onProgress?.(`Found ${allUsers.length} users in environment`);

  type UserRecord = { id?: string; name?: string; emails?: { value?: string; primary?: boolean }[] };

  let participants: UserRecord[] = [];
  let resolvedGroupId = groupId || null;

  if (chatMode === 'group') {
    if (groupId) {
      const { members } = await fetchGroupMembers({ groupId }, ctx);
      participants = members;
      resolvedGroupId = groupId;
      onProgress?.(`Loaded ${members.length} members from group ${groupId}`);
    } else if (participantIds.length > 0) {
      participants = (allUsers as UserRecord[]).filter((u) => participantIds.includes(u.id ?? ''));
      onProgress?.(`Using ${participants.length} explicit participant IDs`);
    } else if (participantEmails.length > 0) {
      participants = (allUsers as UserRecord[]).filter((u) => participantEmails.includes(findPrimaryEmail(u) ?? ''));
      onProgress?.(`Using ${participants.length} explicit participant emails`);
    } else if (groupName) {
      const { groups } = await fetchGroups({}, ctx);
      const qNorm = normalizeName(groupName);
      const qInit = buildInitials(groupName);
      const matched = (groups as { id?: string; name?: string }[]).find((g) => {
        const nameNorm = normalizeName(g.name || '');
        const nameInit = buildInitials(g.name || '');
        return (
          nameNorm === qNorm ||
          nameNorm.includes(qNorm) ||
          nameInit === qNorm ||
          nameInit === qInit
        );
      });
      if (matched) {
        const { members } = await fetchGroupMembers({ groupId: matched.id }, ctx);
        participants = members;
        resolvedGroupId = matched.id ?? null;
        onProgress?.(`Loaded ${members.length} members from group "${matched.name || groupName}" (${matched.id})`);
      } else {
        throw new Error(`Group "${groupName}" not found in provided context`);
      }
    }

    if (participants.length === 0) {
      if (groupName || groupId) {
        throw new Error(`No participants resolved for group "${groupName || groupId}"`);
      }
      participants = (allUsers as UserRecord[]).filter((u) => u.id !== excludeAdminId).slice(0, participantCount);
      onProgress?.(`Fallback: selected ${participants.length} participants`);
    }
  } else {
    participants = (allUsers as UserRecord[]).filter((u) => u.id !== excludeAdminId).slice(0, participantCount);
    onProgress?.(`Selected ${participants.length} users for direct chats`);
  }

  return { participants, resolvedGroupId };
};

/**
 * Create a group conversation
 * @param {Object} args - { chatInstallationId, participantIds, groupId }
 * @param {Object} ctx - context
 */
export const createGroupConversation = async (
  args: { chatInstallationId: string; participantIds: string[] },
  ctx: OperationContext
) => {
  const { chatInstallationId, participantIds } = args;
  const { apiToken, adminUserId, onProgress } = ctx;

  const csrfToken = await getCsrfToken();
  const headers: Record<string, string> = {
    Authorization: `Basic ${apiToken}`,
    'x-csrf-token': csrfToken,
    'Content-Type': 'application/json',
  };
  if (adminUserId) headers['USERID'] = adminUserId;

  const createResponse = await fetch(`/api/installations/${chatInstallationId}/conversations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'group', participantIDs: participantIds }),
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

  onProgress?.(`Created group conversation: ${conversationId}`);

  return { conversationId };
};

/**
 * Send a direct message to a user
 * @param {Object} args - { chatInstallationId, userId, message }
 * @param {Object} ctx - context
 */
export const sendDirectMessage = async (
  args: { chatInstallationId: string; userId: string; message: string; userName?: string },
  ctx: OperationContext
) => {
  const { chatInstallationId, userId, message, userName } = args;
  const { apiToken, adminUserId, onProgress } = ctx;

  const csrfToken = await getCsrfToken();
  const headers: Record<string, string> = {
    Authorization: `Basic ${apiToken}`,
    'x-csrf-token': csrfToken,
    'Content-Type': 'application/json',
  };
  if (adminUserId) headers['USERID'] = adminUserId;

  const response = await fetch(`/api/installations/${chatInstallationId}/conversations/direct/${userId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message }),
  });

  if (response.ok) {
    const respJson = await response.json();
    onProgress?.(`Sent message to ${userName || userId}`);
    return { conversationId: respJson?.conversationID || respJson?.id, success: true };
  } else {
    const errorText = await response.text();
    onProgress?.(`Failed to send to ${userName || userId}: ${response.status}`);
    return { success: false, error: errorText };
  }
};

/**
 * Send a message to a conversation
 * @param {Object} args - { conversationId, message }
 * @param {Object} ctx - context
 */
export const sendMessage = async (
  args: { conversationId: string; message: string; useCsrfOnly?: boolean },
  ctx: OperationContext
) => {
  const { conversationId, message, useCsrfOnly = false } = args;
  const { apiToken, adminUserId, onProgress: _onProgress } = ctx;

  const csrfToken = await getCsrfToken();
  const headers: Record<string, string> = useCsrfOnly
    ? { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }
    : {
        Authorization: `Basic ${apiToken}`,
        'x-csrf-token': csrfToken,
        'Content-Type': 'application/json',
      };
  if (!useCsrfOnly && adminUserId) headers['USERID'] = adminUserId;

  const response = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message }),
  });

  if (response.ok) {
    return { success: true };
  } else {
    const errorText = await response.text();
    return { success: false, error: errorText };
  }
};

/**
 * Login as a specific user
 * @param {Object} args - { email, password }
 * @param {Object} ctx - context
 */
export const loginAsUser = async (
  args: { email: string; password?: string },
  ctx: OperationContext
) => {
  const { email, password } = args;
  const { onProgress } = ctx;
  const resolvedPassword = password || await getSharedDemoPassword(ctx);

  onProgress?.(`Logging in as ${email}...`);

  const loginResponse = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, secret: resolvedPassword, locale: 'en_US' }),
  });

  if (loginResponse.ok) {
    await sleep(1000);
    return { success: true };
  }

  return { success: false };
};

/**
 * Run full chat automation - orchestrates all chat operations
 * This runs in an injected tab context
 * @param {Object} args - { chatCount, prospectName, topics, chatMode, groupId, groupName, participantIds, participantEmails, participantCount }
 * @param {Object} ctx - context
 */
export const runChatAutomation = async (
  args: {
    chatCount?: number;
    count?: number;
    prospectName?: string;
    topics?: string[];
    topic?: string;
    chatMode?: string;
    groupId?: string;
    groupName?: string;
    participantIds?: string[];
    participantEmails?: string[];
    participantCount?: number;
  },
  ctx: OperationContext
) => {
  const {
    chatCount = 5,
    prospectName = '',
    topics = [],
    topic,
    chatMode = 'direct',
    groupId,
    groupName,
    participantIds = [],
    participantEmails = [],
    participantCount,
  } = args;
  const { apiToken, adminUserId, apiDomain: _apiDomain, onProgress } = ctx;

  const normalizedTopics = Array.isArray(topics) ? topics.filter(Boolean) : [];
  if (!normalizedTopics.length && topic) {
    normalizedTopics.push(topic);
  }
  const normalizedCount = chatCount || args.count || 5;

  // This is meant to be run via chrome.scripting.executeScript
  // For now, we return the script configuration
  onProgress?.(`Preparing chat automation: ${normalizedCount} chats${prospectName ? ' for ' + prospectName : ''}`);

  return {
    scriptConfig: {
      apiToken,
      adminUserId,
      chatCount: normalizedCount,
      prospectName,
      topics: normalizedTopics,
      chatParams: {
        chatMode,
        groupId,
        groupName,
        participantIds,
        participantEmails,
        participantCount: participantCount || normalizedCount,
      },
    },
    requiresTabInjection: true,
  };
};

/**
 * Full chat workflow - generates content and triggers tab injection flow
 * @param {Object} args - { chatCount, prospectName, topics, topic, chatMode, groupId, groupName, participantIds, participantEmails, participantCount }
 * @param {Object} ctx - context
 */
export const runFullChatWorkflow = async (
  args: Parameters<typeof runChatAutomation>[0],
  ctx: OperationContext
) => {
  const { onProgress } = ctx;
  onProgress?.('Preparing full chat workflow (tab injection + content generation)...');

  return runChatAutomation(args, ctx);
};

/**
 * Create multiple chats with generated content
 * This is a high-level operation that combines content generation and chat creation
 * @param {Object} args - { topic, count, companyName, chatMode, groupId, groupName }
 * @param {Object} ctx - context
 */
export const createChats = async (
  args: {
    topic?: string;
    count?: number;
    companyName?: string;
    chatMode?: string;
    groupId?: string;
    groupName?: string;
    chatPairs?: { initiator: string; reply: string }[];
  },
  ctx: OperationContext
) => {
  const {
    topic,
    count = 5,
    companyName,
    chatMode = 'direct',
    groupId,
    groupName,
    chatPairs, // Can be passed from a previous generateChatContent call
  } = args;
  const { onProgress } = ctx;

  // Generate content if not provided
  let content = chatPairs;
  if (!content) {
    const result = await generateChatContent({
      topic,
      count,
      companyName,
      chatMode,
      groupName,
    }, ctx);
    content = result.chatPairs;
  }

  onProgress?.(`Ready to create ${count} chats with generated content`);

  // The actual chat creation happens via tab injection
  // Return the prepared config
  return {
    chatPairs: content,
    chatConfig: {
      chatMode,
      groupId,
      groupName,
      count,
    },
    requiresTabInjection: true,
  };
};
