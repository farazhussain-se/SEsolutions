/**
 * AI Function Calling - Operation Orchestrator
 *
 * This file manages:
 * 1. Operation registry mapping function names to implementations
 * 2. Operation execution with reference resolution
 * 3. Legacy task format support for backward compatibility
 */

import { OPERATION_REGISTRY, getOperationDescriptions } from './automationOperations';
import { getGeminiProxyUrl } from './geminiProxy';

// Legacy task runners for backward compatibility
import {
  runBrandingTask,
  runChatsTask,
  runArticlesTask,
  runLinkedInArticlesTask,
  runUserFieldsTask,
  runCommentsTask,
  runUnsupportedTask,
} from './promptTaskRunners';

// ─── Shared types ────────────────────────────────────────────────────────────

interface Operation {
  function: string;
  args?: Record<string, unknown>;
}

interface LegacyTask {
  type: string;
  title: string;
  status?: string;
  params?: Record<string, unknown>;
  operations?: Operation[];
  chatIndex?: number;
  colors?: string[];
  details?: string;
  [key: string]: unknown;
}

interface Plan {
  operations?: Operation[];
  tasks?: LegacyTask[];
  legacyTasks?: LegacyTask[];
  code?: string;
}

interface ExecutionContext {
  apiToken: string;
  branchId?: string;
  apiDomain?: string;
  adminUserId?: string;
  environment?: string;
  onProgress?: (msg: string) => void;
  [key: string]: unknown;
}

