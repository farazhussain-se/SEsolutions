/**
 * User operations - atomic functions for user profile management
 */

import { buildApiUrl, fetchUsers, fetchProfileFields, findPrimaryEmail } from './environment';
import type { OperationContext } from './types';

type UserRecord = {
  id?: string;
  _id?: string;
  externalID?: string;
  externalId?: string;
  branchRole?: string;
  email?: string;
  emails?: { value?: string; primary?: boolean }[];
  firstName?: string;
  username?: string;
  profile?: Record<string, unknown>;
};

/**
 * Get users matching criteria
 * @param {Object} args - { userIds, userEmails, userCount, excludeAdmins }
 * @param {Object} ctx - context
 */
export const selectUsers = async (
  args: {
    userIds?: string[];
    userEmails?: string[];
    users?: UserRecord[];
    userCount?: number;
    selectionStrategy?: string;
    excludeAdmins?: boolean;
  },
  ctx: OperationContext
) => {
  // Normalize all array inputs to ensure they're never null/undefined
  const userIds = Array.isArray(args.userIds) ? args.userIds : [];
  const userEmails = Array.isArray(args.userEmails) ? args.userEmails : [];
  const users = Array.isArray(args.users) ? args.users : [];
  const userCount = args.userCount ?? 8;
  const selectionStrategy = args.selectionStrategy || 'first'; // 'first' or 'random'
  const excludeAdmins = args.excludeAdmins ?? true; // Default to excluding ALL admins

  const { onProgress } = ctx;

  const normalise = (val: unknown) => (val || '').toString().toLowerCase().trim();
  const hasExplicitTargets = userIds.length > 0 || userEmails.length > 0 || users.length > 0;

  // Fetch all users
  const { users: allUsers } = await fetchUsers({ limit: 200 }, ctx);
  onProgress?.(`Found ${allUsers.length} users in environment`);

  const allUsersTyped = allUsers as UserRecord[];
  const shouldExcludeAdmins = excludeAdmins && !hasExplicitTargets;

  // Filter out admins if requested (applies to all selection modes)
  const eligibleUsers = shouldExcludeAdmins
    ? allUsersTyped.filter((u) => u.branchRole !== 'WeBranchAdminRole')
    : allUsersTyped;

  if (shouldExcludeAdmins) {
    const adminCount = allUsersTyped.length - eligibleUsers.length;
    if (adminCount > 0) {
      onProgress?.(`Excluding ${adminCount} admin user(s)`);
    }
  } else if (excludeAdmins && hasExplicitTargets) {
    onProgress?.('Skipping admin exclusion for explicit target list');
  }

  let selectedUsers: UserRecord[];

  const targetIds = [
    ...userIds,
    ...users.map((u) => u.id).filter(Boolean),
  ].map(normalise);

  const targetEmails = [
    ...userEmails,
    ...users.map((u) => u.email).filter(Boolean),
  ].map(normalise);

  const userMatchesTargets = (user: UserRecord) => {
    const possibleIds = [user.id, user._id, user.externalID, user.externalId].map(normalise).filter(Boolean);
    const possibleEmails = new Set([
      findPrimaryEmail(user),
      user.email,
      ...(Array.isArray(user.emails) ? user.emails.map((e) => e?.value) : []),
    ].map(normalise).filter(Boolean));

    const idMatch = targetIds.some((id) => possibleIds.includes(id));
    const emailMatch = targetEmails.some((email) => possibleEmails.has(email));
    return idMatch || emailMatch;
  };

  if (userIds.length > 0) {
    selectedUsers = eligibleUsers.filter((u) => {
      const possibleIds = [u.id, u._id, u.externalID, u.externalId].map(normalise).filter(Boolean);
      return targetIds.some((id) => possibleIds.includes(id));
    });
    onProgress?.(`Selected ${selectedUsers.length} users by ID (matched against id/_id/externalId)`);
  } else if (userEmails.length > 0) {
    selectedUsers = eligibleUsers.filter((u) => {
      const possibleEmails = new Set([
        findPrimaryEmail(u),
        u.email,
        ...(Array.isArray(u.emails) ? u.emails.map((e) => e?.value) : []),
      ].map(normalise).filter(Boolean));
      return targetEmails.some((email) => possibleEmails.has(email));
    });
    onProgress?.(`Selected ${selectedUsers.length} users by email (primary + fallback emails)`);
  } else if (Array.isArray(users) && users.length > 0) {
    selectedUsers = eligibleUsers.filter(userMatchesTargets);
    onProgress?.(`Selected ${selectedUsers.length} users from explicit list (targets: ids=${targetIds.length}, emails=${targetEmails.length})`);
  } else {
    // Count-based selection (first N or random N)
    if (selectionStrategy === 'random') {
      const shuffled = [...eligibleUsers].sort(() => Math.random() - 0.5);
      selectedUsers = shuffled.slice(0, userCount);
      onProgress?.(`Randomly selected ${selectedUsers.length} non-admin users`);
    } else {
      selectedUsers = eligibleUsers.slice(0, userCount);
      onProgress?.(`Selected first ${selectedUsers.length} non-admin users`);
    }
  }

  return { users: selectedUsers };
};

