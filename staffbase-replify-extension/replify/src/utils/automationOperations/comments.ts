/**
 * Comment operations - atomic functions for adding comments to articles
 * Comments require logging in as different users via page context injection
 */

import { callGemini, buildApiUrl, fetchUsers } from './environment';
import { fetchChannelArticles } from './articles';
import { runInPageContext } from './tabInjection';
import { getSharedDemoPassword } from './environment';
import type { OperationContext } from './types';

type UserRecord = {
  id?: string;
  branchRole?: string;
  email?: string;
  publicEmailAddress?: string;
  emails?: { value?: string; primary?: boolean }[];
  firstName?: string;
  username?: string;
};

type ArticleRecord = {
  id?: string;
  title?: string;
  contents?: { en_US?: { title?: string; content?: string } };
  content?: string;
};

type PageContextResult = {
  ok: boolean;
  error?: string;
  csrfToken?: string;
  commentId?: string;
};

const fetchArticleDetails = async (articleId: string, ctx: OperationContext) => {
  const { apiToken, apiDomain, onProgress } = ctx;
  try {
    const res = await fetch(buildApiUrl(`/api/articles/${articleId}`, apiDomain), {
      headers: { Authorization: `Basic ${apiToken}` },
    });
    if (!res.ok) {
      onProgress?.(`⚠️ Could not fetch full article ${articleId} (${res.status})`);
      return null;
    }
    const data = await res.json();
    return data;
  } catch (err) {
    onProgress?.(`⚠️ Failed to load article ${articleId}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
};

const fetchAdminUser = async (ctx: OperationContext, preferredAdminId: string | undefined) => {
  const { apiToken, apiDomain, onProgress } = ctx;
  try {
    const { users } = await fetchUsers({ limit: 200 }, { ...ctx, apiToken, apiDomain });
    const pickAdmin = (list: UserRecord[] | unknown) => {
      if (!list || !Array.isArray(list)) return null;
      if (preferredAdminId) {
        const match = list.find((u) => u.id === preferredAdminId);
        if (match) return match;
      }
      return list.find((u) => u.branchRole === 'WeBranchAdminRole') || list[0];
    };
    const adminUser = pickAdmin(users as UserRecord[]);
    if (adminUser) {
      onProgress?.(`Using admin ${(adminUser as UserRecord).firstName || (adminUser as UserRecord).username || (adminUser as UserRecord).id} to restore session`);
    } else {
      onProgress?.('⚠️ Could not find an admin user to restore session');
    }
    return adminUser || null;
  } catch (err) {
    onProgress?.(`⚠️ Failed to fetch admin user: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
};

/**
 * Generate comments for an article using Gemini AI
 * @param {Object} args - { article, userCount, prospectName }
 * @param {Object} ctx - context
 */
export const generateArticleComments = async (
  args: {
    article: ArticleRecord;
    userCount?: number;
    prospectName?: string;
    includeReplies?: boolean;
    language?: string;
  },
  ctx: OperationContext
) => {
  const { article, userCount = 5, prospectName, includeReplies = true, language } = args;
  const { onProgress } = ctx;

  const articleTitle = article.contents?.en_US?.title || article.title || 'Article';
  const articleContent = (article.contents?.en_US?.content || article.content || '')
    .replace(/<[^>]*>/g, '')
    .substring(0, 1000);

  onProgress?.(`Generating comments for "${articleTitle}"${language ? ` in ${language}` : ''}...`);

  const companyContext = prospectName ? ` as employees of ${prospectName}` : '';
  const languageInstruction = language ? `\n\nIMPORTANT: Write ALL comments in ${language}. Do not use English unless ${language} is English.` : '';

  const prompt = `You are generating comments for a demo environment. Your task is to act as ${userCount} different employees from various departments${companyContext} commenting on an internal company intranet post.${languageInstruction}

Post Title: "${articleTitle}"
Post Content Snippet: "${articleContent}..."

Create a set of unique and realistic comments. The entire response must be a single, valid JSON object with two keys: "standalone_comments" and "comment_reply_pairs".

**Tone and Style Rules:**
1.  **Internal Perspective:** Comments must sound like they are from an employee. Use pronouns like "we", "us", and "our company". Refer to the company's goals and initiatives.
2.  **Departmental Voice:** Comments should reflect different roles. A sales person might ask about customer impact, while an engineer might ask about the tech stack.
3.  **Action-Oriented:** Include questions about strategy, logistics, or team impact.
4.  **No Signatures:** Never end a comment with a name, job title, or any form of attribution (e.g. "- *Name, Title*"). Comments must read as anonymous posts with no sign-off.

**JSON Output Rules:**
1.  **JSON Only**: The entire response must be a single, valid JSON object. Do not include markdown like \`\`\`json.
2.  **standalone_comments**: Provide an array of exactly ${userCount} unique, standalone comments. These are top-level comments that start a new thought.
3.  **comment_reply_pairs**: Provide an array of exactly ${includeReplies ? userCount : 0} unique objects, each containing a "parent" comment (often a question) and a "reply" comment. Replies should directly reference the parent and stay on the topic of the article above.

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
}`;

  try {
    const { rawText } = await callGemini({ prompt, temperature: 0.8 }, ctx);
    const parsed = JSON.parse(rawText);

    onProgress?.(`Generated ${parsed.standalone_comments?.length || 0} standalone comments and ${parsed.comment_reply_pairs?.length || 0} reply pairs`);

    return {
      standaloneComments: parsed.standalone_comments || [],
      commentReplyPairs: includeReplies ? (parsed.comment_reply_pairs || []) : [],
    };
  } catch (error) {
    console.error('Error generating article comments:', error);
    throw new Error(`Failed to generate comments: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
};

/**
 * Login as a specific user via page context injection
 * @param {Object} args - { user }
 * @param {Object} ctx - context
 */
export const loginAsUser = async (
  args: { user: UserRecord },
  ctx: OperationContext
) => {
  const { user } = args;
  const { onProgress } = ctx;

  const email = user.emails?.find((e) => e.primary)?.value ||
                user.emails?.[0]?.value ||
                user.publicEmailAddress ||
                user.email;

  if (!email) {
    throw new Error(`User ${user.id} has no email address`);
  }

  onProgress?.(`Logging in as ${user.firstName || email}...`);
  const sharedDemoPassword = await getSharedDemoPassword(ctx);

  const result = await runInPageContext({
    func: async (userEmail, password) => {
      try {
        // Login as the user
        const loginRes = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: userEmail,
            secret: password,
            locale: 'en_US',
          }),
          credentials: 'include',
        });

        if (!loginRes.ok) {
          const errorText = await loginRes.text().catch(() => '');
          return { ok: false, error: `Login failed: ${loginRes.status} ${errorText}` };
        }

        // Get fresh CSRF token
        const discover = await fetch('/auth/discover', {
          headers: { 'Accept': 'application/vnd.staffbase.auth.discovery.v2+json' },
          credentials: 'include',
        });

        const csrfToken = discover.ok
          ? (await discover.json())?.csrfToken
          : ((document.querySelector('meta[name="x-csrf-token"]') as HTMLMetaElement | null)?.content || '');

        if (!csrfToken) {
          return { ok: false, error: 'Could not get CSRF token after login' };
        }

        return { ok: true, csrfToken };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    args: [email, sharedDemoPassword],
  }) as PageContextResult;

  if (!result?.ok) {
    throw new Error(result?.error || 'Login failed');
  }

  onProgress?.(`Logged in as ${user.firstName || email}`);

  return { csrfToken: result.csrfToken, success: true };
};

/**
 * Post a comment on an article via page context injection
 * @param {Object} args - { articleId, text, parentCommentId }
 * @param {Object} ctx - context
 */
export const postComment = async (
  args: { articleId: string; text: string; parentCommentId?: string | null },
  ctx: OperationContext
) => {
  const { articleId, text, parentCommentId } = args;
  const { onProgress } = ctx;

  // Guard: ensure text is a non-empty string before posting
  const safeText = typeof text === 'string' ? text.trim() : null;
  if (!safeText) {
    throw new Error(`Comment text is invalid or empty (got: ${JSON.stringify(text)})`);
  }

  const result = await runInPageContext({
    func: async (artId, commentText, parentId) => {
      try {
        // Get fresh CSRF token
        const discover = await fetch('/auth/discover', {
          headers: { 'Accept': 'application/vnd.staffbase.auth.discovery.v2+json' },
          credentials: 'include',
        });

        const csrfToken = discover.ok
          ? (await discover.json())?.csrfToken
          : ((document.querySelector('meta[name="x-csrf-token"]') as HTMLMetaElement | null)?.content || '');

        if (!csrfToken) {
          return { ok: false, error: 'No CSRF token found' };
        }

        // Determine endpoint - reply to parent or top-level comment
        const url = parentId
          ? `/api/comments/${parentId}/comments`
          : `/api/articles/${artId}/comments`;

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({ text: `<p>${commentText}</p>` }),
          credentials: 'include',
        });

        if (!res.ok) {
          const errorText = await res.text().catch(() => '');
          return { ok: false, error: `Comment failed: ${res.status} ${errorText}` };
        }

        const data = await res.json();
        return { ok: true, commentId: data.id };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    args: [articleId, safeText, parentCommentId || null],
  }) as PageContextResult;

  if (!result?.ok) {
    throw new Error(result?.error || 'Failed to post comment');
  }

  onProgress?.(`Posted comment on article ${articleId}`);

  return { commentId: result.commentId, success: true };
};

/**
 * Add comments to a single article using multiple users
 * @param {Object} args - { articleId, article, users, prospectName }
 * @param {Object} ctx - context
 */
export const addCommentsToArticle = async (
  args: {
    articleId: string;
    article: ArticleRecord;
    users: UserRecord[];
    prospectName?: string;
    includeReplies?: boolean;
    language?: string;
  },
  ctx: OperationContext
) => {
  const { articleId, article, users, prospectName, includeReplies = true, language } = args;
  const { onProgress } = ctx;

  if (!users || users.length === 0) {
    throw new Error('No users provided for commenting');
  }

  // Step 1: Generate AI comments for this article
  const { standaloneComments, commentReplyPairs } = await generateArticleComments({
    article,
    userCount: users.length,
    prospectName,
    includeReplies,
    language,
  }, ctx);

  // Create pools of available comments
  const availableStandalone = [...standaloneComments] as string[];
  const availablePairs = includeReplies ? [...commentReplyPairs] as { parent: string; reply: string }[] : [];
  const pendingReplies: { parentId?: string; replyText: string; authorId?: string }[] = [];

  let commentsPosted = 0;

  // Step 2: Loop through users, login as each, and post comments
  for (const user of users) {
    try {
      // Login as this user
      await loginAsUser({ user }, ctx);

      // Prefer to seed a parent + reply chain first, then fill with standalone
      if (availablePairs.length > 0) {
        const pair = availablePairs.shift()!;
        const { commentId } = await postComment({ articleId, text: pair.parent }, ctx);
        commentsPosted++;
        pendingReplies.push({
          parentId: commentId,
          replyText: pair.reply,
          authorId: user.id,
        });
      } else if (availableStandalone.length > 0) {
        const commentText = availableStandalone.shift()!;
        await postComment({ articleId, text: commentText }, ctx);
        commentsPosted++;
      }

      // Attempt to reply to an existing parent with a different author
      if (includeReplies && pendingReplies.length > 0) {
        const replyableIndex = pendingReplies.findIndex((p) => p.authorId !== user.id);
        if (replyableIndex > -1) {
          const [replyable] = pendingReplies.splice(replyableIndex, 1);
          await postComment({
            articleId,
            text: replyable.replyText,
            parentCommentId: replyable.parentId,
          }, ctx);
          commentsPosted++;
        }
      }

      // Small delay between users
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error posting comment as ${user.firstName || user.id}:`, error);
      onProgress?.(`Failed to post comment as ${user.firstName || user.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Post any remaining pending replies (login as random users)
  if (includeReplies) {
    for (const pending of pendingReplies) {
      const availableUsers = users.filter((u) => u.id !== pending.authorId);
      if (availableUsers.length > 0) {
        const randomUser = availableUsers[Math.floor(Math.random() * availableUsers.length)];
        try {
          await loginAsUser({ user: randomUser }, ctx);
          await postComment({
            articleId,
            text: pending.replyText,
            parentCommentId: pending.parentId,
          }, ctx);
          commentsPosted++;
        } catch (error) {
          console.error('Error posting pending reply:', error);
        }
      }
    }
  }

  onProgress?.(`Posted ${commentsPosted} comments on article`);

  return { commentsPosted, success: true };
};

/**
 * Add comments to multiple articles
 * @param {Object} args - { articleIds, channelId, users, prospectName, userCount }
 * @param {Object} ctx - context
 */
export const addCommentsToArticles = async (
  args: {
    articleIds?: string[];
    channelId?: string;
    users?: UserRecord[];
    prospectName?: string;
    userCount?: number;
    includeReplies?: boolean;
    language?: string;
  },
  ctx: OperationContext
) => {
  const { articleIds, channelId, users, prospectName, userCount = 5, includeReplies = true, language } = args;
  const { onProgress } = ctx;

  // If no articleIds provided but channelId is, fetch articles from channel
  let targetArticleIds = articleIds;
  let articles: ArticleRecord[] = [];

  if ((!targetArticleIds || targetArticleIds.length === 0) && channelId) {
    const result = await fetchChannelArticles({ channelId, limit: 10 }, ctx);
    articles = result.articles as ArticleRecord[];
    targetArticleIds = articles.map((a) => a.id!).filter(Boolean);
  }

  if (!targetArticleIds || targetArticleIds.length === 0) {
    throw new Error('No articles to comment on. Provide articleIds or channelId.');
  }

  // If we don't have article objects, create minimal ones
  if (articles.length === 0) {
    articles = targetArticleIds.map((id) => ({ id }));
  }

  // Determine which users to use
  let commentUsers = users;
  if (!commentUsers || commentUsers.length === 0) {
    throw new Error('No users provided for commenting. Provide users array.');
  }

  // Limit to userCount if specified
  if (userCount && commentUsers.length > userCount) {
    commentUsers = commentUsers.slice(0, userCount);
  }

  onProgress?.(`Adding comments to ${targetArticleIds.length} articles with ${commentUsers.length} users`);

  // Ensure we know which admin to restore after automation
  let adminUser = ctx.adminUser as UserRecord | null | undefined;
  if (!adminUser) {
    adminUser = await fetchAdminUser(ctx, ctx.adminUserId) as UserRecord | null;
  }

  // Enrich articles with full content when missing so AI can be contextual
  articles = await Promise.all(articles.map(async (article) => {
    if (article?.contents?.en_US?.content) return article;
    const detailed = await fetchArticleDetails(article.id!, ctx);
    return detailed ? { ...article, ...detailed } : article;
  }));

  let totalCommentsPosted = 0;

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    onProgress?.(`Processing article ${i + 1}/${articles.length}...`);

    try {
      const result = await addCommentsToArticle({
        articleId: article.id!,
        article,
        users: commentUsers,
        prospectName,
        includeReplies,
        language,
      }, ctx);

      totalCommentsPosted += result.commentsPosted;
    } catch (error) {
      console.error(`Error adding comments to article ${article.id}:`, error);
      onProgress?.(`Failed to add comments to article: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  onProgress?.(`Added ${totalCommentsPosted} total comments across ${targetArticleIds.length} articles`);

  // Restore admin session if available (mirrors chat automation expectation)
  if (adminUser) {
    try {
      await loginAsUser({ user: adminUser }, ctx);
      onProgress?.('Logged back in as admin after commenting');
    } catch (err) {
      onProgress?.(`⚠️ Failed to restore admin session: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    articlesProcessed: targetArticleIds.length,
    totalCommentsPosted,
    success: true,
  };
};
