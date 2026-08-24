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

import React, { FormEvent, ReactElement, useEffect, useMemo, useState } from "react";
import { SBUserProfile, WidgetApi } from "widget-sdk";
import {
  Shift,
  ShiftChangeRequest,
  ShiftChangeType,
  formatShiftDate,
  knownRosterNames,
  loadRoster,
  loadShiftChangeRequests,
  notifyManagerOfShiftRequest,
  saveShiftChangeRequest,
  shiftsForEmployee,
} from "./shift-data";

export interface ShiftRosterWidgetProps {
  contentLanguage: string;
  widgetApi: WidgetApi;
  apitoken?: string;
  managername?: string;
}

const CHANGE_TYPES: ShiftChangeType[] = ["Swap", "Coverage", "Call-Off"];

const css = `
  .sr-widget { width: 100%; max-width: 460px; background: var(--bg, #fff); border: 1px solid var(--border, #e0e0e0); border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: var(--text, #2B2620); }
  .sr-widget * { box-sizing: border-box; }
  .sr-brand { display: flex; align-items: center; gap: 8px; padding: 14px 24px; border-bottom: 1px solid var(--border, #f0f0f0); }
  .sr-wordmark { font-size: 16px; font-weight: 800; color: var(--primary, #2E2A24); letter-spacing: -0.01em; }
  .sr-inner { padding: 24px 24px 4px; }
  .sr-inner h2 { font-size: 21px; font-weight: 800; color: var(--text, #111); margin: 0 0 4px; }
  .sr-greeting { font-size: 13px; color: var(--text-light, #8A8072); margin: 0 0 18px; }
  .sr-week-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .sr-week-label { font-size: 13px; font-weight: 700; color: var(--text, #111); }
  .sr-shift-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 6px; }
  .sr-shift-item { display: flex; align-items: center; gap: 12px; border: 1px solid var(--border, #e0e0e0); border-radius: 12px; padding: 10px 14px; }
  .sr-shift-date { width: 74px; flex-shrink: 0; font-size: 12px; font-weight: 700; color: var(--text-light, #8A8072); }
  .sr-shift-main { flex-grow: 1; min-width: 0; }
  .sr-shift-loc { font-size: 14px; font-weight: 700; color: var(--text, #111); }
  .sr-shift-meta { font-size: 12px; color: var(--text-light, #8A8072); margin-top: 2px; }
  .sr-shift-tag { flex-shrink: 0; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 3px 8px; border-radius: 6px; background: var(--bg-gray, #F3EEE3); color: var(--text, #444); }
  .sr-empty-state { background: var(--bg-gray, #f7f7f7); border-radius: 14px; padding: 30px 24px; text-align: center; color: var(--text-light, #8A8072); font-size: 13px; }
  .sr-lower { padding: 4px 24px 24px; }
  .sr-section-title { font-size: 15px; font-weight: 700; color: var(--text, #111); margin: 20px 0 12px; }
  .sr-req-item { border: 1px solid var(--border, #e0e0e0); border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; }
  .sr-req-item:last-child { margin-bottom: 0; }
  .sr-req-type { font-size: 13px; font-weight: 700; color: var(--text, #111); }
  .sr-req-meta { font-size: 12px; color: var(--text-light, #8A8072); margin: 3px 0 6px; }
  .sr-req-status { display: inline-block; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 3px 8px; border-radius: 6px; }
  .sr-req-status.pending { color: var(--warning, #a06600); background: #fdf1dc; }
  .sr-req-status.approved { color: var(--success, #2f6a34); background: #e4efe5; }
  .sr-req-status.denied { color: var(--danger, #B8492F); background: var(--danger-soft, #F3E3DA); }
  .sr-notify-hint { font-size: 12px; color: var(--text-light, #8A8072); margin-bottom: 10px; }
  .sr-request-btn { width: 100%; margin-top: 14px; background: var(--primary, #2E2A24); color: #fff; border: none; border-radius: 8px; padding: 12px; font-size: 14px; font-weight: 700; cursor: pointer; }
  .sr-request-btn:hover { opacity: 0.9; }
  .sr-form-label { display: block; font-size: 13px; font-weight: 600; color: var(--text, #333); margin: 14px 0 6px; }
  .sr-form-label:first-of-type { margin-top: 0; }
  .sr-req-mark { color: var(--danger, #e02020); }
  .sr-form-select, .sr-form-textarea { width: 100%; border: 1px solid var(--border, #ccc); border-radius: 8px; padding: 10px 12px; font-size: 14px; font-family: inherit; color: var(--text, #111); background: var(--bg, #fff); }
  .sr-form-select:focus, .sr-form-textarea:focus { outline: none; border-color: var(--primary, #2E2A24); }
  .sr-form-textarea { resize: vertical; }
  .sr-form-card { border: 1px solid var(--border, #e8e8e8); border-radius: 14px; padding: 18px 18px 16px; margin-top: 12px; }
  .sr-cancel-link { display: block; text-align: center; margin-top: 12px; font-size: 13px; color: var(--text-light, #8A8072); cursor: pointer; background: none; border: none; width: 100%; padding: 4px; }
  .sr-cancel-link:hover { color: var(--text, #444); }
`;

