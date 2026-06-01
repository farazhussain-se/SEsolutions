// components/TabValidationBanner.tsx
import { getStatusBannerStyle } from "../styles";

interface TabValidationState {
  status: "ok" | "error" | "idle" | "checking";
  message: string;
}

interface TabValidationBannerProps {
  tabValidation?: TabValidationState;
  onRevalidate?: () => void;
}

const defaultTabValidation: TabValidationState = {
  status: "idle",
  message: "",
};

export default function TabValidationBanner({
  tabValidation = defaultTabValidation,
  onRevalidate,
}: TabValidationBannerProps) {
  if (tabValidation.status === "ok") return null;

  const statusForStyle =
    tabValidation.status === "checking" ? "idle" : tabValidation.status;
  const style = getStatusBannerStyle(statusForStyle);

  return (
    <div style={style}>
      <span>
        {tabValidation.status === "checking" && "⏳ Checking login status..."}
        {tabValidation.status === "error" && `⚠️ ${tabValidation.message}`}
        {tabValidation.status === "idle" &&
          "⚠️ Make sure you're logged into this environment in your browser tab, then click Check now."}
      </span>
      {tabValidation.status !== "checking" && onRevalidate && (
        <button
          onClick={onRevalidate}
          style={{
            fontSize: 11,
            background: "none",
            border: "none",
            cursor: "pointer",
            textDecoration: "underline",
            color: "inherit",
            padding: 0,
            flexShrink: 0,
          }}
        >
          Check now
        </button>
      )}
    </div>
  );
}
