import { getGeminiProxyUrl } from "./geminiProxy";
import { DEMO_VERTICALS } from "../constants/appConstants";

const GEMINI_PROXY_URL = getGeminiProxyUrl();

interface AuthContext {
  apiToken?: string;
  apiDomain?: string;
}

interface GeminiErrorResponse {
  error?: {
    message?: string;
  };
}

interface GeminiGroundingChunk {
  web?: { uri?: string; title?: string };
}

interface GeminiRawResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: {
      groundingChunks?: GeminiGroundingChunk[];
      searchEntryPoint?: { renderedContent?: string };
    };
  }>;
  error?: { message?: string };
}

interface StaffbasePost {
  contents?: { en_US?: { title?: string; content?: string } };
  title?: string;
  content?: string;
}

interface FormField {
  type?: string;
  label?: string;
  optionLabels?: unknown;
}

interface FormSchema {
  formTranslations?: {
    en_US?: {
      options?: { fields?: Record<string, FormField> };
      schema?: { properties?: Record<string, unknown> };
    };
  };
}

export interface SourceItem {
  url: string;
  title: string;
}

interface ProspectIntelligenceResult {
  news: string;
  websiteUrl?: string;
  logoUrl: string;
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
  sources: SourceItem[];
  [key: string]: unknown;
}

/**
 * Structured brief consumed by content-rewrite flows (TailorEmails,
 * EditPages, future): gives Gemini grounded, prospect-specific signals
 * to draw on instead of a raw news blob.
 *
 * The fields are deliberately concrete:
 *   - audience: WHO inside the company is the comms aimed at (employees,
 *     advisors, store associates, plant workers, etc.)
 *   - voice: how that company's internal comms typically reads
 *   - themes / products / initiatives / leadership: real things the
 *     rewriter can name-drop instead of staying generic
 *
 * Populated by `buildProspectBrief` below; consumed by the email +
 * page rewrite ops.
 */
export interface ProspectBrief {
  industry: string;
  audience: string;
  voice: string;
  themes: string[];
  products: string[];
  recentInitiatives: string[];
  leadership: string[];
  /** A 1-2 sentence summary the rewrite prompt can paste at the top. */
  oneLiner: string;
}

const parseGeminiJsonPayload = <T>(raw: string, fallback: T): T => {
  const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
};

const extractCandidateText = (data: GeminiRawResponse, fallback: string): string =>
  data?.candidates?.[0]?.content?.parts?.[0]?.text || fallback;

/**
 * Fetches a news overview for a given prospect name using the Gemini API.
 */
