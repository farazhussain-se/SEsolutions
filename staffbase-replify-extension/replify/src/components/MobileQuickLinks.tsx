// components/MobileQuickLinks.tsx
import { inputStyle, buttonTinyStyle, dangerTinyButtonStyle } from "../styles";
import { colors } from "../styles/colors";
import type { CSSProperties } from "react";

interface QuickLink {
  name: string;
  title: string;
  position: number;
}

interface MobileQuickLinksProps {
  links: QuickLink[];
  onChange: (idx: number, field: keyof QuickLink, value: string) => void;
  onSwap: (a: number, b: number) => void;
  onDelete: (idx: number) => void;
  onAdd: () => void;
}

export default function MobileQuickLinks({
  links,
  onChange,
  onSwap,
  onDelete,
  onAdd,
}: MobileQuickLinksProps) {
  const ordered = [...links].sort((a, b) => a.position - b.position);

  return (
    <div>
      {ordered.map((link, idx) => (
        <div
          key={idx}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 24px 24px 24px",
            gap: 6,
            alignItems: "center",
            marginBottom: 6,
          }}
        >
          <input
            style={{ ...inputStyle, fontSize: 12 } as CSSProperties}
            placeholder="Menu item name"
            value={link.name}
            onChange={(e) => onChange(idx, "name", e.target.value)}
          />

          <input
            style={{ ...inputStyle, fontSize: 12 } as CSSProperties}
            placeholder="Mobile label"
            value={link.title}
            onChange={(e) => onChange(idx, "title", e.target.value)}
          />

          <button
            style={buttonTinyStyle}
            disabled={idx === 0}
            onClick={() => onSwap(idx, idx - 1)}
          >
            ↑
          </button>
          <button
            style={buttonTinyStyle}
            disabled={idx === ordered.length - 1}
            onClick={() => onSwap(idx, idx + 1)}
          >
            ↓
          </button>

          <button style={dangerTinyButtonStyle} onClick={() => onDelete(idx)}>
            x
          </button>
        </div>
      ))}

      <button
        onClick={onAdd}
        style={{
          marginTop: 6,
          marginBottom: 10,
          padding: "4px 10px",
          borderRadius: 4,
          border: `1px solid ${colors.primary}`,
          background: colors.background,
          color: colors.primary,
          cursor: "pointer",
        }}
      >
        + Add
      </button>
    </div>
  );
}
