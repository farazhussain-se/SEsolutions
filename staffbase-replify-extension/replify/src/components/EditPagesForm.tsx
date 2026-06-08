/**
 * EditPagesForm — sub-view under useOption.type === "pages".
 *
 * Flow:
 *   1. On mount, calls discoverCommonPages to fetch pages matching the
 *      title heuristic (Home, HR, IT, FAQ, etc.) with text-block counts.
 *   2. User picks pages + tone (Professional / Friendly / Executive),
 *      optionally enters/confirms a prospect name (seeded from BrandingForm
 *      if already set there).
 *   3. Hits "Generate tailored content" → buildEditDiffsForPages runs
 *      Gemini against every selected page in parallel-ish (sequential
 *      to keep proxy load polite) and returns diffs.
 *   4. UI renders an expandable card per page with the before/after diff.
 *      Each card has an "Approve" checkbox; unchecked pages are skipped.
 *   5. "Apply approved" → applyApprovedPageEdits PUTs each approved page
 *      back. en_US content gets the rewrite; other locales round-trip
 *      untouched (Pages API PUT is full-replace).
 *
 * V1 scope:
 *   - en_US only. Multi-locale UI in V2.
 *   - Common-page heuristic only. "Show all pages" reveal in V2.
 *   - Existing-page edit only. Reference-page creation in V2.
 */

import React, { useEffect, useState } from "react";
import {
  brandingButtonStyle,
  inputStyle,
  labelStyle,
  panelStyle,
  subDescriptionStyle,
  subtlePanelStyle,
} from "../styles";
import { colors } from "../styles/colors";
import {
  discoverCommonPages,
  buildEditDiffsForPages,
  applyApprovedPageEdits,
} from "../utils/automationOperations/pageTextEditor";
import type {
  CommonPage,
  PageEditDiff,
  ApplyReport,
} from "../utils/automationOperations/pageTextEditor";

type Tone = "professional" | "friendly" | "executive";

interface EditPagesFormProps {
  apiToken: string;
  apiDomain: string;
  onLog: (line: string) => void;
  /** Seeded from App.tsx's prospect state if user already worked the Branding flow. */
  prospectNameSeed?: string;
  prospectNewsSeed?: string;
}

const selectStyle: React.CSSProperties = { ...inputStyle, width: "100%", padding: "8px" };

const toneOptions: Array<{ key: Tone; label: string; hint: string }> = [
  { key: "professional", label: "Professional", hint: "Clear, factual, business-appropriate." },
  { key: "friendly", label: "Friendly", hint: "Warmer, more conversational, employee-first." },
  { key: "executive", label: "Executive", hint: "Concise, leadership-voiced, strategic." },
];

