/**
 * Inject and run a function in the active page context (for CSRF-sensitive calls)
 * @param {Function} func - function to run in page context
 * @param {Array} args - arguments for the function
 */
export const runInPageContext = async ({
  func,
  args = [],
}: {
  func: (...args: unknown[]) => unknown;
  args?: unknown[];
}) => {
  try {
    if (!chrome?.scripting) {
      console.warn('[tabInjection] chrome.scripting not available');
      return { ok: false, error: 'chrome.scripting not available' };
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      console.warn('[tabInjection] No active tab found');
      return { ok: false, error: 'No active tab' };
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: false },
      func,
      args,
    });

    return result;
  } catch (err) {
    console.warn('[tabInjection] Failed to run in page context:', err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};
