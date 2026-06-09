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
import { HiSparkles } from "react-icons/hi";
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
// Reuse the same intelligence fetch that BrandingForm's sparkle uses, so
// "Research now" in EditPagesForm produces the same news shape we accept
// from the Branding-seed path.
import { fetchProspectIntelligence, buildProspectBrief } from "../utils/aiUtils";
import type { ProspectBrief } from "../utils/aiUtils";
// Saved prospects only store BRANDING fields (colors / logo / padding) —
// not news. Picking a saved prospect populates the name but leaves news
// empty; user can click Research to enrich.
import type { Prospect } from "./SavedProspects";

type Tone = "professional" | "friendly" | "executive";

interface EditPagesFormProps {
  apiToken: string;
  apiDomain: string;
  onLog: (line: string) => void;
  /** Seeded from App.tsx's prospect state if user already worked the Branding flow. */
  prospectNameSeed?: string;
  prospectNewsSeed?: string;
  /** Saved prospects from chrome.storage / localStorage (via useSavedProspects). */
  savedProspects?: Prospect[];
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
  savedProspects = [],
}: EditPagesFormProps) {
  /* ── State ─────────────────────────────────────────────────────────── */
  const [prospect, setProspect] = useState<string>(prospectNameSeed ?? "");
  /**
   * Active prospect news that flows into the Gemini rewrite prompt. Three
   * paths populate this:
   *   - Branding seed: copied from prospectNewsSeed on mount or via the
   *     "Use Branding prospect" button.
   *   - Saved prospect: stays empty (saved prospects don't store news),
   *     but the prospect name still drives the Gemini prompt — Gemini
   *     just gets less context.
   *   - Research with Gemini: this form calls fetchProspectIntelligence
   *     directly and fills news + sets the input.
   */
  const [prospectNews, setProspectNews] = useState<string>(prospectNewsSeed ?? "");
  const [prospectSource, setProspectSource] = useState<"branding" | "saved" | "research" | "manual">(
    prospectNewsSeed ? "branding" : prospectNameSeed ? "branding" : "manual",
  );
  const [researchBusy, setResearchBusy] = useState(false);
  /** Structured brief — see TailorEmailsForm header for the same comment. */
  const [brief, setBrief] = useState<ProspectBrief | null>(null);
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

  /** Pull the Branding-flow prospect + cached news into local state. */
  const handleUseBranding = () => {
    if (!prospectNameSeed) {
      onLog("⚠️ No prospect set in the Branding flow yet.");
      return;
    }
    setProspect(prospectNameSeed);
    setProspectNews(prospectNewsSeed ?? "");
    setProspectSource("branding");
    onLog(
      prospectNewsSeed
        ? `📥 Using "${prospectNameSeed}" from Branding (news loaded, ${prospectNewsSeed.length} chars).`
        : `📥 Using "${prospectNameSeed}" from Branding (no news cached — click Research to enrich).`,
    );
  };

  /** Pick a saved prospect — fills name only, news must be fetched separately. */
  const handlePickSaved = (prospectId: string) => {
    if (!prospectId) return;
    const found = savedProspects.find((p) => p.id === prospectId);
    if (!found?.prospectName) {
      onLog(`⚠️ Couldn't find saved prospect "${prospectId}".`);
      return;
    }
    setProspect(found.prospectName);
    setProspectNews("");
    setProspectSource("saved");
    onLog(`📥 Loaded saved prospect "${found.prospectName}". Click Research to add news context.`);
  };

  /**
   * Call fetchProspectIntelligence with whatever's currently in the
   * prospect input. Mirrors BrandingForm's sparkle button. News is loaded
   * into local state and flows into the Gemini rewrite prompt.
   */
  const handleResearchProspect = async () => {
    const trimmed = prospect.trim();
    if (trimmed.length < 2) {
      onLog("⚠️ Enter a prospect name first (>= 2 chars).");
      return;
    }
    setResearchBusy(true);
    try {
      onLog(`🔎 Researching "${trimmed}" with Gemini…`);
      const intel = await fetchProspectIntelligence(trimmed, { apiToken, apiDomain });
      const news = (intel.news || "").trim();
      const websiteUrl = (intel.websiteUrl || "").trim();
      setProspectNews(news);
      setProspectSource("research");
      onLog(
        news
          ? `✨ Research complete — ${news.length} chars of context loaded.`
          : `⚠️ Research returned no news for "${trimmed}". Proceeding with name only.`,
      );

      // Distill structured brief so the rewrite prompt has crisp signals.
      if (news) {
        onLog("🧠 Distilling structured brief for the rewrite prompt…");
        const b = await buildProspectBrief(
          { prospectName: trimmed, prospectNews: news, websiteUrl },
          { apiToken, apiDomain },
        );
        setBrief(b);
        onLog(
          `📋 Brief: ${b.industry} · audience "${b.audience.slice(0, 60)}" · ${b.products.length} product(s) · ${b.recentInitiatives.length} initiative(s).`,
        );
      } else {
        setBrief(null);
      }
    } catch (err) {
      onLog(`❌ Research failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setResearchBusy(false);
    }
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
      // Lazy-build the brief if we have news but no brief yet (e.g.
      // user came in via "Use Branding" which has news but no brief).
      let effectiveBrief = brief;
      if (!effectiveBrief && prospect && prospectNews) {
        onLog("🧠 Building prospect brief (one-time) for the rewrite prompt…");
        try {
          effectiveBrief = await buildProspectBrief(
            { prospectName: prospect, prospectNews },
            { apiToken, apiDomain },
          );
          setBrief(effectiveBrief);
          onLog(`📋 Brief: ${effectiveBrief.industry} · ${effectiveBrief.products.length} product(s).`);
        } catch (briefErr) {
          onLog(`⚠️ Brief build failed (falling back to raw news): ${briefErr instanceof Error ? briefErr.message : String(briefErr)}`);
        }
      }

      const result = await buildEditDiffsForPages(
        {
          pageIds: Array.from(selectedPageIds),
          // Use the LOCAL prospectNews (populated by branding-seed copy /
          // saved-prospect pick / research), not the seed prop directly.
          // The seed is just the starting value; the user may have refreshed
          // research or switched to a different prospect since.
          prospect: prospect ? { name: prospect, news: prospectNews || undefined } : undefined,
          brief: effectiveBrief ?? undefined,
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

      {/* Prospect + tone — three fill mechanisms:
            1. Use the prospect currently being worked on in Branding (has news)
            2. Pick from saved prospects (name only — saved prospects don't cache news)
            3. Research the typed name with Gemini (calls fetchProspectIntelligence)
          The news context flows into the Gemini rewrite prompt. Without news,
          rewrites are less tailored but still work using the name alone. */}
      <div style={panelStyle}>
        <label style={labelStyle}>Prospect (company name)</label>
        <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
          <input
            type="text"
            style={{ ...inputStyle, flex: 1 }}
            value={prospect}
            onChange={(e) => {
              setProspect(e.target.value);
              setProspectSource("manual");
            }}
            placeholder="e.g. Stryker, Sun Life, Cummins"
            disabled={generateBusy || applyBusy || researchBusy}
          />
          <button
            type="button"
            onClick={handleResearchProspect}
            disabled={generateBusy || applyBusy || researchBusy || prospect.trim().length < 2}
            title="Call fetchProspectIntelligence to load news context"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "0 12px",
              borderRadius: 4,
              border: "none",
              background: prospect.trim().length < 2 || researchBusy ? colors.uiGray : colors.primary,
              color: colors.textOnPrimary,
              fontSize: 12,
              fontWeight: 600,
              cursor: prospect.trim().length < 2 || researchBusy ? "not-allowed" : "pointer",
            }}
          >
            <HiSparkles /> {researchBusy ? "…" : "Research"}
          </button>
        </div>

        {/* Quick-fill row: Branding seed + saved-prospects picker */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={handleUseBranding}
            disabled={!prospectNameSeed || generateBusy || applyBusy || researchBusy}
            title={
              prospectNameSeed
                ? `Use "${prospectNameSeed}" from the Branding flow`
                : "No Branding prospect set yet"
            }
            style={{
              fontSize: 11,
              padding: "4px 10px",
              borderRadius: 4,
              border: `1px solid ${prospectNameSeed ? colors.primary : colors.border}`,
              background: prospectSource === "branding" ? colors.primaryOverlay20 : "transparent",
              color: prospectNameSeed ? colors.primary : colors.textMuted,
              cursor: prospectNameSeed ? "pointer" : "not-allowed",
              fontWeight: prospectSource === "branding" ? 600 : 400,
            }}
          >
            From Branding{prospectNameSeed ? `: ${prospectNameSeed}` : ""}
          </button>

          {savedProspects.length > 0 && (
            <select
              onChange={(e) => {
                handlePickSaved(e.target.value);
                e.target.value = ""; // reset so the same one can be re-picked
              }}
              disabled={generateBusy || applyBusy || researchBusy}
              defaultValue=""
              style={{
                fontSize: 11,
                padding: "4px 8px",
                borderRadius: 4,
                border: `1px solid ${colors.border}`,
                background: "transparent",
                cursor: "pointer",
                minHeight: 28,
              }}
            >
              <option value="">Saved prospects ({savedProspects.length}) ▼</option>
              {savedProspects.map((p) => (
                <option key={p.id ?? p.prospectName} value={p.id ?? ""}>
                  {p.prospectName}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* News status indicator */}
        <div style={{ marginTop: 8, fontSize: 11 }}>
          {prospectNews ? (
            <div style={{ color: colors.successText, display: "flex", alignItems: "center", gap: 6 }}>
              <span>✓</span>
              <span>
                News loaded ({prospectNews.length} chars
                {prospectSource === "branding" ? " · from Branding" : prospectSource === "research" ? " · from Research" : ""})
              </span>
              <button
                type="button"
                onClick={() => {
                  setProspectNews("");
                  setProspectSource("manual");
                }}
                style={{
                  fontSize: 10,
                  padding: "1px 6px",
                  background: "transparent",
                  border: `1px solid ${colors.border}`,
                  borderRadius: 3,
                  cursor: "pointer",
                  marginLeft: "auto",
                  color: colors.textMuted,
                }}
              >
                Clear
              </button>
            </div>
          ) : prospect.trim() ? (
            <div style={{ color: colors.warningText }}>
              ⚠ No news context loaded — Gemini will use the name alone. Click Research to enrich.
            </div>
          ) : (
            <div style={{ color: colors.textMuted }}>
              Enter a prospect or pick one above; news context is optional but improves rewrites.
            </div>
          )}
        </div>

        {/* 📋 Structured brief — what Gemini extracted from the prospect news,
            shown as a collapsible panel so the SE can verify the signals
            driving the rewrite before clicking Generate. */}
        {brief && (
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: "pointer", fontSize: 11, color: colors.textMuted }}>
              📋 Prospect brief ({brief.industry} · {brief.products.length} product(s) · {brief.recentInitiatives.length} initiative(s))
            </summary>
            <div style={{ fontSize: 11, padding: "8px 0", lineHeight: 1.5 }}>
              <div><strong>Audience:</strong> {brief.audience}</div>
              <div><strong>Voice:</strong> {brief.voice}</div>
              {brief.themes.length > 0 && <div><strong>Themes:</strong> {brief.themes.join(", ")}</div>}
              {brief.products.length > 0 && <div><strong>Products:</strong> {brief.products.join(", ")}</div>}
              {brief.recentInitiatives.length > 0 && (
                <div><strong>Initiatives:</strong> {brief.recentInitiatives.join(" · ")}</div>
              )}
              {brief.leadership.length > 0 && <div><strong>Leadership:</strong> {brief.leadership.join(" · ")}</div>}
              <div style={{ marginTop: 4, fontStyle: "italic", color: colors.textMedium }}>
                {brief.oneLiner}
              </div>
            </div>
          </details>
        )}

        {prospectNews && (
          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: "pointer", fontSize: 11, color: colors.textMuted }}>
              See what Gemini has on file
            </summary>
            <pre style={{ fontSize: 10, whiteSpace: "pre-wrap", color: colors.textBody, marginTop: 4, maxHeight: 160, overflowY: "auto" }}>
              {prospectNews}
            </pre>
          </details>
        )}

        <label style={{ ...labelStyle, marginTop: 12 }}>Tone</label>
        <select
          style={selectStyle}
          value={tone}
          onChange={(e) => setTone(e.target.value as Tone)}
          disabled={generateBusy || applyBusy || researchBusy}
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
