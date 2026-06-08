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
});
