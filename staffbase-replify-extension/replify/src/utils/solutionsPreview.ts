export function isContentPageUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    return /\/content\/page\/[a-f0-9]+/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function injectOrUpdateEmbeddedBlock(url: string): { ok: boolean; action: string } {
  const wrapper = document.querySelector(".fullscreen-preview-wrapper");
  if (!wrapper) return { ok: false, action: "no-wrapper" };

  const existing = wrapper.querySelector("embedded-block");
  if (existing) {
    existing.setAttribute("url", url);
    const iframe = existing.querySelector("iframe") as HTMLIFrameElement | null;
    if (iframe) iframe.src = url;
    return { ok: true, action: "updated" };
  }

  const section = document.createElement("section");
  section.className =
    "rich-text sbx-rich-text__richtext--text sbx-rich-text flex flex-col w-full gap-4 p-6 rounded-xl";
  section.setAttribute("data-widget-type", "rich-text");
  section.setAttribute("data-plugin-id", "rich-text");
  section.innerHTML = `<embedded-block data-widget-type="embedded-block" data-plugin-id="embedded-block" url="${url}" scrolling="true"><div class="embedded-block__outer"><div class="embedded-block__inner"><iframe class="embedded-block__iframe" src="${url}" frameborder="0" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" allow="fullscreen" scrolling="auto" style="pointer-events: auto;"></iframe></div></div></embedded-block>`;

  wrapper.insertBefore(section, wrapper.firstChild);
  return { ok: true, action: "injected" };
}

export async function previewSolutionsInPage(url: string): Promise<{ ok: boolean; action?: string; error?: string }> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return { ok: false, error: "No active tab" };

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: false },
      func: injectOrUpdateEmbeddedBlock as unknown as (...args: unknown[]) => unknown,
      args: [url],
    });

    return (result as { ok: boolean; action: string }) ?? { ok: false, error: "No result" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
