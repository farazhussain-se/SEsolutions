import { useState } from "react";
import { brandingButtonStyle, subDescriptionStyle } from "../styles";
import { colors } from "../styles/colors";

// Kept for quick restore when SE Master demo options are re-enabled.
// const DEMO_REPLIFY_ID = "april2026semasterna";
// const HIDE_STANDARD_KEY = "replify-hide-standard-april2026semasterna";

type EnvironmentAction =
  | "setup"
  | "existing"
  | "users"
  | "demo"
  | "load-demo"
  | "revert"
  | "monorepo";

interface UseEnvironmentOptionsProps {
  slug: string;
  onChoose: (action: EnvironmentAction) => void;
  replifyId?: string;
  isAdminMode?: boolean;
  isDetectingId?: boolean;
  isGitHubAuthenticated?: boolean;
}

const buttonContainerStyle = {
  marginBottom: "15px",
};

export default function UseEnvironmentOptions({
  slug,
  onChoose,
  replifyId: _replifyId,
  isAdminMode: _isAdminMode = false,
  isDetectingId = false,
  isGitHubAuthenticated = false,
}: UseEnvironmentOptionsProps) {
  const [hoveredButton, setHoveredButton] = useState<EnvironmentAction | null>(
    null
  );
  // Kept for quick restore when SE Master demo options are re-enabled.
  // const [hideStandard, setHideStandard] = useState<boolean>(() => {
  //   try {
  //     return JSON.parse(localStorage.getItem(HIDE_STANDARD_KEY) || "false");
  //   } catch {
  //     return false;
  //   }
  // });
  // useEffect(() => {
  //   localStorage.setItem(HIDE_STANDARD_KEY, JSON.stringify(hideStandard));
  // }, [hideStandard]);
  // const isDemoEnv = replifyId === DEMO_REPLIFY_ID || isAdminMode;

  if (isDetectingId) {
    return (
      <div
        style={{
          marginBottom: 20,
          border: `1px solid ${colors.border}`,
          borderRadius: 4,
          padding: 15,
        }}
      >
        <p style={{ fontSize: 12, color: colors.textMuted }}>Detecting environment…</p>
      </div>
    );
  }

  return (
    <div
      style={{
        marginBottom: 20,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        padding: 15,
      }}
    >
      <p>What would you like to do with the environment "{slug}"?</p>

      {/* SE Master NA demo section — commented out
      {isDemoEnv && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            backgroundColor: colors.backgroundInfo,
            border: `1px solid ${colors.primary}`,
            borderRadius: 4,
          }}
        >
          <p style={{ margin: "0 0 10px 0", fontSize: 12, fontWeight: 600, color: colors.primary }}>
            SE Master NA 2026
          </p>
          <div style={buttonContainerStyle}>
            <button
              style={{
                ...brandingButtonStyle,
                backgroundColor: hoveredButton === "demo" ? colors.primaryLight : colors.primary,
              }}
              onClick={() => onChoose("demo")}
              onMouseEnter={() => setHoveredButton("demo")}
              onMouseLeave={() => setHoveredButton(null)}
            >
              Create Demo
            </button>
            <p style={subDescriptionStyle}>Build a branded vertical demo.</p>
          </div>
          <div style={{ ...buttonContainerStyle, marginBottom: 0 }}>
            <button
              style={{
                ...brandingButtonStyle,
                backgroundColor: hoveredButton === "load-demo" ? colors.primaryLight : colors.primary,
              }}
              onClick={() => onChoose("load-demo")}
              onMouseEnter={() => setHoveredButton("load-demo")}
              onMouseLeave={() => setHoveredButton(null)}
            >
              Load Saved Demo
            </button>
            <p style={subDescriptionStyle}>Apply a previously saved demo setup.</p>
          </div>
        </div>
      )}
      */}

      <>
          <div style={buttonContainerStyle}>
            <button
              style={{
                ...brandingButtonStyle,
                backgroundColor:
                  hoveredButton === "setup" ? colors.primaryLight : colors.primary,
              }}
              onClick={() => onChoose("setup")}
              onMouseEnter={() => setHoveredButton("setup")}
              onMouseLeave={() => setHoveredButton(null)}
            >
              Set Up
            </button>
            <p style={subDescriptionStyle}>
              Enable features like Chat, Journeys, and add integrations.
            </p>
          </div>
          <div style={buttonContainerStyle}>
            <button
              style={{
                ...brandingButtonStyle,
                backgroundColor:
                  hoveredButton === "existing"
                    ? colors.primaryLight
                    : colors.primary,
              }}
              onClick={() => onChoose("existing")}
              onMouseEnter={() => setHoveredButton("existing")}
              onMouseLeave={() => setHoveredButton(null)}
            >
              Brand
            </button>
            <p style={subDescriptionStyle}>
              Apply prospect branding, create news articles, and manage themes.
            </p>
          </div>
          <div style={buttonContainerStyle}>
            <button
              style={{
                ...brandingButtonStyle,
                backgroundColor:
                  hoveredButton === "users" ? colors.primaryLight : colors.primary,
              }}
              onClick={() => onChoose("users")}
              onMouseEnter={() => setHoveredButton("users")}
              onMouseLeave={() => setHoveredButton(null)}
            >
              Manage Users
            </button>
            <p style={subDescriptionStyle}>
              Run automation, update profiles, or log in as a user.
            </p>
          </div>
          {/* 📝 Edit Pages — Gemini rewrites the visible TEXT on existing
              pages to fit the prospect, preserving layout, images, widgets,
              and Studio template variables. See EditPagesForm. */}
          <div style={buttonContainerStyle}>
            <button
              style={{
                ...brandingButtonStyle,
                backgroundColor:
                  hoveredButton === "pages" ? colors.primaryLight : colors.primary,
              }}
              onClick={() => onChoose("pages")}
              onMouseEnter={() => setHoveredButton("pages")}
              onMouseLeave={() => setHoveredButton(null)}
            >
              Edit Pages
            </button>
            <p style={subDescriptionStyle}>
              Rewrite text on common pages (HR, IT, FAQ&hellip;) to match the prospect &mdash; layout, images, and widgets stay untouched.
            </p>
          </div>
          {isGitHubAuthenticated && (
            <div style={{ ...buttonContainerStyle, marginBottom: 0 }}>
              <button
                style={{
                  ...brandingButtonStyle,
                  backgroundColor:
                    hoveredButton === "monorepo"
                      ? colors.primaryLight
                      : colors.primary,
                }}
                onClick={() => onChoose("monorepo")}
                onMouseEnter={() => setHoveredButton("monorepo")}
                onMouseLeave={() => setHoveredButton(null)}
              >
                Solutions Monorepo
              </button>
              <p style={subDescriptionStyle}>
                Browse widget embed URLs and inject Global JS snippets from the
                SE solutions-monorepo. Requires GitHub access.
              </p>
            </div>
          )}
      </>
    </div>
  );
}
