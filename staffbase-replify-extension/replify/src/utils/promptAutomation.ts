/**
 * Prompt Automation - AI-powered automation planning
 *
 * Generates structured plans from natural language prompts using Gemini.
 * Supports both new operations format and legacy task format for backward compatibility.
 */

import { fetchAllRecentArticles, fetchChannelArticles } from './automationOperations';
import { callGeminiProxy } from './geminiProxy';

// --- Internal types for Gemini plan structures ---
type GeminiOperation = {
  function: string;
  args?: Record<string, unknown>;
};
type GeminiTask = {
  title?: string;
  type?: string;
  status?: string;
  details?: string;
  colors?: string[];
  params?: Record<string, unknown>;
  operations?: GeminiOperation[];
  [key: string]: unknown;
};
type GeminiPlan = {
  environment?: string;
  userFacingSummary?: string;
  breakdown?: string[];
  operations?: GeminiOperation[];
  legacyTasks?: GeminiTask[];
  tasks?: GeminiTask[];
  needsContext?: boolean | string | Record<string, boolean>;
  contextUsers?: unknown[];
  profileFields?: { slug?: string; title?: unknown }[];
  [key: string]: unknown;
};
type ContextUser = {
  id: string;
  firstName?: string;
  lastName?: string;
  emails?: { primary?: boolean; value: string }[];
  publicEmailAddress?: string;
  email?: string;
  role?: { type?: string };
  branchRole?: string;
  name?: string;
};
type ContextRef = {
  id?: string;
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
};
type ContextData = {
  users?: ContextUser[];
  profileFields?: { slug?: string; title?: unknown }[];
  groups?: { id: string; name?: string; title?: string }[];
  channels?: { id: string; title?: string }[];
  articles?: { id: string; contents?: Record<string, unknown>; title?: string; channelId?: string; channelTitle?: string }[];
};

/**
 * Repair common Gemini JSON malformations where `]` appears before the
 * enclosing object `}` is closed (e.g. inside an `operations` array).
 * Walks the string token-by-token and inserts missing `}` before each `]`.
 */
const repairJsonBraces = (text: string): string => {
  let result = '';
  let inString = false;
  let escaped = false;
  const stack: string[] = []; // '{' or '['

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (escaped) { escaped = false; result += c; continue; }
    if (c === '\\' && inString) { escaped = true; result += c; continue; }
    if (c === '"') { inString = !inString; result += c; continue; }
    if (inString) { result += c; continue; }

    if (c === '{') { stack.push('{'); result += c; }
    else if (c === '[') { stack.push('['); result += c; }
    else if (c === '}') {
      // Pop the top whether it's { or [ — let JSON.parse catch real mismatches
      if (stack.length) stack.pop();
      result += c;
    }
    else if (c === ']') {
      // Close any unclosed objects before closing the array
      while (stack.length && stack[stack.length - 1] === '{') {
        stack.pop();
        result += '}';
      }
      if (stack.length && stack[stack.length - 1] === '[') stack.pop();
      result += c;
    }
    else { result += c; }
  }

  // Close any remaining open structures
  while (stack.length > 0) {
    result += stack.pop() === '{' ? '}' : ']';
  }

  return result;
};

const BRAND_COLOR_FALLBACKS: Record<string, string[]> = {
  salesforce: ['#00A1E0', '#032E61', '#F4F6F9', '#FFFFFF'],
  nike: ['#111111', '#FFFFFF', '#F5F5F5', '#E5E5E5'],
  spotify: ['#1DB954', '#191414', '#FFFFFF', '#121212'],
  tesla: ['#CC0000', '#111111', '#FFFFFF', '#F5F5F5'],
  ford: ['#003399', '#FFFFFF', '#F5F7FA', '#0A1F44'],
  apple: ['#000000', '#FFFFFF', '#F5F5F7', '#1D1D1F'],
  google: ['#4285F4', '#34A853', '#FBBC05', '#EA4335'],
  microsoft: ['#00A4EF', '#7FBA00', '#F25022', '#FFB900'],
  amazon: ['#FF9900', '#232F3E', '#FFFFFF', '#146EB4'],
  meta: ['#0668E1', '#FFFFFF', '#F0F2F5', '#1C2B33'],
};

const getFallbackColors = (prospectName: string): string[] => {
  if (!prospectName) return ['#1D4ED8', '#0F172A', '#F8FAFC'];
  const key = prospectName.toLowerCase().trim();
  for (const brand in BRAND_COLOR_FALLBACKS) {
    if (key.includes(brand)) return BRAND_COLOR_FALLBACKS[brand];
  }
  return ['#1D4ED8', '#0F172A', '#F8FAFC'];
};

const fetchGroups = async (apiToken: string, apiDomain: string, branchId?: string) => {
  if (!apiToken) return [];
  const url = branchId
    ? `https://${apiDomain}/api/branch/groups`
    : `https://${apiDomain}/api/groups`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${apiToken}` } });
  if (!res.ok) return [];
  const data = await res.json();
  return data?.data || [];
};

const fetchProfileFields = async (apiToken: string, apiDomain: string, branchId?: string) => {
  if (!apiToken) return [];
  const url = branchId
    ? `https://${apiDomain}/api/branches/${branchId}/profilefields`
    : `https://${apiDomain}/api/profilefields`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${apiToken}` } });
  if (!res.ok) return [];
  const data = await res.json();
  if (Array.isArray(data?.data)) return data.data;
  if (data?.schema && typeof data.schema === 'object') {
    return Object.keys(data.schema).map((slug) => {
      const field = data.schema[slug] || {};
      return {
        slug,
        title: field.localization?.en_US?.title || field.localization?.de_DE?.title || slug,
      };
    });
  }
  return [];
};

const fetchUsers = async (apiToken: string, apiDomain: string) => {
  if (!apiToken) return [];
  const res = await fetch(`https://${apiDomain}/api/users?limit=200`, {
    headers: { Authorization: `Basic ${apiToken}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data?.data || [];
};

const fetchNewsChannels = async (apiToken: string, apiDomain: string, branchId?: string) => {
  if (!apiToken || !branchId) return [];
  try {
    const res = await fetch(
      `https://${apiDomain}/api/spaces/${branchId}/installations?pluginID=news`,
      { headers: { Authorization: `Basic ${apiToken}` } }
    );
    if (!res.ok) return [];
    const data = await res.json() as { data?: { id: string; config?: { localization?: { en_US?: { title?: string } } } }[] };
    return (data?.data || []).map((c) => ({
      id: c.id,
      title: c.config?.localization?.en_US?.title || 'Unknown',
    }));
  } catch (e) {
    console.error('Error fetching news channels:', e);
    return [];
  }
};

/**
 * Build the system prompt for Gemini
 */