/**
 * Update a single user's profile field
 * @param {Object} args - { userId, field, value }
 * @param {Object} ctx - context
 */
export const updateUserField = async (
  args: { userId: string; field: string; value: unknown; userName?: string },
  ctx: OperationContext
) => {
  const { userId, field, value, userName } = args;
  const { apiToken, apiDomain, adminUserId, onProgress } = ctx;

  const headers: Record<string, string> = {
    Authorization: `Basic ${apiToken}`,
    'Content-Type': 'application/json',
  };
  if (adminUserId) headers['USERID'] = adminUserId;

  const resp = await fetch(buildApiUrl(`/api/users/${userId}`, apiDomain), {
    method: 'PUT',
    mode: 'cors',
    credentials: 'omit',
    headers,
    body: JSON.stringify({ profile: { [field]: value } }),
  });

  if (resp.ok) {
    onProgress?.(`Updated ${userName || userId}: ${field} = "${value}"`);
    return { success: true, userId, field, value };
  } else {
    const txt = await resp.text();
    onProgress?.(`Failed to update ${userName || userId}: ${resp.status} ${txt}`);
    return { success: false, userId, error: txt };
  }
};

/**
 * Update multiple fields on a single user
 * @param {Object} args - { userId, profile }
 * @param {Object} ctx - context
 */
export const updateUserProfile = async (
  args: { userId: string; profile: Record<string, unknown>; userName?: string },
  ctx: OperationContext
) => {
  const { userId, profile, userName } = args;
  const { apiToken, apiDomain, adminUserId, onProgress } = ctx;

  const headers: Record<string, string> = {
    Authorization: `Basic ${apiToken}`,
    'Content-Type': 'application/json',
  };
  if (adminUserId) headers['USERID'] = adminUserId;

  const resp = await fetch(buildApiUrl(`/api/users/${userId}`, apiDomain), {
    method: 'PUT',
    mode: 'cors',
    credentials: 'omit',
    headers,
    body: JSON.stringify({ profile }),
  });

  if (resp.ok) {
    const fields = Object.keys(profile).join(', ');
    onProgress?.(`Updated ${userName || userId}: ${fields}`);
    return { success: true, userId, updatedFields: Object.keys(profile) };
  } else {
    const txt = await resp.text();
    onProgress?.(`Failed to update ${userName || userId}: ${resp.status}`);
    return { success: false, userId, error: txt };
  }
};

/**
 * Validate field slugs against available profile fields
 * @param {Object} args - { fields } - array of field names/slugs to validate
 * @param {Object} ctx - context
 */
export const validateProfileFields = async (
  args: { fields: string[] },
  ctx: OperationContext
) => {
  const { fields } = args;
  const { onProgress } = ctx;

  const { profileFields } = await fetchProfileFields({}, ctx);
  onProgress?.(`Found ${profileFields.length} profile fields`);

  const normalise = (val: unknown) => (val || '').toString().toLowerCase().trim();

  const validatedFields = fields.map((requestedField: string) => {
    const requested = normalise(requestedField);
    const matched = profileFields.find((f) =>
      normalise(f.slug) === requested ||
      normalise(f.title) === requested
    );

    return {
      requested: requestedField,
      slug: matched?.slug || null,
      valid: !!matched,
    };
  });

  return { validatedFields, availableFields: profileFields };
};

