import { useEffect, useState } from "react";
import { MdOutlineFeedback } from "react-icons/md";
import { FaWindowMinimize } from "react-icons/fa";
import { loadBannerState, saveBannerState } from "../utils/bannerStorage";
import { colors } from "../styles/colors";

const feedbackColors = {
  background: colors.backgroundLight,
  buttonAndIcon: colors.uiGray,
  buttonHover: colors.uiGrayHover,
  text: colors.textBody,
  border: colors.borderSubtle,
  retainedBlue: colors.primary,
};

const bannerStyle = {
  position: "relative" as const,
  backgroundColor: feedbackColors.background,
  border: `1px solid ${feedbackColors.border}`,
  color: feedbackColors.text,
  padding: "12px 16px",
  borderRadius: "4px",
  fontSize: "14px",
  textAlign: "center" as const,
  display: "flex",
  flexDirection: "column" as const,
  marginBottom: "5px",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
};

const textStyle = {
  margin: 0,
  lineHeight: "1.5",
  padding: "0 24px",
};

const buttonStyle = {
  backgroundColor: feedbackColors.buttonAndIcon,
  color: feedbackColors.text,
  border: "none",
  borderRadius: "4px",
  padding: "6px 12px",
  cursor: "pointer",
  fontWeight: "bold",
  textDecoration: "none",
  fontSize: "13px",
  boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  transition: "background-color 0.2s ease-in-out",
};

const releaseNotesStyle = {
  fontSize: "10px",
  textDecoration: "none",
  color: feedbackColors.text,
  transition: "text-decoration 0.2s ease-in-out",
};

const minimizeButtonStyle = {
  position: "absolute" as const,
  top: "5px",
  left: "5px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: "0",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const minimizeIconBoxStyle = {
  width: 15,
  height: 12,
  borderRadius: "6px",
  backgroundColor: feedbackColors.buttonAndIcon,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  paddingBottom: 2,
  transition: "background-color 0.2s ease-in-out",
};

const minimizedContainerStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginTop: "-5px",
};

const iconButtonStyle = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "4px",
  display: "flex",
  transition: "opacity 0.2s ease-in-out",
};

export default function FeedbackBanner() {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFeedbackBtnHover, setIsFeedbackBtnHover] = useState(false);
  const [isMinimizeBtnHover, setIsMinimizeBtnHover] = useState(false);
  const [isExpandBtnHover, setIsExpandBtnHover] = useState(false);
  const [isNotesLinkHover, setIsNotesLinkHover] = useState(false);

  useEffect(() => {
    loadBannerState(setIsMinimized);
  }, []);

  const handleToggleMinimize = () => {
    const newState = !isMinimized;
    setIsMinimized(newState);
    saveBannerState(newState);
  };

  const versionNumber = "2.4.5";
  const releaseNotesUrl =
    "https://docs.google.com/document/d/14iV4lUkYHuHv5VY3MPiIXDdRx_8SOY5Ml1M-gSPqvRY/edit?usp=sharing";

  if (isMinimized) {
    return (
      <div style={minimizedContainerStyle}>
        <button
          onClick={handleToggleMinimize}
          style={{
            ...iconButtonStyle,
            ...(isExpandBtnHover && { opacity: 0.7 }),
          }}
          title="Show banner"
          onMouseEnter={() => setIsExpandBtnHover(true)}
          onMouseLeave={() => setIsExpandBtnHover(false)}
        >
          <MdOutlineFeedback size={20} color={feedbackColors.retainedBlue} />
        </button>
        <a
          href={releaseNotesUrl}
          style={{
            ...releaseNotesStyle,
            color: feedbackColors.retainedBlue,
            ...(isNotesLinkHover && { textDecoration: "underline" }),
          }}
          target="_blank"
          rel="noopener noreferrer"
          onMouseEnter={() => setIsNotesLinkHover(true)}
          onMouseLeave={() => setIsNotesLinkHover(false)}
        >
          v{versionNumber}
        </a>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={bannerStyle}>
        <button
          onClick={handleToggleMinimize}
          style={minimizeButtonStyle}
          title="Minimize banner"
          onMouseEnter={() => setIsMinimizeBtnHover(true)}
          onMouseLeave={() => setIsMinimizeBtnHover(false)}
        >
          <div
            style={{
              ...minimizeIconBoxStyle,
              backgroundColor: isMinimizeBtnHover
                ? feedbackColors.buttonHover
                : feedbackColors.buttonAndIcon,
            }}
          >
            <FaWindowMinimize
              size={9}
              color={colors.backgroundLight}
              style={{ marginBottom: 2 }}
            />
          </div>
        </button>
        <p style={textStyle}>
          Please give us your thoughts anonymously. Thank you for helping us
          make Replify better!
        </p>
        <a
          href="https://forms.gle/Qy6Ei8KF8bmwCKNK6"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...buttonStyle,
            ...(isFeedbackBtnHover && { backgroundColor: feedbackColors.buttonHover }),
          }}
          onMouseEnter={() => setIsFeedbackBtnHover(true)}
          onMouseLeave={() => setIsFeedbackBtnHover(false)}
        >
          Share Feedback
        </a>
      </div>

      <a
        href={releaseNotesUrl}
        style={{
          ...releaseNotesStyle,
          ...(isNotesLinkHover && { textDecoration: "underline" }),
        }}
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={() => setIsNotesLinkHover(true)}
        onMouseLeave={() => setIsNotesLinkHover(false)}
      >
        Version Release Notes
      </a>
      <span
        style={{
          fontStyle: "oblique",
          fontSize: "10px",
          color: feedbackColors.text,
        }}
      >
        {" "}
        {versionNumber}
      </span>
    </div>
  );
}
