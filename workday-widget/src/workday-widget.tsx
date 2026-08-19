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

import React, { FormEvent, ReactElement, useEffect, useState } from "react";
import { SBUserProfile, WidgetApi } from "widget-sdk";

export interface WorkdayWidgetProps {
  contentLanguage: string;
  widgetApi: WidgetApi;
}

interface Balance {
  key: string;
  title: string;
  hours: number;
  icon: ReactElement;
}

interface LeaveRequest {
  reason: string;
  start: string;
  end: string;
}

const REASONS = [
  "Paid Time Off",
  "Floating Holiday",
  "Sick Leave",
  "Personal Day",
  "Bereavement Leave",
  "Jury Duty",
  "Unpaid Leave",
  "Other",
];

const BALANCES: Balance[] = [
  {
    key: "pto",
    title: "Paid Time Off",
    hours: 69.8,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 18c0-4-5-8-5-8s-5 4-5 8" />
        <path d="M12 10V3" />
        <path d="M8 7c1-1 2.5-2 4-2s3 1 4 2" />
        <line x1="3" y1="21" x2="21" y2="21" />
        <path d="M7 21c0-2 1-3 2-4" />
        <path d="M17 21c0-2-1-3-2-4" />
      </svg>
    ),
  },
  {
    key: "fh",
    title: "Floating Holiday",
    hours: 16,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <circle cx="16" cy="15" r="3" />
        <polyline points="16 14 16 15 17 15" />
      </svg>
    ),
  },
  {
    key: "sick",
    title: "Sick Leave",
    hours: 24,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
        <path d="M12 8v6M9 11h6" />
      </svg>
    ),
  },
  {
    key: "personal",
    title: "Personal Days",
    hours: 8,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
      </svg>
    ),
  },
];

const formatDate = (value: string): string => {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  return `${m}/${d}/${y}`;
};

