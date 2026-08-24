/*!
 * Copyright 2026, Staffbase SE and contributors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { ReactElement, useEffect, useState } from "react";
import { SBUserProfile, WidgetApi } from "widget-sdk";
import icon from "../resources/docusign-handbook-widget.png";

export interface DocusignHandbookWidgetProps {
  contentLanguage: string;
  widgetApi: WidgetApi;
}

interface SignedRecord {
  signatureText: string;
  font: string;
  ts: string;
}

type View = "envelope" | "document" | "completed";

const STORAGE_KEY = "docusign-handbook-widget/employee-handbook-2026";

const SIGNATURE_STYLES = [
  "'Snell Roundhand','Brush Script MT',cursive",
  "'Lucida Handwriting','Comic Sans MS',cursive",
  "'Segoe Script','Bradley Hand',cursive",
  "Georgia,serif",
];

const fullName = (user: SBUserProfile | null): string =>
  user ? `${user.firstName} ${user.lastName}`.trim() : "";

const initialsFrom = (user: SBUserProfile | null): string =>
  user ? `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase() : "";

const loadSaved = (): SignedRecord | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SignedRecord) : null;
  } catch {
    return null;
  }
};

const persistSaved = (signatureText: string, font: string): SignedRecord => {
  const record: SignedRecord = { signatureText, font, ts: new Date().toISOString() };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // ignore write failures (private browsing, storage full, etc.)
  }
  return record;
};

const clearSaved = (): void => {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};

const formatSignedDate = (iso: string): string =>
  new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const css = `
  .ds-widget { width: 100%; max-width: 480px; margin: 0 auto; background: #fff; border: 1px solid #e1ded8; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #1a1a1a; }
  .ds-widget * { box-sizing: border-box; }

  .ds-topbar { background: #131313; color: #fff; padding: 12px 16px; display: flex; align-items: center; gap: 8px; }
  .ds-logo-icon { width: 20px; height: 20px; flex-shrink: 0; border-radius: 3px; }
  .ds-logo { font-weight: 700; font-size: 16px; letter-spacing: -0.01em; }
  .ds-logo .ds-docu { color: #ffffff; }
  .ds-logo .ds-sign { color: #FFCC00; }

  .ds-body { padding: 18px; }
  .ds-subject { font-size: 15px; font-weight: 700; margin: 0 0 2px 0; line-height: 1.3; }
  .ds-from { font-size: 12px; color: #5c5c5c; margin: 0 0 14px 0; }

  .ds-signer-badge { display: flex; align-items: center; gap: 8px; margin: 0 0 14px 0; }
  .ds-signer-avatar { width: 26px; height: 26px; border-radius: 50%; background: #131313; color: #FFCC00; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .ds-signer-text { font-size: 12.5px; color: #5c5c5c; }
  .ds-signer-text strong { color: #1a1a1a; font-weight: 700; }

  .ds-divider { border: none; border-top: 1px solid #e1ded8; margin: 14px 0; }
  .ds-intro { font-size: 13.5px; line-height: 1.55; margin: 0 0 14px 0; }

  .ds-handbook-link { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #0b5fae; text-decoration: none; margin-bottom: 14px; background: none; border: none; padding: 0; cursor: pointer; font-family: inherit; }
  .ds-handbook-link:hover { text-decoration: underline; }
  .ds-handbook-link svg { width: 13px; height: 13px; flex-shrink: 0; }

  .ds-checkbox-row { display: flex; align-items: flex-start; gap: 8px; background: #f7f7f5; border: 1px solid #e1ded8; border-radius: 8px; padding: 12px; margin-bottom: 16px; }
  .ds-checkbox-row input[type="checkbox"] { width: 17px; height: 17px; margin: 1px 0 0 0; accent-color: #131313; flex-shrink: 0; cursor: pointer; }
  .ds-checkbox-row label { font-size: 12.5px; line-height: 1.5; color: #1a1a1a; cursor: pointer; }

  .ds-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 11px 20px; font-size: 13px; font-weight: 700; letter-spacing: 0.02em; border-radius: 6px; border: 1px solid transparent; cursor: pointer; font-family: inherit; transition: filter 0.15s, opacity 0.15s; }
  .ds-btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .ds-btn-primary { background: #FFCC00; color: #131313; width: 100%; }
  .ds-btn-primary:hover:not(:disabled) { background: #E6B800; }
  .ds-btn-text { background: none; color: #5c5c5c; font-weight: 600; border: none; }
  .ds-btn-text:hover { color: #1a1a1a; }

  .ds-doc-frame { border: 1px solid #e1ded8; border-radius: 8px; background: #fdfdfc; padding: 20px 16px 16px; position: relative; margin-bottom: 4px; }
  .ds-doc-title { font-size: 13px; font-weight: 700; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
  .ds-doc-title svg { width: 14px; height: 14px; color: #5c5c5c; flex-shrink: 0; }
  .ds-doc-body-text { font-size: 12.5px; line-height: 1.6; color: #5c5c5c; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px dashed #e1ded8; }

  .ds-tag-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .ds-tag-start { background: #FFCC00; color: #131313; font-size: 11px; font-weight: 700; letter-spacing: 0.03em; padding: 4px 8px; border-radius: 3px; }

  .ds-sign-tag { background: #FFCC00; color: #131313; border: none; font-size: 12px; font-weight: 700; letter-spacing: 0.02em; padding: 9px 14px; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-family: inherit; animation: ds-pulse 2s ease-in-out infinite; }
  .ds-sign-tag:hover { background: #E6B800; }
  .ds-sign-tag svg { width: 13px; height: 13px; }
  @keyframes ds-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,204,0,0.55); } 50% { box-shadow: 0 0 0 5px rgba(255,204,0,0); } }

  .ds-signed-mark { display: flex; align-items: center; gap: 10px; border: 1px solid #1b8a5a; background: rgba(27,138,90,0.06); border-radius: 6px; padding: 8px 12px; width: 100%; }
  .ds-signed-mark .ds-signature-render { font-size: 22px; line-height: 1; color: #10381f; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .ds-signed-mark .ds-check { width: 16px; height: 16px; color: #1b8a5a; flex-shrink: 0; }

  .ds-finish-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: #131313; border-radius: 8px; padding: 10px 12px 10px 16px; margin-top: 16px; animation: ds-slide-in 0.25s ease-out; }
  @keyframes ds-slide-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  .ds-finish-hint { color: #d8d5cf; font-size: 12px; line-height: 1.4; }
  .ds-finish-bar .ds-btn-primary { width: auto; padding: 9px 18px; flex-shrink: 0; }

  .ds-modal-overlay { position: fixed; inset: 0; background: rgba(19,19,19,0.55); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 10; }
  .ds-modal { background: #fff; border-radius: 10px; width: 100%; max-width: 380px; max-height: 90vh; overflow-y: auto; padding: 20px; color: #1a1a1a; }
  .ds-modal-title { font-size: 17px; font-weight: 700; margin: 0 0 4px 0; }
  .ds-modal-sub { font-size: 12.5px; color: #5c5c5c; margin: 0 0 16px 0; line-height: 1.4; }

  .ds-field { margin-bottom: 12px; }
  .ds-field-label { display: block; font-size: 11px; font-weight: 700; color: #5c5c5c; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 5px; }
  .ds-field input[type="text"] { width: 100%; padding: 9px 10px; font-size: 14px; border: 1px solid #e1ded8; border-radius: 6px; font-family: inherit; color: #1a1a1a; background: #fff; }
  .ds-field input[type="text"]:focus { outline: none; border-color: #131313; }

  .ds-profile-name-display { padding: 9px 10px; font-size: 14px; font-weight: 600; border: 1px solid #e1ded8; border-radius: 6px; background: #f7f7f5; }
  .ds-field-note { font-size: 10.5px; color: #5c5c5c; margin: 4px 0 0 0; }

  .ds-style-row { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
  .ds-style-swatch { flex: 1; min-width: 76px; border: 2px solid #e1ded8; border-radius: 6px; padding: 6px 4px; text-align: center; font-size: 16px; cursor: pointer; background: #fff; color: #111; }
  .ds-style-swatch.active { border-color: #E6B800; background: #fffbea; }

  .ds-sig-preview { border: 1px solid #e1ded8; border-radius: 6px; background: #f7f7f5; padding: 14px 12px; text-align: center; font-size: 26px; min-height: 52px; display: flex; align-items: center; justify-content: center; color: #111; margin-bottom: 12px; overflow: hidden; }
  .ds-sig-preview-empty { color: #5c5c5c; font-size: 12px; font-family: -apple-system, sans-serif; font-style: italic; }

  .ds-agree-row { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 16px; }
  .ds-agree-row input { margin-top: 2px; accent-color: #131313; flex-shrink: 0; cursor: pointer; }
  .ds-agree-row label { font-size: 11px; line-height: 1.5; color: #5c5c5c; cursor: pointer; }

  .ds-modal-actions { display: flex; gap: 8px; align-items: center; }
  .ds-modal-actions .ds-btn-primary { flex: 1; }

  .ds-completed { text-align: center; padding: 8px 4px 4px; }
  .ds-completed-icon { width: 52px; height: 52px; margin: 0 auto 14px; background: rgba(27,138,90,0.08); color: #1b8a5a; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .ds-completed-icon svg { width: 26px; height: 26px; }
  .ds-completed-heading { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
  .ds-completed-sub { font-size: 12.5px; color: #5c5c5c; margin-bottom: 16px; }
  .ds-completed-file { display: flex; align-items: center; gap: 8px; background: #f7f7f5; border: 1px solid #e1ded8; border-radius: 8px; padding: 10px 12px; margin-bottom: 16px; text-align: left; }
  .ds-completed-file svg { width: 18px; height: 18px; color: #d0393e; flex-shrink: 0; }
  .ds-completed-file .fname { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ds-completed-file .fsub { font-size: 11px; color: #5c5c5c; }
  .ds-completed-actions { display: flex; flex-direction: column; gap: 8px; }
`;

export const DocusignHandbookWidget = ({ widgetApi }: DocusignHandbookWidgetProps): ReactElement => {
  const [user, setUser] = useState<SBUserProfile | null>(null);
  const [view, setView] = useState<View>("envelope");
  const [confirmedRead, setConfirmedRead] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedFont, setSelectedFont] = useState(SIGNATURE_STYLES[0]);
  const [initials, setInitials] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [signedRecord, setSignedRecord] = useState<SignedRecord | null>(null);

  useEffect(() => {
    widgetApi
      .getUserInformation()
      .then((profile) => {
        setUser(profile);
        setInitials(initialsFrom(profile));
      })
      .catch(() => setUser(null));
  }, [widgetApi]);

  useEffect(() => {
    const existing = loadSaved();
    if (existing) {
      setSignedRecord(existing);
      setView("document");
    }
  }, []);

  const name = fullName(user);
  const HANDBOOK_URL = "#employee-handbook";

  const openHandbook = (event: React.MouseEvent): void => {
    event.preventDefault();
    window.open(HANDBOOK_URL, "_blank", "noopener");
  };

  const handleContinue = (): void => {
    if (!confirmedRead) {
      window.alert("Please confirm you've read the Employee Handbook before continuing.");
      return;
    }
    setView("document");
  };

  const handleAdopt = (): void => {
    if (!agreed) {
      window.alert("Please agree to adopt this signature before continuing.");
      return;
    }
    const record = persistSaved(name, selectedFont);
    setSignedRecord(record);
    setModalOpen(false);
  };

  const handleFinish = (): void => {
    if (signedRecord) setView("completed");
  };

  const handleStartOver = (): void => {
    clearSaved();
    setSignedRecord(null);
    setConfirmedRead(false);
    setAgreed(false);
    setInitials(initialsFrom(user));
    setView("envelope");
  };

  return (
    <div className="ds-widget">
      <style>{css}</style>

      <div className="ds-topbar">
        <img className="ds-logo-icon" src={icon} alt="" aria-hidden="true" />
        <span className="ds-logo">
          <span className="ds-docu">docu</span>
          <span className="ds-sign">sign.</span>
        </span>
      </div>

      <div className="ds-body">
        {view === "envelope" && (
          <div>
            <p className="ds-subject">Employee Handbook 2026 — Signature Required</p>
            <p className="ds-from">HR Team via DocuSign</p>
            <div className="ds-signer-badge">
              <span className="ds-signer-avatar">{initialsFrom(user) || "…"}</span>
              <span className="ds-signer-text">
                Signing as <strong>{name || "…"}</strong>
              </span>
            </div>
            <hr className="ds-divider" />
            <p className="ds-intro">Please review and sign the acknowledgment for the Employee Handbook 2026.</p>
            <button className="ds-handbook-link" onClick={openHandbook}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
              </svg>
              <span>Open Employee Handbook</span>
            </button>
            <div className="ds-checkbox-row">
              <input
                type="checkbox"
                id="ds-confirm-read"
                checked={confirmedRead}
                onChange={(e) => setConfirmedRead(e.target.checked)}
              />
              <label htmlFor="ds-confirm-read">I have read and reviewed the Employee Handbook.</label>
            </div>
            <button className="ds-btn ds-btn-primary" onClick={handleContinue}>
              CONTINUE
            </button>
          </div>
        )}

        {view === "document" && (
          <div>
            <div className="ds-doc-frame">
              <div className="ds-doc-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                  <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
                </svg>
                <span>Employee Handbook 2026 — Acknowledgment of Receipt</span>
              </div>
              <p className="ds-doc-body-text">
                By signing below, I acknowledge that I have received, read, and understand the Employee Handbook, and I
                agree to comply with its policies.
              </p>
              <div className="ds-tag-row">
                {!signedRecord && (
                  <>
                    <span className="ds-tag-start">START</span>
                    <span>→</span>
                    <button className="ds-sign-tag" onClick={() => setModalOpen(true)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" />
                        <path d="M14.06 6.19l3.75 3.75" />
                      </svg>
                      <span>SIGN HERE</span>
                    </button>
                  </>
                )}
                {signedRecord && (
                  <div className="ds-signed-mark">
                    <svg className="ds-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                    <span className="ds-signature-render" style={{ fontFamily: signedRecord.font }}>
                      {signedRecord.signatureText}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {signedRecord && (
              <div className="ds-finish-bar">
                <span className="ds-finish-hint">Please review the document, then select FINISH.</span>
                <button className="ds-btn ds-btn-primary" onClick={handleFinish}>
                  FINISH
                </button>
              </div>
            )}
          </div>
        )}

        {view === "completed" && signedRecord && (
          <div className="ds-completed">
            <div className="ds-completed-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5L20 7" />
              </svg>
            </div>
            <div className="ds-completed-heading">You&apos;ve completed this document.</div>
            <div className="ds-completed-sub">A confirmation has been sent to your email.</div>
            <div className="ds-completed-file">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" opacity={0.15} />
                <path d="M14 2v6h6" fill="none" stroke="currentColor" strokeWidth={1.6} />
                <path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth={1.6} />
              </svg>
              <div>
                <div className="fname">employee-handbook-2026-acknowledgment.pdf</div>
                <div className="fsub">Signed on {formatSignedDate(signedRecord.ts)}</div>
              </div>
            </div>
            <div className="ds-completed-actions">
              <button
                className="ds-handbook-link"
                onClick={openHandbook}
                style={{ justifyContent: "center", marginBottom: 4 }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                  <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
                </svg>
                <span>View Employee Handbook</span>
              </button>
              <button className="ds-btn ds-btn-text" onClick={handleStartOver}>
                Start Again
              </button>
            </div>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="ds-modal-overlay">
          <div className="ds-modal">
            <p className="ds-modal-title">Adopt Your Signature</p>
            <p className="ds-modal-sub">Confirm your name, initials, and signature style below.</p>

            <div className="ds-field">
              <span className="ds-field-label">Full Name</span>
              <div className="ds-profile-name-display">{name || "…"}</div>
              <p className="ds-field-note">Pulled automatically from your Staffbase profile.</p>
            </div>
            <div className="ds-field">
              <label className="ds-field-label" htmlFor="ds-initials-input">
                Initials
              </label>
              <input
                type="text"
                id="ds-initials-input"
                maxLength={6}
                value={initials}
                onChange={(e) => setInitials(e.target.value)}
              />
            </div>

            <span className="ds-field-label">Select Style</span>
            <div className="ds-style-row">
              {SIGNATURE_STYLES.map((font) => (
                <div
                  key={font}
                  className={`ds-style-swatch${selectedFont === font ? " active" : ""}`}
                  style={{ fontFamily: font, fontStyle: font.includes("Georgia") ? "italic" : "normal" }}
                  onClick={() => setSelectedFont(font)}
                >
                  Ab
                </div>
              ))}
            </div>

            <span className="ds-field-label">Preview</span>
            <div className="ds-sig-preview">
              {name ? (
                <span style={{ fontFamily: selectedFont }}>{name}</span>
              ) : (
                <span className="ds-sig-preview-empty">Your signature will appear here</span>
              )}
            </div>

            <div className="ds-agree-row">
              <input
                type="checkbox"
                id="ds-agree-checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <label htmlFor="ds-agree-checkbox">
                I agree that the signature and initials will be the electronic representation of my signature and
                initials for all purposes when used on documents, including legally binding contracts.
              </label>
            </div>

            <div className="ds-modal-actions">
              <button className="ds-btn ds-btn-text" onClick={() => setModalOpen(false)}>
                CANCEL
              </button>
              <button className="ds-btn ds-btn-primary" onClick={handleAdopt}>
                ADOPT AND SIGN
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
