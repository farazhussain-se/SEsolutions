/**
 * Personas & Groups form — sub-view under useOption.type === "users".
 *
 * Bolt-in port of staffbase-demo-group-tool, now with a Gemini prospect-
 * research stage layered on top so the SE doesn't have to think about
 * industry buckets at all in the common case.
 *
 * Flow:
 *   1. (optional) "Research with Gemini" — types a prospect name (pre-filled
 *      from the BrandingForm prospect if one was set), clicks the sparkle.
 *      Calls researchProspectForPersonas which reuses Replify's existing
 *      fetchProspectIntelligence to learn what the company does, then asks
 *      Gemini to pick the best industry bucket and propose 8 prospect-themed
 *      group names. The form shows the inferred industry + groups so the
 *      user can sanity-check.
 *
 *   2. "Preview" — fetches activated users from the tenant and calls
 *      matchUsersToIndustry. If a research result is available, prospect
 *      context is passed so positions/departments come back prospect-
 *      specific (e.g. "MAKO Robotic-Arm Specialist") rather than generic.
 *
 *   3. "Apply" — writes positions+departments via POST /users/{id}, sets
 *      managers via PATCH /users/{id} with v3 accessor headers, creates
 *      the 8 groups (custom-from-research OR industry template), then
 *      round-robin-assigns users into them.
 *
 * All Staffbase API calls live in personas.ts so this component stays
 * pure-UI. Auth (apiToken + apiDomain) and prospect seeds come from props.
 */

import React, { useState, useEffect } from "react";
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
  fetchPersonaCandidates,
  researchProspectForPersonas,
  matchUsersToIndustry,
  applyPersonas,
} from "../utils/automationOperations/personas";
import type {
  PersonaCandidate,
  PersonaAssignment,
  ApplyPersonasReport,
  ProspectResearchResult,
} from "../utils/automationOperations/personas";
import { personaIndustryKeys, PERSONA_INDUSTRIES } from "../utils/automationOperations/industryTemplates";

interface PersonasFormProps {
  apiToken: string;
  apiDomain: string;
  onLog: (line: string) => void;
  /** Seed value pulled from BrandingForm's prospect input (App.tsx state). */
  prospectNameSeed?: string;
  /**
   * Optional pre-fetched intelligence from BrandingForm's sparkle. If
   * present we use it as a head-start; otherwise the research button does
   * the full Gemini round-trip.
   */
  prospectNewsSeed?: string;
}

const selectStyle: React.CSSProperties = { ...inputStyle, width: "100%", padding: "8px" };

/** Sparkle-style button matching BrandingForm's "Fetch intelligence" trigger. */
const sparkleButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 12px",
  borderRadius: 6,
  border: "none",
  background: colors.primary,
  color: colors.textOnPrimary,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};

const reportRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "4px 0",
  fontSize: 13,
};

