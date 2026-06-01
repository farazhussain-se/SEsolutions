import { useEffect, useState } from "react";
import {
  loadPromptHistoryFromStorage,
  savePromptHistoryToStorage,
} from "../utils/promptHistoryStorage";

const MAX_HISTORY_ITEMS = 4;

export interface PromptHistoryEntry {
  id: string;
  timestamp: number;
  [key: string]: unknown;
}

type PromptHistoryUpdater =
  | PromptHistoryEntry[]
  | ((previous: PromptHistoryEntry[]) => PromptHistoryEntry[]);

export default function useSavedPromptHistory(): [
  PromptHistoryEntry[],
  (updater: PromptHistoryUpdater) => void,
  (promptData: Record<string, unknown>) => string
] {
  const [promptHistory, setPromptHistory] = useState<PromptHistoryEntry[]>([]);

  useEffect(() => {
    setPromptHistory(loadPromptHistoryFromStorage());
  }, []);

  const updatePromptHistory = (updater: PromptHistoryUpdater) => {
    setPromptHistory((prev) => {
      const nextState = typeof updater === "function" ? updater(prev) : updater;
      const trimmed = nextState.slice(0, MAX_HISTORY_ITEMS);
      savePromptHistoryToStorage(trimmed);
      return trimmed;
    });
  };

  const addToHistory = (promptData: Record<string, unknown>) => {
    const newItem: PromptHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      ...promptData,
    };
    updatePromptHistory((prev) => [newItem, ...prev]);
    return newItem.id;
  };

  return [promptHistory, updatePromptHistory, addToHistory];
}