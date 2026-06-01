/**
 * Personas & Groups form — sub-view under useOption.type === "users".
 *
 * Bolt-in port of staffbase-demo-group-tool's wizard. Drives the
 * `personas.ts` operations: fetch candidates → Gemini classifies → preview →
 * apply (write fields, set managers, create 8 groups, assign members).
 *
 * Stays prop-driven in Replify's style (parent owns apiToken / apiDomain /
 * progress). Re-uses the existing styles barrel — no new colors or buttons.
 */

import React, { useState } from "react";
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
  matchUsersToIndustry,
  applyPersonas,
} from "../utils/automationOperations/personas";
import type {
  PersonaCandidate,
  PersonaAssignment,
  ApplyPersonasReport,
} from "../utils/automationOperations/personas";
import { personaIndustryKeys, PERSONA_INDUSTRIES } from "../utils/automationOperations/industryTemplates";

interface PersonasFormProps {
  apiToken: string;
  apiDomain: string;
  onLog: (line: string) => void;
}

const selectStyle: React.CSSProperties = { ...inputStyle, width: "100%", padding: "8px" };
const reportRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "4px 0",
  fontSize: 13,
};

export default function PersonasForm({ apiToken, apiDomain, onLog }: PersonasFormProps) {
  const [industryKey, setIndustryKey] = useState<string>("healthcare");
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<PersonaCandidate[]>([]);
  const [assignments, setAssignments] = useState<PersonaAssignment[]>([]);
  const [report, setReport] = useState<ApplyPersonasReport | null>(null);

  const industries = personaIndustryKeys();
  const industry = PERSONA_INDUSTRIES[industryKey];
  const ctx = {
    apiToken,
    apiDomain,
    onProgress: (msg: string) => onLog(msg),
  };

  /* ── Step 1: fetch + Gemini match (preview-only, nothing written yet) ── */
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
      const planned = await matchUsersToIndustry({ industryKey, candidates: fetched }, ctx);
      setAssignments(planned);
      onLog(`✅ Gemini returned ${planned.length} assignment(s). Review below before applying.`);
    } catch (err) {
      onLog(`❌ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  /* ── Step 2: apply (PATCHes + group creation) ── */
  const handleApply = async () => {
    if (assignments.length === 0) {
      onLog("⚠️ Run preview first.");
      return;
    }
    if (!window.confirm(
      `This will update ${assignments.length} user(s), set managers, and create ` +
      `${industry?.groups.length ?? 8} groups in the "${industry?.label ?? industryKey}" theme. Continue?`
    )) return;

    setBusy(true);
    try {
      const result = await applyPersonas({ industryKey, assignments }, ctx);
      setReport(result);
      onLog(
        `🎭 Personas applied: ${result.usersUpdated} user(s), ${result.managersSet} manager link(s), ` +
        `${result.groupsCreated} group(s), ${result.groupsAssigned} group assignment(s).`
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

  /* ── UI ── */
  return (
    <div>
      <h2>Personas &amp; Groups</h2>
      <p style={subDescriptionStyle}>
        Pick an industry, then let Gemini classify the activated users into
        comms / corporate / frontline roles and create 8 industry-themed groups.
        Preview first — apply writes positions, departments, and managers.
      </p>

      <div style={panelStyle}>
        <label style={labelStyle}>Industry</label>
        <select
          style={selectStyle}
          value={industryKey}
          onChange={(e) => {
            setIndustryKey(e.target.value);
            setCandidates([]);
            setAssignments([]);
            setReport(null);
          }}
          disabled={busy}
        >
          {industries.map((i) => (
            <option key={i.key} value={i.key}>{i.label}</option>
          ))}
        </select>
        {industry && (
          <p style={{ ...subDescriptionStyle, marginTop: 8 }}>
            Will create: {industry.groups.map(([t]) => t).join(" · ")}
          </p>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          style={{ ...brandingButtonStyle, flex: 1 }}
          onClick={handlePreview}
          disabled={busy}
        >
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

      {assignments.length > 0 && (
        <div style={subtlePanelStyle}>
          <strong>Preview ({assignments.length} user{assignments.length === 1 ? "" : "s"})</strong>
          <div style={{ maxHeight: 260, overflowY: "auto", marginTop: 8 }}>
            {assignments.map((a) => {
              const c = candidates.find((cand) => cand.id === a.userId);
              const name = c ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email || a.userId : a.userId;
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

      {report && (
        <div style={subtlePanelStyle}>
          <strong>Result</strong>
          <div style={reportRowStyle}><span>Users updated</span><span>{report.usersUpdated}</span></div>
          <div style={reportRowStyle}><span>Users failed</span><span>{report.usersFailed}</span></div>
          <div style={reportRowStyle}><span>Managers set</span><span>{report.managersSet}</span></div>
          <div style={reportRowStyle}><span>Groups created</span><span>{report.groupsCreated}</span></div>
          <div style={reportRowStyle}><span>Groups assigned</span><span>{report.groupsAssigned}</span></div>
          {report.errors.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ color: colors.danger, cursor: "pointer" }}>
                {report.errors.length} error(s)
              </summary>
              <pre style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>
                {report.errors.slice(0, 10).join("\n")}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