export const fetchProspectIntelligence = async (
  prospectName: string,
  auth: AuthContext = {}
): Promise<ProspectIntelligenceResult> => {
  const { apiToken, apiDomain } = auth;

  // Automatically calculate the date for the last 6 months.
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const fromDate = sixMonthsAgo.toISOString().split("T")[0];

  const prompt = `For the company "${prospectName}", find the following information for a sales intelligence app. The output must be a single, valid JSON object.

Strictly follow these rules:
1.  **JSON Output**: The entire response must be a single, valid JSON object. Do not include any text or markdown formatting like \`\`\`json.
2.  **No Citations**: Do not include inline source citations like [5] or [6] in the text.
3.  **websiteUrl**: Find the official website URL for the company (e.g., "google.com"). Return only the domain name.
4.  **news**: Provide a bulleted list of the most important developments from the last 6 months (since ${fromDate}). If no major developments are found, the value should be an empty string.
    * **Priority**: Focus heavily on leadership changes (e.g., CEO, CFO, board members), executive hires, funding rounds, acquisitions, major product launches, and strategic partnerships.
    * **Format**: Each item must start with "* " (an asterisk and a space).
5.  **primaryColor**: Suggest a primary branding color from their website or logo as a valid hex code.
6.  **textColor**: Suggest a text color (hex code) that contrasts well with the primaryColor.
7.  **backgroundColor**: Suggest a neutral, light background color (hex code), like off-white.

Example of a good JSON output:
{
  "news": "* **Leadership Change:** John Doe appointed as new Chief Financial Officer.\\n* **Funding:** Secured a $50M Series C funding round.",
  "websiteUrl": "acme.com",
  "primaryColor": "#1A2B3C",
  "textColor": "#FFFFFF",
  "backgroundColor": "#F5F5F5"
}`;

  const response = await fetch(GEMINI_PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      apiToken,
      apiDomain,
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
      },
      tools: [
        {
          google_search: {},
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json()) as GeminiErrorResponse;
    throw new Error(
      `Gemini API failed: ${errorData.error?.message || response.statusText}`
    );
  }

  const data = await response.json() as GeminiRawResponse;
  const sources: SourceItem[] = [];
  const seenSourceUrls = new Set<string>();
  const addSource = (url?: string, title?: string): void => {
    if (!url || seenSourceUrls.has(url)) return;
    sources.push({ url, title: title || url });
    seenSourceUrls.add(url);
  };

  const grounding = data?.candidates?.[0]?.groundingMetadata;
  const groundingChunks = grounding?.groundingChunks || [];
  groundingChunks.forEach((chunk: GeminiGroundingChunk) => {
    const web = chunk?.web;
    addSource(web?.uri, web?.title);
  });

  const renderedContent = grounding?.searchEntryPoint?.renderedContent;
  if (renderedContent) {
    const anchorRegex = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match = anchorRegex.exec(renderedContent);
    while (match) {
      const url = match[1];
      const rawTitle = match[2] || "";
      const title = rawTitle
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      addSource(url, title);
      match = anchorRegex.exec(renderedContent);
    }
  }

  const rawText = extractCandidateText(data, "{}");
  const parsedData = parseGeminiJsonPayload<Record<string, unknown>>(rawText, {});

  if (parsedData.websiteUrl && typeof parsedData.websiteUrl === "string") {
    const domain = parsedData.websiteUrl
      .replace(/^(?:https?:\/\/)?(?:www\.)?/i, "")
      .replace(/\/$/, "");

    parsedData.logoUrl = `https://img.logo.dev/${domain}?token=pk_f7bKMnRJR4a9cUWuNq1KUg&format=png&retina=true`;
  } else {
    parsedData.logoUrl = "";
  }

  if (parsedData.news && typeof parsedData.news === "string") {
    parsedData.news = parsedData.news.replace(/^\* /gm, "• ");
  }

  parsedData.sources = sources;

  return {
    news:
      typeof parsedData.news === "string"
        ? parsedData.news
        : "Error: Could not parse AI response.",
    logoUrl: typeof parsedData.logoUrl === "string" ? parsedData.logoUrl : "",
    primaryColor:
      typeof parsedData.primaryColor === "string" ? parsedData.primaryColor : "",
    textColor: typeof parsedData.textColor === "string" ? parsedData.textColor : "",
    backgroundColor:
      typeof parsedData.backgroundColor === "string"
        ? parsedData.backgroundColor
        : "",
    websiteUrl:
      typeof parsedData.websiteUrl === "string" ? parsedData.websiteUrl : undefined,
    sources,
    ...parsedData,
  };
};

/**
 * Plans a full demo configuration from just a prospect name.
 * Uses gemini-2.5-flash (no search tool) to infer vertical, size, branding, and blog URL.
 * @param {string} prospectName
 * @param {Object} auth - { apiToken, apiDomain }
 */
const FORD_HARDCODE = {
  vertical: "Manufacturing",
  companySize: 177000,
  primaryColor: "#00095B",
  textColor: "#FFFFFF",
  backgroundColor: "#FAFAFA",
  websiteUrl: "ford.com",
  blogUrl: "https://www.fromtheroad.ford.com/us/en/home",
  aiTopics: "manufacturing excellence, employee safety, innovation, workforce development, electric vehicles",
  logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Ford_logo_flat.svg/1920px-Ford_logo_flat.svg.png?_=20230831145925",
};
const FORD_ALIASES = ["ford", "ford motor company", "ford motor"];

/**
 * Take a prospect name + (optional) news + (optional) website and ask
 * Gemini to distill it into a STRUCTURED brief that downstream content
 * rewrites can ground themselves in.
 *
 * Why this exists: TailorEmails (and EditPages) were getting timid
 * rewrites when given only a raw news blob. The LLM didn't have crisp
 * signals about who the comms target is, what real products/initiatives
 * exist, etc — so it defaulted to safe edits. The brief gives it a
 * concrete `{products, initiatives, leadership, audience, voice}` to
 * draw on, so "the new Q3 update" can become "the MyChoice 2026
 * renewals briefing for Sun Life advisors" instead of staying generic.
 *
 * Cheap to call (one Gemini turn, ~600 tokens). Callers should cache
 * the result for the duration of a session and re-invoke when prospect
 * changes.
 */
