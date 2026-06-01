// components/ApiKeyForm.tsx
import { useState, useEffect } from "react";
import { IoClose } from "react-icons/io5";
import { IoIosKey } from "react-icons/io";
import { DEFAULT_DOMAIN, STAFFBASE_DOMAINS } from "../constants/appConstants";
import {
  geminiOverlayBackdropStyle,
  apiKeyOverlayCardStyle,
  apiKeyContentShellStyle,
  geminiCloseButtonStyle,
  geminiHeaderStyle,
  geminiTitleStyle,
  apiKeyHeaderIconStyle,
  apiKeyDescriptionStyle,
  apiKeyFormStyle,
  apiKeyErrorStyle,
  apiKeySubmitButtonStyle,
  overlayFieldStyle,
  overlayFieldLabelStyle,
} from "../styles";

const ROLE_LABELS: Record<string, string> = {
  WeBranchAdminRole: "Administrator",
  WeBranchManagingEditorRole: "Managing Editor",
  WeBranchModeratorRole: "Editorial",
  WeBranchReaderRole: "Restricted",
  WeBranchRestrictedReaderRole: "Restricted Read-Only",
};

interface SavedEntry {
  slug: string;
  token: string;
  fullToken: string;
  branchId?: string;
  domain: string;
  hasNewUI: boolean;
  starred: boolean;
  truncatedToken: string;
  branchRole: string;
  branchRoleLabel: string;
}

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (entry: SavedEntry) => void;
}

interface DiscoverData {
  token?: { branchRole?: string };
}

interface BranchData {
  slug?: string;
  id?: string;
  config?: { flags?: string[] };
}

export default function ApiKeyModal({ isOpen, onClose, onSave }: ApiKeyModalProps) {
  const [domain, setDomain] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setApiKey("");
    void chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const url = tabs?.[0]?.url;
      if (url) {
        const parseHost = (u: string): string | null => {
          try { return new URL(u).hostname; } catch { return null; }
        };
        const host = parseHost(url);
        if (host && STAFFBASE_DOMAINS.some((d) => host === d || host.endsWith('.' + d))) {
          setDomain(host);
          return;
        }
      }
      setDomain("");
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const effectiveDomain = domain.trim() || DEFAULT_DOMAIN;

  const handleSubmit = async (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();
    if (!apiKey.trim()) return;
    setIsLoading(true);
    setError("");

    try {
      const token = apiKey.trim();

      let discoverRes: Response;
      try {
        discoverRes = await fetch(`https://${effectiveDomain}/auth/discover`, {
          credentials: "omit",
          headers: {
            Authorization: `Basic ${token}`,
            Accept: "application/vnd.staffbase.auth.discovery.v2+json",
          },
        });
      } catch {
        throw new Error(
          `Could not reach "${effectiveDomain}". Make sure the domain is correct and you're not on a tab from a different environment.`
        );
      }
      if (discoverRes.status === 401) {
        throw new Error(
          `API key rejected by "${effectiveDomain}" (401). Check the key is correct and belongs to this environment — not a different one.`
        );
      }
      if (!discoverRes.ok) {
        throw new Error(`Auth failed for "${effectiveDomain}" (${discoverRes.status}). Try closing other Staffbase tabs and retrying.`);
      }
      const discoverData: DiscoverData = await discoverRes.json();
      const branchRole = discoverData?.token?.branchRole ?? "";

      if (branchRole !== "WeBranchAdminRole") {
        const label = ROLE_LABELS[branchRole] || branchRole || "unknown role";
        throw new Error(`This key has "${label}" access. Replify requires an Administrator key.`);
      }

      const branchRes = await fetch(`https://${effectiveDomain}/api/branch`, {
        credentials: "omit",
        headers: { Authorization: `Basic ${token}` },
      });
      if (!branchRes.ok) {
        throw new Error(`Key validated but could not fetch branch info from "${effectiveDomain}" (${branchRes.status}).`);
      }
      const branchData: BranchData = await branchRes.json();
      const slug = branchData.slug;
      if (!slug) throw new Error(`Branch API returned no slug for "${effectiveDomain}". The key may not have sufficient permissions.`);
      const branchId = branchData.id;
      const hasNewUI = !!(branchData.config?.flags ?? []).includes("wow_desktop_menu");

      onSave({
        slug,
        token,
        fullToken: token,
        branchId,
        domain: effectiveDomain,
        hasNewUI,
        starred: false,
        truncatedToken: `${token.slice(0, 8)}...`,
        branchRole,
        branchRoleLabel: ROLE_LABELS[branchRole] || branchRole,
      });

      setApiKey("");
      setDomain("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={geminiOverlayBackdropStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={apiKeyOverlayCardStyle}>
        <button style={geminiCloseButtonStyle} onClick={onClose} title="Close">
          <IoClose size={18} />
        </button>

        <div style={apiKeyContentShellStyle}>
          <div style={geminiHeaderStyle}>
            <IoIosKey size={22} style={apiKeyHeaderIconStyle} />
            <div>
              <h2 style={geminiTitleStyle}>add api key</h2>
            </div>
          </div>

          <p style={apiKeyDescriptionStyle}>
            Paste your Staffbase API key and environment domain. We validate it directly so only admin keys are saved.
          </p>

          <form onSubmit={handleSubmit} style={apiKeyFormStyle}>
            <div>
              <label style={overlayFieldLabelStyle}>Domain</label>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value.replace(/^https?:\/\//, "").replace(/\/$/, ""))}
                placeholder="e.g. mycompany.staffbase.com"
                style={overlayFieldStyle}
              />
            </div>

            <div>
              <label style={overlayFieldLabelStyle}>API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API key"
                autoFocus
                style={overlayFieldStyle}
              />
            </div>

            {error && (
              <p style={apiKeyErrorStyle}>
                {error}
              </p>
            )}

            <button
              type="submit"
              style={{ ...apiKeySubmitButtonStyle, opacity: (!apiKey.trim() || isLoading) ? 0.5 : 1 }}
              disabled={!apiKey.trim() || isLoading}
            >
              {isLoading ? "Authenticating…" : "Authenticate & Save"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
