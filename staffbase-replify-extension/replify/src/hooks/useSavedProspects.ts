// hooks/useSavedProspects.ts
import { useState, useEffect } from "react";
import {
  loadProspectsFromStorage,
  saveProspectsToStorage,
  type StoredProspect,
} from "../utils/prospectStorage";

type ProspectUpdater =
  | StoredProspect[]
  | ((prev: StoredProspect[]) => StoredProspect[]);

export default function useSavedProspects(): [
  StoredProspect[],
  (updater: ProspectUpdater) => void,
] {
  const [prospects, setProspects] = useState<StoredProspect[]>([]);

  useEffect(() => {
    setProspects(loadProspectsFromStorage());
  }, []);

  const updateProspects = (updater: ProspectUpdater) => {
    setProspects((prev) => {
      const nextState =
        typeof updater === "function" ? updater(prev) : updater;
      saveProspectsToStorage(nextState);
      return nextState;
    });
  };

  return [prospects, updateProspects];
}
