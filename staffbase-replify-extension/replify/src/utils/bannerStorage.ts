type BannerStateCallback = (isMinimized: boolean) => void;

export const loadBannerState = (callback: BannerStateCallback): void => {
  if (chrome?.storage?.local) {
    chrome.storage.local.get(["isBannerMinimized"]).then((result: Record<string, unknown>) => {
      callback(Boolean(result.isBannerMinimized));
    }).catch(() => callback(false));
    return;
  }

  console.warn("chrome.storage.local not found. Defaulting banner state.");
  callback(false);
};

export const saveBannerState = (isMinimized: boolean): void => {
  if (chrome?.storage?.local) {
    chrome.storage.local.set({ isBannerMinimized: isMinimized });
  }
};
