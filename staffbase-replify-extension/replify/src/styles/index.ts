// styles/index.ts

import type { CSSProperties } from 'react';
import { colors } from './colors';

const transitionEffect = 'background-color 0.2s ease-in-out, color 0.2s ease-in-out';

export const inputStyle: CSSProperties = {
  padding: "8px",
  margin: "5px 0",
  border: `1px solid ${colors.border}`,
  borderRadius: "4px",
  width: "calc(100% - 18px)",
  boxSizing: "border-box",
};
export const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: "5px",
  fontWeight: "bold",
  color: colors.textDark,
};
export const apiKeyLabelStyle: CSSProperties = {
  display: "block",
  marginBottom: "5px",
  fontWeight: "normal",
  fontSize: "0.8em",
  color: colors.textMuted,
  wordBreak: "break-all",
};
export const apiKeyInputStyle: CSSProperties = {
  ...inputStyle,
  border: `1px solid ${colors.border}`,
  fontSize: "0.9em",
  color: colors.textMedium,
  backgroundColor: colors.backgroundLight,
};
export const checkboxLabelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  marginBottom: "5px",
  fontWeight: "normal",
};
export const checkboxStyle: CSSProperties = { marginRight: "8px" };
export const buttonStyle: CSSProperties = {
  backgroundColor: colors.primary,
  color: colors.textOnPrimary,
  padding: "10px 15px",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
  fontSize: "16px",
  marginTop: "15px",
  transition: transitionEffect,
};
export const brandingButtonStyle: CSSProperties = {
  ...buttonStyle,
  display: "inline-block",
  marginRight: "10px",
};
export const actionButtonStyle: CSSProperties = {
  padding: "6px 10px",
  fontSize: "12px",
  marginRight: "5px",
};
export const dangerButtonStyle: CSSProperties = {
  ...buttonStyle,
  backgroundColor: colors.danger,
};
export const responseStyle: CSSProperties = {
  marginTop: "20px",
  padding: "10px",
  border: `1px solid ${colors.borderLight}`,
  borderRadius: "4px",
  backgroundColor: colors.backgroundLight,
  whiteSpace: "pre-wrap",
  // Long URLs and tokens shouldn't force the side panel to scroll horizontally.
  overflowWrap: "break-word",
  wordBreak: "break-all",
  fontFamily: "monospace",
  fontSize: "10px",
};
export const containerStyle: CSSProperties = {
  padding: "15px",
  fontFamily: "sans-serif",
};
export const headingStyle: CSSProperties = {
  color: colors.textDark,
  marginBottom: "10px",
  textAlign: "center",
};
export const formGroupStyle: CSSProperties = { marginBottom: "15px" };
export const panelStyle: CSSProperties = {
  marginBottom: "15px",
  padding: "15px",
  border: `1px solid ${colors.borderMedium}`,
  borderRadius: "4px",
};
export const listContainerStyle: CSSProperties = {
  maxHeight: "250px",
  overflowY: "auto",
  border: `1px solid ${colors.borderMedium}`,
  borderRadius: "4px",
  padding: "10px",
  marginBottom: "15px",
};
export const listRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "8px 5px",
  borderBottom: `1px solid ${colors.backgroundSubtle}`,
};
export const subtlePanelStyle: CSSProperties = {
  border: `1px solid ${colors.border}`,
  padding: "15px",
  borderRadius: "4px",
  marginBottom: "15px",
  backgroundColor: colors.backgroundLight,
};
export const savedTokenStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 0",
  borderBottom: `1px solid ${colors.borderLight}`,
};
export const buttonsContainerStyle: CSSProperties = { display: "flex", gap: "10px" };
export const buttonTinyStyle: CSSProperties = {
  border: "none",
  background: "none",
  cursor: "pointer",
  padding: 0,
  color: colors.primary,
  transition: 'color 0.2s ease-in-out',
};
export const dangerTinyButtonStyle: CSSProperties = {
  ...buttonTinyStyle,
  color: colors.danger,
};
export const dropdownHeaderStyle: CSSProperties = {
  fontWeight: 600,
  cursor: "pointer",
  marginTop: 24,
};
export const psaStyle: CSSProperties = {
  marginTop: '15px',
  padding: '10px',
  backgroundColor: colors.backgroundSubtle,
  borderRadius: '4px',
  fontSize: '12px',
  color: colors.textDark,
  lineHeight: '1.4',
};
export const warningPsaStyle: CSSProperties = {
  padding: '10px',
  backgroundColor: colors.warningBackground,
  border: `1px solid ${colors.warningBorder}`,
  borderRadius: '4px',
  fontSize: '12px',
  marginBottom: '15px',
};
export const subDescriptionStyle: CSSProperties = {
  fontSize: '13px',
  color: colors.textMedium,
  marginTop: '5px',
  marginBottom: '10px',
  lineHeight: '1.4',
};
export const logoStyle: CSSProperties = {
  width: '100px',
  marginBottom: '5px',
};
const statusBannerBaseStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '8px 12px',
  borderRadius: 6,
  marginBottom: 14,
  fontSize: 12,
};
const statusBannerVariants: Record<string, CSSProperties> = {
  ok: {
    background: colors.successLight,
    border: `1px solid ${colors.success}`,
    color: colors.successText,
  },
  error: {
    background: colors.errorBackground,
    border: `1px solid ${colors.errorText}`,
    color: colors.errorTextStrong,
  },
  idle: {
    background: colors.warningBackground,
    border: `1px solid ${colors.warningBorder}`,
    color: colors.warningText,
  },
};
type BannerStatus = 'ok' | 'error' | 'idle';
export const getStatusBannerStyle = (status: BannerStatus): CSSProperties => ({
  ...statusBannerBaseStyle,
  ...(statusBannerVariants[status] || statusBannerVariants.idle),
});