const buildSystemPrompt = (cleanedPrompt: string, environment: string, linkedInHint: string | null): string => {
  return `
You are Replify, an intelligent automation assistant that helps configure Staffbase demo environments. You create detailed, user-friendly automation plans.

## Your Capabilities
You can automate these tasks:
- **Branding**: Apply company colors, logos, backgrounds, and header transparency
- **AI Chats**: Generate realistic employee conversations
- **LinkedIn Articles**: Import posts from company LinkedIn pages
- **User Fields**: Update profile fields like position, department, etc.

## Response Format
Respond ONLY with a single valid JSON object (no markdown, no code fences).

### JSON Structure:
{
  "environment": "${environment}",
  "userFacingSummary": "<Conversational sentence describing what will happen. Be specific and engaging.>",
  "breakdown": [
    "<Bullet point 1: specific action>",
    "<Bullet point 2: specific action>",
    "..."
  ],
  "needsContext": {
    "users": <true if you need user list for selection, specific targeting, or adding comments>,
    "profileFields": <true if updating user fields>,
    "groups": <true if creating group chats>,
    "channels": <true if importing/creating articles - to check for existing channels>,
    "articles": <true if adding comments to existing articles - to get article IDs>
  },
  "operations": [
    {
      "function": "<operation name>",
      "args": { <operation arguments> }
    }
  ],
  "code": null,
  "legacyTasks": [<backward compatible task format>]
}

## Context Requests
Request only the context you need by setting the appropriate flags in "needsContext":
- **users**: Set true when updating user fields, selecting chat participants, or adding comments to articles
- **profileFields**: Set true when updating user profile fields (to validate field slugs)
- **groups**: Set true when creating group chats (to resolve group names to IDs)
- **channels**: Set true when importing/creating articles (to check if channel exists)
- **articles**: Set true when adding comments to EXISTING articles (to get article IDs and titles)

If you don't need any context, you can omit needsContext or set all values to false.
NOTE: For NEW articles (generateAndCreateArticles or importLinkedInArticlesFull), you don't need articles context - the operation returns the new article IDs.

## Writing Great Summaries

### userFacingSummary Examples:
- BAD: "Apply branding and add chats"
- GOOD: "Replify will transform your environment with Salesforce's signature blue (#00A1E0), add their cloud logo, and spark 5 employee conversations about the newest acquisition."

- BAD: "Add LinkedIn articles for Tesla"
- GOOD: "Replify will create a Top News channel and import 10 recent LinkedIn posts from Tesla Motors, bringing fresh content about electric vehicles and company updates."

### breakdown Examples:
- "Apply Salesforce blue (#00A1E0) as the primary brand color"
- "Set the official Salesforce logo in the header"
- "Create 5 realistic employee chats discussing the latest acquisition news"
- "Import 10 LinkedIn articles about product launches"
- "Update the first 5 non-admin users to have Department = Sales and Location = Berlin"
- "Set 5 users to Sales Rep titles and Sales department (first 5 non-admin users)"

## Available Operations

### Branding Operations
- applyFullBranding: { prospectName, primary, text, background, headerTransparency, bgUrl } // Logo is auto-generated from prospectName
- applyBrandColors: { primary, text, background, floatingNavBg, floatingNavText }
- setLogo: { prospectName } // Logo URL is auto-generated from prospectName via logo.dev - do NOT provide logoUrl
- setHeaderTransparency: { value } // 0-100 where 0=transparent, 100=solid. Vary by brand: modern/minimal brands (Apple, Tesla, Nike) use 30-50, traditional brands use 60-80. Don't always default to 70.
- setBackground: { bgUrl, bgVertical }
- commitBranding: { colors, headerTransparency, bgUrl, prospectName } // Logo auto-generated from prospectName

### Chat Operations
- runFullChatWorkflow: { chatCount, prospectName, topics, topic, chatMode, groupId, groupName, participantCount, chatTitle, conversationFlow, conversationContext } // Preferred: generates + sends via tab injection
- generateChatContent: { topic, count, context, companyName, chatMode, groupName }
- createChats: { topic, count, companyName, chatMode, groupId, groupName, chatPairs }
- runChatAutomation: { chatCount, prospectName, topics, chatMode, groupId, groupName }

### Chat Customization (runFullChatWorkflow)
- **chatTitle**: Optional name for the group chat (e.g., "Project Planning", "Q4 Discussion")
- **conversationFlow**: Array specifying WHO sends messages in WHAT order. Use "admin" for the logged-in user, or participant first names.
  - Example: ["admin", "Maria", "Patrick", "admin", "Maria"] means admin sends first, then Maria, then Patrick, then admin again, then Maria
  - If user says "back and forth" or wants a real conversation, generate a flow with 5-6 messages alternating between participants
  - If not specified, default to: admin sends once, then each participant replies once
- **conversationContext**: The topic/context for the AI to generate relevant messages (e.g., "discussing Q4 project timelines and deadlines")
  - Extract this from the user's prompt - what should they be talking ABOUT?
  - This helps generate contextual messages instead of generic "Hey, how's it going?"

### Article Operations
- generateAndCreateArticles: { topics, count, channelName, prospectName } // Generate AI articles with Unsplash images and publish to a channel
- importLinkedInArticlesFull: { linkedInUrl, articleCount, prospectName, channelName } // Import LinkedIn posts - synchronous, waits for completion
- findOrCreateNewsChannel: { channelName, prospectName }
- addCommentsToArticles: { articleIds, channelId, users, prospectName, userCount, language? } // Add AI-generated comments to articles using multiple users. Pass language (e.g. "Spanish", "French") if user specifies a language.
- scrapeAndCreateArticlesFromBlog: { blogUrl, articleCount, channelName, prospectName } // Scrape articles from a public blog URL and create them in a channel with original images

### Blog Scraping Operation
- **scrapeAndCreateArticlesFromBlog**: Opens a blog URL in a new tab, waits for user to trigger scraping (via right-click menu or keyboard shortcut), then creates articles in Staffbase
  - **Two-phase process**: (1) Scrape blog articles (separate tab), (2) Create articles in Staffbase
  - Default articleCount: 3 (only specify if user requests different number)
  - Works with most standard blog platforms (WordPress, Medium, Wix, Ghost, etc.)
  - Requires PUBLIC blog URL (no authentication/paywall supported)
  - **Permission flow**: Opens blog → notification appears → user right-clicks and selects "Replify: Scrape this blog" OR presses Ctrl+Shift+S → scrapes → closes tab
  - User has 90 seconds to trigger the scrape
  - Scrapes visible articles from the first page only
  - Original article URLs are preserved (link to source in article content)
  - Uses images from the blog (not Unsplash)
  - If user provides a company website, try common blog paths: /blog, /news, /insights, /press, /articles

### Article + Comment Guidance
- **generateAndCreateArticles** creates AI-written articles with stock images from Unsplash
- **importLinkedInArticlesFull** is synchronous - it waits for the import to complete, cleans up the marker article, and returns the new article IDs
- **addCommentsToArticles** logs in as different users to post comments - requires user context
- If user wants "LinkedIn articles with comments", chain: importLinkedInArticlesFull → addCommentsToArticles (using returned articleIds)
- If user wants "AI articles with comments", chain: generateAndCreateArticles → addCommentsToArticles (using returned articleIds)
- For comments, use the same user pool as chats by default UNLESS the user specifies different users for each

### User Operations
- updateUserFields: { fieldUpdates: [{ field, values }], userCount, userIds, userEmails, users, selectionStrategy } // ALWAYS use this for user field updates - supports context enrichment
- selectUsers: { userIds, userEmails, userCount }
// NOTE: Do NOT use updateUserField (singular) - always use updateUserFields even for single users

### Environment Setup Operations
- setupInstallations: Configure environment features via Chino's endpoint
  Args: {
    chat: boolean - Enable chat in navigation (adds chat to nav, NOT AI chat conversations)
    microsoft: boolean - Enable Microsoft integration (Teams/Outlook)
    campaigns: boolean - Enable campaigns feature
    launchpad: array - Launchpad items to enable, e.g., ["all"] or specific items
    journeys: boolean - Enable employee journeys
    quickLinks: array - Quick links for mobile, e.g., [{ name: "hr", title: "HR Support" }, { name: "it", title: "IT Help" }]
    customWidgets: boolean - Enable custom widgets (uses admin email automatically)
    workdayMerge: boolean - Enable Workday merge integration
    mergeFieldTitle: string - Profile field for merge (default: "Public Email Address")
  }
  Use when: user wants to enable features like chat in nav, Microsoft, quick links, launchpad, etc.
  IMPORTANT: "add chat" or "enable chat" = setupInstallations({ chat: true }) - this adds chat to the navigation
  Use runFullChatWorkflow ONLY when user wants AI-generated chat CONVERSATIONS

- setupEmailTemplates: Generate email templates for the environment
  Args: {} (no args needed, uses domain from context)
  Use when: user mentions "email templates" or "transactional emails"

### Environment Setup Guidance
- "add chat" / "enable chat" / "chat in the nav" → setupInstallations with chat: true
- "add some chats about X" / "generate chat conversations" → runFullChatWorkflow (AI conversations)
- "quick links" / "mobile quick links" → setupInstallations with quickLinks array
- "email templates" → setupEmailTemplates
- "Microsoft integration" / "Teams" / "Outlook" → setupInstallations with microsoft: true
- "launchpad" / "enable launchpad" → setupInstallations with launchpad: ["all"]
- "Workday merge" / "merge integration" → setupInstallations with workdayMerge: true

### User Field Update Guidance
- Always include a fieldUpdates array with field + values (values length should cover the number of target users).
- Be explicit about which users get updated (userIds, userEmails, or "first N non-admin users"). Mention this in userFacingSummary and breakdown.
- If the user did not specify users, default to userCount with clear intent (e.g., "first 5 non-admin users"). Use selectionStrategy="first" (not random) when you say "first".
- You can also pass an explicit "users" array (objects with id/email) if specific users are named.
- Only request user context if needed; otherwise keep the plan minimal.

### Workflow Guidance
- Default to **runFullChatWorkflow** for anything that sounds like "generate/add chats" so content gets created and sent via tab injection.
- Use the atomic chat operations only if the user explicitly asks for partial/manual control (e.g., "just give me the JSON" or "I'll send messages myself").

## Rules
1. **Use only provided context** - If a requested user/channel/group/profile field is not in the provided context, say "<item> not found", mark the task/operation as unsupported, and do not invent IDs/emails/fields/channels.
2. **Targeting users** - Prefer IDs; include full name + role + primary/internal email in tasks/operations (e.g., "Updating Davide Bonchamp (id 6925..., email clone+...@staffbase.com, role reader)").
3. **Only create tasks explicitly requested** - Don't add extra features
4. **Always provide colors for branding** - Extract from the company name (3-4 hex colors)
5. **LinkedIn URLs must be exact** - Format: https://www.linkedin.com/company/{slug}
   ${linkedInHint ? `- USE THIS SLUG: "${linkedInHint}" → "https://www.linkedin.com/company/${linkedInHint}"` : ''}
6. **headerTransparency is 0-100 INTEGER** - Default 70. "transparent"=0, "solid"=100
7. **Mirror user language in summaries** - If they say "some chats", don't say "5 chats"
7a. **Content language** - If the user asks for content in a specific language (e.g. "comments in Spanish", "chats in French"), add a \`language\` field (e.g. "Spanish", "French") to the args of the relevant operations: addCommentsToArticles, runFullChatWorkflow. For articles, set \`locales\` to the appropriate locale codes (e.g. ["es_ES"], ["fr_FR"]) instead.
8. **Be descriptive** - Don't just list operations, explain what they'll see
9. **Chats need tab injection** - When user wants chats in their environment, use runFullChatWorkflow (or runChatAutomation) so messages are generated AND sent. Only use atomic chat ops for highly manual requests.
10. **User field updates must be concrete** - Provide fieldUpdates with values AND specify which users (IDs/emails or N random/non-admin). Summaries should say who gets updated, using full names when known.
11. **Profile fields: exact slugs only** - Use only the slugs from the provided profile fields list (e.g., "hobby" is valid; do NOT change to "hobbies"). If a requested field isn’t in the list, say "<field> not found", mark the task unsupported, and omit the operation.
12. **If you say "first N users", set selectionStrategy="first" (not random)** - Do not claim "first" and then randomize.
13. **Group chat targeting rules (critically important)**
    - If the user names a specific group (e.g., "DEI"): resolve groupId from the provided groups, include groupId in BOTH task.params and operations[0].args, and do NOT include participantIds/users. If not found, set status="unsupported".
    - If the user does NOT name a group but names people (e.g., "Maria", "Patrick"): leave groupName empty, set groupId=null, and include participantIds/users for those people (id+email) in BOTH task.params and operations[0].args. Do NOT invent a group name like "General Chat".
    - If neither a group nor people are provided: set status="unsupported" and say a group or participants are required.
14. **Blog scraping rules**
    - Only works with PUBLIC blogs (no login/paywall)
    - URL must be a blog listing page (e.g., /blog, /news, /articles), not an individual post
    - **Two-step process**: (1) Scrape blog articles (separate tab), (2) Create articles in Staffbase
    - **Permission flow**: Opens blog tab → user right-clicks and selects "Replify: Scrape this blog" OR presses Ctrl+Shift+S → scrapes → auto-closes tab (90 second timeout)
    - ALWAYS mention in userFacingSummary that user will need to "right-click" or use keyboard shortcut
    - Default to 3 articles if user doesn't specify a number
    - Scrapes visible articles from the first page only
    - Original article URLs are preserved in the created Staffbase articles
    - Uses images from the blog (not Unsplash)
    - If user provides a company website root (e.g., "acme.com"), append common blog paths: /blog, /news, /insights, /press

## Legacy Task Format (for backward compatibility)
Include a "legacyTasks" array with objects like:
{
  "title": "Apply Salesforce branding",
  "type": "branding|chats|articles|linkedinArticles|userFields|comments|unsupported",
  "status": "ready|unsupported",
  "details": "Description of what will happen",
  "colors": ["#hex1", "#hex2", "#hex3"],
  "params": {
    "prospectName": "Company Name",
    "headerTransparency": 70,
    // ... other params
  }
}

## Special Cases
- For widgets, stock tickers, page layouts: type="unsupported", status="unsupported"
- For group chats: set chatMode="group" and include groupName or groupId
- For user field updates: include fieldUpdates array with {field, values} objects

## Example Input/Output

Input: "add some chats about the new acquisition from salesforce"

Output:
{
  "environment": "current",
  "userFacingSummary": "Replify will create several employee conversations discussing Salesforce's newest acquisition, with different team members sharing their thoughts and reactions to the news.",
  "breakdown": [
    "Generate realistic chat messages about the acquisition",
    "Create conversations from various employees discussing the news",
    "Include natural back-and-forth dialogue about the acquisition's impact"
  ],
  "operations": [
    { "function": "runFullChatWorkflow", "args": { "chatCount": 5, "prospectName": "Salesforce", "topics": ["newest acquisition", "company news", "business impact"] } }
  ],
  "code": null,
  "legacyTasks": [
    {
      "title": "Create employee chats about the acquisition",
      "type": "chats",
      "status": "ready",
      "details": "Multiple employees will discuss Salesforce's newest acquisition",
      "colors": [],
      "params": { "chatCount": 5, "prospectName": "Salesforce", "topics": ["newest acquisition"] }
    }
  ]
}

Input: "Add articles from https://dhl-freight-connections.com/en/blog/ to Top News"

Output:
{
  "environment": "current",
  "userFacingSummary": "Replify will open the DHL Freight Connections blog in a new tab. You'll right-click and select 'Replify: Scrape this blog' (or press Ctrl+Shift+S), then Replify will scrape 3 articles and add them to your Top News channel.",
  "breakdown": [
    "Open blog in new tab",
    "Wait for you to right-click → 'Replify: Scrape this blog' OR press Ctrl+Shift+S",
    "Scrape article titles, URLs, excerpts, and images from blog",
    "Create 'Top News' channel if it doesn't exist",
    "Create articles in Staffbase with links to original posts"
  ],
  "operations": [
    {
      "function": "scrapeAndCreateArticlesFromBlog",
      "args": {
        "blogUrl": "https://dhl-freight-connections.com/en/blog/",
        "channelName": "Top News",
        "prospectName": "DHL Freight"
      }
    }
  ],
  "code": null,
  "legacyTasks": []
}

User's prompt: "${cleanedPrompt}"
`;
};

