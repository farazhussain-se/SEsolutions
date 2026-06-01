/**
 * News Channel Rename form — sub-view under useOption.type === "existing"
 * (alongside the regular BrandingForm).
 *
 * Bolt-in port of staffbase-news-tool's wizard. Two independent actions:
 *
 *   1. Rename channels: list → Gemini maps to industry templates → user can
 *      edit the proposed titles in place → apply (uses links.update from each
 *      channel detail, see newsChannelRename.ts file header).
 *
 *   2. Redistribute post dates: pick channels → pick a demo date → Spread
 *      published timestamps with the weighted-recency curve.
 *
 * Re-uses Replify's existing style barrel (no new colors / buttons added).
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
  listAllChannels,
  planChannelRenames,
  renameChannels,
  redistributePostDates,
} from "../utils/automationOperations/newsChannelRename";
import type {
  ChannelSummary,
  ChannelRenamePlan,
  RenameReport,
  RedistributeReport,
} from "../utils/automationOperations/newsChannelRename";
import { newsIndustryKeys } from "../utils/automationOperations/industryTemplates";

interface NewsChannelRenameFormProps {
  apiToken: string;
  apiDomain: string;
  onLog: (line: string) => void;
}

const selectStyle: React.CSSProperties = { ...inputStyle, width: "100%", padding: "8px" };
const todayIso = (): string => new Date().toISOString().slice(0, 10);

export default function NewsChannelRenameForm({
  apiToken,
  apiDomain,
  onLog,
}: NewsChannelRenameFormProps) {
  const [industryKey, setIndustryKey] = useState<string>("healthcare");
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [plan, setPlan] = useState<ChannelRenamePlan[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(new Set());
  const [demoDate, setDemoDate] = useState<string>(todayIso());
  const [spanDays, setSpanDays] = useState<number>(90);
  const [renameReport, setRenameReport] = useState<RenameReport | null>(null);
  const [redistReport, setRedistReport] = useState<RedistributeReport | null>(null);
  const [busy, setBusy] = useState(false);

  const ctx = { apiToken, apiDomain, onProgress: (msg: string) => onLog(msg) };
  const industries = newsIndustryKeys();

  /* ── Step 1: list channels (separate button so user can review counts first) */
  const handleListChannels = async () => {
    setBusy(true);
    setPlan([]);
    setRenameReport(null);
    try {
      const all = await listAllChannels(ctx);
      setChannels(all);
      setSelectedChannelIds(new Set(all.map((c) => c.id)));
      onLog(`📰 Listed ${all.length} channel(s).`);
    } catch (err) {
      onLog(`❌ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  /* ── Step 2: Gemini plan rename ── */
  const handlePlanRename = async () => {
    if (channels.length === 0) {
      onLog("⚠️ List channels first.");
      return;
    }
    setBusy(true);
    try {
      const target = channels.filter((c) => selectedChannelIds.has(c.id));
      const planned = await planChannelRenames({ industryKey, channels: target }, ctx);
      setPlan(planned);
      onLog(`✅ Gemini proposed ${planned.length} rename(s). Edit titles below before applying.`);
    } catch (err) {
      onLog(`❌ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  /* ── Step 3: apply renames ── */
  const handleApplyRename = async () => {
    if (plan.length === 0) {
      onLog("⚠️ Generate a rename plan first.");
      return;
    }
    if (!window.confirm(`Rename ${plan.length} channel(s)? Originals are NOT backed up.`)) return;

    setBusy(true);
    try {
      const result = await renameChannels({ plan }, ctx);
      setRenameReport(result);
      onLog(`🪧 Rename complete: ${result.channelsRenamed} ok, ${result.channelsFailed} failed.`);
    } catch (err) {
      onLog(`❌ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  /* ── Step 4: redistribute post dates ── */
  const handleRedistribute = async () => {
    const targets = Array.from(selectedChannelIds);
    if (targets.length === 0) {
      onLog("⚠️ Select at least one channel.");
      return;
    }
    const iso = `${demoDate}T12:00:00.000Z`;
    if (!window.confirm(`Redistribute post dates across ${targets.length} channel(s) around ${demoDate}? Original "published" timestamps will be overwritten.`)) return;

    setBusy(true);
    try {
      const result = await redistributePostDates(
        { channelIds: targets, demoDateIso: iso, spanDays },
        ctx,
      );
      setRedistReport(result);
      onLog(`🗓 Date spread done: ${result.postsTouched} ok, ${result.postsFailed} failed.`);
    } catch (err) {
      onLog(`❌ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  /* ── Helpers ── */
  const toggleSelected = (id: string) => {
    setSelectedChannelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updatePlanRow = (idx: number, patch: Partial<ChannelRenamePlan>) => {
    setPlan((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  /* ── UI ── */
  return (
    <div>
      <h2>News Channel Rename</h2>
      <p style={subDescriptionStyle}>
        List the tenant's news channels, let Gemini map each to an industry-
        appropriate name, edit the proposed titles, then apply. Optionally
        spread post publish dates around a chosen demo date for a fresh-looking
        feed.
      </p>

      <div style={panelStyle}>
        <label style={labelStyle}>Industry</label>
        <select style={selectStyle} value={industryKey} onChange={(e) => setIndustryKey(e.target.value)} disabled={busy}>
          {industries.map((i) => (
            <option key={i.key} value={i.key}>{i.label}</option>
          ))}
        </select>

        <button
          style={{ ...brandingButtonStyle, width: "100%", marginTop: 10 }}
          onClick={handleListChannels}
          disabled={busy}
        >
          {busy && channels.length === 0 ? "Loading…" : "List Channels"}
        </button>
      </div>

      {channels.length > 0 && (
        <div style={subtlePanelStyle}>
          <strong>{channels.length} channel(s) — toggle which to operate on</strong>
          <div style={{ maxHeight: 200, overflowY: "auto", marginTop: 8 }}>
            {channels.map((c) => (
              <label key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, padding: "3px 0" }}>
                <input
                  type="checkbox"
                  checked={selectedChannelIds.has(c.id)}
                  onChange={() => toggleSelected(c.id)}
                  disabled={busy}
                />
                <span style={{ fontWeight: 500 }}>{c.title}</span>
                <span style={{ color: colors.textMuted }}>({c.id.slice(-6)})</span>
              </label>
            ))}
          </div>
          <button
            style={{ ...brandingButtonStyle, width: "100%", marginTop: 10 }}
            onClick={handlePlanRename}
            disabled={busy || selectedChannelIds.size === 0}
          >
            {busy && plan.length === 0 ? "Planning…" : "Plan Renames with Gemini"}
          </button>
        </div>
      )}

      {plan.length > 0 && (
        <div style={subtlePanelStyle}>
          <strong>Rename plan — edit before applying</strong>
          <div style={{ maxHeight: 320, overflowY: "auto", marginTop: 8 }}>
            {plan.map((p, idx) => (
              <div key={p.channelId} style={{ borderBottom: `1px solid ${colors.borderLight}`, padding: "8px 0" }}>
                <div style={{ fontSize: 11, color: colors.textMuted }}>
                  {p.oldTitle} → ({p.channelId.slice(-6)})
                </div>
                <input
                  style={{ ...inputStyle, width: "100%" }}
                  value={p.newTitle}
                  onChange={(e) => updatePlanRow(idx, { newTitle: e.target.value })}
                  disabled={busy}
                />
                <input
                  style={{ ...inputStyle, width: "100%", fontSize: 11 }}
                  value={p.newDescription}
                  onChange={(e) => updatePlanRow(idx, { newDescription: e.target.value })}
                  disabled={busy}
                />
              </div>
            ))}
          </div>
          <button
            style={{ ...brandingButtonStyle, width: "100%", marginTop: 10 }}
            onClick={handleApplyRename}
            disabled={busy}
          >
            {busy && renameReport === null ? "Applying…" : `Apply ${plan.length} Rename(s)`}
          </button>
        </div>
      )}

      {renameReport && (
        <div style={subtlePanelStyle}>
          <strong>Rename Result</strong>
          <div>{renameReport.channelsRenamed} renamed · {renameReport.channelsFailed} failed</div>
          {renameReport.errors.length > 0 && (
            <details><summary style={{ color: colors.danger }}>Errors</summary>
              <pre style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>{renameReport.errors.join("\n")}</pre>
            </details>
          )}
        </div>
      )}

      <div style={panelStyle}>
        <label style={labelStyle}>Demo date (post timestamps will cluster here)</label>
        <input
          type="date"
          style={{ ...inputStyle, width: "100%" }}
          value={demoDate}
          onChange={(e) => setDemoDate(e.target.value)}
          disabled={busy}
        />
        <label style={{ ...labelStyle, marginTop: 10 }}>Span (days back from demo date)</label>
        <input
          type="number"
          min={14}
          max={365}
          style={{ ...inputStyle, width: "100%" }}
          value={spanDays}
          onChange={(e) => setSpanDays(Number(e.target.value) || 90)}
          disabled={busy}
        />
        <p style={subDescriptionStyle}>
          60% of posts will land in the last 14 days, the rest spread exponentially older.
        </p>

        <button
          style={{ ...brandingButtonStyle, width: "100%", marginTop: 10, background: colors.primary }}
          onClick={handleRedistribute}
          disabled={busy || selectedChannelIds.size === 0}
        >
          {busy && redistReport === null ? "Redistributing…" : `Redistribute Post Dates (${selectedChannelIds.size} channel${selectedChannelIds.size === 1 ? "" : "s"})`}
        </button>
      </div>

      {redistReport && (
        <div style={subtlePanelStyle}>
          <strong>Redistribute Result</strong>
          <div>{redistReport.postsTouched} updated · {redistReport.postsFailed} failed</div>
          {redistReport.errors.length > 0 && (
            <details><summary style={{ color: colors.danger }}>Errors</summary>
              <pre style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>{redistReport.errors.join("\n")}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