export const buildProspectBrief = async (
  args: { prospectName: string; prospectNews?: string; websiteUrl?: string },
  auth: AuthContext = {},
): Promise<ProspectBrief> => {
  const { apiToken, apiDomain } = auth;

  const prompt = `You are summarising a real-world company so an AI rewriter can produce internal-comms content that sounds genuinely like it was written FROM that company TO its employees.

Company: ${args.prospectName}
${args.websiteUrl ? `Website: ${args.websiteUrl}` : ""}
${args.prospectNews ? `Recent news & context:\n${args.prospectNews.slice(0, 2000)}` : ""}

Return a JSON object with these fields. Be SPECIFIC — name real products, real leaders, real initiatives. If you don't know a field with confidence, give the most reasonable inference from the company's industry and footprint; do not return empty arrays.

{
  "industry": "1-3 word industry/sector tag (e.g. 'Insurance & Wealth Management', 'Automotive Manufacturing', 'Acute-care Hospital System')",
  "audience": "WHO inside the company would receive this internal communication — be concrete about roles (e.g. 'Sun Life advisors, claims processors, and head-office staff', 'Ford plant workers, line supervisors, and engineers')",
  "voice": "1 sentence describing the company's internal-comms tone (e.g. 'Professional and employee-first, with emphasis on wellbeing and career growth' or 'Operational and direct, focused on safety and shift performance')",
  "themes": ["3-5 themes that show up in their internal comms — e.g. wellbeing benefits, DEI, retirement readiness, product roadmap, safety, quality"],
  "products": ["3-6 actual products, programs, or platforms the company sells or runs — real names if you know them"],
  "recentInitiatives": ["3-5 specific recent initiatives, acquisitions, leadership changes, or strategic moves you can name — drawn from the news context if provided"],
  "leadership": ["3-5 actual senior leaders by Name (Role), drawn from the news context if provided or from publicly-known org chart"],
  "oneLiner": "One 1-2 sentence summary of who this company is + who its employees are, written as a hand-off to the rewriter."
}

Respond with ONLY the JSON object. No prose, no markdown fences.`;

  const response = await fetch(GEMINI_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiToken,
      apiDomain,
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
    }),
  });
  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as GeminiErrorResponse;
    throw new Error(err.error?.message || `Gemini proxy error: ${response.status}`);
  }
  const data = (await response.json()) as GeminiRawResponse;
  const text = extractCandidateText(data, "");
  const parsed = parseGeminiJsonPayload<Partial<ProspectBrief>>(text, {});

  // Defensive defaults — every field gets a value even if Gemini omits one.
  return {
    industry: parsed.industry || "",
    audience: parsed.audience || "company employees",
    voice: parsed.voice || "Professional and employee-first.",
    themes: Array.isArray(parsed.themes) ? parsed.themes : [],
    products: Array.isArray(parsed.products) ? parsed.products : [],
    recentInitiatives: Array.isArray(parsed.recentInitiatives) ? parsed.recentInitiatives : [],
    leadership: Array.isArray(parsed.leadership) ? parsed.leadership : [],
    oneLiner: parsed.oneLiner || `${args.prospectName} — internal communications.`,
  };
};