const callGemini = async (promptText: string, auth: Record<string, unknown> = {}) => {
  const data = await callGeminiProxy(
    {
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: {
        temperature: 0.25,
      },
    },
    'gemini-2.5-flash',
    auth
  ) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; sessionToken?: string };
  let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
  return {
    rawText,
    sessionToken: data.sessionToken,
  };
};

const enrichPlanWithFallbackColors = (plan: GeminiPlan): GeminiPlan => {
  // Enrich legacy tasks
  if (plan?.legacyTasks?.length) {
    plan.legacyTasks = plan.legacyTasks.map((task: GeminiTask) => {
      if (task.type === 'branding') {
        const prospect = String(task.params?.prospectName || '');
        if (!Array.isArray(task.colors) || task.colors.length < 2) {
          task.colors = getFallbackColors(prospect);
        }
      }
      return task;
    });
  }

  // Also check old tasks format for backward compat
  if (plan?.tasks?.length) {
    plan.tasks = plan.tasks.map((task: GeminiTask) => {
      if (task.type === 'branding') {
        const prospect = String(task.params?.prospectName || '');
        if (!Array.isArray(task.colors) || task.colors.length < 2) {
          task.colors = getFallbackColors(prospect);
        }
      }
      return task;
    });
  }

  return plan;
};

