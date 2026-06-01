import { colors } from "../styles/colors";

interface ProgressData {
  tasksCompleted: number;
  totalTasks: number;
  currentUser?: string;
  currentStatus?: string;
}

interface ProgressBarProps {
  progressData: ProgressData;
  initialTimeEstimate: number;
  theme?: "light" | "dark";
}

const progressContainerStyle = {
  width: "100%",
  backgroundColor: colors.borderMedium,
  borderRadius: "4px",
  marginTop: "15px",
  overflow: "hidden",
  border: `1px solid ${colors.border}`,
};
const fillerStyle = {
  height: "24px",
  backgroundColor: colors.primary,
  textAlign: "right" as const,
  transition: "width 0.4s ease-in-out",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const progressLabelStyle = {
  padding: "5px",
  color: colors.textOnPrimary,
  fontWeight: "bold",
  fontSize: "12px",
  textShadow: "1px 1px 1px rgba(0,0,0,0.3)",
};
const statusTextStyle = {
  textAlign: "center" as const,
  fontSize: "13px",
  marginTop: "8px",
  color: colors.textDark,
  fontStyle: "italic",
};

export default function ProgressBar({
  progressData,
  initialTimeEstimate,
  theme = "light",
}: ProgressBarProps) {
  const { tasksCompleted, totalTasks, currentUser, currentStatus } = progressData;
  if (totalTasks === 0) return null;

  const isDark = theme === "dark";
  const labelColor = isDark ? colors.overlayText : colors.textDark;
  const mutedColor = isDark ? colors.overlayTextMuted : colors.textMuted;

  const percentage = Math.min((tasksCompleted / totalTasks) * 100, 100);

  const timeRemaining = () => {
    const avgTimePerTask = initialTimeEstimate / totalTasks;
    const tasksRemaining = totalTasks - tasksCompleted;
    const secondsLeft = Math.max(0, tasksRemaining * avgTimePerTask);

    const minutes = Math.floor(secondsLeft / 60);
    const seconds = Math.floor(secondsLeft % 60);
    if (minutes === 0 && seconds === 0 && tasksCompleted < totalTasks) {
      return "Calculating...";
    }

    return `${minutes}m ${seconds}s`;
  };

  return (
    <div>
      <div style={progressContainerStyle}>
        <div style={{ ...fillerStyle, width: `${percentage}%` }}>
          <span style={progressLabelStyle}>{`${Math.round(percentage)}%`}</span>
        </div>
      </div>
      <p style={{ ...statusTextStyle, color: labelColor }}>
        {currentUser && <strong>{`Processing: ${currentUser}... `}</strong>}
        {currentStatus && <span>{currentStatus}</span>}
      </p>
      <p
        style={{
          textAlign: "center",
          fontSize: "12px",
          marginTop: "5px",
          color: mutedColor,
        }}
      >
        {`(${tasksCompleted} / ${totalTasks}) tasks completed. Est. time remaining: ${timeRemaining()}`}
      </p>
    </div>
  );
}
