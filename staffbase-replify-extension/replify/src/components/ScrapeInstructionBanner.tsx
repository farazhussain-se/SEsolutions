import { colors } from "../styles/colors";
import type { ScrapePrompt } from "../utils/automationOperations/types";

interface ScrapeInstructionBannerProps {
  prompt: ScrapePrompt | null;
  onCancel?: () => void;
}

const wrapStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 50,
  marginBottom: 12,
  padding: "12px 14px",
  background: colors.backgroundInfo,
  border: `1px solid ${colors.primary}`,
  borderRadius: 8,
  fontSize: 12,
  lineHeight: 1.5,
  color: colors.textDark,
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
};

const titleRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 6,
};

const titleStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 13,
  color: colors.primary,
};

const cancelButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: colors.textMuted,
  cursor: "pointer",
  fontSize: 11,
  textDecoration: "underline",
  padding: 0,
};

const stepsStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
};

const codeStyle: React.CSSProperties = {
  background: colors.backgroundSubtle,
  padding: "1px 5px",
  borderRadius: 3,
  fontFamily: "monospace",
  fontSize: 11,
};

const noteStyle: React.CSSProperties = {
  marginTop: 8,
  paddingTop: 8,
  borderTop: `1px solid ${colors.borderLight}`,
  fontSize: 11,
  color: colors.textMuted,
};

const linkStyle: React.CSSProperties = {
  color: colors.primary,
  textDecoration: "none",
};

export default function ScrapeInstructionBanner({
  prompt,
  onCancel,
}: ScrapeInstructionBannerProps) {
  if (!prompt) return null;

  return (
    <div style={wrapStyle}>
      <div style={titleRowStyle}>
        <span style={titleStyle}>
          ⏳ Waiting for{" "}
          {prompt.type === "linkedin" ? "LinkedIn" : "blog"} scrape…
        </span>
        {onCancel && (
          <button type="button" onClick={onCancel} style={cancelButtonStyle}>
            cancel
          </button>
        )}
      </div>
      <ol style={stepsStyle}>
        <li>Switch to the tab Replify just opened.</li>
        <li>
          Right-click on the page and choose{" "}
          <strong>{prompt.menuLabel}</strong>.
        </li>
        {prompt.boundShortcut && (
          <li>
            Or press <code style={codeStyle}>{prompt.boundShortcut}</code>.
          </li>
        )}
      </ol>
      {!prompt.boundShortcut && (
        <div style={noteStyle}>
          No keyboard shortcut bound for this command. Want one? Set it at{" "}
          <a
            href="chrome://extensions/shortcuts"
            onClick={(e) => {
              e.preventDefault();
              void chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
            }}
            style={linkStyle}
          >
            chrome://extensions/shortcuts
          </a>
          .
        </div>
      )}
    </div>
  );
}