interface ExecutedOp {
  fnName: string;
  result: unknown;
  args: unknown;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CHAT_OPERATION_NAMES = new Set([
  'generateChatContent',
  'getChatInstallation',
  'selectChatParticipants',
  'createGroupConversation',
  'sendDirectMessage',
  'sendMessage',
  'loginAsUser',
  'runChatAutomation',
  'runFullChatWorkflow',
  'createChats',
]);

const BRAND_OPS = new Set([
  'applyBrandColors',
  'setLogo',
  'setHeaderTransparency',
  'setBackground',
  'setLogoSize',
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const validateOperations = (operations: Operation[] = []) => {
  operations.forEach((op) => {
    if (op.function === 'updateUserFields') {
      const updates = op.args?.fieldUpdates;
      if (!Array.isArray(updates) || !updates.length) {
        throw new Error(
          'Gemini plan is missing fieldUpdates for updateUserFields. Regenerate the plan with a fieldUpdates array (field + values) and user selection.'
        );
      }
      const hasValues = (updates as Record<string, unknown>[]).some(
        (u) => (Array.isArray(u.values) && (u.values as unknown[]).length) || typeof u.value !== 'undefined'
      );
      if (!hasValues) {
        throw new Error(
          'Gemini plan must provide values in fieldUpdates (use values array sized to userCount or a single value).'
        );
      }
    }
  });
};

const appendBrandCommitIfNeeded = (operations: Operation[] = [], plan: Plan = {}): Operation[] => {
  const hasCommit = operations.some((op) => op.function === 'commitBranding' || op.function === 'applyFullBranding');
  if (hasCommit) return operations;

  const hasBrandOps = operations.some((op) => BRAND_OPS.has(op.function));
  if (!hasBrandOps) return operations;

  const hasApplyColors = operations.find((op) => op.function === 'applyBrandColors');
  let hasLogo: unknown = operations.find((op) => op.function === 'setLogo');
  const hasHeader = operations.find((op) => op.function === 'setHeaderTransparency');
  const hasBg = operations.find((op) => op.function === 'setBackground');
  const hasLogoSize = operations.find((op) => op.function === 'setLogoSize');

  // If we have branding but no logo, try to extract prospectName and add setLogo
  let augmentedOps = [...operations];
  if (!hasLogo) {
    // Look for prospectName in operations first
    let prospectName: string | null = null;
    for (const op of operations) {
      if (op.args?.prospectName) {
        prospectName = op.args.prospectName as string;
        break;
      }
    }
    // If not found in operations, check legacyTasks
    if (!prospectName) {
      const tasks = plan.legacyTasks || plan.tasks || [];
      for (const task of tasks) {
        if (task.params?.prospectName) {
          prospectName = task.params.prospectName as string;
          break;
        }
      }
    }
    if (prospectName) {
      // Insert setLogo before any commit
      augmentedOps.push({ function: 'setLogo', args: { prospectName } });
      hasLogo = true; // Mark that we now have logo
    }
  }

  const commitArgs: Record<string, unknown> = {};
  if (hasApplyColors) commitArgs.colors = '$applyBrandColors.colors';
  if (hasLogo) {
    commitArgs.logoUrl = '$setLogo.logoUrl';
    commitArgs.prospectName = '$setLogo.prospectName';
  }
  if (hasHeader) commitArgs.headerTransparency = '$setHeaderTransparency.headerTransparency';
  if (hasBg) {
    commitArgs.bgUrl = '$setBackground.bgUrl';
    commitArgs.bgVertical = '$setBackground.bgVertical';
  }
  if (hasLogoSize) commitArgs.logoSize = '$setLogoSize';

  return [...augmentedOps, { function: 'commitBranding', args: commitArgs }];
};

const extractChatTasksFromOperations = (operations: Operation[] = []) => {
  const chatOps: Operation[] = [];
  const remainingOps: Operation[] = [];

  operations.forEach((op) => {
    if (CHAT_OPERATION_NAMES.has(op.function)) {
      chatOps.push(op);
    } else {
      remainingOps.push(op);
    }
  });

  if (!chatOps.length) return { chatTasks: [], remainingOps: operations };

  // Create a SEPARATE task for each chat operation (don't merge them)
  const chatTasks: LegacyTask[] = chatOps.map((op, index) => {
    const args = (op.args || {}) as Record<string, unknown>;

    // Build params from this specific operation
    const params: Record<string, unknown> = {
      chatCount: args.chatCount || args.count || 5,
      prospectName: args.prospectName || args.companyName || '',
      topics: Array.isArray(args.topics) ? (args.topics as unknown[]).filter(Boolean) : args.topic ? [args.topic] : [],
    };

    // Chat mode and group targeting
    if (args.chatMode) params.chatMode = args.chatMode;
    if (args.groupId) params.groupId = args.groupId;
    if (args.groupName) params.groupName = args.groupName;

    // Participant targeting
    if (Array.isArray(args.users) && args.users.length) params.users = args.users;
    if (Array.isArray(args.participantIds) && args.participantIds.length) params.participantIds = args.participantIds;
    if (Array.isArray(args.participantEmails) && args.participantEmails.length) params.participantEmails = args.participantEmails;
    if (args.participantCount !== undefined) params.participantCount = args.participantCount;

    // Conversation customization
    if (args.chatTitle) params.chatTitle = args.chatTitle;
    if (Array.isArray(args.conversationFlow) && args.conversationFlow.length) params.conversationFlow = args.conversationFlow;
    if (args.conversationContext) params.conversationContext = args.conversationContext;
    if (args.language) params.language = args.language;

    // Build a descriptive title
    let title = 'Create AI chats';
    const chatCount = params.chatCount as number;
    if (args.chatTitle) {
      title = `Create "${args.chatTitle}" chat`;
    } else if (args.chatMode === 'group' && args.groupName) {
      title = `Create group chat in ${args.groupName}`;
    } else if (args.chatMode === 'group' && Array.isArray(args.users) && args.users.length) {
      const names = (args.users as Record<string, string>[]).map(u => u.name || u.firstName || 'user').slice(0, 2).join(' & ');
      title = `Create group chat with ${names}`;
    } else if (args.chatMode === 'direct' || !args.chatMode) {
      title = `Create ${chatCount} direct chat${chatCount > 1 ? 's' : ''}`;
    }
    const prospectName = params.prospectName as string;
    if (prospectName && !title.includes(prospectName)) {
      title += ` for ${prospectName}`;
    }

    return {
      title,
      type: 'chats',
      status: 'ready',
      details: 'Generate chat content and send it via chat automation (tab injection)',
      params,
      operations: [op], // Single operation for this task
      chatIndex: index, // Track which chat operation this is
    };
  });

  return { chatTasks, remainingOps };
};

/**
 * Resolve references in operation arguments
 * References look like "$operationName" or "$operationName.property"
 */
const resolveRefPath = (value: unknown, results: Record<string, unknown>): unknown => {
  if (typeof value !== 'string' || !value.startsWith('$')) {
    return value;
  }

  // Reference format: $operationName or $operationName.property
  const refPath = value.slice(1);
  const [opName, ...propPath] = refPath.split('.');

  let refValue: unknown = results[opName];
  for (const prop of propPath) {
    if (refValue && typeof refValue === 'object') {
      refValue = (refValue as Record<string, unknown>)[prop];
    }
  }

  return refValue;
};

const resolveReferences = (value: unknown, results: Record<string, unknown>): unknown => {
  if (typeof value === 'string') {
    return resolveRefPath(value, results);
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveReferences(item, results));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const resolved: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    resolved[key] = resolveReferences(nestedValue, results);
  }
  return resolved;
};

const inferArticleTargetsFromPreviousResults = (executedOps: ExecutedOp[] = []) => {
  for (let i = executedOps.length - 1; i >= 0; i--) {
    const prior = executedOps[i] || {};
    const priorResult = prior.result;

    if (!priorResult || typeof priorResult !== 'object') continue;

    const resultObj = priorResult as Record<string, unknown>;
    const candidateArticleIds = Array.isArray(resultObj.articleIds)
      ? (resultObj.articleIds as unknown[]).filter(Boolean)
      : [];
    if (candidateArticleIds.length > 0) {
      return {
        sourceOperation: prior.fnName,
        articleIds: candidateArticleIds,
        channelId: resultObj.channelId,
      };
    }
  }

  return null;
};

const maybeHydrateCommentArgs = (
  fnName: string,
  resolvedArgs: Record<string, unknown>,
  executedOps: ExecutedOp[],
  onProgress?: (msg: string) => void
): Record<string, unknown> => {
  if (fnName !== 'addCommentsToArticles' && fnName !== 'addCommentsToArticle') {
    return resolvedArgs;
  }

  const hasArticleIds = Array.isArray(resolvedArgs?.articleIds) && resolvedArgs.articleIds.length > 0;
  const hasChannelId = !!resolvedArgs?.channelId;
  if (hasArticleIds || hasChannelId) {
    return resolvedArgs;
  }

  const inferred = inferArticleTargetsFromPreviousResults(executedOps);
  if (!inferred) {
    return resolvedArgs;
  }

  const nextArgs = {
    ...resolvedArgs,
    ...(inferred.channelId ? { channelId: inferred.channelId } : {}),
    ...(inferred.articleIds.length ? { articleIds: inferred.articleIds } : {}),
  };

  const inferredCount = inferred.articleIds.length;
  const targetText = inferredCount
    ? `${inferredCount} article ID${inferredCount === 1 ? '' : 's'}`
    : `channel ${inferred.channelId}`;
  onProgress?.(`ℹ️ ${fnName}: using ${targetText} from ${inferred.sourceOperation}`);

  return nextArgs;
};

/**
 * Execute a sequence of operations
 */
export const executeOperations = async (
  operations: Operation[],
  context: ExecutionContext,
  onProgress?: (msg: string) => void
) => {
  const results: Record<string, unknown> = {};
  const errors: { operation: string; error: string }[] = [];
  const executedOps: ExecutedOp[] = [];

  const registry = OPERATION_REGISTRY as Record<string, (args: unknown, ctx: unknown) => Promise<unknown>>;

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    const { function: fnName, args = {} } = op;

    const fn = registry[fnName];
    if (!fn) {
      const error = `Unknown operation: ${fnName}`;
      onProgress?.(`⚠️ ${error}`);
      errors.push({ operation: fnName, error });
      continue;
    }

    try {
      // Resolve any references to previous operation results
      const resolvedArgs = resolveReferences(args, results) as Record<string, unknown>;
      const hydratedArgs = maybeHydrateCommentArgs(fnName, resolvedArgs, executedOps, onProgress);

      // Create context with progress callback
      const opContext = { ...context, onProgress };

      onProgress?.(`🔄 Running: ${fnName}`);
      const result = await fn(hydratedArgs, opContext);
      results[fnName] = result;
      executedOps.push({ fnName, result, args: hydratedArgs });

      onProgress?.(`✅ Completed: ${fnName}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      onProgress?.(`❌ Failed: ${fnName} - ${errorMsg}`);
      errors.push({ operation: fnName, error: errorMsg });

      // Store error in results so subsequent operations can check
      results[fnName] = { error: errorMsg };
    }
  }

  return { results, errors, success: errors.length === 0 };
};

const rejectPlanCode = async (code: string | null | undefined, onProgress?: (msg: string) => void) => {
  if (!code) return { success: false, error: 'No code provided' };

  const error =
    'Gemini returned raw code execution, which is disabled for security. Regenerate the plan using supported operations only.';
  onProgress?.(`❌ ${error}`);
  return { success: false, error };
};

/**
 * Execute a plan (new format with operations) or legacy tasks
 */
export const executePlan = async (
  plan: Plan,
  context: ExecutionContext,
  onProgress?: (msg: string) => void
) => {
  // Check if this is the new operations format
  if (plan.operations && Array.isArray(plan.operations)) {
    validateOperations(plan.operations);

    const operationsWithCommit = appendBrandCommitIfNeeded(plan.operations, plan);
    const { chatTasks, remainingOps } = extractChatTasksFromOperations(operationsWithCommit);

    if (chatTasks.length) {
      onProgress?.('📩 Detected chat operations. Routing them to legacy chat runner for tab injection.');
    }

    if (remainingOps.length) {
      onProgress?.(`📋 Executing ${remainingOps.length} operations${chatTasks.length ? ' (chats handled separately)' : ''}...`);
    }

    const opResult = remainingOps.length
      ? await executeOperations(remainingOps, context, onProgress)
      : { results: {}, errors: [], success: true };

    let chatResult: Awaited<ReturnType<typeof executeLegacyTasks>> | undefined;
    if (chatTasks.length) {
      onProgress?.('🚀 Starting: chat automation workflow');
      chatResult = await executeLegacyTasks(chatTasks, context, onProgress);
      onProgress?.('✅ Completed: chat automation workflow');
    }

    const finalResult: {
      results: Record<string, unknown>;
      errors: { operation?: string; task?: string; error: string }[];
      success: boolean;
      codeResult?: { success: boolean; error: string };
    } = {
      results: { ...opResult.results, chatTasks: chatResult?.results },
      errors: [...(opResult.errors || []), ...(chatResult?.errors || [])],
      success: (opResult.success !== false) && (chatResult?.success !== false),
    };

    if (plan.code) {
      finalResult.codeResult = await rejectPlanCode(plan.code, onProgress);
      finalResult.errors.push({ operation: 'plan.code', error: finalResult.codeResult.error });
      finalResult.success = false;
    }

    return finalResult;
  }

  // Fall back to legacy task format
  if (plan.tasks && Array.isArray(plan.tasks)) {
    return await executeLegacyTasks(plan.tasks, context, onProgress);
  }

  // Also support legacyTasks field
  if (plan.legacyTasks && Array.isArray(plan.legacyTasks)) {
    return await executeLegacyTasks(plan.legacyTasks, context, onProgress);
  }

  return { success: false, error: 'No operations or tasks found in plan' };
};

/**
 * Execute legacy task format (backward compatibility)
 */
export const executeLegacyTasks = async (
  tasks: LegacyTask[],
  context: ExecutionContext,
  onProgress?: (msg: string) => void
) => {
  const {
    apiToken,
    branchId,
    apiDomain = 'app.staffbase.com',
    adminUserId,
    environment,
  } = context;

  const results: { task: string; success: boolean; error?: string }[] = [];
  const errors: { task: string; error: string }[] = [];

  // Reorder tasks: ensure LinkedIn articles run last; if comments are present, they go after LinkedIn
  const reorderedTasks = [...tasks].sort((a, b) => {
    const order = (t: LegacyTask) => {
      if (t.type === 'linkedinArticles') return 2;
      if (t.type === 'comments') return 3;
      return 1;
    };
    return order(a) - order(b);
  });

  for (const task of reorderedTasks) {
    if (task.status === 'unsupported') {
      onProgress?.(`⚠️ Skipping unsupported task: ${task.title}`);
      continue;
    }

    onProgress?.(`\n🚀 Starting: ${task.title}`);

    try {
      switch (task.type) {
        case 'branding':
          await runBrandingTask({
            task,
            environment,
            apiToken,
            branchId,
            apiDomain,
            onProgress,
            onError: (msg: string) => errors.push({ task: task.title, error: msg }),
          });
          break;
        case 'chats':
          await runChatsTask({
            task,
            environment,
            apiToken,
            branchId,
            apiDomain,
            adminUserId,
            onProgress,
            onError: (msg: string) => errors.push({ task: task.title, error: msg }),
          });
          break;
        case 'articles':
          await runArticlesTask({
            task,
            environment,
            apiToken,
            branchId,
            apiDomain,
            onProgress,
            onError: (msg: string) => errors.push({ task: task.title, error: msg }),
          });
          break;
        case 'linkedinArticles':
          await runLinkedInArticlesTask({
            task,
            environment,
            apiToken,
            branchId,
            apiDomain,
            onProgress,
            onError: (msg: string) => errors.push({ task: task.title, error: msg }),
          });
          break;
        case 'userFields':
          await runUserFieldsTask({
            task,
            environment,
            apiToken,
            branchId,
            apiDomain,
            adminUserId,
            onProgress,
            onError: (msg: string) => errors.push({ task: task.title, error: msg }),
          });
          break;
        case 'comments':
          await runCommentsTask({
            task,
            environment,
            apiToken,
            branchId,
            apiDomain,
            adminUserId,
            onProgress,
            onError: (msg: string) => errors.push({ task: task.title, error: msg }),
          });
          break;
        default:
          await runUnsupportedTask({ task, environment });
          break;
      }

      results.push({ task: task.title, success: true });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      onProgress?.(`❌ Failed: ${task.title} - ${errorMsg}`);
      errors.push({ task: task.title, error: errorMsg });
      results.push({ task: task.title, success: false, error: errorMsg });
    }
  }

  onProgress?.('\n\n✅ All tasks completed!');

  return {
    results,
    errors,
    success: errors.length === 0,
  };
};

/**
 * Get Gemini tool declarations for function calling
 */
export const getAvailableTools = (allProfileFields: string[] = [], _allGroups: unknown[] = []) => {
  const descriptions = getOperationDescriptions();

  // Build function declarations from operation registry
  const functionDeclarations = Object.entries(OPERATION_REGISTRY).map(([name]) => ({
    name,
    description: (descriptions as Record<string, string>)[name] || `Execute ${name} operation`,
    parameters: {
      type: 'OBJECT',
      properties: {
        args: {
          type: 'OBJECT',
          description: 'Arguments for the operation',
        },
      },
    },
  }));

  // Add legacy tools for backward compatibility
  const legacyDeclarations = [
    {
      name: 'update_branding',
      description: 'Applies branding to the current environment. Can fetch branding information for a known company or apply specific colors and logos.',
      parameters: {
        type: 'OBJECT',
        properties: {
          prospectName: { type: 'STRING', description: "The name of the company to fetch branding for, e.g., 'Coca-Cola'." },
          primaryColor: { type: 'STRING', description: "The primary color in hex format, e.g., '#FF0000'." },
          textColor: { type: 'STRING', description: "The text color in hex format, e.g., '#FFFFFF'." },
          logoUrl: { type: 'STRING', description: "A direct URL to the company's logo." },
        },
        required: ['prospectName'],
      },
    },
    {
      name: 'setup_environment_features',
      description: 'Enables or configures specific features in the environment like Chat, Journeys, or Microsoft integrations.',
      parameters: {
        type: 'OBJECT',
        properties: {
          features: {
            type: 'ARRAY',
            description: 'A list of features to enable.',
            items: { type: 'STRING', enum: ['chat', 'journeys', 'microsoft', 'campaigns'] },
          },
        },
        required: ['features'],
      },
    },
    {
      name: 'update_user_profile',
      description: "Updates a specific field on a user's profile.",
      parameters: {
        type: 'OBJECT',
        properties: {
          userId: { type: 'STRING', description: 'The ID of the user to update.' },
          field: {
            type: 'STRING',
            description: 'The profile field to update. Must be one of the available field slugs.',
            enum: allProfileFields,
          },
          value: { type: 'STRING', description: 'The new value for the field.' },
        },
        required: ['userId', 'field', 'value'],
      },
    },
  ];

  return [{ functionDeclarations: [...functionDeclarations, ...legacyDeclarations] }];
};

/**
 * Sends a prompt to the Gemini API with the defined tools and returns the model's response.
 */
export const callGeminiWithTools = async (
  prompt: string,
  tools: unknown[],
  _apiKey: string,
  auth: { apiToken?: string; apiDomain?: string } = {}
) => {
  const { apiToken, apiDomain } = auth;
  const proxyUrl = getGeminiProxyUrl();

  const body = {
    apiToken,
    apiDomain,
    model: 'gemini-1.5-pro-latest',
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    tools: tools,
    generationConfig: {
      temperature: 0.1,
    },
  };

  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json() as { error?: { message?: string } };
    throw new Error(`Gemini API failed: ${errorData.error?.message || response.statusText}`);
  }

  return response.json();
};
