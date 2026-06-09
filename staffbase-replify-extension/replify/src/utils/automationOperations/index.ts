/**
 * Automation Operations Index
 * Central export for all atomic automation operations
 */

// Environment operations
import {
  buildApiUrl,
  getCsrfToken,
  fetchGroups as envFetchGroups,
  fetchUsers as envFetchUsers,
  fetchProfileFields as envFetchProfileFields,
  fetchAdminUserId as envFetchAdminUserId,
  fetchNewsChannels as envFetchNewsChannels,
  findPrimaryEmail,
  fetchGroupMembers,
  sleep,
  callGemini,
  ensureContrast,
} from './environment';

// Branding operations
import {
  applyBrandColors as brandApplyBrandColors,
  setLogo as brandSetLogo,
  setHeaderTransparency as brandSetHeaderTransparency,
  setBackground as brandSetBackground,
  setLogoSize as brandSetLogoSize,
  commitBranding as brandCommitBranding,
  applyFullBranding as brandApplyFullBranding,
} from './branding';

// Chat operations
import {
  generateChatContent as chatGenerateChatContent,
  getChatInstallation as chatGetChatInstallation,
  selectChatParticipants as chatSelectChatParticipants,
  createGroupConversation as chatCreateGroupConversation,
  sendDirectMessage as chatSendDirectMessage,
  sendMessage as chatSendMessage,
  loginAsUser as chatLoginAsUser,
  runChatAutomation as chatRunChatAutomation,
  runFullChatWorkflow as chatRunFullChatWorkflow,
  createChats as chatCreateChats,
} from './chats';

// Article operations
import {
  findNewsChannel as articleFindNewsChannel,
  createNewsChannel as articleCreateNewsChannel,
  findOrCreateNewsChannel as articleFindOrCreateNewsChannel,
  importLinkedInArticles as articleImportLinkedInArticles,
  importLinkedInArticlesFull as articleImportLinkedInArticlesFull,
  createArticle as articleCreateArticle,
  generateArticleContent as articleGenerateArticleContent,
  generateAndCreateArticles as articleGenerateAndCreateArticles,
  fetchChannelArticles as articleFetchChannelArticles,
  deleteArticle as articleDeleteArticle,
  getArticlesAfterMarker as articleGetArticlesAfterMarker,
  fetchUnsplashImage as articleFetchUnsplashImage,
  fetchAllRecentArticles as articleFetchAllRecentArticles,
} from './articles';

// Comment operations
import {
  generateArticleComments as commentGenerateArticleComments,
  loginAsUser as commentLoginAsUser,
  postComment as commentPostComment,
  addCommentsToArticle as commentAddCommentsToArticle,
  addCommentsToArticles as commentAddCommentsToArticles,
} from './comments';

// User operations
import {
  selectUsers as userSelectUsers,
  updateUserField as userUpdateUserField,
  updateUserProfile as userUpdateUserProfile,
  validateProfileFields as userValidateProfileFields,
  updateUserFields as userUpdateUserFields,
  generateFieldValues as userGenerateFieldValues,
} from './users';

// Installation operations
import {
  setupInstallations as installSetupInstallations,
  setupEmailTemplates as installSetupEmailTemplates,
} from './installations';

// Blog scraping operations
import {
  scrapeAndCreateArticlesFromBlog as blogScrapeAndCreateArticlesFromBlog,
} from './blogScraping';

// Personas & Groups (industry-driven user/group rewrite) — bolt-in port of
// staffbase-demo-group-tool. See ./personas.ts for the v3 accessor header
// quirk and the raw-array group-membership body.
import {
  fetchPersonaCandidates as personaFetchCandidates,
  researchProspectForPersonas as personaResearchProspect,
  matchUsersToIndustry as personaMatchUsers,
  applyPersonas as personaApply,
  runPersonasPipeline as personaRunPipeline,
} from './personas';

// News channel rename + post-date redistribution — bolt-in port of
// staffbase-news-tool. See ./newsChannelRename.ts for the links.update
// channel-update pattern and the contents round-trip on post PUT.
import {
  listAllChannels as newsListChannels,
  planChannelRenames as newsPlanRenames,
  renameChannels as newsRenameChannels,
  redistributePostDates as newsRedistributeDates,
} from './newsChannelRename';