export const fetchDemoPlan = async (
  prospectName: string,
  auth: { apiToken?: string; apiDomain?: string } = {}
) => {
  if (FORD_ALIASES.includes(prospectName.toLowerCase().trim())) {
    return FORD_HARDCODE;
  }

  const { apiToken, apiDomain } = auth;

  const verticalOptions = DEMO_VERTICALS.map(v => `"${v}"`).join(", ");

  const prompt = `You are a sales intelligence assistant helping plan a product demo for the company "${prospectName}".

Return a single valid JSON object with the fields below. No markdown, no \`\`\`json wrapping.

1. vertical: The industry this company belongs to. Must be exactly one of: ${verticalOptions}. Choose the closest match.
2. companySize: Estimated number of employees as an integer. Use your best knowledge; if unknown, estimate based on company scale (startup < 500, mid-market 500–10000, enterprise > 10000).
3. primaryColor: Primary brand hex color (e.g. "#0057B7").
4. textColor: A high-contrast nav/text color that works against primaryColor, as a hex.
5. backgroundColor: A neutral, light background hex color.
6. websiteUrl: The company's primary domain only, no protocol or www (e.g. "acme.com").
7. blogUrl: The full URL to the company's blog or news/press page. Look for patterns like blog.domain.com, domain.com/blog, domain.com/news, domain.com/newsroom, domain.com/press. If genuinely unknown, return an empty string — do NOT guess domain.com/blog.
8. aiTopics: 3-5 comma-separated topic keywords relevant to this company's industry for generating internal comms articles (e.g. "employee engagement, safety, digital transformation").

Example:
{
  "vertical": "Healthcare",
  "companySize": 12000,
  "primaryColor": "#003087",
  "textColor": "#FFFFFF",
  "backgroundColor": "#F5F8FF",
  "websiteUrl": "johnshopkins.edu",
  "blogUrl": "https://www.hopkinsmedicine.org/news",
  "aiTopics": "patient care innovation, digital health, workforce wellbeing, clinical research"
}`;

  const response = await fetch(GEMINI_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiToken,
      apiDomain,
      model: 'gemini-2.5-flash',
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Gemini API failed: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const rawText = extractCandidateText(data, "{}");

  const fallback = {
    vertical: "",
    companySize: 5000,
    primaryColor: "",
    textColor: "",
    backgroundColor: "",
    websiteUrl: "",
    blogUrl: "",
    aiTopics: "",
    logoUrl: "",
  };

  const parsed = parseGeminiJsonPayload(rawText, fallback);

  if (parsed.websiteUrl && parsed.websiteUrl !== fallback.websiteUrl) {
    const domain = parsed.websiteUrl.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "").replace(/\/$/, "");
    parsed.logoUrl = `https://img.logo.dev/${domain}?token=pk_f7bKMnRJR4a9cUWuNq1KUg&format=png&retina=true`;
  } else {
    parsed.logoUrl = "";
  }

  return parsed;
};

/**
 * Generates AI chat initiator/reply pairs using the Gemini proxy.
 */
export const generateChatPairs = async ({
  prospectName,
  count,
  language,
  apiToken,
  apiDomain,
}: {
  prospectName?: string;
  count: number;
  language?: string;
  apiToken?: string;
  apiDomain?: string;
}): Promise<Array<{ initiator: string; reply: string }>> => {
  const companyContext = prospectName
    ? `of "${prospectName}"`
    : "of a company";
  const languageInstruction = language
    ? `\n\nIMPORTANT: Write ALL messages in ${language}. Do not use English unless ${language} is English.`
    : "";

  const prompt = `You are generating chat messages for a test environment. Your task is to act as employees ${companyContext} having brief, realistic conversations on an internal chat tool.

Generate ${count} unique objects, each containing an "initiator" message and a "reply" message. The entire response must be a single, valid JSON array.

**Rules:**
1.  **JSON Only**: The entire response must be a single JSON array of objects. Do not include markdown like \`\`\`json.
2.  **Internal Tone**: Messages should sound like they are between colleagues. They can be about work, projects, or casual office topics.
3.  **Placeholders**: The initiator message should include a "{name}" placeholder where the recipient's first name will be inserted.

**Example of a valid JSON output:**
[
  { "initiator": "Hey {name}, do you have the latest numbers for the Q3 forecast?", "reply": "Yep, just finalizing them now. I'll send them over in about 15 minutes." },
  { "initiator": "Quick question {name}, are you going to the all-hands meeting this afternoon?", "reply": "I have a conflict, unfortunately. Could you send me the key takeaways afterward?" }
]${languageInstruction}`;

  const response = await fetch(GEMINI_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiToken,
      apiDomain,
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9 },
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json()) as GeminiErrorResponse;
    throw new Error(
      `Gemini API failed: ${errorData.error?.message || response.statusText}`
    );
  }

  const data = await response.json();
  const rawText = extractCandidateText(data, "[]");
  return parseGeminiJsonPayload(rawText, [] as Array<{ initiator: string; reply: string }>);
};

/**
 * Generates bulk AI survey answers for multiple users using the Gemini proxy.
 */
