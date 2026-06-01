// components/EnvironmentSetupForm.tsx
import {
  formGroupStyle,
  labelStyle,
  checkboxLabelStyle,
  checkboxStyle,
  brandingButtonStyle,
  psaStyle,
} from "../styles";
import LaunchpadSelect from "./LaunchpadSelect";
import MobileQuickLinks from "./MobileQuickLinks";
import MergeIntegrationForm, { type MergeConfig, type ProfileField } from "./MergeIntegrationForm";
import TabValidationBanner from "./TabValidationBanner";

interface QuickLink {
  name: string;
  title: string;
  position: number;
}

interface TabValidationState {
  status: "ok" | "error" | "idle" | "checking";
  message: string;
}

interface EnvironmentSetupFormProps {
  chatEnabled: boolean;
  setChatEnabled: (v: boolean) => void;
  microsoftEnabled: boolean;
  setMicrosoftEnabled: (v: boolean) => void;
  journeysEnabled: boolean;
  setJourneysEnabled: (v: boolean) => void;
  campaignsEnabled: boolean;
  setCampaignsEnabled: (v: boolean) => void;

  launchpadSel: string[];
  items: string[];
  openLaunchpad: boolean;
  onToggleLaunchpadOpen: () => void;
  onToggleLaunchpadItem: (item: string) => void;

  quickLinksEnabled: boolean;
  setQuickLinksEnabled: (v: boolean) => void;
  mobileQuickLinks: QuickLink[];
  onQuickLinkChange: (idx: number, field: keyof QuickLink, value: string) => void;
  onQuickLinkSwap: (a: number, b: number) => void;
  onQuickLinkDelete: (idx: number) => void;
  onQuickLinkAdd: () => void;

  customWidgetsChecked: boolean;
  setCustomWidgetsChecked: (v: boolean) => void;
  setupEmailChecked: boolean;
  setSetupEmailChecked: (v: boolean) => void;
  allProfileFields: ProfileField[];

  hrIntegrationChecked: boolean;
  setHrIntegrationChecked: (v: boolean) => void;
  domain: string;
  slug: string;
  mergeConfig: MergeConfig;
  onMergeConfigChange: (config: MergeConfig) => void;

  tabValidation?: TabValidationState;
  onRevalidate?: () => void;

  onSetup: () => void;
}

export default function EnvironmentSetupForm({
  chatEnabled, setChatEnabled,
  microsoftEnabled, setMicrosoftEnabled,
  journeysEnabled, setJourneysEnabled,
  campaignsEnabled, setCampaignsEnabled,
  launchpadSel, items, openLaunchpad, onToggleLaunchpadOpen, onToggleLaunchpadItem,
  quickLinksEnabled, setQuickLinksEnabled,
  mobileQuickLinks, onQuickLinkChange, onQuickLinkSwap, onQuickLinkDelete, onQuickLinkAdd,
  customWidgetsChecked, setCustomWidgetsChecked,
  setupEmailChecked, setSetupEmailChecked,
  allProfileFields,
  hrIntegrationChecked, setHrIntegrationChecked,
  domain, slug, mergeConfig, onMergeConfigChange,
  tabValidation = { status: 'idle', message: '' },
  onRevalidate,
  onSetup,
}: EnvironmentSetupFormProps) {
  const isValidated = tabValidation.status === 'ok';

  const mainToggles: [string, boolean, (v: boolean) => void][] = [
    ["Enable Chat", chatEnabled, setChatEnabled],
    ["Enable Microsoft Integration", microsoftEnabled, setMicrosoftEnabled],
    ["Add Journeys", journeysEnabled, setJourneysEnabled],
    ["Add Campaigns", campaignsEnabled, setCampaignsEnabled],
  ];

  const additionalOptions: [string, boolean, (v: boolean) => void][] = [
    ["Add Custom Widgets", customWidgetsChecked, setCustomWidgetsChecked],
    ["Add Email Templates", setupEmailChecked, setSetupEmailChecked],
  ];

  return (
    <>
      <h3>Environment Setup</h3>

      <TabValidationBanner tabValidation={tabValidation} onRevalidate={onRevalidate} />

      {mainToggles.map(([lbl, val, setter]) => (
        <div key={lbl} style={formGroupStyle}>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              style={checkboxStyle}
              checked={val}
              onChange={(e) => setter(e.target.checked)}
            />
            {lbl}
          </label>
        </div>
      ))}

      {campaignsEnabled && (
        <p style={{ ...psaStyle, marginBottom: "15px" }}>
          For campaigns, you will need to add yourself as a manager to see the
          generated campaigns.
        </p>
      )}

      <div style={formGroupStyle}>
        <label style={labelStyle}>Launchpad items:</label>
        <LaunchpadSelect
          items={items}
          selected={launchpadSel}
          open={openLaunchpad}
          onToggleOpen={onToggleLaunchpadOpen}
          onToggleItem={onToggleLaunchpadItem}
        />
      </div>

      <div style={formGroupStyle}>
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            style={checkboxStyle}
            checked={quickLinksEnabled}
            onChange={(e) => setQuickLinksEnabled(e.target.checked)}
          />
          Quick Links
        </label>
      </div>

      {quickLinksEnabled && (
        <>
          <h4>Mobile Quick Links</h4>
          <MobileQuickLinks
            links={mobileQuickLinks}
            onChange={onQuickLinkChange}
            onSwap={onQuickLinkSwap}
            onDelete={onQuickLinkDelete}
            onAdd={onQuickLinkAdd}
          />
        </>
      )}

      {additionalOptions.map(([lbl, val, setter]) => (
        <div key={lbl} style={formGroupStyle}>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              style={checkboxStyle}
              checked={val}
              onChange={(e) => setter(e.target.checked)}
            />
            {lbl}
          </label>
        </div>
      ))}

      <div style={formGroupStyle}>
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            style={checkboxStyle}
            checked={hrIntegrationChecked}
            onChange={(e) => setHrIntegrationChecked(e.target.checked)}
          />
          HR Integration (Workday)
        </label>
      </div>

      {hrIntegrationChecked && (
        <div style={{ marginBottom: 16 }}>
          <MergeIntegrationForm
            domain={domain}
            slug={slug}
            profileFields={allProfileFields}
            config={mergeConfig}
            onConfigChange={onMergeConfigChange}
          />
        </div>
      )}
      <div style={formGroupStyle}>
        <button
          style={{ ...brandingButtonStyle, opacity: isValidated ? 1 : 0.45, cursor: isValidated ? 'pointer' : 'not-allowed' }}
          onClick={onSetup}
          disabled={!isValidated}
          title={!isValidated ? 'Log into this environment in your browser tab first' : undefined}
        >
          Set Up Environment
        </button>
      </div>
    </>
  );
}
