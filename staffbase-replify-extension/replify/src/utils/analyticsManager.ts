export interface AnalyticsState {
  news: boolean;
  hashtags: boolean;
  search: boolean;
  campaigns: boolean;
  posts: boolean;
  email: boolean;
  dashboard: boolean;
  user: boolean;
  chat: boolean;
  pages: boolean;
  editorial: boolean;
  governance: boolean;
  numberOfEmployees: number;
  allowAllStaffbase: boolean;
  allowedDomains: string[];
}

export type AnalyticsToggleKey = keyof Omit<
  AnalyticsState,
  "numberOfEmployees" | "allowAllStaffbase" | "allowedDomains"
>;

type ResponseSetter = (message: string) => void;
type AnalyticsStateSetter = (state: AnalyticsState) => void;

export const manageAnalyticsScriptInPage = async (
  _id: string,
  _enable: boolean,
  setResp: ResponseSetter = () => {}
): Promise<void> => {
  setResp(
    "✅ Analytics toggle synced. Content scripts will handle injection on next page."
  );
};

export const handleToggleAnalyticsChange = async (
  id: AnalyticsToggleKey,
  enabled: boolean,
  curState: AnalyticsState,
  setState: AnalyticsStateSetter,
  setResp: ResponseSetter
): Promise<void> => {
  const newState: AnalyticsState = { ...curState, [id]: enabled };
  setState(newState);
  chrome.storage?.local?.set({ redirectAnalyticsState: newState });
  await manageAnalyticsScriptInPage(id, enabled, setResp);
};