export const ShiftRosterWidget = ({ widgetApi, apitoken, managername }: ShiftRosterWidgetProps): ReactElement => {
  const [user, setUser] = useState<SBUserProfile | null>(null);
  const [roster] = useState<Shift[]>(() => loadRoster());
  const [requests, setRequests] = useState<ShiftChangeRequest[]>(() => loadShiftChangeRequests());
  const [showForm, setShowForm] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState("");
  const [changeType, setChangeType] = useState<ShiftChangeType>("Swap");
  const [targetEmployee, setTargetEmployee] = useState("");
  const [reason, setReason] = useState("");
  const [notifyStatus, setNotifyStatus] = useState<"idle" | "sent" | "skipped">("idle");

  useEffect(() => {
    widgetApi
      .getUserInformation()
      .then(setUser)
      .catch(() => setUser(null));
  }, [widgetApi]);

  // Real logged-in users are matched against the seed roster by name where
  // possible; anyone else still sees the roster's first employee's shifts so
  // the widget never renders empty during a demo walkthrough.
  const employeeName = useMemo(() => {
    const fullName = user ? `${user.firstName} ${user.lastName}`.trim() : "";
    const known = knownRosterNames();
    if (known.includes(fullName)) return fullName;
    return known[0];
  }, [user]);

  const myShifts = useMemo(() => shiftsForEmployee(roster, employeeName), [roster, employeeName]);
  const otherEmployees = useMemo(() => knownRosterNames().filter((n) => n !== employeeName), [employeeName]);
  const myRequests = useMemo(
    () => requests.filter((r) => r.requestedBy === employeeName),
    [requests, employeeName],
  );

  const openForm = (shiftId: string): void => {
    setSelectedShiftId(shiftId);
    setChangeType("Swap");
    setTargetEmployee("");
    setReason("");
    setNotifyStatus("idle");
    setShowForm(true);
  };

  const submitRequest = (event: FormEvent): void => {
    event.preventDefault();
    if (!selectedShiftId || !reason) return;

    const shift = myShifts.find((s) => s.id === selectedShiftId);
    const request: ShiftChangeRequest = {
      id: `${selectedShiftId}-${Date.now()}`,
      shiftId: selectedShiftId,
      requestedBy: employeeName,
      type: changeType,
      targetEmployee: changeType === "Swap" ? targetEmployee || undefined : undefined,
      reason,
      status: "Pending",
      submittedAt: new Date().toISOString(),
    };

    saveShiftChangeRequest(request);
    setRequests((prev) => [request, ...prev]);
    setShowForm(false);

    const where = shift ? `${shift.location} · ${formatShiftDate(shift.date)}` : "a shift";
    const message = `${employeeName} requested a ${changeType.toLowerCase()} for ${where}: ${reason}`;
    notifyManagerOfShiftRequest(widgetApi, apitoken, managername, message).then((sent) => {
      setNotifyStatus(sent ? "sent" : "skipped");
    });
  };

  return (
    <div className="sr-widget">
      <style>{css}</style>

      <div className="sr-brand">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--primary, #2E2A24)" }}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
        <span className="sr-wordmark">My Shift Roster</span>
      </div>

      <div className="sr-inner">
        <h2>This Week's Shifts</h2>
        <p className="sr-greeting">Hi, {user ? user.firstName : "…"}</p>

        {myShifts.length === 0 ? (
          <div className="sr-empty-state">No shifts scheduled this week.</div>
        ) : (
          <div className="sr-shift-list">
            {myShifts.map((shift) => (
              <div className="sr-shift-item" key={shift.id}>
                <div className="sr-shift-date">{formatShiftDate(shift.date)}</div>
                <div className="sr-shift-main">
                  <div className="sr-shift-loc">{shift.location}</div>
                  <div className="sr-shift-meta">
                    {shift.start} – {shift.end} · {shift.position}
                  </div>
                </div>
                <div className="sr-shift-tag">{shift.scheduleTag}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="sr-lower">
        {!showForm && myShifts.length > 0 && (
          <button className="sr-request-btn" onClick={() => openForm(myShifts[0].id)}>
            Request a Shift Change
          </button>
        )}

        {showForm && (
          <div className="sr-form-card">
            <form onSubmit={submitRequest}>
              <label className="sr-form-label" htmlFor="sr-shift">
                Which shift? <span className="sr-req-mark">*</span>
              </label>
              <select
                id="sr-shift"
                className="sr-form-select"
                value={selectedShiftId}
                onChange={(e) => setSelectedShiftId(e.target.value)}
                required
              >
                {myShifts.map((shift) => (
                  <option key={shift.id} value={shift.id}>
                    {formatShiftDate(shift.date)} · {shift.location} ({shift.start}–{shift.end})
                  </option>
                ))}
              </select>

              <label className="sr-form-label" htmlFor="sr-type">
                Request type <span className="sr-req-mark">*</span>
              </label>
              <select
                id="sr-type"
                className="sr-form-select"
                value={changeType}
                onChange={(e) => setChangeType(e.target.value as ShiftChangeType)}
              >
                {CHANGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              {changeType === "Swap" && (
                <>
                  <label className="sr-form-label" htmlFor="sr-target">
                    Swap with
                  </label>
                  <select
                    id="sr-target"
                    className="sr-form-select"
                    value={targetEmployee}
                    onChange={(e) => setTargetEmployee(e.target.value)}
                  >
                    <option value="">Select a teammate</option>
                    {otherEmployees.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </>
              )}

              <label className="sr-form-label" htmlFor="sr-reason">
                Reason <span className="sr-req-mark">*</span>
              </label>
              <textarea
                id="sr-reason"
                className="sr-form-textarea"
                rows={3}
                placeholder="Let your manager know why"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />

              <button type="submit" className="sr-request-btn">
                Submit request
              </button>
              <button type="button" className="sr-cancel-link" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </form>
          </div>
        )}

        {myRequests.length > 0 && (
          <>
            <div className="sr-section-title">Your Requests</div>
            {notifyStatus !== "idle" && (
              <div className="sr-notify-hint">
                {notifyStatus === "sent"
                  ? `${managername || "Your manager"} was notified ✓`
                  : "Saved — configure the API token to notify your manager automatically"}
              </div>
            )}
            {myRequests.map((r) => (
              <div className="sr-req-item" key={r.id}>
                <div className="sr-req-type">
                  {r.type}
                  {r.targetEmployee ? ` with ${r.targetEmployee}` : ""}
                </div>
                <div className="sr-req-meta">{r.reason}</div>
                <span className={`sr-req-status ${r.status.toLowerCase()}`}>{r.status}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};