/**
 * Validate that user IDs/emails look legitimate (not hallucinated)
 * Hallucinated IDs are often short numbers like "67890" or generic emails like "user@example.com"
 */
const isLikelyHallucinatedUserData = (
  users: UserRecord[],
  userIds: string[],
  userEmails: string[]
) => {
  // Check for obvious hallucination patterns
  const suspiciousIdPattern = /^[0-9]{4,6}$/; // Short numeric IDs like "67890"
  const suspiciousEmailPattern = /@example\.(com|org|net)$/i; // example.com emails

  const usersArray = Array.isArray(users) ? users : [];
  const idsArray = Array.isArray(userIds) ? userIds : [];
  const emailsArray = Array.isArray(userEmails) ? userEmails : [];

  // Check user objects
  for (const u of usersArray) {
    if (u?.id && suspiciousIdPattern.test(u.id)) return true;
    if (u?.email && suspiciousEmailPattern.test(u.email)) return true;
  }

  // Check raw IDs
  for (const id of idsArray) {
    if (suspiciousIdPattern.test(id)) return true;
  }

  // Check raw emails
  for (const email of emailsArray) {
    if (suspiciousEmailPattern.test(email)) return true;
  }

  return false;
};

/**
 * Update fields on multiple users
 * @param {Object} args - { fieldUpdates, userCount, userIds, userEmails }
 * @param {Object} ctx - context
 */
export const updateUserFields = async (
  args: {
    fieldUpdates?: { slug?: string; field?: string; values?: unknown[]; value?: unknown }[];
    userCount?: number;
    userIds?: string[];
    userEmails?: string[];
    users?: UserRecord[];
    selectionStrategy?: string;
  },
  ctx: OperationContext
) => {
  // Normalize all array inputs to ensure they're never null/undefined
  let fieldUpdates = Array.isArray(args.fieldUpdates) ? args.fieldUpdates : [];
  const userCount = args.userCount ?? 8;
  let userIds = Array.isArray(args.userIds) ? args.userIds : [];
  let userEmails = Array.isArray(args.userEmails) ? args.userEmails : [];
  let users = Array.isArray(args.users) ? args.users : [];
  const selectionStrategy = args.selectionStrategy || 'first';

  const { apiToken: _apiToken, apiDomain: _apiDomain, adminUserId: _adminUserId, onProgress } = ctx;

  const updates = Array.isArray(fieldUpdates) ? fieldUpdates : [];
  if (!updates.length) {
    throw new Error('No fieldUpdates provided. Include a fieldUpdates array with field + values.');
  }

  // Validate fields first
  // Prefer slug over field since Gemini may hallucinate field names but provide correct slugs
  const fieldsToValidate = updates.map((f) => f.slug || f.field || '');
  const { validatedFields, availableFields: _availableFields } = await validateProfileFields(
    { fields: fieldsToValidate },
    ctx
  );
  const validationSummary = validatedFields
    .map((v) => `${v.requested}→${v.slug || 'INVALID'}`)
    .join(', ');
  onProgress?.(`Field validation: ${validationSummary}`);

  // Check for hallucinated user data and fall back to count-based selection if detected
  const hasExplicitTargets = (Array.isArray(userIds) && userIds.length > 0) ||
    (Array.isArray(userEmails) && userEmails.length > 0) ||
    (Array.isArray(users) && users.length > 0);

  if (hasExplicitTargets && isLikelyHallucinatedUserData(users, userIds, userEmails)) {
    onProgress?.('WARNING: Detected potentially hallucinated user IDs/emails, falling back to count-based selection');
    // Clear the suspicious data and fall back to userCount
    users = [];
    userIds = [];
    userEmails = [];
  }

  // Select target users (excludeAdmins=true by default, but bypassed for explicit targets)
  onProgress?.(
    `Selecting users for update (userIds=${userIds.length}, userEmails=${userEmails.length}, explicitUsers=${users.length}, userCount=${userCount}, selectionStrategy=${selectionStrategy})`
  );
  const { users: targetUsers } = await selectUsers({
    userIds,
    userEmails,
    users,
    userCount: userIds.length || userEmails.length || users.length || userCount,
    selectionStrategy,
    excludeAdmins: true, // Note: bypassed automatically when explicit targets are provided
  }, ctx);

  if (!targetUsers.length) {
    onProgress?.('No matching users found after selection; verify IDs/emails are present in fetched users.');
    throw new Error('No matching users found for field update.');
  }

  onProgress?.(`Will update ${targetUsers.length} users`);

  const results: { success: boolean; userId?: string; updatedFields?: string[]; error?: string }[] = [];

  for (let idx = 0; idx < targetUsers.length; idx++) {
    const user = targetUsers[idx];

    // Build profile update for this user
    const profile: Record<string, unknown> = {};

    for (const update of updates) {
      // Match by the same key we used for validation (slug || field)
      const requestedKey = update.slug || update.field;
      const validated = validatedFields.find((v) => v.requested === requestedKey);
      if (!validated?.valid || !validated?.slug) {
        continue; // Skip invalid fields
      }

      // Get value for this user (cycle through values array)
      const values = Array.isArray(update.values) ? update.values : [update.value];
      const value = values[idx % values.length];

      if (value !== undefined) {
        profile[validated.slug] = value;
      }
    }

    if (Object.keys(profile).length === 0) {
      onProgress?.(`Skipping ${user.firstName || user.username || user.id}: no valid fields`);
      continue;
    }

    const result = await updateUserProfile({
      userId: user.id!,
      profile,
      userName: user.firstName || user.username,
    }, ctx);

    results.push(result);
  }

  const successCount = results.filter((r) => r.success).length;
  onProgress?.(`Updated ${successCount}/${results.length} users`);

  return {
    results,
    successCount,
    totalAttempted: results.length,
  };
};

