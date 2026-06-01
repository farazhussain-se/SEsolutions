// Local ambient typings for the extension runtime.
//
// We keep this file narrower than @types/chrome on purpose:
// - the app mostly uses promise-based Chrome APIs
// - a few APIs differ from the upstream typings in ways that better match our code
// - it gives us a single place to document the subset of chrome.* this popup uses
interface ChromeStorageLocal {
  // Storage reads are modeled as promises because that is how the app uses them.
  get: (keys: string | string[] | Record<string, unknown>) => Promise<Record<string, unknown>>;
  // Chrome's MV3 storage APIs return promises (the callback overload still
  // exists for backward compat); we model the promise form so `await` works.
  set: (items: Record<string, unknown>, callback?: () => void) => Promise<void>;
  remove: (keys: string | string[], callback?: () => void) => Promise<void>;
}

interface ChromeTabsApi {
  query: (queryInfo: {
    active: boolean;
    currentWindow: boolean;
  }) => Promise<Array<{ id?: number; url?: string }>>;
  create: (createProperties: {
    url?: string;
    active?: boolean;
  }) => Promise<{ id?: number; url?: string }>;
  update: (
    tabId: number,
    updateProperties: {
      url?: string;
      active?: boolean;
    }
  ) => Promise<{ id?: number; url?: string }>;
  remove: (tabId: number) => Promise<void>;
  reload: (tabId: number, reloadProperties?: { bypassCache?: boolean }) => Promise<void>;
  onActivated: {
    addListener: (callback: () => void) => void;
    removeListener: (callback: () => void) => void;
  };
  onUpdated: {
    addListener: (
      callback: (tabId: number, changeInfo: { status?: string }) => void | Promise<void>
    ) => void;
    removeListener: (
      callback: (tabId: number, changeInfo: { status?: string }) => void | Promise<void>
    ) => void;
  };
}

interface ChromeWindowsApi {
  create: (createData: {
    url?: string;
    type?: string;
    width?: number;
    height?: number;
  }) => Promise<{ tabs?: Array<{ id?: number; url?: string }> }>;
}

interface ChromeScriptingApi {
  executeScript: (injection: {
    target: { tabId: number; allFrames?: boolean };
    func?: (...args: unknown[]) => unknown;
    args?: unknown[];
    files?: string[];
    world?: "ISOLATED" | "MAIN";
  }) => Promise<Array<{ result: unknown }>>;
}

interface ChromeContextMenusApi {
  update: (
    id: string,
    updateProperties: {
      visible?: boolean;
      title?: string;
      enabled?: boolean;
    }
  ) => Promise<void>;
}

interface ChromeCommandsApi {
  // Returns the registered commands. `shortcut` is empty string when unbound.
  getAll: () => Promise<Array<{ name?: string; shortcut?: string; description?: string }>>;
}

declare const chrome: {
  commands: ChromeCommandsApi;
  contextMenus: ChromeContextMenusApi;
  storage: {
    local: ChromeStorageLocal;
  };
  runtime: {
    lastError?: {
      message?: string;
    };
    getURL: (path: string) => string;
    onMessage: {
      addListener: (callback: (message: Record<string, unknown>) => void) => void;
      removeListener: (callback: (message: Record<string, unknown>) => void) => void;
    };
  };
  tabs: ChromeTabsApi;
  windows: ChromeWindowsApi;
  scripting: ChromeScriptingApi;
};
