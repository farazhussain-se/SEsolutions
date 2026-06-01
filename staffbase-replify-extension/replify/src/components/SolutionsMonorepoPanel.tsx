import { useState } from "react";
import { colors } from "../styles/colors";
import { subDescriptionStyle } from "../styles";
import IntegrationsCatalogue from "./IntegrationsCatalogue";
import GlobalJSPanel from "./GlobalJSPanel";

type Tab = "widgets" | "globaljs";

interface SolutionsMonorepoPanelProps {
  staffbaseToken: string;
  tabUrl: string | null;
  apiDomain: string;
  isOnContentPage?: boolean;
  onPreviewInPage?: (url: string) => void;
}

const tabBarStyle: React.CSSProperties = {
  display: "flex",
  gap: 4,
  borderBottom: `1px solid ${colors.border}`,
  marginBottom: 12,
};

const tabButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: "8px 14px",
  background: "none",
  border: "none",
  borderBottom: active ? `2px solid ${colors.primary}` : "2px solid transparent",
  color: active ? colors.primary : colors.textMuted,
  fontWeight: active ? 600 : 500,
  fontSize: 13,
  cursor: "pointer",
  marginBottom: -1,
});

const introStyle: React.CSSProperties = {
  ...subDescriptionStyle,
  marginBottom: 12,
};

export default function SolutionsMonorepoPanel({
  staffbaseToken,
  tabUrl,
  apiDomain,
  isOnContentPage,
  onPreviewInPage,
}: SolutionsMonorepoPanelProps) {
  const [tab, setTab] = useState<Tab>("widgets");

  return (
    <div>
      <p style={introStyle}>
        Live widgets and JS snippets from <code>Staffbase/solutions-monorepo</code>.
        Widgets are embeddable URLs you paste into Custom Widgets in the studio.
        Global JS snippets inject directly into the current Staffbase tab.
      </p>
      <div style={tabBarStyle}>
        <button
          type="button"
          style={tabButtonStyle(tab === "widgets")}
          onClick={() => setTab("widgets")}
        >
          Widgets
        </button>
        <button
          type="button"
          style={tabButtonStyle(tab === "globaljs")}
          onClick={() => setTab("globaljs")}
        >
          Global JS
        </button>
      </div>
      {tab === "widgets" ? (
        <IntegrationsCatalogue
          isOnContentPage={isOnContentPage}
          onPreviewInPage={onPreviewInPage}
        />
      ) : (
        <GlobalJSPanel
          staffbaseToken={staffbaseToken}
          tabUrl={tabUrl}
          apiDomain={apiDomain}
        />
      )}
    </div>
  );
}