/**
 * Generate role/position values based on company context
 * @param {Object} args - { companyName, field, count }
 * @param {Object} ctx - context
 */
export const generateFieldValues = async (
  args: { companyName?: string; field?: string; count?: number },
  ctx: OperationContext
) => {
  const { companyName = 'Company', field, count = 5 } = args;
  const { onProgress } = ctx;

  // Common position templates by industry/company type
  const POSITION_TEMPLATES: Record<string, string[]> = {
    retail: ['Store Manager', 'Sales Associate', 'Visual Merchandiser', 'Cashier', 'Inventory Specialist'],
    tech: ['Software Engineer', 'Product Manager', 'UX Designer', 'DevOps Engineer', 'QA Analyst'],
    finance: ['Financial Analyst', 'Account Manager', 'Risk Specialist', 'Compliance Officer', 'Portfolio Manager'],
    healthcare: ['Nurse', 'Medical Technician', 'Patient Coordinator', 'Lab Specialist', 'Care Manager'],
    default: ['Team Lead', 'Specialist', 'Coordinator', 'Analyst', 'Manager'],
  };

  const DEPARTMENT_TEMPLATES: Record<string, string[]> = {
    default: ['Sales', 'Marketing', 'Engineering', 'Operations', 'HR', 'Finance', 'Customer Success'],
  };

  let values: string[] = [];

  if (field === 'position' || field === 'title') {
    // Try to match company to industry
    const lowerCompany = companyName.toLowerCase();
    if (lowerCompany.includes('store') || lowerCompany.includes('retail') || lowerCompany.includes('shop')) {
      values = POSITION_TEMPLATES.retail;
    } else if (lowerCompany.includes('tech') || lowerCompany.includes('software') || lowerCompany.includes('app')) {
      values = POSITION_TEMPLATES.tech;
    } else if (lowerCompany.includes('bank') || lowerCompany.includes('finance') || lowerCompany.includes('capital')) {
      values = POSITION_TEMPLATES.finance;
    } else {
      values = POSITION_TEMPLATES.default;
    }
  } else if (field === 'department') {
    values = DEPARTMENT_TEMPLATES.default;
  }

  // Ensure we have enough values
  while (values.length < count) {
    values = [...values, ...values];
  }

  onProgress?.(`Generated ${count} values for ${field}`);

  return { field, values: values.slice(0, count) };
};
