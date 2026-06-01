/**
 * Shared types for automation operation functions.
 */

/**
 * Status pushed by the blog/LinkedIn scrapers to drive the in-extension
 * instruction banner. Cleared (null) when the scrape completes or aborts.
 *
 * `boundShortcut` is whatever Chrome currently has bound for the command —
 * null if unbound. The banner reads this directly instead of hardcoding key
 * combos in the UI string.
 */
export interface ScrapePrompt {
  type: 'blog' | 'linkedin';
  url: string;
  menuLabel: string;
  boundShortcut: string | null;
}

/** The execution context passed to every operation function. */
export interface OperationContext {
  apiToken: string;
  apiDomain: string;
  branchId?: string;
  adminUserId?: string;
  onProgress?: (msg: string) => void;
  /**
   * Optional callback that drives the in-extension scrape-instruction banner.
   * Called with a prompt object when the scrape tab opens, and `null` when
   * the scrape finishes (success or error).
   */
  onScrapeStatusChange?: (prompt: ScrapePrompt | null) => void;
  /** Pre-fetched groups, used by some operations to avoid redundant API calls. */
  groups?: unknown[];
  /** Pre-fetched users, used by some operations to avoid redundant API calls. */
  users?: unknown[];
  /** Pre-fetched profile fields. */
  profileFields?: unknown[];
  /** Selected users for chat/comment automation. */
  selectedUsers?: unknown[];
  /** Pre-fetched admin user object. */
  adminUser?: unknown;
  /** Optional slug override for shared demo password lookup. */
  slug?: string;
}
