import { useState } from "react";
import {
  formGroupStyle,
  checkboxLabelStyle,
  checkboxStyle,
  dropdownHeaderStyle,
  psaStyle,
  inputStyle
} from "../styles";
import { colors } from "../styles/colors";
import type { AnalyticsState, AnalyticsToggleKey } from "../utils/analyticsManager";
import { ANALYTICS_TYPES } from "../constants/appConstants";

const enableButtonStyle: React.CSSProperties = {
  marginTop: '12px',
  padding: '8px 15px',
  backgroundColor: colors.primary,
  color: colors.textOnPrimary,
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '14px',
};

const enableButtonHoverStyle: React.CSSProperties = {
  backgroundColor: colors.primaryDark,
};

const selectAllLabelStyle: React.CSSProperties = {
  ...checkboxLabelStyle,
  display: 'flex',
  alignItems: 'center',
};

const arrowStyle: React.CSSProperties = {
  marginLeft: '8px',
  userSelect: 'none',
  transition: 'transform 0.2s ease-in-out',
  display: 'inline-block',
};

const clickableAreaStyle: React.CSSProperties = {
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  userSelect: 'none',
};

interface RedirectAnalyticsFormProps {
  open: boolean;
  onToggleOpen: (value?: boolean) => void;
  state: AnalyticsState;
  onToggleType: (id: AnalyticsToggleKey, value: boolean) => void;
  onNumberOfEmployeesChange: (count: number) => void;
  onToggleAllowAllStaffbase?: (value: boolean) => void;
}

export default function RedirectAnalyticsForm({
  open,
  onToggleOpen,
  state,
  onToggleType,
  onNumberOfEmployeesChange,
  onToggleAllowAllStaffbase,
}: RedirectAnalyticsFormProps) {
  const [isButtonHovered, setIsButtonHovered] = useState(false);
  const [subAnalyticsVisible, setSubAnalyticsVisible] = useState(true);

  const allSelected = ANALYTICS_TYPES.every(({ id }) => !!state[id]);
  const isIndeterminate = !allSelected && ANALYTICS_TYPES.some(({ id }) => !!state[id]);

  const handleSelectAll = () => {
    const shouldSelectAll = !allSelected;
    ANALYTICS_TYPES.forEach(type => {
      if (state[type.id] !== shouldSelectAll) {
        onToggleType(type.id, shouldSelectAll);
      }
    });
  };

  const handleToggleSubAnalytics = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSubAnalyticsVisible(prev => !prev);
  };

  const handleEnableAndRefresh = () => {
    if (typeof onToggleOpen === 'function') {
      onToggleOpen(false);
    }
    void chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId != null) {
        void chrome.tabs.reload(tabId);
      }
    });
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onNumberOfEmployeesChange(parseInt(e.target.value, 10));
  };

  return (
    <>
      <div style={dropdownHeaderStyle} onClick={() => onToggleOpen()}>
        ▸ Fake analytics
      </div>

      {open && (
        <div style={{ marginTop: 8, marginLeft: 12, paddingBottom: 10 }}>
          <div style={formGroupStyle}>
            <label style={selectAllLabelStyle}>
              <input
                style={checkboxStyle}
                type="checkbox"
                ref={el => {
                  if (el) el.indeterminate = isIndeterminate;
                }}
                checked={allSelected}
                onChange={handleSelectAll}
              />
              <span onClick={handleToggleSubAnalytics} style={clickableAreaStyle}>
                Select All
                <span
                  style={{...arrowStyle, transform: subAnalyticsVisible ? 'rotate(90deg)' : 'rotate(0deg)'}}
                  title={subAnalyticsVisible ? "Hide sub-analytics" : "Show sub-analytics"}
                >
                  ▸
                </span>
              </span>
            </label>
          </div>

          {subAnalyticsVisible && (
            <div style={{ marginLeft: 20 }}>
              {ANALYTICS_TYPES.map(({ id, label }) => (
                <div key={id} style={formGroupStyle}>
                  <label style={checkboxLabelStyle}>
                    <input
                      style={checkboxStyle}
                      type="checkbox"
                      checked={!!state[id]}
                      onChange={() => onToggleType(id, !state[id])}
                    />
                    {label}
                  </label>
                </div>
              ))}
            </div>
          )}

          <div style={{ ...formGroupStyle, marginTop: '12px' }}>
            <label style={{ ...checkboxLabelStyle, alignItems: 'flex-start' }}>
              <input
                style={{ ...checkboxStyle, marginTop: '2px' }}
                type="checkbox"
                checked={!!state.allowAllStaffbase}
                onChange={(e) => onToggleAllowAllStaffbase?.(e.target.checked)}
              />
              <div>
                Fake analytics on all staffbase environments.
                <div style={{ fontStyle: 'italic', fontSize: '12px', color: colors.textMedium, marginTop: '4px' }}>
                  If checked, every Staffbase environment will have fake analytics. If unchecked, only whitelabeled environments that you have saved *and all app.staffbase.com environments* will show fake analytics.
                </div>
              </div>
            </label>
          </div>

          <div style={{ ...formGroupStyle, marginTop: '20px' }}>
            <label htmlFor="employee-count" style={{ ...checkboxLabelStyle, display: 'block', marginBottom: '8px' }}>
              Number of Employees
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="range"
                id="employee-count"
                min="1000"
                max="100000"
                step="500"
                value={state.numberOfEmployees || 5000}
                onChange={handleSliderChange}
                style={{ flex: 1, cursor: 'pointer' }}
              />
              <input
                type="number"
                value={state.numberOfEmployees || 5000}
                onChange={handleSliderChange}
                style={{ ...inputStyle, width: '80px', margin: 0, textAlign: 'center' }}
              />
            </div>
          </div>
          <button
            style={isButtonHovered ? {...enableButtonStyle, ...enableButtonHoverStyle} : enableButtonStyle}
            onClick={handleEnableAndRefresh}
            onMouseEnter={() => setIsButtonHovered(true)}
            onMouseLeave={() => setIsButtonHovered(false)}
            title="Saves current redirect choices and reloads the page to apply them."
          >
            Enable & Refresh
          </button>

          <div style={psaStyle}>
            <strong>Heads up:</strong> Your analytics choices are saved directly in your browser. They'll stick around even if you restart, so you shouldn't have to set them again.
          </div>
        </div>
      )}
    </>
  );
}
