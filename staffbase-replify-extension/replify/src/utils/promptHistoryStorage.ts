// utils/promptHistoryStorage.ts
const STORAGE_KEY = "savedPromptHistory";
const MAX_HISTORY_ITEMS = 4;

export interface PromptHistoryItem {
  id: string;
  timestamp: number;
  [key: string]: unknown;
}

/**
 * Loads the array of saved prompt history from browser's local storage.
 */
export const loadPromptHistoryFromStorage = (): PromptHistoryItem[] => {
  try {
    const serialized = localStorage.getItem(STORAGE_KEY);
    if (serialized === null) {
      return [];
    }

    const parsed: unknown = JSON.parse(serialized);
    return Array.isArray(parsed) ? (parsed as PromptHistoryItem[]) : [];
  } catch (err) {
    console.error("Error loading prompt history from storage:", err);
    return [];
  }
};

/**
 * Saves the array of prompt history to the browser's local storage.
 * Keeps only the most recent MAX_HISTORY_ITEMS items.
 */
export const savePromptHistoryToStorage = (history: PromptHistoryItem[]): void => {
  try {
    // Keep only the last MAX_HISTORY_ITEMS
    const trimmed = history.slice(0, MAX_HISTORY_ITEMS);
    const serialized = JSON.stringify(trimmed);
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (err) {
    console.error("Error saving prompt history to storage:", err);
  }
};

/**
 * Adds a new prompt to the history, keeping only the last MAX_HISTORY_ITEMS.
 */
export const addPromptToHistory = (
  promptData: Record<string, unknown>
): PromptHistoryItem[] => {
  const current = loadPromptHistoryFromStorage();
  const newItem: PromptHistoryItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: Date.now(),
    ...promptData,
  };

  const updated = [newItem, ...current].slice(0, MAX_HISTORY_ITEMS);
  savePromptHistoryToStorage(updated);
  return updated;
};