// Home-page Link Tiles widget rebranding — finds the tenant's home page,
// rewrites `data-widget-conf-tile-bg-color` / `text-color` attrs on every
// `data-widget-type="QuickLinks"` div, PUTs the page back via Pages API
// (full-replace, so we round-trip every locale's title + content).
// See ./pageWidgetBranding.ts for the regex scoping.
import {
  findHomePageWithLinkTiles as pageFindHomeLinkTiles,
  previewLinkTilesPlan as pagePreviewLinkTilesPlan,
  rebrandHomePageLinkTiles as pageRebrandHomeLinkTiles,
} from './pageWidgetBranding';

// Distributed demo articles — Gemini-driven multi-channel AI article gen
// with realistic date scheduling around a demo date. Composes
// generateAndCreateArticles + redistributePostDates with a planning Gemini
// call on top. See ./distributedArticles.ts for the prompt + orchestration.
import {
  planArticleDistribution as distrPlanArticles,
  generateDistributedDemoArticles as distrGenerateArticles,
  previewDistributedArticlesPlan as distrPreviewPlan,
} from './distributedArticles';

// Edit Pages — Gemini rewrites the visible TEXT on existing pages while
// preserving layout, images, widget configs, and Studio template variables.
// HTML parsing happens in the browser via DOMParser; we walk only TEXT nodes
// and skip widget containers / scripts / template vars. PUT /api/pages/{id}
// is full-replace, so the apply step round-trips the full contents object.
import {
  discoverCommonPages as pagesDiscoverCommon,
  buildEditDiffsForPages as pagesBuildEditDiffs,
  applyApprovedPageEdits as pagesApplyEdits,
} from './pageTextEditor';

// Tailor Emails — Gemini rewrites text inside email-designer templates
// (the "pikasso" content tree). Reuses the page text-walker for each
// textMarkupValue fragment. PUTs back via
// /api/email-service/templates/{id}/contents/pikasso (undocumented but
// empirically verified via Replify's setupOperations/emailTemplates.ts).
import {
  discoverEmailTemplates as emailDiscoverTemplates,
  buildEmailTemplateDiffs as emailBuildDiffs,
  applyApprovedEmailTemplateEdits as emailApplyEdits,
  // V2: clone-and-translate templates to a new locale, and create
  // ready-to-preview email drafts from templates.
  cloneTranslatedTemplates as emailCloneTranslated,
  createDraftsFromTemplates as emailCreateDrafts,
} from './emailTemplateTailor';

// V2.2: swap brand-tailored images into template slots (with logo.dev
// suggestions + per-slot user override + upload-to-media when possible).
import {
  buildImageSwapPlans as imageBuildPlans,
  applyImageSwapsToTemplate as imageApplyOne,
  applyImageSwapsToAllTemplates as imageApplyAll,
  resolveProspectDomain as imageResolveDomain,
} from './imageSlotSwap';

// Re-export everything for direct imports
export {
  buildApiUrl,
  getCsrfToken,
  findPrimaryEmail,
  fetchGroupMembers,
  sleep,
  callGemini,
  ensureContrast,
};

export const fetchGroups = envFetchGroups;
export const fetchUsers = envFetchUsers;
export const fetchProfileFields = envFetchProfileFields;
export const fetchAdminUserId = envFetchAdminUserId;
export const fetchNewsChannels = envFetchNewsChannels;

export const applyBrandColors = brandApplyBrandColors;
export const setLogo = brandSetLogo;
export const setHeaderTransparency = brandSetHeaderTransparency;
export const setBackground = brandSetBackground;
export const setLogoSize = brandSetLogoSize;
export const commitBranding = brandCommitBranding;
export const applyFullBranding = brandApplyFullBranding;

export const generateChatContent = chatGenerateChatContent;
export const getChatInstallation = chatGetChatInstallation;
export const selectChatParticipants = chatSelectChatParticipants;
export const createGroupConversation = chatCreateGroupConversation;
export const sendDirectMessage = chatSendDirectMessage;
export const sendMessage = chatSendMessage;
export const loginAsUser = chatLoginAsUser;
export const runChatAutomation = chatRunChatAutomation;
export const runFullChatWorkflow = chatRunFullChatWorkflow;
export const createChats = chatCreateChats;

