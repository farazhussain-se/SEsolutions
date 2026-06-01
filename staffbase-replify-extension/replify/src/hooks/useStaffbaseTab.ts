import { useEffect, useState } from "react";
import { STAFFBASE_DOMAINS } from "../constants/appConstants";

export interface StaffbaseTabState {
  isStaffbaseTab: boolean;
  tabUrl: string | null;
}

export default function useStaffbaseTab(): StaffbaseTabState {
  const [state, setState] = useState<StaffbaseTabState>({ isStaffbaseTab: false, tabUrl: null });

  useEffect(() => {
    const checkActiveTab = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const url = tab?.url ?? null;
        const host = url ? new URL(url).hostname : "";
        const isStaffbaseTab = STAFFBASE_DOMAINS.some((domain) => host.endsWith(domain));
        setState({ isStaffbaseTab, tabUrl: url });
      } catch {
        setState({ isStaffbaseTab: false, tabUrl: null });
      }
    };

    const check = () => { void checkActiveTab(); };

    check();
    chrome.tabs.onActivated.addListener(check);
    chrome.tabs.onUpdated.addListener(check);

    return () => {
      chrome.tabs.onActivated.removeListener(check);
      chrome.tabs.onUpdated.removeListener(check);
    };
  }, []);

  return state;
}