export const generateBulkSurveyAnswers = async ({
  questions,
  userCount,
  surveyTitle,
  prospectName,
  language,
  apiToken,
  apiDomain,
}: {
  questions: unknown;
  userCount: number;
  surveyTitle: string;
  prospectName?: string;
  language?: string;
  apiToken?: string;
  apiDomain?: string;
}): Promise<Record<string, unknown>[]> => {
  const companyContext = prospectName ? ` of ${prospectName}` : "";
  const languageInstruction = language ? `\n\nIMPORTANT: Write ALL text answers in ${language}. Do not use English unless ${language} is English.` : '';
  const prompt = `You are generating survey data for a test environment. Your task is to act as ${userCount} different employees${companyContext} filling out an internal company survey titled "${surveyTitle}".${languageInstruction}

Create ${userCount} unique and realistic sets of answers for the following questions. The entire response must be a single, valid JSON array, where each object in the array represents one employee's complete response.

Follow these rules for each question type:
1.  **JSON Output Only**: The entire response must be a single JSON array. Do not include markdown like \`\`\`json.
2.  **STAR/SCALE/NPS**: Provide a single integer within the allowed range.
3.  **MULTIPLE_CHOICE**:
    *   If only one option is allowed (\`maxNumOptions: 1\`), return an array with a single option ID string (e.g., \`["option-id-1"]\`).
    *   If multiple options are allowed (\`maxNumOptions > 1\` or \`maxNumOptions: 0\`), return an array of one or more option ID strings (e.g., \`["option-id-1", "option-id-3"]\`).
4.  **TEXT**: Provide a brief, realistic, and constructive comment (1-2 sentences). The tone can be positive, neutral, or slightly critical, but always professional.

Here are the questions:
${JSON.stringify(questions, null, 2)}

Example of a valid JSON array output for 2 users:
[
  {
    "620370c3-4fa9-4344-b097-8d7e94b4137f": 4,
    "6fa3aa3a-071c-414d-9237-c465b426368f": "The presentation was insightful, but the Q&A session could have been longer."
  },
  {
    "620370c3-4fa9-4344-b097-8d7e94b4137f": 5,
    "6fa3aa3a-071c-414d-9237-c465b426368f": "Excellent session, very clear and helpful. No notes!"
  }
]`;

  const response = await fetch(GEMINI_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiToken,
      apiDomain,
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 },
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json()) as GeminiErrorResponse;
    throw new Error(
      `Gemini API failed: ${errorData.error?.message || response.statusText}`
    );
  }

  const data = await response.json();
  const rawText = extractCandidateText(data, "[]");
  return parseGeminiJsonPayload(rawText, [] as Record<string, unknown>[]);
};

/**
 * Generates AI comment banks for a post using the Gemini proxy.
 */
export const generatePostComments = async ({
  post,
  userCount = 5,
  prospectName = "",
  language,
  apiToken,
  apiDomain,
}: {
  post: StaffbasePost;
  userCount?: number;
  prospectName?: string;
  language?: string;
  apiToken?: string;
  apiDomain?: string;
}): Promise<{ standalone_comments: string[]; comment_reply_pairs: Array<{ parent: string; reply: string }> }> => {
  const postTitle = post?.contents?.en_US?.title || post?.title || "Post";
  const rawContent = post?.contents?.en_US?.content || post?.content || "";
  const postContent = String(rawContent).replace(/<[^>]*>/g, "").substring(0, 1000);
  const companyContext = prospectName ? ` as employees of ${prospectName}` : "";
  const languageInstruction = language
    ? `\n\nIMPORTANT: Write ALL comments in ${language}. Do not use English unless ${language} is English.`
    : "";

  const prompt = `You are generating comments for a demo environment. Your task is to act as ${userCount} different employees from various departments${companyContext} commenting on an internal company intranet post.

Post Title: "${postTitle}"
Post Content Snippet: "${postContent}..."

Create a set of unique and realistic comments. The entire response must be a single, valid JSON object with two keys: "standalone_comments" and "comment_reply_pairs".

**Tone and Style Rules:**
1.  **Internal Perspective:** Comments must sound like they are from an employee. Use pronouns like "we", "us", and "our company". Refer to the company's goals and initiatives.
2.  **Departmental Voice:** Comments should reflect different roles. A sales person might ask about customer impact, while an engineer might ask about the tech stack.
3.  **Action-Oriented:** Include questions about strategy, logistics, or team impact.
4.  **No Signatures:** Never end a comment with a name, job title, or any form of attribution (e.g. "- *Name, Title*"). Comments must read as anonymous posts with no sign-off.

**JSON Output Rules:**
1.  **JSON Only**: The entire response must be a single, valid JSON object. Do not include markdown like \`\`\`json.
2.  **standalone_comments**: Provide an array of exactly ${userCount} unique, standalone comments. These are top-level comments that start a new thought.
3.  **comment_reply_pairs**: Provide an array of exactly ${userCount} unique objects, each containing a "parent" comment (often a question) and a "reply" comment.

**Example of a valid JSON output:**
{
  "standalone_comments": [
    "Fantastic to see us moving forward with this initiative! This will be a huge help for the sales team.",
    "Great work by everyone involved. This aligns perfectly with our quarterly goals.",
    "Appreciate the detailed breakdown here.",
    "This is a major step forward!"
  ],
  "comment_reply_pairs": [
    { "parent": "This looks promising. Are we sunsetting the old platform entirely?", "reply": "I'd also like to know this. We need to plan our team's migration strategy." },
    { "parent": "Who is the main DRI for this project if our team has follow-up questions?", "reply": "I believe it's Sarah from Product, but it would be great to get confirmation." }
  ]
}${languageInstruction}`;

  const response = await fetch(GEMINI_PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      apiToken,
      apiDomain,
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
      },
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json()) as GeminiErrorResponse;
    throw new Error(
      `Gemini API failed: ${errorData.error?.message || response.statusText}`
    );
  }

  const data = await response.json();
  const rawText = extractCandidateText(data, "{}");
  return parseGeminiJsonPayload(rawText, {
    standalone_comments: [],
    comment_reply_pairs: [],
  } as { standalone_comments: string[]; comment_reply_pairs: Array<{ parent: string; reply: string }> });
};