export const findNewsChannel = articleFindNewsChannel;
export const createNewsChannel = articleCreateNewsChannel;
export const findOrCreateNewsChannel = articleFindOrCreateNewsChannel;
export const importLinkedInArticles = articleImportLinkedInArticles;
export const importLinkedInArticlesFull = articleImportLinkedInArticlesFull;
export const createArticle = articleCreateArticle;
export const generateArticleContent = articleGenerateArticleContent;
export const generateAndCreateArticles = articleGenerateAndCreateArticles;
export const fetchChannelArticles = articleFetchChannelArticles;
export const deleteArticle = articleDeleteArticle;
export const getArticlesAfterMarker = articleGetArticlesAfterMarker;
export const fetchUnsplashImage = articleFetchUnsplashImage;
export const fetchAllRecentArticles = articleFetchAllRecentArticles;

// Comment exports
export const generateArticleComments = commentGenerateArticleComments;
export { commentLoginAsUser };
export const postComment = commentPostComment;
export const addCommentsToArticle = commentAddCommentsToArticle;
export const addCommentsToArticles = commentAddCommentsToArticles;

export const selectUsers = userSelectUsers;
export const updateUserField = userUpdateUserField;
export const updateUserProfile = userUpdateUserProfile;
export const validateProfileFields = userValidateProfileFields;
export const updateUserFields = userUpdateUserFields;
export const generateFieldValues = userGenerateFieldValues;

export const setupInstallations = installSetupInstallations;
export const setupEmailTemplates = installSetupEmailTemplates;

export const scrapeAndCreateArticlesFromBlog = blogScrapeAndCreateArticlesFromBlog;

// Personas & Groups exports
export const fetchPersonaCandidates    = personaFetchCandidates;
export const researchProspectForPersonas = personaResearchProspect;
export const matchUsersToIndustry      = personaMatchUsers;
export const applyPersonas             = personaApply;
export const runPersonasPipeline       = personaRunPipeline;

// News channel rename exports
export const listAllChannels        = newsListChannels;
export const planChannelRenames     = newsPlanRenames;
export const renameChannels         = newsRenameChannels;
export const redistributePostDates  = newsRedistributeDates;

// Page-widget branding (home page Link Tiles)
export const findHomePageWithLinkTiles = pageFindHomeLinkTiles;
export const previewLinkTilesPlan      = pagePreviewLinkTilesPlan;
export const rebrandHomePageLinkTiles  = pageRebrandHomeLinkTiles;

// Distributed demo articles
export const planArticleDistribution        = distrPlanArticles;
export const generateDistributedDemoArticles = distrGenerateArticles;
export const previewDistributedArticlesPlan  = distrPreviewPlan;

// Edit Pages
export const discoverCommonPages    = pagesDiscoverCommon;
export const buildEditDiffsForPages = pagesBuildEditDiffs;
export const applyApprovedPageEdits = pagesApplyEdits;

// Tailor Emails
export const discoverEmailTemplates           = emailDiscoverTemplates;
export const buildEmailTemplateDiffs          = emailBuildDiffs;
export const applyApprovedEmailTemplateEdits  = emailApplyEdits;
export const cloneTranslatedTemplates         = emailCloneTranslated;
export const createDraftsFromTemplates        = emailCreateDrafts;
export const buildImageSwapPlans              = imageBuildPlans;
export const applyImageSwapsToTemplate        = imageApplyOne;
export const applyImageSwapsToAllTemplates    = imageApplyAll;
export const resolveProspectDomain            = imageResolveDomain;

/**
 * Operation Registry
 * Maps operation names to their implementations
 * Used by the executor to dynamically call operations
 *
 * NOTE: Using direct function references instead of dynamic imports
 * to avoid code splitting issues in Chrome extensions
 */
