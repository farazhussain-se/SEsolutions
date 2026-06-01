// utils/prospectStorage.ts

export interface StoredProspect {
  [key: string]: unknown;
}

/**
 * Loads the array of saved prospects from browser's local storage.
 * @returns The array of prospects, or an empty array if none are found.
 */
export const loadProspectsFromStorage = (): StoredProspect[] => {
  try {
    const serializedProspects = localStorage.getItem("savedProspects");
    if (serializedProspects === null) {
      return [];
    }

    const parsed: unknown = JSON.parse(serializedProspects);
    return Array.isArray(parsed) ? (parsed as StoredProspect[]) : [];
  } catch (err) {
    console.error("Error loading prospects from storage:", err);
    return [];
  }
};

/**
 * Saves the array of prospects to the browser's local storage.
 */
export const saveProspectsToStorage = (prospects: StoredProspect[]): void => {
  try {
    const serializedProspects = JSON.stringify(prospects);
    localStorage.setItem("savedProspects", serializedProspects);
  } catch (err) {
    console.error("Error saving prospects to storage:", err);
  }
};
