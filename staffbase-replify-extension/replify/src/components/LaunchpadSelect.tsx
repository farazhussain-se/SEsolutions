// components/LaunchpadSelect.tsx
// Reusable multi-select dropdown for the Launchpad list.

import { inputStyle, checkboxLabelStyle, checkboxStyle } from "../styles";
import { colors } from "../styles/colors";
import type { CSSProperties } from "react";

interface LaunchpadSelectProps {
  items: string[];
  selected: string[];
  open: boolean;
  onToggleOpen: () => void;
  onToggleItem: (item: string) => void;
}

export default function LaunchpadSelect({
  items,
  selected,
  open,
  onToggleOpen,
  onToggleItem,
}: LaunchpadSelectProps) {
  const isSelected = (opt: string) =>
    selected.includes("all") || selected.includes(opt);

  const getLabel = () => {
    if (selected.includes("all")) return "All";
    if (!selected.length) return "Select Items";
    const shown = items.filter((i) => selected.includes(i));
    return shown.length > 2
      ? `${shown.slice(0, 2).join(", ")} +${shown.length - 2}`
      : shown.join(", ");
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        style={{
          ...inputStyle,
          textAlign: "left",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        } as CSSProperties}
        onClick={onToggleOpen}
      >
        {getLabel()}
        <span>▼</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: colors.background,
            border: `1px solid ${colors.border}`,
            borderRadius: 4,
            zIndex: 10,
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          <label
            style={{
              ...checkboxLabelStyle,
              padding: 8,
              borderBottom: `1px solid ${colors.borderLight}`,
            }}
          >
            <input
              type="checkbox"
              style={checkboxStyle}
              checked={selected.includes("all")}
              onChange={() => onToggleItem("all")}
            />
            All
          </label>

          {items.map((opt) => (
            <label
              key={opt}
              style={{
                ...checkboxLabelStyle,
                padding: 8,
                borderBottom: `1px solid ${colors.borderLight}`,
              }}
            >
              <input
                type="checkbox"
                style={checkboxStyle}
                checked={isSelected(opt)}
                onChange={() => onToggleItem(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
