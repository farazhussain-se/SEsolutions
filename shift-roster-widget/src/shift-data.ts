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

// Shared data contract with the Lifetime Manager Hub widget's "Roster &
// Leave" tab. Both widgets run on the same Staffbase branch origin, so
// localStorage under these keys acts as a common data store between them —
// same no-backend-needed pattern the manager hub already uses for
// requisitions and role changes.

export type ShiftLocation = "Front Desk" | "Pool Deck" | "Group Fitness" | "Fitness Floor" | "LifeCafe" | "Housekeeping";

export interface Shift {
  id: string;
  employeeName: string;
  initials: string;
  date: string; // YYYY-MM-DD
  position: string;
  location: ShiftLocation;
  costCenter: string;
  scheduleTag: "Open" | "Mid" | "Close" | "Swing";
  start: string; // HH:MM 24h
  end: string; // HH:MM 24h
}

export type ShiftChangeType = "Swap" | "Coverage" | "Call-Off";
export type ShiftChangeStatus = "Pending" | "Approved" | "Denied";

export interface ShiftChangeRequest {
  id: string;
  shiftId: string;
  requestedBy: string;
  type: ShiftChangeType;
  targetEmployee?: string;
  reason: string;
  status: ShiftChangeStatus;
  submittedAt: string; // ISO
}

const ROSTER_KEY = "lifetime-shift-roster:roster";
const REQUESTS_KEY = "lifetime-shift-roster:requests";

const COST_CENTERS_BY_LOCATION: Record<ShiftLocation, string> = {
  "Front Desk": "CC-4100 · Winter Park – Member Services",
  "Pool Deck": "CC-4108 · Winter Park – Aquatics",
  "Group Fitness": "CC-4110 · Winter Park – Fitness Floor",
  "Fitness Floor": "CC-4110 · Winter Park – Fitness Floor",
  LifeCafe: "CC-4120 · Winter Park – LifeCafe",
  Housekeeping: "CC-4101 · Winter Park – Housekeeping",
};

// Same Winter Park roster referenced by the manager hub's Journeys/Tasks
// baseline data, so an employee opening this widget and a manager opening
// theirs are looking at the same people.
const ROSTER_NAMES: { name: string; initials: string; position: string; location: ShiftLocation }[] = [
  { name: "Jamie Cole", initials: "JC", position: "Member Services Associate", location: "Front Desk" },
  { name: "Priya Shah", initials: "PS", position: "Lifeguard", location: "Pool Deck" },
  { name: "Chris Diaz", initials: "CD", position: "Group Fitness Instructor", location: "Group Fitness" },
  { name: "Derek Simmons", initials: "DS", position: "Fitness Floor Attendant", location: "Fitness Floor" },
  { name: "Natalie Cho", initials: "NC", position: "LifeCafe Associate", location: "LifeCafe" },
  { name: "Daniel Esposito", initials: "DE", position: "Member Services Associate", location: "Front Desk" },
  { name: "Zoe Bennett", initials: "ZB", position: "Lifeguard", location: "Pool Deck" },
  { name: "Owen Park", initials: "OP", position: "Housekeeping Associate", location: "Housekeeping" },
  { name: "Felicia Grant", initials: "FG", position: "Group Fitness Instructor", location: "Group Fitness" },
  { name: "Trevor Nash", initials: "TN", position: "Fitness Floor Attendant", location: "Fitness Floor" },
];

const SHIFT_TEMPLATES: { scheduleTag: Shift["scheduleTag"]; start: string; end: string }[] = [
  { scheduleTag: "Open", start: "06:00", end: "14:00" },
  { scheduleTag: "Mid", start: "09:00", end: "17:00" },
  { scheduleTag: "Swing", start: "12:00", end: "20:00" },
  { scheduleTag: "Close", start: "14:00", end: "22:00" },
];

function isoDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Deterministic-ish baseline so the same seed roster shows up in both
// widgets before any real requests have been made. Regenerated on load if
// nothing is in storage yet.
function buildBaselineRoster(): Shift[] {
  const shifts: Shift[] = [];
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = isoDateOffset(dayOffset);
    ROSTER_NAMES.forEach((person, idx) => {
      // Skip one day a week per person so the roster has natural days off.
      if ((idx + dayOffset) % 6 === 5) return;
      const template = SHIFT_TEMPLATES[(idx + dayOffset) % SHIFT_TEMPLATES.length];
      shifts.push({
        id: `${person.name.replace(/\s+/g, "-").toLowerCase()}-${date}`,
        employeeName: person.name,
        initials: person.initials,
        date,
        position: person.position,
        location: person.location,
        costCenter: COST_CENTERS_BY_LOCATION[person.location],
        scheduleTag: template.scheduleTag,
        start: template.start,
        end: template.end,
      });
    });
  }
  return shifts;
}

export function loadRoster(): Shift[] {
  try {
    const raw = localStorage.getItem(ROSTER_KEY);
    if (!raw) {
      const seeded = buildBaselineRoster();
      localStorage.setItem(ROSTER_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : buildBaselineRoster();
  } catch {
    return buildBaselineRoster();
  }
}

export function saveRoster(shifts: Shift[]): void {
  try {
    localStorage.setItem(ROSTER_KEY, JSON.stringify(shifts));
  } catch {
    // localStorage unavailable — roster still renders this session
  }
}

export function loadShiftChangeRequests(): ShiftChangeRequest[] {
  try {
    const arr = JSON.parse(localStorage.getItem(REQUESTS_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveShiftChangeRequest(req: ShiftChangeRequest): void {
  try {
    const list = loadShiftChangeRequests();
    list.unshift(req);
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    // localStorage unavailable — request still shows this session, just won't persist
  }
}

export function knownRosterNames(): string[] {
  return ROSTER_NAMES.map((p) => p.name);
}

export function shiftsForEmployee(shifts: Shift[], employeeName: string): Shift[] {
  return shifts
    .filter((s) => s.employeeName === employeeName)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function formatShiftDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
