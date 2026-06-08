/**
 * TailorEmailsForm — sub-view under useOption.type === "emails".
 *
 * Mirrors EditPagesForm's structure (same three-source prospect picker,
 * same tone choices, same per-card diff approval pattern), but operates
 * on Staffbase email-service templates instead of pages.
 *
 * Flow:
 *   1. On mount, discoverEmailTemplates lists every template across all
 *      galleries, pre-counted with `textFragmentCount` so the user can
 *      see which templates have substantive content to tailor.
 *   2. Prospect picker (same three sources as EditPagesForm):
 *        - From Branding (if a prospect was set + Gemini sparkle ran)
 *        - From a saved prospect (name only, news must be researched)
 *        - Research inline with Gemini (calls fetchProspectIntelligence)
 *   3. Tone dropdown (Professional / Friendly / Executive).
 *   4. "Generate tailored content" runs buildEmailTemplateDiffs which
 *      fetches each template's pikasso tree, walks every
 *      textMarkupValue fragment, batches text nodes to Gemini for a
 *      single rewrite call per template, then splices rewrites back
 *      into the tree. Nothing is written yet.
 *   5. Per-template diff cards (collapsible) show old → new for every
 *      changed text block. Each card has an Approve checkbox.
 *   6. "Apply approved" PUTs each approved template's content back via
 *      /api/email-service/templates/{id}/contents/pikasso.
 *
 * V1 scope:
 *   - Templates only (not live email drafts in folders — those use the
 *     same endpoint shape, easy V2 extension).
 *   - No template-name editing (we leave the template's name and
 *     gallery placement alone; only the inner pikasso content changes).
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
  discoverEmailTemplates,
  buildEmailTemplateDiffs,
  applyApprovedEmailTemplateEdits,
} from "../utils/automationOperations/emailTemplateTailor";
import type {
  EmailTemplateSummary,
  EmailTemplateDiff,
  EmailApplyReport,
} from "../utils/automationOperations/emailTemplateTailor";
import { fetchProspectIntelligence } from "../utils/aiUtils";
import type { Prospect } from "./SavedProspects";

type Tone = "professional" | "friendly" | "executive";

interface TailorEmailsFormProps {
  apiToken: string;
  apiDomain: string;
  onLog: (line: string) => void;
  prospectNameSeed?: string;
  prospectNewsSeed?: string;
  savedProspects?: Prospect[];
}

const selectStyle: React.CSSProperties = { ...inputStyle, width: "100%", padding: "8px" };

const toneOptions: Array<{ key: Tone; label: string; hint: string }> = [
  { key: "professional", label: "Professional", hint: "Clear, factual, business-appropriate." },
  { key: "friendly", label: "Friendly", hint: "Warmer, conversational, employee-first." },
  { key: "executive", label: "Executive", hint: "Concise, leadership-voiced, strategic." },
];

export default function TailorEmailsForm({
  apiToken,
  apiDomain,
  onLog,
  prospectNameSeed,
  prospectNewsSeed,
  savedProspects = [],
}: TailorEmailsFormProps) {
  /* ── State ─────────────────────────────────────────────────────────── */
  const [prospect, setProspect] = useState<string>(prospectNameSeed ?? "");
  const [prospectNews, setProspectNews] = useState<string>(prospectNewsSeed ?? "");
  const [prospectSource, setProspectSource] = useState<"branding" | "saved" | "research" | "manual">(
    prospectNewsSeed ? "branding" : prospectNameSeed ? "branding" : "manual",
  );
  const [researchBusy, setResearchBusy] = useState(false);
  const [tone, setTone] = useState<Tone>("professional");
  const [templates, setTemplates] = useState<EmailTemplateSummary[]>([]);
  const [discoverBusy, setDiscoverBusy] = useState(false);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());
  const [generateBusy, setGenerateBusy] = useState(false);
  const [diffs, setDiffs] = useState<EmailTemplateDiff[]>([]);
  const [approvals, setApprovals] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [applyBusy, setApplyBusy] = useState(false);
  const [report, setReport] = useState<EmailApplyReport | null>(null);

  const ctx = { apiToken, apiDomain, onProgress: (m: string) => onLog(m) };

  // Keep prospect input in sync with Branding seed if the user populates it later.
  useEffect(() => {
    if (prospectNameSeed && !prospect) setProspect(prospectNameSeed);
  }, [prospectNameSeed, prospect]);

  // Discover templates on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDiscoverBusy(true);
      try {
        const found = await discoverEmailTemplates(ctx);
        if (cancelled) return;
        setTemplates(found);
        setSelectedTemplateIds(new Set(found.filter((t) => t.textFragmentCount > 0).map((t) => t.id)));
      } catch (err) {
        if (!cancelled) onLog(`❌ Template discovery failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (!cancelled) setDiscoverBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Prospect actions (mirrors EditPagesForm) ─────────────────────── */
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
      setProspectNews(news);
      setProspectSource("research");
      onLog(
        news
          ? `✨ Research complete — ${news.length} chars of context loaded.`
          : `⚠️ Research returned no news for "${trimmed}". Proceeding with name only.`,
      );
    } catch (err) {
      onLog(`❌ Research failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setResearchBusy(false);
    }
  };

  /* ── Template-list actions ─────────────────────────────────────────── */
  const toggleSelected = (id: string) => {
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (selectedTemplateIds.size === 0) {
      onLog("⚠️ Pick at least one template first.");
      return;
    }
    setGenerateBusy(true);
    setDiffs([]);
    setApprovals({});
    setExpanded({});
    setReport(null);
    try {
      const selected = templates.filter((t) => selectedTemplateIds.has(t.id));
      const result = await buildEmailTemplateDiffs(
        {
          templates: selected,
          prospect: prospect ? { name: prospect, news: prospectNews || undefined } : undefined,
          tone,
        },
        ctx,
      );
      setDiffs(result);
      const initialApprovals: Record<string, boolean> = {};
      for (const d of result) initialApprovals[d.templateId] = d.entries.length > 0;
      setApprovals(initialApprovals);
      onLog(`✅ ${result.length} template(s) processed. Review diffs below.`);
    } catch (err) {
      onLog(`❌ Generate failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerateBusy(false);
    }
  };

  const handleApply = async () => {
    const approved = diffs.filter((d) => approvals[d.templateId] && d.entries.length > 0);
    if (approved.length === 0) {
      onLog("⚠️ No templates approved.");
      return;
    }
    if (
      !window.confirm(
        `Write text changes to ${approved.length} email template(s)? Originals are NOT backed up.`,
      )
    )
      return;
    setApplyBusy(true);
    try {
      const result = await applyApprovedEmailTemplateEdits({ diffs: approved }, ctx);
      setReport(result);
      onLog(`📨 Saved ${result.templatesApplied} template(s); ${result.templatesFailed} failed.`);
    } catch (err) {
      onLog(`❌ Apply failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setApplyBusy(false);
    }
  };

  /* ── UI ────────────────────────────────────────────────────────────── */
  const approvedCount = Object.values(approvals).filter(Boolean).length;
  const totalChangeCount = diffs
    .filter((d) => approvals[d.templateId])
    .reduce((acc, d) => acc + d.entries.length, 0);

  return (
    <div>
      <h2>Tailor Emails</h2>
      <p style={subDescriptionStyle}>
        Rewrite the TEXT inside email designer templates to match your prospect.
        Layout, images, social-icon configs, and colors stay untouched.
      </p>

      {/* Prospect + tone (mirrors EditPagesForm) */}
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
                e.target.value = "";
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

      {/* Template selector */}
      <div style={panelStyle}>
        <label style={labelStyle}>
          Email templates
          {discoverBusy ? " (discovering…)" : templates.length ? ` (${selectedTemplateIds.size}/${templates.length} selected)` : " (none found)"}
        </label>
        <div style={{ maxHeight: 240, overflowY: "auto", border: `1px solid ${colors.borderMedium}`, borderRadius: 4, padding: 6 }}>
          {templates.length === 0 && !discoverBusy && (
            <p style={{ margin: 0, fontSize: 11, color: colors.textMuted }}>
              No email templates found. Install them first via Set Up → Email templates, or in Staffbase Studio.
            </p>
          )}
          {templates.map((t) => {
            const isSelected = selectedTemplateIds.has(t.id);
            const hasText = t.textFragmentCount > 0;
            return (
              <label
                key={t.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  padding: "4px 0",
                  cursor: hasText ? "pointer" : "not-allowed",
                  opacity: hasText ? 1 : 0.5,
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelected(t.id)}
                  disabled={!hasText || generateBusy || applyBusy}
                />
                <strong style={{ flex: 1 }}>{t.name}</strong>
                <span style={{ color: colors.textMuted, fontSize: 10 }}>
                  {t.galleryName} · {t.textFragmentCount} block{t.textFragmentCount === 1 ? "" : "s"}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <button
        style={{ ...brandingButtonStyle, width: "100%" }}
        onClick={handleGenerate}
        disabled={generateBusy || applyBusy || selectedTemplateIds.size === 0}
      >
        {generateBusy
          ? "Asking Gemini…"
          : `Generate tailored content (${selectedTemplateIds.size} template${selectedTemplateIds.size === 1 ? "" : "s"})`}
      </button>

      {/* Diffs */}
      {diffs.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>
            Proposed changes ({approvedCount} of {diffs.length} approved · {totalChangeCount} block
            {totalChangeCount === 1 ? "" : "s"})
          </h3>
          {diffs.map((d) => (
            <div key={d.templateId} style={{ ...subtlePanelStyle, padding: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={!!approvals[d.templateId]}
                  onChange={(e) => setApprovals({ ...approvals, [d.templateId]: e.target.checked })}
                  disabled={d.entries.length === 0 || applyBusy}
                />
                <strong style={{ flex: 1 }}>{d.templateName}</strong>
                <span style={{ fontSize: 11, color: colors.textMuted }}>
                  {d.entries.length} change{d.entries.length === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  onClick={() => setExpanded({ ...expanded, [d.templateId]: !expanded[d.templateId] })}
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 4,
                    border: `1px solid ${colors.border}`,
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  {expanded[d.templateId] ? "Hide diff" : "Show diff"}
                </button>
              </div>
              {expanded[d.templateId] && d.entries.length > 0 && (
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
                        &lt;{e.context}&gt; · fragment #{e.fragmentIndex}
                      </div>
                      <div style={{ color: colors.errorText, textDecoration: "line-through", marginBottom: 2 }}>
                        {e.oldText}
                      </div>
                      <div style={{ color: colors.successText }}>{e.newText}</div>
                    </div>
                  ))}
                </div>
              )}
              {d.entries.length === 0 && (
                <p style={{ margin: "6px 0 0", fontSize: 11, color: colors.textMuted }}>
                  Gemini returned no changes for this template.
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
            {report.templatesApplied} saved · {report.templatesFailed} failed
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