/**
 * Determine what context the plan needs - returns object with specific context types
 */
const getRequestedContext = (plan: GeminiPlan) => {
  const needs = { users: false, profileFields: false, groups: false, channels: false, articles: false };

  // Check explicit needsContext object from Gemini
  if (plan?.needsContext && typeof plan.needsContext === 'object') {
    return { ...needs, ...plan.needsContext };
  }

  // Legacy string check
  if (plan?.needsContext && typeof plan.needsContext === 'string' && plan.needsContext.toLowerCase() === 'yes') {
    // Old format - assume needs everything
    return { users: true, profileFields: true, groups: true, channels: false, articles: false };
  }

  // Infer from operations/tasks if not explicitly requested
  const tasks = plan?.legacyTasks || plan?.tasks || [];
  const operations = plan?.operations || [];

  tasks.forEach((t: GeminiTask) => {
    if (t.type === 'userFields') {
      needs.users = true;
      needs.profileFields = true;
    }
    if (t.type === 'chats' && t.params?.chatMode === 'group') {
      // If a group name is present, always request groups so we can resolve/validate it,
      // even if Gemini supplied a placeholder groupId.
      if (t.params?.groupName) {
        needs.groups = true;
      } else {
        // No group name means we need explicit participants, so fetch users.
        needs.users = true;
      }
    }
    if (t.type === 'linkedinArticles') {
      needs.channels = true;
    }
  });

  operations.forEach((op: GeminiOperation) => {
    if (op.function === 'updateUserFields') {
      needs.users = true;
      needs.profileFields = true;
    }
    if ((op.function === 'selectChatParticipants' || op.function === 'runFullChatWorkflow' || op.function === 'runChatAutomation') && op.args?.chatMode === 'group') {
      // Same rule as tasks: if a group name is present, request groups even if a groupId exists
      if (op.args?.groupName) {
        needs.groups = true;
      } else {
        needs.users = true;
      }
    }
    if (op.function === 'importLinkedInArticlesFull' || op.function === 'findOrCreateNewsChannel') {
      needs.channels = true;
    }
    // Comments need users (to post as different users) and articles (to get article IDs)
    if (op.function === 'addCommentsToArticles' || op.function === 'addCommentsToArticle') {
      needs.users = true;
      // Only need articles context if no articleIds were provided (commenting on existing articles)
      if (!Array.isArray(op.args?.articleIds) || !(op.args.articleIds as unknown[]).length) {
        needs.articles = true;
        needs.channels = true; // Also fetch channels so Gemini can resolve channel names to IDs
      }
    }
  });

  return needs;
};

