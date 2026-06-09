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
  // V2 actions: translate templates to a new locale (new template), or
  // spin up email drafts from templates.
  cloneTranslatedTemplates,
  createDraftsFromTemplates,
} from "../utils/automationOperations/emailTemplateTailor";
import type {
  EmailTemplateSummary,
  EmailTemplateDiff,
  EmailApplyReport,
  TranslatedTemplateReport,
  CreatedDraftReport,
} from "../utils/automationOperations/emailTemplateTailor";
import { fetchProspectIntelligence, buildProspectBrief } from "../utils/aiUtils";
import type { ProspectBrief } from "../utils/aiUtils";
import type { Prospect } from "./SavedProspects";

type Tone = "professional" | "friendly" | "executive";

interface TailorEmailsFormProps {
  apiToken: string;
  apiDomain: string;
  onLog: (line: string) => void;
  prospectNameSeed?: string;
  prospectNewsSeed?: string;
  savedProspects?: Prospect[];
  /** Locales the tenant has configured (from /api/branch). Drives the
   *  translation target dropdown. If absent, falls back to a built-in
   *  short list so demos still work. */
  availableLocales?: string[];
}

/** Three actions Tailor Emails can perform on the selected templates. */
type EmailAction = "edit" | "translate" | "draft";

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
  availableLocales,
}: TailorEmailsFormProps) {
  /* ── State ─────────────────────────────────────────────────────────── */
  const [prospect, setProspect] = useState<string>(prospectNameSeed ?? "");
  const [prospectNews, setProspectNews] = useState<string>(prospectNewsSeed ?? "");
  const [prospectSource, setProspectSource] = useState<"branding" | "saved" | "research" | "manual">(
    prospectNewsSeed ? "branding" : prospectNameSeed ? "branding" : "manual",
  );
  const [researchBusy, setResearchBusy] = useState(false);
  /**
   * Structured brief derived from prospect name + news. Built either:
   *   (a) explicitly when the user clicks Research (handleResearchProspect)
   *   (b) on-demand inside handleGenerate when news exists but brief
   *       doesn't (e.g. coming in from "Use Branding" which provides
   *       news but no brief). Without a brief, Gemini gets only the raw
   *       news blob and produces timid edits — see commit notes for
   *       prior issue.
   */
  const [brief, setBrief] = useState<ProspectBrief | null>(null);
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
  /* ── V2 action state ────────────────────────────────────────────────── */
  // Which output mode the user wants. "edit" keeps the V1 behavior
  // (rewrite in place). "translate" clones to a new template with
  // translated content. "draft" creates an email draft in a folder.
  const [action, setAction] = useState<EmailAction>("edit");
  // Target locale for the "translate" action. Default to fr_FR because
  // French is the most common multi-locale demo ask; user can switch.
  const [targetLocale, setTargetLocale] = useState<string>("fr_FR");
  // Folder name for the "draft" action. Created if it doesn't exist.
  const [draftFolder, setDraftFolder] = useState<string>("Replify Drafts");
  // Per-action reports — kept separate so switching modes doesn't
  // clobber a result you might still want to see.
  const [translateReport, setTranslateReport] = useState<TranslatedTemplateReport[] | null>(null);
  const [draftReport, setDraftReport] = useState<CreatedDraftReport[] | null>(null);

  // Locales to offer in the translation dropdown. Prefer the tenant's
  // configured availableLocales (from /api/branch); fall back to a
  // built-in short list so the form still works on tenants where
  // branch fetch failed.
  const FALLBACK_LOCALES = ["en_US", "de_DE", "fr_FR", "es_ES", "it_IT", "pt_BR", "nl_NL", "ja_JP", "zh_CN"];
  const locales = (availableLocales && availableLocales.length > 0) ? availableLocales : FALLBACK_LOCALES;

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
      const websiteUrl = (intel.websiteUrl || "").trim();
      setProspectNews(news);
      setProspectSource("research");
      onLog(
        news
          ? `✨ Research complete — ${news.length} chars of context loaded.`
          : `⚠️ Research returned no news for "${trimmed}". Proceeding with name only.`,
      );

      // Now distill into a structured brief so the rewrite prompt has
      // crisp signals (products, leadership, initiatives) instead of a
      // raw news blob to forage in. Skip if news is empty.
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

      // Lazy-build the brief if we have news but no brief yet. This
      // covers the "Use Branding" path where news comes in from
      // BrandingForm's sparkle but the structured brief was never built.
      let effectiveBrief = brief;
      if (!effectiveBrief && prospect && prospectNews) {
        onLog("🧠 Building prospect brief (one-time) for the rewrite prompt…");
        try {
          effectiveBrief = await buildProspectBrief(
            { prospectName: prospect, prospectNews },
            { apiToken, apiDomain },
          );
          setBrief(effectiveBrief);
          onLog(
            `📋 Brief: ${effectiveBrief.industry} · ${effectiveBrief.products.length} product(s) · ${effectiveBrief.recentInitiatives.length} initiative(s).`,
          );
        } catch (briefErr) {
          // Non-fatal — rewrite still works with raw news, just less specific.
          onLog(`⚠️ Brief build failed (will fall back to raw news): ${briefErr instanceof Error ? briefErr.message : String(briefErr)}`);
        }
      }

      // Three action branches:
      //   - "edit": V1 behavior — produce diffs, user approves, applyApprovedEmailTemplateEdits PUTs back.
      //   - "translate": one-shot — for each source, POST a new template + Gemini-translates + PUT. No approval step (creates NEW resources, original templates are untouched).
      //   - "draft": one-shot — for each source, POST a new email draft in a folder + Gemini-rewrites + PUT. Same logic: creates NEW resources, additive only.
      const prospectArg = prospect ? { name: prospect, news: prospectNews || undefined } : undefined;
      setTranslateReport(null);
      setDraftReport(null);

      if (action === "translate") {
        onLog(`🌐 Translating ${selected.length} template(s) → ${targetLocale}…`);
        const result = await cloneTranslatedTemplates(
          {
            sources: selected,
            targetLocale,
            prospect: prospectArg,
            brief: effectiveBrief ?? undefined,
          },
          ctx,
        );
        setTranslateReport(result);
        const ok = result.filter((r) => r.newTemplateId).length;
        onLog(`✅ Translation complete — ${ok}/${result.length} new template(s) created in ${targetLocale}.`);
        return;
      }

      if (action === "draft") {
        onLog(`📨 Creating ${selected.length} email draft(s) in folder "${draftFolder}"…`);
        const result = await createDraftsFromTemplates(
          {
            sources: selected,
            folderName: draftFolder,
            // V1 of drafts: en_US locale only. Multi-locale drafts are a
            // follow-up — would need to translate per-locale and write
            // each into the contents map.
            locale: "en_US",
            prospect: prospectArg,
            brief: effectiveBrief ?? undefined,
            tone,
          },
          ctx,
        );
        setDraftReport(result);
        const ok = result.filter((r) => r.newDraftId).length;
        onLog(`✅ Drafts complete — ${ok}/${result.length} email draft(s) created in "${draftFolder}".`);
        return;
      }

      // action === "edit" — V1 in-place edit flow with approve step.
      const result = await buildEmailTemplateDiffs(
        {
          templates: selected,
          prospect: prospectArg,
          brief: effectiveBrief ?? undefined,
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

        {/* 📋 Structured brief — what Gemini extracted from the prospect news.
            Shown as a collapsible panel so the SE can sanity-check what
            signals are driving the rewrite before they click Generate. */}
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

        {/* 🎬 Action selector — picks which output flow runs when the
            user clicks Generate. Reveals additional inputs per action. */}
        <label style={{ ...labelStyle, marginTop: 12 }}>Action</label>
        <select
          style={selectStyle}
          value={action}
          onChange={(e) => {
            setAction(e.target.value as EmailAction);
            // Switching action invalidates any in-flight diffs/reports
            setDiffs([]);
            setReport(null);
            setTranslateReport(null);
            setDraftReport(null);
          }}
          disabled={generateBusy || applyBusy || researchBusy}
        >
          <option value="edit">Edit in place — rewrite the selected templates</option>
          <option value="translate">Translate to new templates — clone + translate to another locale</option>
          <option value="draft">Create email drafts — make ready-to-send draft emails from templates</option>
        </select>

        {action === "translate" && (
          <div style={{ marginTop: 8 }}>
            <label style={{ ...labelStyle, fontSize: 11 }}>Target locale</label>
            <select
              style={selectStyle}
              value={targetLocale}
              onChange={(e) => setTargetLocale(e.target.value)}
              disabled={generateBusy || applyBusy || researchBusy}
            >
              {locales.filter((l) => l !== "en_US").map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: colors.textMuted, lineHeight: 1.4 }}>
              Each selected template gets a NEW twin named "…—{" "}
              {locales.includes(targetLocale) ? targetLocale : targetLocale}" in the same gallery.
              Originals stay untouched.
            </p>
          </div>
        )}

        {action === "draft" && (
          <div style={{ marginTop: 8 }}>
            <label style={{ ...labelStyle, fontSize: 11 }}>Folder for new drafts</label>
            <input
              type="text"
              style={{ ...inputStyle, width: "100%" }}
              value={draftFolder}
              onChange={(e) => setDraftFolder(e.target.value)}
              placeholder="Replify Drafts"
              disabled={generateBusy || applyBusy || researchBusy}
            />
            <p style={{ margin: "4px 0 0", fontSize: 11, color: colors.textMuted, lineHeight: 1.4 }}>
              Folder will be created if it doesn't exist. Each draft uses
              the source template as its layout + Gemini-tailored text.
              Subject defaults to "&lt;template name&gt; — &lt;prospect&gt;".
            </p>
          </div>
        )}
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
          ? action === "translate"
            ? "Translating with Gemini…"
            : action === "draft"
            ? "Creating drafts…"
            : "Asking Gemini…"
          : action === "translate"
          ? `Translate to ${targetLocale} (${selectedTemplateIds.size} template${selectedTemplateIds.size === 1 ? "" : "s"})`
          : action === "draft"
          ? `Create ${selectedTemplateIds.size} draft${selectedTemplateIds.size === 1 ? "" : "s"} in "${draftFolder}"`
          : `Generate tailored content (${selectedTemplateIds.size} template${selectedTemplateIds.size === 1 ? "" : "s"})`}
      </button>

      {/* Translate result panel — appears after a translate run completes */}
      {translateReport && (
        <div style={{ ...subtlePanelStyle, marginTop: 14 }}>
          <strong>Translated templates</strong>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            {translateReport.filter((r) => r.newTemplateId).length}/{translateReport.length} created ·{" "}
            {translateReport.reduce((acc, r) => acc + r.changeCount, 0)} blocks translated
          </div>
          {translateReport.map((r) => (
            <div key={r.sourceTemplateId} style={{ fontSize: 11, padding: "4px 0", borderBottom: `1px solid ${colors.borderLight}` }}>
              <div>
                {r.newTemplateId ? "✅" : "❌"} <strong>{r.newTemplateName}</strong>
                {r.changeCount > 0 && <span style={{ color: colors.textMuted, marginLeft: 6 }}>· {r.changeCount} blocks</span>}
              </div>
              {r.error && <div style={{ color: colors.danger, fontSize: 10 }}>{r.error}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Drafts result panel — appears after a draft run completes */}
      {draftReport && (
        <div style={{ ...subtlePanelStyle, marginTop: 14 }}>
          <strong>Email drafts</strong>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            {draftReport.filter((r) => r.newDraftId).length}/{draftReport.length} created ·{" "}
            {draftReport.reduce((acc, r) => acc + r.changeCount, 0)} blocks tailored
          </div>
          {draftReport.map((r) => (
            <div key={r.sourceTemplateId} style={{ fontSize: 11, padding: "4px 0", borderBottom: `1px solid ${colors.borderLight}` }}>
              <div>
                {r.newDraftId ? "✅" : "❌"} <strong>{r.newDraftTitle}</strong>
                {r.changeCount > 0 && <span style={{ color: colors.textMuted, marginLeft: 6 }}>· {r.changeCount} blocks</span>}
              </div>
              {r.error && <div style={{ color: colors.danger, fontSize: 10 }}>{r.error}</div>}
            </div>
          ))}
          <p style={{ margin: "8px 0 0", fontSize: 10, color: colors.textMuted, lineHeight: 1.4 }}>
            Drafts are visible in Staffbase Studio → Email → Drafts. Preview, edit, or send from there.
          </p>
        </div>
      )}

      {/* Diffs (only for action === "edit" — the other actions don't go through approve) */}
      {action === "edit" && diffs.length > 0 && (
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