/**
 * Generates AI form answers for multiple users from a form schema.
 */
export const generateFormAnswers = async ({
  schema,
  userCount,
  formTitle,
  prospectName,
  language,
  apiToken,
  apiDomain,
}: {
  schema: FormSchema;
  userCount: number;
  formTitle: string;
  prospectName?: string;
  language?: string;
  apiToken?: string;
  apiDomain?: string;
}): Promise<Record<string, unknown>[]> => {
  const fields = schema?.formTranslations?.en_US?.options?.fields || {};
  const schemaProps = schema?.formTranslations?.en_US?.schema?.properties || {};
  const skipTypes = ["separator", "imageSeparator", "profileField"];

  // Build simplified field descriptions for the prompt.
  const fieldDescriptions: Array<Record<string, unknown>> = [];
  for (const [key, field] of Object.entries(fields)) {
    if (skipTypes.includes(field.type ?? '')) continue;

    const prop = schemaProps[key];
    if (Array.isArray(prop) && prop.length === 0) continue;

    const desc: Record<string, unknown> = {
      key,
      label: field.label || key,
      type: field.type,
    };

    const propObj = prop as { enum?: unknown[] } | undefined;
    if (propObj?.enum) desc.options = propObj.enum;
    if (field.optionLabels) desc.optionLabels = field.optionLabels;
    fieldDescriptions.push(desc);
  }

  const companyContext = prospectName ? ` of ${prospectName}` : "";
  const languageInstruction = language ? `\n\nIMPORTANT: Write ALL text answers in ${language}. Do not use English unless ${language} is English.` : '';
  const prompt = `You are generating form responses for a demo environment. Your task is to act as ${userCount} different employees${companyContext} filling out an internal company form titled "${formTitle}".${languageInstruction}

Create ${userCount} unique and realistic answer sets. The entire response must be a single, valid JSON array where each object represents one employee's response.

Rules:
1. **JSON Only**: No markdown or \`\`\`json wrapping.
2. **text / textarea**: A realistic 1-2 sentence response appropriate to the field label.
3. **select / radio**: Exactly one string value from the "options" array.
4. **checkbox**: An array of 1-2 string values from the "options" array.
5. **date**: A realistic date string in "YYYY-MM-DD" format. Today is ${new Date().toISOString().split('T')[0]}. Use context clues from the field label to decide: if the field seems to ask for a future date (e.g. "start date", "requested date", "leave date", "end date", "due date") use a date within the next 6 months; if it asks for a past date (e.g. "birth date", "hire date", "start of employment") use an appropriate past date.
6. **labeledSelect**: A 0-based numeric index as a string (e.g. "0", "1").
7. Only include keys listed below - do not add extra keys.

Fields:
${JSON.stringify(fieldDescriptions, null, 2)}

Example for 2 users (adapt structure to actual fields above):
[
  { "_0": "I found this very helpful overall.", "_2": "First Choice", "_3": ["Second Choice"], "_4": "First Choice" },
  { "_0": "A great initiative, well communicated.", "_2": "Second Choice", "_3": ["First Choice", "Third Choice"], "_4": "Second Choice" }
]`;

  const response = await fetch(GEMINI_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiToken,
      apiDomain,
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 },
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json()) as GeminiErrorResponse;
    throw new Error(
      `Gemini API failed: ${errorData.error?.message || response.statusText}`
    );
  }

  const data = await response.json();
  const rawText = extractCandidateText(data, "[]");
  return parseGeminiJsonPayload(rawText, [] as Record<string, unknown>[]);
};