const mergeContextUpdates = (originalPlan: GeminiPlan, updates: Record<string, unknown>) => {

  if (!updates?.tasks || !Array.isArray(updates.tasks)) {
    return originalPlan;
  }

  const nextPlan = {
    ...originalPlan,
    legacyTasks: [...(originalPlan.legacyTasks || originalPlan.tasks || [])],
    operations: [...(originalPlan.operations || [])],
  };

  // Build a map of operationIndex -> update for userFields tasks
  // This allows us to match each task to its corresponding operation
  const userFieldsOpIndices = nextPlan.operations
    .map((op: GeminiOperation, idx: number) => (op.function === 'updateUserFields' ? idx : -1))
    .filter((idx: number) => idx >= 0);

  // Build indices for comment operations
  const commentsOpIndices = nextPlan.operations
    .map((op: GeminiOperation, idx: number) => (op.function === 'addCommentsToArticles' || op.function === 'addCommentsToArticle' ? idx : -1))
    .filter((idx: number) => idx >= 0);

  // Track which operations we've processed
  let userFieldsUpdateCounter = 0;
  let commentsUpdateCounter = 0;

  (updates.tasks as Record<string, unknown>[]).forEach((update: Record<string, unknown>) => {
    const idx = typeof update.index === 'number' ? update.index : -1;
    const task = (update.task || update) as GeminiTask;
    const availableUsers = (originalPlan.contextUsers || []) as ContextUser[];
    const findPrimaryEmail = (u: ContextUser) =>
      u?.emails?.find((e) => e.primary)?.value ||
      u?.emails?.[0]?.value ||
      u?.publicEmailAddress ||
      u?.email ||
      null;
    const normalizeUser = (u: ContextUser) => {
      const email = findPrimaryEmail(u);
      const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.name || email || u.id;
      return {
        id: u.id,
        email,
        name,
        role: u.role?.type || u.branchRole || 'unknown-role',
      };
    };
    const matchUserRef = (ref: ContextRef = {}) => {
      if (!availableUsers.length) return null;
      const refEmail = (ref.email || '').toLowerCase();
      const refId = ref.id;
      const refName = (ref.name || ref.firstName || '').toLowerCase();
      const refLast = (ref.lastName || '').toLowerCase();

      const byId = refId ? availableUsers.find((u: ContextUser) => u.id === refId) : null;
      if (byId) return normalizeUser(byId);

      const byEmail = refEmail
        ? availableUsers.find((u: ContextUser) => (findPrimaryEmail(u) || '').toLowerCase() === refEmail)
        : null;
      if (byEmail) return normalizeUser(byEmail);

      if (refName) {
        const byName = availableUsers.find((u: ContextUser) => {
          const full = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase().trim();
          return full.includes(refName) || (u.firstName || '').toLowerCase() === refName;
        });
        if (byName) return normalizeUser(byName);
      }
      if (refLast) {
        const byLast = availableUsers.find((u: ContextUser) => (u.lastName || '').toLowerCase() === refLast);
        if (byLast) return normalizeUser(byLast);
      }
      return null;
    };

    // Check if Gemini provided an explicit operationIndex
    const explicitOpIdx = typeof update.operationIndex === 'number' ? update.operationIndex : null;


    // Update legacyTasks
    if (idx >= 0 && idx < nextPlan.legacyTasks.length) {
      nextPlan.legacyTasks[idx] = task;
    } else if (task?.title) {
      const found = nextPlan.legacyTasks.findIndex((t: GeminiTask) => t.title === task.title && t.type === task.type);
      if (found >= 0) {
        nextPlan.legacyTasks[found] = task;
      }
    }

    // Validate chat participants against context users to avoid hallucinated IDs/emails
    if (task.type === 'chats') {
      const refUsers = Array.isArray(task.params?.users)
        ? task.params.users
        : Array.isArray(task.operations?.[0]?.args?.users)
        ? task.operations[0].args.users
        : [];
      if (refUsers.length && availableUsers.length) {
        const matched: ReturnType<typeof normalizeUser>[] = [];
        const missing: string[] = [];
        refUsers.forEach((ref: ContextRef) => {
          const hit = matchUserRef(ref);
          if (hit) {
            matched.push(hit);
          } else {
            const hint = ref.name || ref.firstName || ref.email || ref.id || 'user';
            missing.push(hint);
          }
        });

        if (!matched.length || missing.length) {
          task.status = 'unsupported';
          task.details = `${task.details || task.title || 'Chat'} - ${missing.join(', ') || 'participants'} not found`;
          task.params = { ...(task.params || {}), users: matched };
          if (task.operations?.[0]?.args) {
            task.operations[0].args = { ...(task.operations[0].args || {}), users: matched };
          }
        } else {
          task.params = { ...(task.params || {}), users: matched };
          if (task.operations?.[0]?.args) {
            task.operations[0].args = { ...(task.operations[0].args || {}), users: matched };
          }
        }

        // If a groupId exists, keep it and do not convert intent
        const hasGroupId = !!(task.params?.groupId || task.operations?.[0]?.args?.groupId);
        const hasGroupName = !!(task.params?.groupName || task.operations?.[0]?.args?.groupName);
        if (!hasGroupId && hasGroupName && !matched.length && (!task.params?.participantIds || !(task.params?.participantIds as unknown[])?.length)) {
          const title = task.params?.groupName || task.operations?.[0]?.args?.groupName;
          task.status = 'ready';
          task.details = `${task.details || task.title || 'Chat'} - using "${title}" as chat title and selecting participants automatically`;
          task.params = { ...(task.params || {}), chatTitle: title, groupName: '', groupId: null, users: matched };
          if (task.operations?.[0]?.args) {
            task.operations[0].args = { ...(task.operations[0].args || {}), chatTitle: title, groupName: '', groupId: null, users: matched };
          }
        }
      }
    }

    // Also sync to operations array if this is a userFields task
    if (task.type === 'userFields' && (task.params?.fieldUpdates || task.operations?.[0]?.args?.fieldUpdates)) {

      // Determine which operation index to update:
      // 1. Use explicit operationIndex if provided by Gemini
      // 2. Otherwise, use the Nth updateUserFields operation (in order)
      let opIdx;
      if (explicitOpIdx !== null && explicitOpIdx >= 0 && explicitOpIdx < nextPlan.operations.length) {
        opIdx = explicitOpIdx;
      } else if (userFieldsUpdateCounter < userFieldsOpIndices.length) {
        opIdx = userFieldsOpIndices[userFieldsUpdateCounter];
        userFieldsUpdateCounter++;
      } else {
        return;
      }

      // Extract fieldUpdates and user data from task.operations[0].args FIRST (preferred - enriched by context pass)
      // Fall back to task.params only if operations is empty (legacy format)
      // This is important because Gemini puts the correct enriched data in operations[0].args,
      // while params may contain hallucinated data from the initial pass
      const opArgs = task.operations?.[0]?.args || {};
      const taskFieldUpdates = opArgs.fieldUpdates || task.params?.fieldUpdates || [];
      const taskUsers = opArgs.users || task.params?.users || [];
      const taskUserIds = opArgs.userIds || task.params?.userIds || [];
      const taskUserEmails = opArgs.userEmails || task.params?.userEmails || [];
      const taskUserCount = opArgs.userCount ?? task.params?.userCount;
      const taskSelectionStrategy = opArgs.selectionStrategy || task.params?.selectionStrategy;

      const usersArray = Array.isArray(taskUsers) ? taskUsers : [];
      const userIdsArray = Array.isArray(taskUserIds) ? taskUserIds : [];
      const userEmailsArray = Array.isArray(taskUserEmails) ? taskUserEmails : [];

      // Derive ids/emails from task.users if present
      const derivedIds = usersArray.map(u => u.id).filter(Boolean);
      const derivedEmails = usersArray.map(u => u.email).filter(Boolean);

      // Validate field slugs against available profile fields if present in originalPlan context
      // IMPORTANT: Prefer fu.slug over fu.field since Gemini may hallucinate field names but provide correct slugs
      const availableFields = (originalPlan.profileFields || []).map((f: { slug?: string }) => (f?.slug || '').toLowerCase());
      const filteredFieldUpdates = (taskFieldUpdates as Record<string, unknown>[] || []).filter((fu: Record<string, unknown>) => {
        const slug = ((fu.slug as string) || (fu.field as string) || '').toLowerCase();
        const isValid = availableFields.length === 0 || availableFields.includes(slug);
        return isValid;
      }).map((fu: Record<string, unknown>) => ({
        ...fu,
        field: fu.slug || fu.field, // Normalize: use the validated slug as the field name
      }));
      if (!filteredFieldUpdates.length) {
        return;
      }

      // IMPORTANT: Only use data from the context-enriched task, NOT from the original operation
      // This prevents hallucinated data (like eira@example.com) from persisting
      // The context pass should have resolved the real user data from the API
      const mergedUsers = usersArray.length > 0 ? usersArray : [];
      const mergedIds = [...new Set([...userIdsArray, ...derivedIds].filter(Boolean))];
      const mergedEmails = [...new Set([...userEmailsArray, ...derivedEmails].filter(Boolean))];

      // Filter out obviously hallucinated emails (example.com, example.org, etc.)
      const suspiciousEmailPattern = /@example\.(com|org|net)$/i;
      const cleanedEmails = mergedEmails.filter(email => !suspiciousEmailPattern.test(email));

      // Replace the operation args entirely (don't keep potentially hallucinated data from original op)
      nextPlan.operations[opIdx] = {
        ...nextPlan.operations[opIdx],
        args: {
          fieldUpdates: filteredFieldUpdates,
          userCount: taskUserCount || nextPlan.operations[opIdx].args?.userCount,
          userIds: mergedIds,
          userEmails: cleanedEmails,
          users: mergedUsers,
          selectionStrategy: taskSelectionStrategy || nextPlan.operations[opIdx].args?.selectionStrategy,
        },
      };
    }

    // For other tasks that carry operations (e.g., chats), sync the first operation into the plan
    if (task.type !== 'userFields' && task.type !== 'comments' && Array.isArray(task.operations) && task.operations.length > 0) {
      const opToApply = task.operations[0];
      let opIdx = null;

      if (explicitOpIdx !== null && explicitOpIdx >= 0 && explicitOpIdx < nextPlan.operations.length) {
        opIdx = explicitOpIdx;
      } else if (idx >= 0 && idx < nextPlan.operations.length) {
        opIdx = idx;
      } else if (opToApply?.function) {
        const found = nextPlan.operations.findIndex((op: GeminiOperation) => op.function === opToApply.function);
        if (found >= 0) opIdx = found;
      }

      if (opIdx !== null) {
        nextPlan.operations[opIdx] = opToApply;
      } else {
      }
    }

    // Handle comments task - merge article IDs and users from context
    if (task.type === 'comments') {

      let opIdx;
      if (explicitOpIdx !== null && explicitOpIdx >= 0 && explicitOpIdx < nextPlan.operations.length) {
        opIdx = explicitOpIdx;
      } else if (commentsUpdateCounter < commentsOpIndices.length) {
        opIdx = commentsOpIndices[commentsUpdateCounter];
        commentsUpdateCounter++;
      } else {
        return;
      }

      // Extract data from task.operations[0].args first, fall back to params
      const opArgs = task.operations?.[0]?.args || {};
      const taskArticleIds = opArgs.articleIds || task.params?.articleIds || [];
      const taskUsers = opArgs.users || task.params?.users || [];
      const taskUserCount = opArgs.userCount ?? task.params?.userCount;
      const taskProspectName = opArgs.prospectName || task.params?.prospectName;
      const taskChannelId = opArgs.channelId || task.params?.channelId;

      const articleIdsArray = Array.isArray(taskArticleIds) ? taskArticleIds : [];
      const usersArray = Array.isArray(taskUsers) ? taskUsers : [];

      // Update the operation — spread original args first so extra fields (e.g. language) are preserved
      nextPlan.operations[opIdx] = {
        ...nextPlan.operations[opIdx],
        args: {
          ...nextPlan.operations[opIdx].args,
          ...opArgs,
          articleIds: articleIdsArray,
          users: usersArray,
          userCount: taskUserCount || nextPlan.operations[opIdx].args?.userCount,
          prospectName: taskProspectName || nextPlan.operations[opIdx].args?.prospectName,
          channelId: taskChannelId || nextPlan.operations[opIdx].args?.channelId,
        },
      };
    }
  });

  nextPlan.needsContext = 'no';
  return nextPlan;
};