// --- Ask Gemini overlay styles ---
export const floatingSparkleButtonStyle: CSSProperties = {
  position: 'fixed',
  bottom: '18px',
  right: '18px',
  width: '58px',
  height: '58px',
  borderRadius: '14px',
  border: 'none',
  backgroundColor: colors.primary,
  color: colors.textOnPrimary,
  boxShadow: '0 16px 40px rgba(0, 164, 253, 0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  zIndex: 1200,
  transform: 'translateY(0)',
};

export const geminiOverlayBackdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: colors.overlayScrim,
  backdropFilter: 'blur(12px)',
  display: 'flex',
  alignItems: 'stretch',
  justifyContent: 'stretch',
  padding: 0,
  zIndex: 1300,
};

export const geminiOverlayCardStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  background: `linear-gradient(145deg, ${colors.overlaySurface} 0%, ${colors.overlaySurfaceSoft} 45%, ${colors.overlaySurface} 100%)`,
  border: `1px solid ${colors.overlayBorder}`,
  borderRadius: 0,
  boxShadow: '0 30px 80px rgba(0, 0, 0, 0.55)',
  padding: '32px',
  color: colors.overlayText,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-start',
  gap: '20px',
  overflowY: 'auto',
};

export const geminiCloseButtonStyle: CSSProperties = {
  position: 'absolute',
  top: '16px',
  left: '16px',
  width: '38px',
  height: '38px',
  borderRadius: '12px',
  border: `1px solid ${colors.overlayBorder}`,
  background: colors.overlayInput,
  color: colors.overlayText,
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  transition: 'transform 0.2s ease, background 0.2s ease',
};

export const geminiHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  color: colors.overlayText,
};

export const geminiTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: '20px',
  letterSpacing: '0.2px',
};

export const geminiSubtitleStyle: CSSProperties = {
  margin: 0,
  fontSize: '13px',
  color: colors.overlayTextMuted,
};