const css = `
  .wd-widget { width: 100%; max-width: 440px; background: #fff; border: 1px solid #e0e0e0; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .wd-widget * { box-sizing: border-box; }
  .wd-brand { display: flex; align-items: center; gap: 8px; padding: 14px 24px; border-bottom: 1px solid #f0f0f0; }
  .wd-wordmark { font-size: 17px; font-weight: 700; color: #f7941e; letter-spacing: -0.01em; }
  .wd-inner { padding: 24px 24px 0; }
  .wd-inner h2 { font-size: 22px; font-weight: 800; color: #111; margin: 0 0 4px; }
  .wd-greeting { font-size: 13px; color: #777; margin: 0 0 16px; }
  .wd-section-label { font-size: 15px; font-weight: 700; color: #111; margin: 0 0 12px; }
  .wd-cards-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .wd-balance-card { border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; }
  .wd-card-icon { background: #f2f2f2; height: 90px; display: flex; align-items: center; justify-content: center; }
  .wd-card-icon svg { width: 40px; height: 40px; color: #555; }
  .wd-card-body { padding: 12px 14px 14px; background: #fff; }
  .wd-card-title { font-size: 14px; font-weight: 700; color: #111; margin-bottom: 6px; }
  .wd-card-label { font-size: 12px; color: #999; margin-bottom: 3px; }
  .wd-card-value { font-size: 14px; font-weight: 700; color: #111; }
  .wd-scrollbar-mock { height: 5px; background: #ddd; border-radius: 3px; margin: 16px 0; width: 75%; }
  .wd-toggle-row { display: flex; justify-content: center; align-items: center; gap: 6px; padding: 12px 0 20px; cursor: pointer; font-size: 13px; font-weight: 500; color: #444; border-top: 1px solid #f0f0f0; }
  .wd-toggle-row:hover { color: #000; }
  .wd-toggle-icon { width: 15px; height: 15px; color: #555; flex-shrink: 0; }
  .wd-lower { padding: 0 24px 24px; border-top: 1px solid #f0f0f0; }
  .wd-absences-title { font-size: 18px; font-weight: 700; color: #111; padding-top: 20px; margin-bottom: 2px; }
  .wd-absences-year { font-size: 13px; color: #666; margin-bottom: 14px; }
  .wd-tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .wd-tab { padding: 6px 16px; border-radius: 8px; border: 1.5px solid #ccc; font-size: 13px; font-weight: 600; background: #fff; color: #444; cursor: pointer; transition: all 0.15s ease; }
  .wd-tab.active { border-color: #888; background: #f7f7f7; color: #111; }
  .wd-tab:hover:not(.active) { background: #f7f7f7; }
  .wd-empty-state { background: #f7f7f7; border-radius: 14px; padding: 36px 24px; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .wd-empty-icon { width: 56px; height: 56px; margin-bottom: 14px; color: #888; }
  .wd-empty-title { font-size: 15px; font-weight: 700; color: #111; margin-bottom: 8px; }
  .wd-empty-desc { font-size: 13px; color: #666; line-height: 1.55; max-width: 240px; }
  .wd-request-item { border: 1px solid #e0e0e0; border-radius: 12px; padding: 14px 16px; margin-bottom: 10px; }
  .wd-request-item:last-child { margin-bottom: 0; }
  .wd-request-item-reason { font-size: 14px; font-weight: 700; color: #111; margin-bottom: 4px; }
  .wd-request-item-dates { font-size: 13px; color: #666; margin-bottom: 6px; }
  .wd-request-item-status { display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: #a06600; background: #fdf1dc; padding: 3px 8px; border-radius: 6px; }
  .wd-request-card { position: relative; border: 1px solid #e8e8e8; border-radius: 14px; padding: 22px 20px 20px; box-shadow: 0 1px 6px rgba(0,0,0,0.05); }
  .wd-request-close { position: absolute; top: 14px; right: 14px; background: none; border: none; font-size: 20px; line-height: 1; color: #999; cursor: pointer; }
  .wd-request-close:hover { color: #444; }
  .wd-request-header { text-align: center; margin-bottom: 20px; }
  .wd-request-kicker { font-size: 10.5px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: #8a8a8a; }
  .wd-form-label { display: block; font-size: 13px; font-weight: 600; color: #333; margin: 14px 0 6px; }
  .wd-form-label:first-of-type { margin-top: 0; }
  .wd-req { color: #e02020; }
  .wd-form-select, .wd-form-input, .wd-form-textarea { width: 100%; border: 1px solid #ccc; border-radius: 8px; padding: 10px 12px; font-size: 14px; font-family: inherit; color: #111; background: #fff; }
  .wd-form-select:focus, .wd-form-input:focus, .wd-form-textarea:focus { outline: none; border-color: #1e6fe0; }
  .wd-form-textarea { resize: vertical; }
  .wd-date-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .wd-date-row .wd-form-label { margin-top: 14px; }
  .wd-submit-btn { width: 100%; margin-top: 20px; background: #1e6fe0; color: #fff; border: none; border-radius: 8px; padding: 12px; font-size: 15px; font-weight: 700; cursor: pointer; }
  .wd-submit-btn:hover { background: #1859b8; }
`;