export const OPERATION_REGISTRY = {
  // Environment
  fetchGroups: envFetchGroups,
  fetchUsers: envFetchUsers,
  fetchProfileFields: envFetchProfileFields,
  fetchAdminUserId: envFetchAdminUserId,
  fetchNewsChannels: envFetchNewsChannels,

  // Branding
  applyBrandColors: brandApplyBrandColors,
  setLogo: brandSetLogo,
  setHeaderTransparency: brandSetHeaderTransparency,
  setBackground: brandSetBackground,
  setLogoSize: brandSetLogoSize,
  commitBranding: brandCommitBranding,
  applyFullBranding: brandApplyFullBranding,

  // Chats
  generateChatContent: chatGenerateChatContent,
  getChatInstallation: chatGetChatInstallation,
  selectChatParticipants: chatSelectChatParticipants,
  createGroupConversation: chatCreateGroupConversation,
  sendDirectMessage: chatSendDirectMessage,
  sendMessage: chatSendMessage,
  loginAsUser: chatLoginAsUser,
  runChatAutomation: chatRunChatAutomation,
  runFullChatWorkflow: chatRunFullChatWorkflow,
  createChats: chatCreateChats,

  // Articles
  findNewsChannel: articleFindNewsChannel,
  createNewsChannel: articleCreateNewsChannel,
  findOrCreateNewsChannel: articleFindOrCreateNewsChannel,
  importLinkedInArticles: articleImportLinkedInArticles,
  importLinkedInArticlesFull: articleImportLinkedInArticlesFull,
  createArticle: articleCreateArticle,
  generateArticleContent: articleGenerateArticleContent,
  generateAndCreateArticles: articleGenerateAndCreateArticles,
  fetchChannelArticles: articleFetchChannelArticles,
  deleteArticle: articleDeleteArticle,
  getArticlesAfterMarker: articleGetArticlesAfterMarker,
  fetchUnsplashImage: articleFetchUnsplashImage,
  fetchAllRecentArticles: articleFetchAllRecentArticles,

  // Comments
  generateArticleComments: commentGenerateArticleComments,
  commentLoginAsUser: commentLoginAsUser,
  postComment: commentPostComment,
  addCommentsToArticle: commentAddCommentsToArticle,
  addCommentsToArticles: commentAddCommentsToArticles,

  // Users
  selectUsers: userSelectUsers,
  updateUserField: userUpdateUserField,
  updateUserProfile: userUpdateUserProfile,
  validateProfileFields: userValidateProfileFields,
  updateUserFields: userUpdateUserFields,
  generateFieldValues: userGenerateFieldValues,

  // Installations
  setupInstallations: installSetupInstallations,
  setupEmailTemplates: installSetupEmailTemplates,

  // Blog scraping
  scrapeAndCreateArticlesFromBlog: blogScrapeAndCreateArticlesFromBlog,

  // Personas & Groups (industry-driven or prospect-research-driven rewrite)
  fetchPersonaCandidates:    personaFetchCandidates,
  researchProspectForPersonas: personaResearchProspect,
  matchUsersToIndustry:      personaMatchUsers,
  applyPersonas:             personaApply,
  runPersonasPipeline:       personaRunPipeline,

  // News channel rename + post-date redistribution
  listAllChannels:        newsListChannels,
  planChannelRenames:     newsPlanRenames,
  renameChannels:         newsRenameChannels,
  redistributePostDates:  newsRedistributeDates,

  // Page-widget branding (home-page Link Tiles)
  findHomePageWithLinkTiles: pageFindHomeLinkTiles,
  previewLinkTilesPlan:      pagePreviewLinkTilesPlan,
  rebrandHomePageLinkTiles:  pageRebrandHomeLinkTiles,

  // Distributed demo articles
  planArticleDistribution:        distrPlanArticles,
  generateDistributedDemoArticles: distrGenerateArticles,
  previewDistributedArticlesPlan:  distrPreviewPlan,

  // Edit Pages
  discoverCommonPages:    pagesDiscoverCommon,
  buildEditDiffsForPages: pagesBuildEditDiffs,
  applyApprovedPageEdits: pagesApplyEdits,

  // Tailor Emails
  discoverEmailTemplates:          emailDiscoverTemplates,
  buildEmailTemplateDiffs:         emailBuildDiffs,
  applyApprovedEmailTemplateEdits: emailApplyEdits,
  cloneTranslatedTemplates:        emailCloneTranslated,
  createDraftsFromTemplates:       emailCreateDrafts,
  buildImageSwapPlans:             imageBuildPlans,
  applyImageSwapsToTemplate:       imageApplyOne,
  applyImageSwapsToAllTemplates:   imageApplyAll,
  resolveProspectDomain:           imageResolveDomain,
};