/**
 * Runs a freeform prompt through Gemini and returns a structured plan.
 *
 * @param {Object} params
 * @param {string} params.prompt - The user's freeform request
 * @param {string} params.environment - The selected environment label/slug
 * @param {string} params.apiToken - API token for context fetching
 * @param {string} params.branchId - Branch ID
 * @param {string} params.apiDomain - API domain
 * @returns {Object} Plan with userFacingSummary, breakdown, operations, and legacyTasks
 */
export const runPromptAutomation = async ({
  prompt,
  environment,
  apiToken,
  branchId,
  apiDomain = 'app.staffbase.com',
  onPhaseChange,
}: {
  prompt: string;
  environment: string;
  apiToken?: string;
  branchId?: string;
  apiDomain?: string;
  onPhaseChange?: (message: string) => void;
}) => {
// Extract LinkedIn URL hint from prompt if provided
  const linkedInHintMatch = prompt.match(/\(linkedin\s+([a-z0-9-]+)\)/i);
  const linkedInHint = linkedInHintMatch ? linkedInHintMatch[1] : null;

  // Remove the LinkedIn hint from the prompt before sending to Gemini
  const cleanedPrompt = linkedInHint ? prompt.replace(/\(linkedin\s+[a-z0-9-]+\)/i, '').trim() : prompt;

  const systemPrompt = buildSystemPrompt(cleanedPrompt, environment, linkedInHint);

  let geminiSessionToken;

  onPhaseChange?.('🔐 Authenticating with Gemini…');
  let { rawText, sessionToken } = await callGemini(systemPrompt, {
    apiToken,
    apiDomain,
    issueSession: Boolean(apiToken && apiDomain),
  });
  geminiSessionToken = sessionToken;
  onPhaseChange?.('🤖 Analyzing your request…');
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    console.error('Failed to parse Gemini JSON response:', error, 'Raw text:', rawText);
    throw new Error('Could not parse Gemini response.', { cause: error });
  }

  // Smart context enrichment - only fetch what's needed
  const requestedContext = getRequestedContext(parsed);
  const hasContextNeeds = Object.values(requestedContext).some((v) => v);

  if (hasContextNeeds && apiToken) {
    onPhaseChange?.('⟳ Enriching plan with environment context…');

    // Fetch only the context types that were requested
    const contextData: ContextData = {};
    const fetches: Promise<void>[] = [];

    if (requestedContext.users) {
      fetches.push(
        fetchUsers(apiToken, apiDomain).then((users) => {
          contextData.users = users;
        })
      );
    }
    if (requestedContext.profileFields) {
      fetches.push(
        fetchProfileFields(apiToken, apiDomain, branchId).then((fields) => {
          contextData.profileFields = fields;
        })
      );
    }
    if (requestedContext.groups) {
      fetches.push(
        fetchGroups(apiToken, apiDomain, branchId).then((groups) => {
          contextData.groups = groups;
        })
      );
    }
    if (requestedContext.channels) {
      fetches.push(
        fetchNewsChannels(apiToken, apiDomain, branchId).then((channels) => {
          contextData.channels = channels;
        })
      );
    }
    if (requestedContext.articles) {
      // Find channelIds explicitly referenced in comment operations (from first-pass plan)
      const commentOps = (parsed.operations || []).filter(
        (op: GeminiOperation) => (op.function === 'addCommentsToArticles' || op.function === 'addCommentsToArticle') && !Array.isArray(op.args?.articleIds)
      );
      const explicitChannelIds = [...new Set(
        commentOps.map((op: GeminiOperation) => op.args?.channelId as string | undefined).filter(Boolean)
      )] as string[];

      fetches.push(
        (async () => {
          try {
            // Resolve which channels to do targeted fetches for
            let targetChannelIds = explicitChannelIds;

            // If no channel was specified in the plan, resolve to the default "Top News" channel
            if (targetChannelIds.length === 0 && commentOps.length > 0) {
              const allChannels = await fetchNewsChannels(apiToken, apiDomain, branchId);
              const defaultChannel =
                allChannels.find((c) => c.title?.toLowerCase().includes('top news')) ||
                allChannels.find((c) => c.title?.toLowerCase().includes('news')) ||
                allChannels[0];
              if (defaultChannel) {
                targetChannelIds = [defaultChannel.id];
              }
            }

            // Always do the global fetch for broad context
            const globalResult = await fetchAllRecentArticles({ limit: 20 }, { apiToken, apiDomain, branchId });
            let articles = globalResult.articles || [];

            // Do targeted fetches for specific channels so their articles are fully represented
            if (targetChannelIds.length > 0) {
              const targeted = await Promise.all(
                targetChannelIds.map((channelId) =>
                  fetchChannelArticles({ channelId, limit: 20 }, { apiToken, apiDomain, branchId })
                    .then((r) => (r.articles || []).map((a: Record<string, unknown>) => ({ ...a, channelId })))
                    .catch(() => [] as Record<string, unknown>[])
                )
              );
              const targetedFlat = targeted.flat();
              // Merge: prioritise targeted articles, then append global ones not already present
              const seen = new Set(targetedFlat.map((a) => a.id as string));
              articles = [...targetedFlat, ...(articles as Record<string, unknown>[]).filter((a) => !seen.has(a.id as string))];
            }

            contextData.articles = articles as ContextData['articles'];
          } catch (err) {
            console.error('[PromptAutomation] Error fetching articles:', err);
            contextData.articles = [];
          }
        })()
      );
    }

    await Promise.all(fetches);
    // Persist fetched users so later merges can validate/normalize participants
    if (contextData.users) {
      parsed.contextUsers = contextData.users;
    }

    // Build context summaries for each type
    const formatUser = (u: ContextUser) => {
      const primaryEmail =
        u?.emails?.find((e) => e.primary)?.value ||
        u?.emails?.[0]?.value ||
        u?.publicEmailAddress ||
        'none';
      const role = u?.role?.type || u?.branchRole || 'unknown-role';
      return `${u.firstName || ''} ${u.lastName || ''} (id: ${u.id}, email: ${primaryEmail}, role: ${role})`.trim();
    };

    const userSummary = contextData.users
      ? contextData.users
          .slice(0, 50)
          .map(formatUser)
          .join(', ')
      : '';

    const fieldSummary = contextData.profileFields
      ? contextData.profileFields
          .slice(0, 100)
          .map((f: { slug?: string; title?: unknown }) => `${(f.title as Record<string, string>)?.en_US || f.title || f.slug} (slug: ${f.slug})`)
          .join(', ')
      : '';

    const groupSummary = contextData.groups
      ? contextData.groups
          .slice(0, 100)
          .map((g: { id: string; name?: string; title?: string }) => `${g.name || g.title || g.id} (id: ${g.id})`)
          .join(', ')
      : '';

    const channelSummary = contextData.channels
      ? contextData.channels
          .slice(0, 50)
          .map((c: { id: string; title?: string }) => `${c.title} (id: ${c.id})`)
          .join(', ')
      : '';

    const articleSummary = contextData.articles
      ? contextData.articles
          .slice(0, 50)
          .map((a: { id: string; contents?: Record<string, unknown>; title?: string; channelId?: string; channelTitle?: string }) => {
            const title = (a.contents?.en_US as Record<string, string>)?.title || a.title || 'Untitled';
            const channelName = a.channelTitle || a.channelId || 'unknown channel';
            return `"${title}" (id: ${a.id}, channel: ${channelName})`;
          })
          .join('; ')
      : '';

    // Build context sections for Gemini
    const contextSections = [];
    if (contextData.users) {
      contextSections.push(`- Users available (including admins): ${userSummary || 'none found'}`);
      contextSections.push('  NOTE: Use IDs/emails exactly as provided. If a requested user is not present here, respond "<user> not found" and do not invent IDs/emails.');
    }
    if (contextData.profileFields) {
      contextSections.push(`- Profile fields available (use these slugs EXACTLY): ${fieldSummary || 'none found'}`);
    }
    if (contextData.groups) {
      contextSections.push(`- Groups available: ${groupSummary || 'none found'}`);
    }
    if (contextData.channels) {
      contextSections.push(`- Existing news channels: ${channelSummary || 'none found'}`);
      if (contextData.channels.length > 0) {
        contextSections.push('  NOTE: If a suitable channel already exists, update your summary to say "import to existing channel" instead of "create a new channel".');
      }
    }
    if (contextData.articles) {
      contextSections.push(`- Existing articles: ${articleSummary || 'none found'}`);
      if (contextData.articles.length > 0) {
        contextSections.push('  NOTE: Use these article IDs for addCommentsToArticles. Include the exact IDs in the articleIds array. Each article entry shows its channel — use the channelId from the matching channel above to fill in the channelId field.');
      }
    }

    const tasks = parsed.legacyTasks || parsed.tasks || [];
    const tasksNeedingContext = tasks
      .map((t: GeminiTask, idx: number) => ({ ...t, __index: idx }))
      .filter(
        (t: GeminiTask & { __index: number }) =>
          // Group chats: always include if groupName present so we can resolve/validate, even if a groupId was provided
          (t.type === 'chats' && t.params?.chatMode === 'group' && (t.params?.groupName || !t.params?.groupId)) ||
          t.type === 'userFields' ||
          t.type === 'linkedinArticles' ||
          t.type === 'comments'
      );

    // Build operation index map for userFields and comments tasks
    const operationIndexMap: Record<string, number> = {};
    let userFieldsOpCount = 0;
    let commentsOpCount = 0;
    (parsed.operations || []).forEach((op: GeminiOperation, idx: number) => {
      if (op.function === 'updateUserFields') {
        operationIndexMap[`userFields_${userFieldsOpCount}`] = idx;
        userFieldsOpCount++;
      }
      if (op.function === 'addCommentsToArticles' || op.function === 'addCommentsToArticle') {
        operationIndexMap[`comments_${commentsOpCount}`] = idx;
        commentsOpCount++;
      }
    });

    const contextPrompt = `
You previously returned this plan (keep for reference, do NOT regenerate unrelated tasks):
${JSON.stringify(parsed)}

Additional context from Staffbase APIs:
${contextSections.join('\n')}

CRITICAL: Operation index mapping (use these exact indices):
${JSON.stringify(operationIndexMap)}

Update ONLY the tasks listed below. Return JSON ONLY:
{
  "tasks": [
    {
      "index": <original task index>,
      "operationIndex": <index in operations array - REQUIRED for userFields tasks>,
      "task": { <updated task object with operations array containing enriched args> }
    }
  ],
  "updatedSummary": "<optional: if channel already exists, update the userFacingSummary to reflect using existing channel>"
}

Tasks needing updates:
${JSON.stringify(tasksNeedingContext)}

STRICT RULES - FOLLOW EXACTLY:

1. **NEVER HALLUCINATE IDs OR EMAILS**
   - ONLY use user IDs and emails that appear EXACTLY in the context above
   - If a user like "Ishaan" is mentioned, find them by name in the user list
   - If you cannot find a user, set status="unsupported" and explain "<user> not found"
   - NEVER invent IDs like "67890" or emails like "ishaan@example.com"

2. **USER SELECTION PRIORITY**
   - For specific named users: Find their EXACT id/email from context
   - For "some users" or "a few users": Prefer NON-ADMIN users (role != "admin", role != "WeBranchAdminRole")
   - Include the full user object: { id, email, name, role }

3. **OPERATION INDEX IS REQUIRED**
   - Each userFields task MUST include "operationIndex" matching the operation it updates
   - First userFields task -> operationIndex from operationIndexMap.userFields_0
   - Second userFields task -> operationIndex from operationIndexMap.userFields_1
   - This ensures the correct operation gets the enriched data

4. **INCLUDE OPERATIONS IN TASK**
   - Each task should include an "operations" array with the enriched args
   - The operations[0].args should have: fieldUpdates, users (array of {id, email, name, role})
   - IMPORTANT: fieldUpdates must use the EXACT slug from profile fields (e.g., "position" not "title" or "jobTitle")
   - Example:
     {
       "index": 1,
       "operationIndex": 1,
       "task": {
         "title": "Update Ishaan to CEO",
         "type": "userFields",
         "status": "ready",
         "operations": [{
           "function": "updateUserFields",
           "args": {
             "fieldUpdates": [{"field": "position", "slug": "position", "values": ["CEO"]}],
             "users": [{"id": "actual-id-from-context", "email": "actual@email.com", "name": "Ishaan S", "role": "admin"}]
           }
         }]
       }
     }

5. **FIELD VALIDATION - CRITICAL**
   - The "field" property in fieldUpdates MUST be the exact slug from the profile fields list
   - Example: If user says "title" or "job title", use "position" (the actual slug)
   - Example: If user says "hobbies", use "hobby" (the actual slug)
   - ALWAYS map user's language to the correct profile field slug
   - If no matching field exists, mark task as unsupported
   - In fieldUpdates, set BOTH "field" AND "slug" to the correct slug value

6. **ADMIN USERS**
   - When user asks for "some users" without specifying, prefer non-admin users
   - Only include admin users if specifically requested by name

7. **GROUP CHATS: NO MADE-UP NAMES**
   - If chatMode=”group” and a groupName is provided, resolve groupId from the provided groups and include it in BOTH task.params and operations[0].args. If not found, set status=”unsupported” (do NOT invent IDs or names).
   - If the user did NOT provide a groupName, leave groupName empty and DO NOT invent one. Instead, include participantIds/users (IDs/emails) for the people mentioned (e.g., “Maria”, “Patrick”) so the runner can create the group with those participants.

8. **COMMENTS / ARTICLE IDs**
   - For addCommentsToArticles tasks, resolve the channelId from the channels list above using the channel name the user mentioned. If no channel was mentioned, use the “Top News” channel (or the first news channel listed).
   - Then find articles in that channel from the articles list above and include ALL of their IDs in articleIds.
   - If articles exist in that channel, you MUST include them — do NOT say “articles not found” if any article in the list has a matching channelId.
   - Set channelId in args to the resolved channel's ID.
   - If no articles are found for the specified channel, set status=”unsupported” and explain which channel had no articles.
`;

    ({ rawText } = await callGemini(
      contextPrompt,
      geminiSessionToken
        ? { sessionToken: geminiSessionToken }
        : { apiToken, apiDomain, issueSession: Boolean(apiToken && apiDomain) }
    ));
    onPhaseChange?.('✅ Plan ready!');
    // Strip markdown code fences if present
    rawText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    let updates = null;
    try {
      updates = JSON.parse(rawText);
    } catch (firstError) {
      // Gemini sometimes forgets to close the last object in an operations array.
      // Try repairing by inserting missing `}` before `]` where needed.
      try {
        updates = JSON.parse(repairJsonBraces(rawText));
        console.warn('[PromptAutomation] Repaired malformed JSON from context pass');
      } catch {
        // Repair failed — proceed with the original plan (no context enrichment).
        // The overlay will still show the plan; execution may ask for IDs at runtime.
        console.error('Failed to parse Gemini JSON on contextual pass (even after repair):', (firstError as Error).message);
      }
    }

    if (updates) {
      parsed = mergeContextUpdates(parsed, updates);
      if (updates.updatedSummary) {
        parsed.userFacingSummary = updates.updatedSummary;
      }
    }
  } else if (hasContextNeeds && !apiToken) {
    console.warn('[PromptAutomation] Context needed but no API token; cannot enrich plan');
  }

  // Ensure we have both legacy tasks format for backward compatibility
  if (!parsed.legacyTasks && parsed.tasks) {
    parsed.legacyTasks = parsed.tasks;
  }
  if (!parsed.tasks && parsed.legacyTasks) {
    parsed.tasks = parsed.legacyTasks;
  }

  return enrichPlanWithFallbackColors(parsed);
};