export default function EditPagesForm({
  apiToken,
  apiDomain,
  onLog,
  prospectNameSeed,
  prospectNewsSeed,
}: EditPagesFormProps) {
  /* ── State ─────────────────────────────────────────────────────────── */
  const [prospect, setProspect] = useState<string>(prospectNameSeed ?? "");
  const [tone, setTone] = useState<Tone>("professional");
  const [pages, setPages] = useState<CommonPage[]>([]);
  const [discoverBusy, setDiscoverBusy] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [generateBusy, setGenerateBusy] = useState(false);
  const [diffs, setDiffs] = useState<PageEditDiff[]>([]);
  /** Per-page approval flag — toggled per card before Apply. */
  const [approvals, setApprovals] = useState<Record<string, boolean>>({});
  /** Per-page expand toggle — diffs are collapsed by default to keep the panel scrollable. */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [applyBusy, setApplyBusy] = useState(false);
  const [report, setReport] = useState<ApplyReport | null>(null);

  const ctx = { apiToken, apiDomain, onProgress: (m: string) => onLog(m) };

  // Keep prospect in sync if Branding form populates it later.
  useEffect(() => {
    if (prospectNameSeed && !prospect) setProspect(prospectNameSeed);
  }, [prospectNameSeed, prospect]);

  // Auto-discover pages on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDiscoverBusy(true);
      try {
        const found = await discoverCommonPages(ctx);
        if (cancelled) return;
        setPages(found);
        // Default: pre-select pages that actually have editable text.
        setSelectedPageIds(new Set(found.filter((p) => p.textBlockCount > 0).map((p) => p.id)));
      } catch (err) {
        if (!cancelled) onLog(`❌ Page discovery failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (!cancelled) setDiscoverBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Actions ───────────────────────────────────────────────────────── */
  const toggleSelected = (id: string) => {
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (selectedPageIds.size === 0) {
      onLog("⚠️ Pick at least one page first.");
      return;
    }
    setGenerateBusy(true);
    setDiffs([]);
    setApprovals({});
    setExpanded({});
    setReport(null);
    try {
      const result = await buildEditDiffsForPages(
        {
          pageIds: Array.from(selectedPageIds),
          prospect: prospect ? { name: prospect, news: prospectNewsSeed } : undefined,
          tone,
        },
        ctx,
      );
      setDiffs(result);
      // Pre-approve every diff by default; user unchecks any they don't want.
      const initialApprovals: Record<string, boolean> = {};
      for (const d of result) initialApprovals[d.pageId] = d.entries.length > 0;
      setApprovals(initialApprovals);
      onLog(`✅ ${result.length} page(s) processed. Review diffs below.`);
    } catch (err) {
      onLog(`❌ Generate failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerateBusy(false);
    }
  };

  const handleApply = async () => {
    const approvedDiffs = diffs.filter((d) => approvals[d.pageId] && d.entries.length > 0);
    if (approvedDiffs.length === 0) {
      onLog("⚠️ No pages approved.");
      return;
    }
    if (
      !window.confirm(
        `Write text changes to ${approvedDiffs.length} page(s)? Originals are NOT backed up.`,
      )
    )
      return;
    setApplyBusy(true);
    try {
      const result = await applyApprovedPageEdits({ diffs: approvedDiffs }, ctx);
      setReport(result);
      onLog(`📝 Saved ${result.pagesApplied} page(s); ${result.pagesFailed} failed.`);
    } catch (err) {
      onLog(`❌ Apply failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setApplyBusy(false);
    }
  };

  /* ── UI ────────────────────────────────────────────────────────────── */
  const approvedCount = Object.values(approvals).filter(Boolean).length;
  const totalChangeCount = diffs
    .filter((d) => approvals[d.pageId])
    .reduce((acc, d) => acc + d.entries.length, 0);

  return (
    <div>
      <h2>Edit Pages</h2>
      <p style={subDescriptionStyle}>
        Tailor the visible TEXT on common pages (Home, HR, IT, FAQ&hellip;) to fit your
        prospect. Layout, images, widgets, and template variables stay untouched.
      </p>

      {/* Prospect + tone */}
      <div style={panelStyle}>
        <label style={labelStyle}>Prospect (company name)</label>
        <input
          type="text"
          style={{ ...inputStyle, width: "100%" }}
          value={prospect}
          onChange={(e) => setProspect(e.target.value)}
          placeholder="e.g. Stryker, Sun Life, Cummins"
          disabled={generateBusy || applyBusy}
        />

        <label style={{ ...labelStyle, marginTop: 12 }}>Tone</label>
        <select
          style={selectStyle}
          value={tone}
          onChange={(e) => setTone(e.target.value as Tone)}
          disabled={generateBusy || applyBusy}
        >
          {toneOptions.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label} — {opt.hint}
            </option>
          ))}
        </select>
      </div>

      {/* Page selector */}
      <div style={panelStyle}>
        <label style={labelStyle}>
          Common pages
          {discoverBusy ? " (discovering…)" : pages.length ? ` (${selectedPageIds.size}/${pages.length} selected)` : " (none found)"}
        </label>
        <div style={{ maxHeight: 240, overflowY: "auto", border: `1px solid ${colors.borderMedium}`, borderRadius: 4, padding: 6 }}>
          {pages.length === 0 && !discoverBusy && (
            <p style={{ margin: 0, fontSize: 11, color: colors.textMuted }}>
              No pages matched the title heuristic. The discovery looks for titles containing words like "home", "hr", "it", "faq", "benefits", "onboarding".
            </p>
          )}
          {pages.map((p) => {
            const isSelected = selectedPageIds.has(p.id);
            const hasEditableText = p.textBlockCount > 0;
            return (
              <label
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  padding: "4px 0",
                  cursor: hasEditableText ? "pointer" : "not-allowed",
                  opacity: hasEditableText ? 1 : 0.5,
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelected(p.id)}
                  disabled={!hasEditableText || generateBusy || applyBusy}
                />
                <strong style={{ flex: 1 }}>{p.primaryTitle}</strong>
                <span style={{ color: colors.textMuted }}>
                  {p.textBlockCount} block{p.textBlockCount === 1 ? "" : "s"}
                </span>
                {p.locales.length > 1 && (
                  <span
                    style={{ color: colors.warningText, fontSize: 10 }}
                    title={`Page has ${p.locales.length} locales (${p.locales.join(", ")}). V1 only edits en_US — other locales stay untouched.`}
                  >
                    +{p.locales.length - 1} more locale{p.locales.length - 1 === 1 ? "" : "s"}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </div>

      <button
        style={{ ...brandingButtonStyle, width: "100%" }}
        onClick={handleGenerate}
        disabled={generateBusy || applyBusy || selectedPageIds.size === 0}
      >
        {generateBusy ? "Asking Gemini…" : `Generate tailored content (${selectedPageIds.size} page${selectedPageIds.size === 1 ? "" : "s"})`}
      </button>

      {/* Diffs */}
      {diffs.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>
            Proposed changes ({approvedCount} of {diffs.length} approved · {totalChangeCount} block{totalChangeCount === 1 ? "" : "s"})
          </h3>
          {diffs.map((d) => (
            <div key={d.pageId} style={{ ...subtlePanelStyle, padding: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={!!approvals[d.pageId]}
                  onChange={(e) => setApprovals({ ...approvals, [d.pageId]: e.target.checked })}
                  disabled={d.entries.length === 0 || applyBusy}
                />
                <strong style={{ flex: 1 }}>{d.pageTitle}</strong>
                <span style={{ fontSize: 11, color: colors.textMuted }}>
                  {d.entries.length} change{d.entries.length === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  onClick={() => setExpanded({ ...expanded, [d.pageId]: !expanded[d.pageId] })}
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 4,
                    border: `1px solid ${colors.border}`,
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  {expanded[d.pageId] ? "Hide diff" : "Show diff"}
                </button>
              </div>
              {expanded[d.pageId] && d.entries.length > 0 && (
                <div style={{ maxHeight: 280, overflowY: "auto", marginTop: 8, fontSize: 11 }}>
                  {d.entries.map((e) => (
                    <div
                      key={e.id}
                      style={{
                        borderBottom: `1px solid ${colors.borderLight}`,
                        padding: "6px 0",
                      }}
                    >
                      <div style={{ color: colors.textMuted, fontSize: 10, marginBottom: 2 }}>
                        &lt;{e.context}&gt;
                      </div>
                      <div style={{ color: colors.errorText, textDecoration: "line-through", marginBottom: 2 }}>
                        {e.oldText}
                      </div>
                      <div style={{ color: colors.successText }}>
                        {e.newText}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {d.entries.length === 0 && (
                <p style={{ margin: "6px 0 0", fontSize: 11, color: colors.textMuted }}>
                  Gemini returned no changes for this page.
                </p>
              )}
            </div>
          ))}

          <button
            style={{ ...brandingButtonStyle, width: "100%", marginTop: 8 }}
            onClick={handleApply}
            disabled={applyBusy || approvedCount === 0}
          >
            {applyBusy ? "Saving…" : `Apply approved (${approvedCount})`}
          </button>
        </div>
      )}

      {report && (
        <div style={subtlePanelStyle}>
          <strong>Result</strong>
          <div style={{ fontSize: 13 }}>
            {report.pagesApplied} saved · {report.pagesFailed} failed
          </div>
          {report.errors.length > 0 && (
            <details>
              <summary style={{ color: colors.danger, cursor: "pointer" }}>
                {report.errors.length} error{report.errors.length === 1 ? "" : "s"}
              </summary>
              <pre style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>{report.errors.slice(0, 10).join("\n")}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
