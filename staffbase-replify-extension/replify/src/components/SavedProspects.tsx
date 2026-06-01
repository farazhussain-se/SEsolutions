// components/SavedProspects.tsx
import { useState } from "react";
import { LuChevronDown, LuChevronUp, LuTrash, LuArrowRight } from "react-icons/lu";
import { colors } from "../styles/colors";

export interface Prospect {
  id?: string;
  logoUrl?: string;
  prospectName?: string;
  primaryColor?: string;
  textColor?: string;
  backgroundColor?: string;
  [key: string]: unknown;
}

interface SavedProspectsProps {
  prospects: Prospect[];
  onSelect: (prospect: Prospect) => void;
  onDelete?: (id: string) => void;
}

const dropdownHeaderStyle: React.CSSProperties = {
  padding: "10px 12px",
  border: `1px solid ${colors.border}`,
  borderRadius: "4px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  cursor: "pointer",
  backgroundColor: colors.background,
};

const dropdownListStyle: React.CSSProperties = {
  listStyle: "none",
  margin: "4px 0 0 0",
  padding: 0,
  border: `1px solid ${colors.border}`,
  borderRadius: "4px",
  backgroundColor: colors.background,
  maxHeight: "250px",
  overflowY: "auto",
};

const prospectItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "8px",
  gap: "10px",
  borderBottom: `1px solid ${colors.border}`,
};

const prospectLogoStyle: React.CSSProperties = {
  width: "32px",
  height: "32px",
  objectFit: "contain",
  borderRadius: "4px",
  backgroundColor: colors.backgroundSubtle,
};

const colorSwatchStyle: React.CSSProperties = {
  width: "16px",
  height: "16px",
  borderRadius: "3px",
  border: `1px solid ${colors.border}`,
};

export default function SavedProspects({ prospects, onSelect, onDelete }: SavedProspectsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (prospect: Prospect) => {
    onSelect(prospect);
    setIsOpen(false);
  };

  return (
    <div style={{ marginBottom: "15px" }}>
      <div style={dropdownHeaderStyle} onClick={() => setIsOpen(!isOpen)}>
        <span>Use a saved prospect</span>
        {isOpen ? <LuChevronUp /> : <LuChevronDown />}
      </div>

      {isOpen && (
        <ul style={dropdownListStyle}>
          {prospects.length === 0 ? (
            <li style={{ padding: "10px", color: colors.textMuted }}>
              You have not saved any prospects yet!
            </li>
          ) : (
            prospects.map((prospect) => (
              <li key={String(prospect.id ?? '')} style={prospectItemStyle}>
                <img src={String(prospect.logoUrl ?? '')} alt="" style={prospectLogoStyle} />
                <span style={{ flex: 1, fontWeight: "bold" }}>
                  {String(prospect.prospectName ?? '')}
                </span>
                <div style={{ display: "flex", gap: "4px" }}>
                  <div style={{...colorSwatchStyle, backgroundColor: String(prospect.primaryColor ?? '')}} />
                  <div style={{...colorSwatchStyle, backgroundColor: String(prospect.textColor ?? '')}} />
                  <div style={{...colorSwatchStyle, backgroundColor: String(prospect.backgroundColor ?? '')}} />
                </div>
                <button
                  onClick={() => handleSelect(prospect)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px' }}
                  title="Use this prospect"
                >
                  <LuArrowRight size={18} color={colors.primary} />
                </button>
                {onDelete && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(String(prospect.id ?? '')); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px' }}
                    title="Delete this prospect"
                  >
                    <LuTrash size={16} color={colors.danger} />
                  </button>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