export default function PersonasForm({
  apiToken,
  apiDomain,
  onLog,
  prospectNameSeed,
  prospectNewsSeed,
}: PersonasFormProps) {
  /* ── State ──────────────────────────────────────────────────────────── */
  // Prospect input (seeded from BrandingForm if available, but editable).
  const [prospect, setProspect] = useState<string>(prospectNameSeed ?? "");
  // Industry — defaults to "auto" when research is intended; falls back to
  // healthcare for the static-template path.
  const [industryKey, setIndustryKey] = useState<string>(prospectNameSeed ? "auto" : "healthcare");
  // Research result (industry + 8 custom groups). Populated by the sparkle.
  const [research, setResearch] = useState<ProspectResearchResult | null>(
    // If BrandingForm already pulled news, surface it as a partial seed so
    // the user can still hit Preview without a full re-research.
    prospectNewsSeed
      ? {
          prospectName: prospectNameSeed ?? "",
          inferredIndustryKey: "other",
          inferredIndustryLabel: PERSONA_INDUSTRIES.other.label,
          customGroups: [],
          prospectNews: prospectNewsSeed,
          websiteUrl: "",
        }
      : null,
  );
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<PersonaCandidate[]>([]);
  const [assignments, setAssignments] = useState<PersonaAssignment[]>([]);
  const [report, setReport] = useState<ApplyPersonasReport | null>(null);

  // Keep the prospect input in sync with the BrandingForm input if the user
  // updates it in another tab/view. Only overwrites if our local field is
  // empty so we don't fight the user mid-typing.
  useEffect(() => {
    if (prospectNameSeed && !prospect) setProspect(prospectNameSeed);
  }, [prospectNameSeed, prospect]);

  const industries = personaIndustryKeys();
  // Determine the EFFECTIVE industry for downstream calls:
  //   - if research succeeded AND user left industryKey === "auto", use the
  //     inferred key from research
  //   - if user manually selected an industry, that wins
  const effectiveIndustryKey =
    industryKey === "auto" && research?.inferredIndustryKey
      ? research.inferredIndustryKey
      : industryKey === "auto"
      ? "other"
      : industryKey;
  const industry = PERSONA_INDUSTRIES[effectiveIndustryKey];
  const ctx = { apiToken, apiDomain, onProgress: (msg: string) => onLog(msg) };

  /* ── Stage 1: Gemini prospect research (sparkle button) ─────────────── */
  const handleResearch = async () => {
    if (!prospect || prospect.trim().length < 2) {
      onLog("⚠️ Enter a prospect name first.");
      return;
    }
    setBusy(true);
    setAssignments([]);
    setReport(null);
    try {
      const result = await researchProspectForPersonas({ prospectName: prospect.trim() }, ctx);
      setResearch(result);
      setIndustryKey("auto"); // user can still override
      onLog(
        `✨ Research complete — industry: ${result.inferredIndustryLabel}, ${result.customGroups.length} bespoke group(s).`,
      );
    } catch (err) {
      onLog(`❌ Research failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  /* ── Stage 2: classify users (preview, no writes) ───────────────────── */
  const handlePreview = async () => {
    setBusy(true);
    setReport(null);
    try {
      const fetched = await fetchPersonaCandidates({ excludeAdmins: true }, ctx);
      setCandidates(fetched);
      if (fetched.length === 0) {
        onLog("⚠️ No activated non-admin users found.");
        return;
      }
      // Pass research output as prospect context when available so positions
      // come back prospect-flavored.
      const planned = await matchUsersToIndustry(
        {
          industryKey: effectiveIndustryKey,
          candidates: fetched,
          prospect: research ? { name: research.prospectName, news: research.prospectNews } : undefined,
        },
        ctx,
      );
      setAssignments(planned);
      onLog(`✅ Gemini returned ${planned.length} assignment(s). Review below before applying.`);
    } catch (err) {
      onLog(`❌ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  /* ── Stage 3: apply (writes to tenant) ──────────────────────────────── */
  const handleApply = async () => {
    if (assignments.length === 0) {
      onLog("⚠️ Run preview first.");
      return;
    }
    const groupSource = research?.customGroups.length ? "prospect research" : "industry template";
    const groupNames = research?.customGroups.length
      ? research.customGroups.map(([t]) => t)
      : (industry?.groups ?? []).map(([t]) => t);
    if (
      !window.confirm(
        `This will update ${assignments.length} user(s), set managers, and create ` +
          `${groupNames.length} group(s) (${groupSource}) in the "${industry?.label ?? effectiveIndustryKey}" theme.\n\n` +
          `Groups: ${groupNames.join(", ")}\n\nContinue?`,
      )
    )
      return;

    setBusy(true);
    try {
      const result = await applyPersonas(
        {
          industryKey: effectiveIndustryKey,
          assignments,
          customGroups: research?.customGroups,
        },
        ctx,
      );
      setReport(result);
      onLog(
        `🎭 Personas applied: ${result.usersUpdated} user(s), ${result.managersSet} manager link(s), ` +
          `${result.groupsCreated} group(s), ${result.groupsAssigned} group assignment(s).`,
      );
      if (result.errors.length > 0) {
        onLog(`⚠️ ${result.errors.length} error(s) — first: ${result.errors[0]}`);
      }
    } catch (err) {
      onLog(`❌ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  /* ── UI ─────────────────────────────────────────────────────────────── */
  return (
    <div>
      <h2>Personas &amp; Groups</h2>
      <p style={subDescriptionStyle}>
        Let Gemini do the leg work. Enter a prospect name (or pull it from the
        Branding flow), click the sparkle to research, then preview + apply.
        Replify writes positions, departments, managers, and 8 prospect-themed
        groups.
      </p>

      {/* 🔎 Research panel — sparkle button + result display */}
      <div style={panelStyle}>
        <label style={labelStyle}>Prospect (company name)</label>
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          <input
            type="text"
            style={{ ...inputStyle, flex: 1 }}
            placeholder="e.g. Stryker, Cummins, Lineage Logistics"
            value={prospect}
            onChange={(e) => setProspect(e.target.value)}
            disabled={busy}
          />
          <button
            type="button"
            style={{ ...sparkleButtonStyle, opacity: busy ? 0.6 : 1, cursor: busy ? "not-allowed" : "pointer" }}
            onClick={handleResearch}
            disabled={busy || !prospect || prospect.trim().length < 2}
            title="Research the prospect with Gemini"
          >
            <HiSparkles /> Research
          </button>
        </div>

        {research && research.customGroups.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: colors.textMedium }}>
            <div>
              <strong>Inferred industry:</strong> {research.inferredIndustryLabel}{" "}
              {research.websiteUrl ? <span style={{ color: colors.textMuted }}>· {research.websiteUrl}</span> : null}
            </div>
            <div style={{ marginTop: 4 }}>
              <strong>Bespoke groups:</strong> {research.customGroups.map(([t]) => t).join(" · ")}
            </div>
          </div>
        )}

        {research && research.prospectNews && (
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: "pointer", fontSize: 12, color: colors.textMuted }}>
              See what Gemini learned
            </summary>
            <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", color: colors.textBody, marginTop: 6 }}>
              {research.prospectNews}
            </pre>
          </details>
        )}
      </div>

      {/* 🏭 Industry picker (override / fallback) */}
      <div style={panelStyle}>
        <label style={labelStyle}>Industry</label>
        <select
          style={selectStyle}
          value={industryKey}
          onChange={(e) => {
            setIndustryKey(e.target.value);
            setAssignments([]);
            setReport(null);
          }}
          disabled={busy}
        >
          <option value="auto">Auto (from prospect research)</option>
          {industries.map((i) => (
            <option key={i.key} value={i.key}>
              {i.label}
            </option>
          ))}
        </select>
        {industry && (
          <p style={{ ...subDescriptionStyle, marginTop: 8 }}>
            {research?.customGroups.length
              ? `Will create the 8 bespoke groups from research: ${research.customGroups.map(([t]) => t).join(" · ")}`
              : `Will create: ${industry.groups.map(([t]) => t).join(" · ")}`}
          </p>
        )}
      </div>

      {/* ▶︎ Preview + Apply */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button style={{ ...brandingButtonStyle, flex: 1 }} onClick={handlePreview} disabled={busy}>
          {busy && assignments.length === 0 ? "Classifying…" : "Preview with Gemini"}
        </button>
        <button
          style={{
            ...brandingButtonStyle,
            flex: 1,
            background: assignments.length === 0 ? colors.uiGray : colors.primary,
            cursor: assignments.length === 0 ? "not-allowed" : "pointer",
          }}
          onClick={handleApply}
          disabled={busy || assignments.length === 0}
        >
          {busy && assignments.length > 0 ? "Applying…" : `Apply (${assignments.length})`}
        </button>
      </div>

      {/* 📋 Preview list */}
      {assignments.length > 0 && (
        <div style={subtlePanelStyle}>
          <strong>
            Preview ({assignments.length} user{assignments.length === 1 ? "" : "s"})
          </strong>
          <div style={{ maxHeight: 260, overflowY: "auto", marginTop: 8 }}>
            {assignments.map((a) => {
              const c = candidates.find((cand) => cand.id === a.userId);
              const name = c
                ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email || a.userId
                : a.userId;
              return (
                <div
                  key={a.userId}
                  style={{
                    borderBottom: `1px solid ${colors.borderLight}`,
                    padding: "6px 0",
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{name}</div>
                  <div style={{ color: colors.textMedium }}>
                    {a.roleType} · {a.position} · {a.department}
                    {a.managerOfUserId ? ` · → manager ${a.managerOfUserId.slice(-6)}` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 📊 Result panel */}
      {report && (
        <div style={subtlePanelStyle}>
          <strong>Result</strong>
          <div style={reportRowStyle}>
            <span>Users updated</span>
            <span>{report.usersUpdated}</span>
          </div>
          <div style={reportRowStyle}>
            <span>Users failed</span>
            <span>{report.usersFailed}</span>
          </div>
          <div style={reportRowStyle}>
            <span>Managers set</span>
            <span>{report.managersSet}</span>
          </div>
          <div style={reportRowStyle}>
            <span>Groups created</span>
            <span>{report.groupsCreated}</span>
          </div>
          <div style={reportRowStyle}>
            <span>Groups assigned</span>
            <span>{report.groupsAssigned}</span>
          </div>
          {report.errors.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ color: colors.danger, cursor: "pointer" }}>{report.errors.length} error(s)</summary>
              <pre style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>{report.errors.slice(0, 10).join("\n")}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