/**
 * Get list of available operations with their descriptions
 * Useful for Gemini to understand what functions are available
 */
export const getOperationDescriptions = () => ({
  // Environment
  fetchGroups: 'Fetch all groups from the environment',
  fetchUsers: 'Fetch all users from the environment',
  fetchProfileFields: 'Fetch profile field schema',
  fetchAdminUserId: 'Get the admin user ID',
  fetchNewsChannels: 'Fetch existing news channels from the environment',

  // Branding
  applyBrandColors: 'Apply brand colors (primary, text, background)',
  setLogo: 'Set company logo by prospect name or URL',
  setHeaderTransparency: 'Set header/nav transparency (0-100)',
  setBackground: 'Set background image URL',
  setLogoSize: 'Adjust logo size and positioning',
  commitBranding: 'Commit all branding changes to the environment',
  applyFullBranding: 'Apply complete branding in one step',

  // Chats
  generateChatContent: 'Generate AI chat messages about a topic',
  getChatInstallation: 'Get chat plugin installation ID',
  selectChatParticipants: 'Select users for chat participation',
  createGroupConversation: 'Create a group chat conversation',
  sendDirectMessage: 'Send a direct message to a user',
  sendMessage: 'Send a message to a conversation',
  loginAsUser: 'Login as a specific user',
  runChatAutomation: 'Run full chat automation flow',
  runFullChatWorkflow: 'Preferred chat workflow: generates content and sends via tab injection',
  createChats: 'Create multiple chats with generated content',

  // Articles
  findNewsChannel: 'Find an existing news channel',
  createNewsChannel: 'Create a new news channel',
  findOrCreateNewsChannel: 'Find or create a news channel',
  importLinkedInArticles: 'Import articles from LinkedIn',
  importLinkedInArticlesFull: 'Full LinkedIn import with channel creation and marker cleanup',
  createArticle: 'Create a single article in a channel',
  generateArticleContent: 'Generate article content with AI',
  generateAndCreateArticles: 'Full workflow: generate AI articles with images and create them in a channel',
  fetchChannelArticles: 'Fetch articles from a news channel',
  deleteArticle: 'Delete an article',
  getArticlesAfterMarker: 'Get articles added after LinkedIn marker and delete the marker',
  fetchUnsplashImage: 'Fetch a random image from Unsplash for a topic',
  fetchAllRecentArticles: 'Fetch recent articles from all news channels',

  // Comments
  generateArticleComments: 'Generate AI comments for an article',
  commentLoginAsUser: 'Login as a specific user for commenting',
  postComment: 'Post a comment on an article',
  addCommentsToArticle: 'Add AI-generated comments to a single article using multiple users',
  addCommentsToArticles: 'Add AI-generated comments to multiple articles using multiple users',

  // Users
  selectUsers: 'Select users by IDs, emails, or random',
  updateUserField: 'Update a single profile field on a user',
  updateUserProfile: 'Update multiple fields on a user',
  validateProfileFields: 'Validate field names against schema',
  updateUserFields: 'Update fields on multiple users',
  generateFieldValues: 'Generate contextual field values',

  // Installations
  setupInstallations: 'Configure environment features (chat, Microsoft, campaigns, launchpad, quick links, widgets, Workday merge)',
  setupEmailTemplates: 'Generate email templates for the environment',

  // Blog scraping
  scrapeAndCreateArticlesFromBlog: 'Scrape articles from a public blog URL and create them in a news channel with original images',

  // Personas & Groups
  fetchPersonaCandidates:      'Fetch activated non-admin users for industry persona classification',
  researchProspectForPersonas: 'Gemini researches a prospect (news, industry, LinkedIn context) and returns an inferred industry key + 8 prospect-themed groups for the persona pipeline',
  matchUsersToIndustry:        'Use Gemini to classify users into comms/corporate/frontline roles and suggest position/department per industry (optionally prospect-flavored)',
  applyPersonas:               'Apply a persona plan: POST /users/{id} basic fields, PATCH /users/{id} with v3 accessors for system_manager, create 8 groups (industry-templated OR custom from Gemini), assign members',
  runPersonasPipeline:         'One-shot: fetch candidates -> Gemini match -> apply (writes users + creates groups)',

  // News channel rename + post date redistribution
  listAllChannels:        'List every news channel in the tenant (paginated via /api/branch/channels)',
  planChannelRenames:     'Use Gemini to map existing channels to industry channel templates (preview-only, no writes)',
  renameChannels:         'Apply a rename plan via each channel\'s links.update endpoint',
  redistributePostDates:  'Spread post `published` timestamps around a demo date with weighted recency (60% in last 14 days)',

  // Page-widget branding (home-page Link Tiles)
  findHomePageWithLinkTiles: 'Find the tenant\'s home page (title contains home/welcome AND contains a QuickLinks widget)',
  previewLinkTilesPlan:      'Inspect-only summary of what rebrandHomePageLinkTiles would change (no writes)',
  rebrandHomePageLinkTiles:  'Rewrite tile bg/text colors on every QuickLinks widget on the home page; PUTs the page back via Pages API (full-replace round-trip)',

  // Distributed demo articles
  planArticleDistribution:        'Use Gemini to allocate N articles across the supplied channels based on prospect context + channel themes (read-only planning step)',
  generateDistributedDemoArticles: 'Full flow: plan distribution, generate + create articles per channel, then redistribute published timestamps across all selected channels around a demo date',
  previewDistributedArticlesPlan:  'Dry-run: returns the planned distribution + existing post counts per channel without writing anything',

  // Edit Pages
  discoverCommonPages:    'List pages with titles matching the common-page heuristic (Home / HR / IT / FAQ / etc.) + count of editable text blocks per page',
  buildEditDiffsForPages: 'For each page: GET, extract editable text nodes (skip widgets/scripts/template vars), Gemini rewrites text in the requested tone, returns per-page before/after diffs WITHOUT writing',
  applyApprovedPageEdits: 'PUT each approved diff back via /api/pages/{id}, round-tripping the full contents object so other locales stay untouched',

  // Tailor Emails
  discoverEmailTemplates:          'List every email designer template across all galleries via /api/email-service, with per-template editable-text-fragment counts',
  buildEmailTemplateDiffs:         'For each selected template: GET its pikasso content tree, walk every textMarkupValue HTML fragment, batch text nodes to Gemini for prospect-tailored rewrites, return per-template before/after diffs WITHOUT writing',
  applyApprovedEmailTemplateEdits: 'PUT each approved template back via /api/email-service/templates/{id}/contents/pikasso — only the content changes; name, gallery, thumbnail are untouched',
  cloneTranslatedTemplates:        'For each source template: POST a NEW template in the same gallery with name suffix "— <Locale>", then walk + Gemini-translate every textMarkupValue to the target locale, then PUT translated content. Original template stays untouched.',
  createDraftsFromTemplates:       'For each source template: discover/create a draft folder, POST a new email draft using the template name + prospect-flavored subject, then Gemini-rewrite + PUT pikasso content with the locale-keyed body shape emails require.',
  buildImageSwapPlans:             'Walk every selected template\'s pikasso tree, find image slots (anything with a src field, excluding social-icon containers), and seed default logo.dev suggestions per slot keyed on the prospect\'s domain. Returns per-template per-slot plans for UI approval.',
  applyImageSwapsToTemplate:       'For a single template plan: upload approved image URLs to /api/media (fall back to direct external URL when CORS/upload fails), splice new src + mediumId into the tree at each approved slot, PUT modified template back.',
  applyImageSwapsToAllTemplates:   'Bulk apply image swaps across many template plans (sequential).',
  resolveProspectDomain:           'Given a prospect name + optional websiteUrl, return the canonical domain via Brandfetch /v2/search fallback. Used to seed logo.dev URLs for image-slot suggestions.',
});