export const geminiInputStyle: CSSProperties = {
  width: '100%',
  maxWidth: '100%',
  minHeight: '120px',
  padding: '16px 18px',
  borderRadius: '14px',
  border: `1px solid ${colors.overlayBorder}`,
  background: colors.overlayInput,
  color: colors.overlayText,
  fontSize: '16px',
  lineHeight: '1.5',
  outline: 'none',
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.35)',
  resize: 'vertical',
  overflowWrap: 'break-word',
  boxSizing: 'border-box',
};
export const overlayFieldLabelStyle: CSSProperties = {
  ...labelStyle,
  color: colors.overlayText,
};
export const overlayFieldStyle: CSSProperties = {
  ...inputStyle,
  background: colors.overlayInputStrong,
  border: `1px solid ${colors.overlayBorderStrong}`,
  color: colors.textOnPrimary,
};

export const geminiFooterStyle: CSSProperties = {
  margin: 0,
  fontSize: '12px',
  color: colors.overlayTextFaint,
};

export const geminiFieldShellStyle: CSSProperties = {
  width: '100%',
  maxWidth: '880px',
  alignSelf: 'center',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
};

export const geminiSampleGridStyle: CSSProperties = {
  display: 'grid',
  gap: '10px',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  transition: 'opacity 0.25s ease, transform 0.25s ease',
};

export const geminiInputMutedStyle: CSSProperties = {
  background: colors.overlayInputMuted,
  borderColor: colors.overlayBorderMuted,
  color: colors.overlayTextDim,
};

export const geminiActionButtonStyle: CSSProperties = {
  padding: '12px 16px',
  borderRadius: '12px',
  border: 'none',
  fontWeight: 600,
  minWidth: '140px',
  transition: 'opacity 0.2s ease, transform 0.1s ease',
};

export const geminiSelectStyle: CSSProperties = {
  width: '100%',
  maxWidth: '100%',
  padding: '12px 14px',
  borderRadius: '12px',
  border: `1px solid ${colors.overlayBorder}`,
  background: colors.overlayInput,
  color: colors.overlayText,
  fontSize: '16px',
  fontWeight: 600,
  lineHeight: '1.3',
  appearance: 'none',
  WebkitAppearance: 'none',
  paddingRight: '36px',
  backgroundImage: 'linear-gradient(45deg, transparent 50%, rgba(232, 241, 255, 0.45) 50%), linear-gradient(135deg, rgba(232, 241, 255, 0.45) 50%, transparent 50%)',
  backgroundPosition: 'calc(100% - 26px) calc(50% - 3px), calc(100% - 18px) calc(50% - 3px)',
  backgroundSize: '8px 8px, 8px 8px',
  backgroundRepeat: 'no-repeat',
  minHeight: '0',
  height: '48px',
};

export const geminiTaskCardStyle: CSSProperties = {
  border: `1px solid ${colors.overlayBorder}`,
  borderRadius: '12px',
  padding: '14px',
  background: 'rgba(255,255,255,0.03)',
  boxShadow: '0 8px 28px rgba(0,0,0,0.25)',
  position: 'relative',
  overflow: 'visible',
};

// --- Add API Key overlay styles ---
export const apiKeyOverlayCardStyle: CSSProperties = {
  ...geminiOverlayCardStyle,
  justifyContent: 'flex-start',
};

export const apiKeyContentShellStyle: CSSProperties = {
  ...geminiFieldShellStyle,
  maxWidth: '700px',
  marginTop: '40px',
};

export const apiKeyHeaderIconStyle: CSSProperties = {
  color: colors.primary,
  filter: `drop-shadow(0 6px 14px ${colors.primaryGlow})`,
};

export const apiKeyDescriptionStyle: CSSProperties = {
  ...geminiSubtitleStyle,
  fontSize: '14px',
  lineHeight: '1.55',
};

export const apiKeyFormStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

export const apiKeyErrorStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: colors.errorText,
};

export const apiKeySubmitButtonStyle: CSSProperties = {
  ...buttonStyle,
  width: '100%',
  marginTop: 2,
};
