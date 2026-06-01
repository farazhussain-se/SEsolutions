// hooks/useSavedDemos.ts
// This hook manages saved demos in local storage.

import { useEffect, useState } from "react";

type SavedDemo = Record<string, unknown>;
type DemoUpdater =
  | SavedDemo[]
  | ((prev: SavedDemo[]) => SavedDemo[]);

export default function useSavedDemos(): [
  SavedDemo[],
  (updater: DemoUpdater) => void,
] {
  const [demos, setDemos] = useState<SavedDemo[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem("savedDemos");
    if (!raw) return;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setDemos(parsed as SavedDemo[]);
      }
    } catch {
      setDemos([]);
    }
  }, []);

  const updateDemos = (updater: DemoUpdater) => {
    setDemos((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      localStorage.setItem("savedDemos", JSON.stringify(next));
      return next;
    });
  };

  return [demos, updateDemos];
}