export const WorkdayWidget = ({ widgetApi }: WorkdayWidgetProps): ReactElement => {
  const [user, setUser] = useState<SBUserProfile | null>(null);
  const [showingDays, setShowingDays] = useState(false);
  const [activeTab, setActiveTab] = useState<"requests" | "history" | "new">("requests");
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [reason, setReason] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    widgetApi
      .getUserInformation()
      .then(setUser)
      .catch(() => setUser(null));
  }, [widgetApi]);

  const formatBalance = (hours: number): string =>
    showingDays ? `${(hours / 8).toFixed(1)} days` : `${hours} hours`;

  const submitLeaveRequest = (event: FormEvent): void => {
    event.preventDefault();
    if (!reason || !start || !end) return;

    setRequests((prev) => [{ reason, start, end }, ...prev]);
    setReason("");
    setStart("");
    setEnd("");
    setNote("");
    setActiveTab("requests");
  };

  return (
    <div className="wd-widget">
      <style>{css}</style>

      <div className="wd-brand">
        <svg width="22" height="22" viewBox="0 0 40 40">
          <path d="M20 5 A15 15 0 0 1 35 20" fill="none" stroke="#f7941e" strokeWidth={5} strokeLinecap="round" />
          <path d="M20 5 A15 15 0 0 0 5 20" fill="none" stroke="#f7941e" strokeWidth={5} strokeLinecap="round" opacity={0.35} />
        </svg>
        <span className="wd-wordmark">workday.</span>
      </div>

      <div className="wd-inner">
        <h2>My Absences</h2>
        <p className="wd-greeting">Hi, {user ? user.firstName : "…"}</p>
        <p className="wd-section-label">Absence Balance</p>

        <div className="wd-cards-row">
          {BALANCES.map((balance) => (
            <div className="wd-balance-card" key={balance.key}>
              <div className="wd-card-icon">{balance.icon}</div>
              <div className="wd-card-body">
                <div className="wd-card-title">{balance.title}</div>
                <div className="wd-card-label">Balance</div>
                <div className="wd-card-value">{formatBalance(balance.hours)}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="wd-scrollbar-mock" />

        <div className="wd-toggle-row" onClick={() => setShowingDays((v) => !v)}>
          <svg className="wd-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0" />
            <path d="M12 8v4l3 3" />
          </svg>
          <span>{showingDays ? "Show balances in hours" : "Show balances in days (8h/day)"}</span>
        </div>
      </div>

      <div className="wd-lower">
        <div className="wd-absences-title">Absences</div>
        <div className="wd-absences-year">2026</div>

        <div className="wd-tabs">
          <button className={`wd-tab${activeTab === "requests" ? " active" : ""}`} onClick={() => setActiveTab("requests")}>
            Your Requests
          </button>
          <button className={`wd-tab${activeTab === "history" ? " active" : ""}`} onClick={() => setActiveTab("history")}>
            History
          </button>
          <button className={`wd-tab${activeTab === "new" ? " active" : ""}`} onClick={() => setActiveTab("new")}>
            New Request
          </button>
        </div>

        {activeTab === "requests" &&
          (requests.length === 0 ? (
            <div className="wd-empty-state">
              <svg className="wd-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
              </svg>
              <div className="wd-empty-title">No Requests Yet</div>
              <div className="wd-empty-desc">Once you've submitted absence requests, you can view them here.</div>
            </div>
          ) : (
            <div>
              {requests.map((request, index) => (
                <div className="wd-request-item" key={index}>
                  <div className="wd-request-item-reason">{request.reason}</div>
                  <div className="wd-request-item-dates">
                    {formatDate(request.start)} – {formatDate(request.end)}
                  </div>
                  <span className="wd-request-item-status">Pending Approval</span>
                </div>
              ))}
            </div>
          ))}

        {activeTab === "history" && (
          <div className="wd-empty-state">
            <svg className="wd-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
            <div className="wd-empty-title">No History Yet</div>
            <div className="wd-empty-desc">Approved or declined requests will show up here.</div>
          </div>
        )}

        {activeTab === "new" && (
          <div className="wd-request-card">
            <button className="wd-request-close" onClick={() => setActiveTab("requests")} aria-label="Close">
              &times;
            </button>
            <div className="wd-request-header">
              <div className="wd-request-kicker">Submit a paid leave request</div>
            </div>

            <form onSubmit={submitLeaveRequest}>
              <label className="wd-form-label" htmlFor="wd-reason">
                Reason <span className="wd-req">*</span>
              </label>
              <select
                id="wd-reason"
                className="wd-form-select"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              >
                <option value="" disabled>
                  Select a reason
                </option>
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <div className="wd-date-row">
                <div>
                  <label className="wd-form-label" htmlFor="wd-start-date">
                    Start date <span className="wd-req">*</span>
                  </label>
                  <input
                    id="wd-start-date"
                    className="wd-form-input"
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="wd-form-label" htmlFor="wd-end-date">
                    End date <span className="wd-req">*</span>
                  </label>
                  <input
                    id="wd-end-date"
                    className="wd-form-input"
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    required
                  />
                </div>
              </div>

              <label className="wd-form-label" htmlFor="wd-note">
                Leave a note
              </label>
              <textarea
                id="wd-note"
                className="wd-form-textarea"
                rows={3}
                placeholder="Write a note to your manager here"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />

              <button type="submit" className="wd-submit-btn">
                Submit
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
