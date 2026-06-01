import { useCallback, useEffect, useState } from "react";
import {
  type AnalyticsState,
  type AnalyticsToggleKey,
  handleToggleAnalyticsChange as utilToggle,
  manageAnalyticsScriptInPage,
} from "../utils/analyticsManager";

type GeneralOptionKey = "numberOfEmployees" | "allowAllStaffbase" | "allowedDomains";

interface UseAnalyticsRedirectsReturn {
  redirectState: AnalyticsState;
  analyticsResponse: string;
  handleToggleRedirect: (id: string, enabled: boolean) => void;
  handleToggleGeneralOption: (
    id: GeneralOptionKey,
    value: boolean | number | string[]
  ) => void;
  setAllowedDomains: (domains: string[]) => void;
  isLoading: boolean;
  handleNumberOfEmployeesChange: (value: string) => void;
}

const ANALYTIC_KEYS: AnalyticsToggleKey[] = [
  "news",
  "hashtags",
  "search",
  "campaigns",
  "posts",
  "email",
  "dashboard",
  "user",
  "chat",
  "pages",
  "editorial",
  "governance",
];

const getDefaultAnalyticsState = (): AnalyticsState => ({
  news: false,
  hashtags: false,
  search: false,
  campaigns: false,
  posts: false,
  email: false,
  dashboard: false,
  user: false,
  chat: false,
  pages: false,
  editorial: false,
  governance: false,
  numberOfEmployees: 5000,
  allowAllStaffbase: false,
  allowedDomains: [],
});

export default function useAnalyticsRedirects(): UseAnalyticsRedirectsReturn {
  const [redirectState, setRedirectState] = useState<AnalyticsState>(
    getDefaultAnalyticsState()
  );
  const [analyticsResponse, setAnalyticsResponse] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);

    if (chrome.storage?.local) {
      chrome.storage.local.get(["redirectAnalyticsState"]).then((result) => {
        const defaultState = getDefaultAnalyticsState();
        const storedState = result.redirectAnalyticsState;

        if (storedState && typeof storedState === "object") {
          setRedirectState({
            ...defaultState,
            ...(storedState as Partial<AnalyticsState>),
          });
        } else {
          setRedirectState(defaultState);
        }

        setIsLoading(false);
      }).catch(() => {
        setIsLoading(false);
      });
      return;
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isLoading) {
      void (async () => {
        for (const id of ANALYTIC_KEYS) {
          if (redirectState[id]) {
            await manageAnalyticsScriptInPage(id, true, setAnalyticsResponse);
          }
        }
      })();
    }
  }, [redirectState, isLoading]);

  const handleToggleRedirect = useCallback(
    (id: string, enabled: boolean) => {
      if ((ANALYTIC_KEYS as string[]).includes(id)) {
        setRedirectState((prevState) => {
          const key = id as AnalyticsToggleKey;
          const newState: AnalyticsState = {
            ...prevState,
            [key]: enabled,
          };

          void utilToggle(key, enabled, newState, () => {}, setAnalyticsResponse);
          return newState;
        });
      }
    },
    [setAnalyticsResponse]
  );

  const handleToggleGeneralOption = useCallback(
    (id: GeneralOptionKey, value: boolean | number | string[]) => {
      setRedirectState((prevState) => {
        const newState = { ...prevState, [id]: value } as AnalyticsState;
        chrome.storage?.local?.set({ redirectAnalyticsState: newState });
        return newState;
      });
    },
    []
  );

  const setAllowedDomains = useCallback((domains: string[] = []) => {
    const safeDomains = Array.isArray(domains) ? domains : [];
    setRedirectState((prevState) => {
      const newState: AnalyticsState = {
        ...prevState,
        allowedDomains: safeDomains,
      };
      chrome.storage?.local?.set({ redirectAnalyticsState: newState });
      return newState;
    });
  }, []);

  const handleNumberOfEmployeesChange = useCallback((value: string) => {
    const numValue = parseInt(value, 10);
    if (!Number.isNaN(numValue)) {
      setRedirectState((prevState) => ({
        ...prevState,
        numberOfEmployees: numValue,
      }));
    }
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (redirectState.numberOfEmployees && !isLoading) {
        chrome.storage?.local?.set({ redirectAnalyticsState: redirectState });
      }
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [redirectState.numberOfEmployees, isLoading, redirectState]);

  return {
    redirectState,
    analyticsResponse,
    handleToggleRedirect,
    handleToggleGeneralOption,
    setAllowedDomains,
    isLoading,
    handleNumberOfEmployeesChange,
  };
}
