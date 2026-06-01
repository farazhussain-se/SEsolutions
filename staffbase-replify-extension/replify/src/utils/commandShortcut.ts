/**
 * Helpers around chrome.commands — read what the user actually has bound
 * (or nothing) without hardcoding modifier strings in the UI.
 *
 * Chrome doesn't expose a way for an extension to FORCE a keybinding; we can
 * only suggest one via manifest.json's `suggested_key`. On a fresh install
 * the suggestion is honored if free; on an extension UPDATE that adds new
 * commands, Chrome silently leaves them unbound. So we read the live state
 * each time we want to display a shortcut.
 */

export type CommandName = 'scrape-blog' | 'scrape-linkedin';

const SHORTCUT_CACHE = new Map<CommandName, string>();

/**
 * Returns the user's currently-bound shortcut for a Replify command, or
 * `null` if Chrome doesn't have one. Cached per-session because the
 * binding can't change while the side panel is open without a reload.
 */
export const getBoundShortcut = async (name: CommandName): Promise<string | null> => {
  if (SHORTCUT_CACHE.has(name)) {
    const cached = SHORTCUT_CACHE.get(name);
    return cached ? cached : null;
  }
  try {
    const all = await chrome.commands.getAll();
    const match = all.find((c) => c.name === name);
    const shortcut = (match?.shortcut || '').trim();
    SHORTCUT_CACHE.set(name, shortcut);
    return shortcut || null;
  } catch {
    return null;
  }
};

/** Clear the cache (used on reload-driven flows; rarely needed). */
export const clearShortcutCache = (): void => {
  SHORTCUT_CACHE.clear();
};
