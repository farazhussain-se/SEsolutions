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

// DEV: shared data contract with the standalone shift-roster-widget (employee
// facing). Both widgets run on the same Staffbase branch origin, so
// localStorage under these keys acts as a common data store between them —
// same no-backend-needed pattern this widget already uses for requisitions
// and role changes (see REQUISITION_STORAGE_KEY / ROLE_CHANGE_STORAGE_KEY).
// Types here are a deliberate duplicate of shift-roster-widget/src/shift-data.ts
// rather than a shared package — the two widgets are independent deployables.
//
// PM: this file is sample/seed data only — the fictional "Northwind Retail"
// store's department names, cost centers, and starter roster used to make
// Roster & Leave look populated before any real shift data exists. Nothing
// here calls a real Staffbase API; it's all localStorage.

export type ShiftLocation = "Checkout" | "Receiving" | "Sales Floor" | "Fitting Rooms" | "Café" | "Housekeeping" | "Visual Merchandising";

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

const ROSTER_KEY = "retaildemo-shift-roster:roster";
const REQUESTS_KEY = "retaildemo-shift-roster:requests";

const COST_CENTERS_BY_LOCATION: Record<ShiftLocation, string> = {
  "Checkout": "CC-4100 · Downtown – Customer Service",
  "Receiving": "CC-4108 · Downtown – Aquatics",
  "Sales Floor": "CC-4110 · Downtown – Fitting Rooms",
  "Fitting Rooms": "CC-4110 · Downtown – Fitting Rooms",
  Café: "CC-4120 · Downtown – Café",
  Housekeeping: "CC-4101 · Downtown – Housekeeping",
  "Visual Merchandising": "CC-4112 · Downtown – Visual Merchandising",
};

// Identical seed roster to shift-roster-widget, so the coverage matrix here
// looks right even before any employee has opened that widget in this browser.
const ROSTER_NAMES: { name: string; initials: string; position: string; location: ShiftLocation }[] = [
  { name: "Jamie Cole", initials: "JC", position: "Customer Service Associate", location: "Checkout" },
  { name: "Priya Shah", initials: "PS", position: "Receiving Associate", location: "Receiving" },
  { name: "Chris Diaz", initials: "CD", position: "Sales Floor Lead", location: "Sales Floor" },
  { name: "Derek Simmons", initials: "DS", position: "Fitting Room Attendant", location: "Fitting Rooms" },
  { name: "Natalie Cho", initials: "NC", position: "Café Associate", location: "Café" },
  { name: "Daniel Esposito", initials: "DE", position: "Customer Service Associate", location: "Checkout" },
  { name: "Zoe Bennett", initials: "ZB", position: "Receiving Associate", location: "Receiving" },
  { name: "Owen Park", initials: "OP", position: "Housekeeping Associate", location: "Housekeeping" },
  { name: "Felicia Grant", initials: "FG", position: "Sales Floor Lead", location: "Sales Floor" },
  { name: "Trevor Nash", initials: "TN", position: "Fitting Room Attendant", location: "Fitting Rooms" },
  { name: "Jordan Blake", initials: "JB", position: "Visual Merchandiser", location: "Visual Merchandising" },
];

const OPEN_TRAINING_SHIFT_DAY_OFFSETS = [2, 5];

const SHIFT_TEMPLATES: { scheduleTag: Shift["scheduleTag"]; start: string; end: string }[] = [
  { scheduleTag: "Open", start: "06:00", end: "14:00" },
  { scheduleTag: "Mid", start: "09:00", end: "17:00" },
  { scheduleTag: "Swing", start: "12:00", end: "20:00" },
  { scheduleTag: "Close", start: "14:00", end: "22:00" },
];

export function isoDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildBaselineRoster(): Shift[] {
  const shifts: Shift[] = [];
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = isoDateOffset(dayOffset);
    ROSTER_NAMES.forEach((person, idx) => {
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

  OPEN_TRAINING_SHIFT_DAY_OFFSETS.forEach((dayOffset) => {
    const date = isoDateOffset(dayOffset);
    const template = SHIFT_TEMPLATES[dayOffset % SHIFT_TEMPLATES.length];
    shifts.push({
      id: `open-personal-training-${date}`,
      employeeName: "Open Shift",
      initials: "OS",
      date,
      position: "Visual Merchandiser",
      location: "Visual Merchandising",
      costCenter: COST_CENTERS_BY_LOCATION["Visual Merchandising"],
      scheduleTag: template.scheduleTag,
      start: template.start,
      end: template.end,
    });
  });

  return shifts;
}

// `allowSeed` mirrors this widget's demoMode toggle: when off, an empty
// roster stays empty instead of blending in the sample Downtown roster
// (same "no sample data when demo mode is off" rule as requisitions/journeys).
export function loadRoster(allowSeed = true): Shift[] {
  try {
    const raw = localStorage.getItem(ROSTER_KEY);
    if (!raw) {
      if (!allowSeed) return [];
      const seeded = buildBaselineRoster();
      localStorage.setItem(ROSTER_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : (allowSeed ? buildBaselineRoster() : []);
  } catch {
    return allowSeed ? buildBaselineRoster() : [];
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

export function saveShiftChangeRequests(requests: ShiftChangeRequest[]): void {
  try {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
  } catch {
    // localStorage unavailable — status change still reflects this session
  }
}

export function allLocations(): ShiftLocation[] {
  return ["Checkout", "Receiving", "Sales Floor", "Fitting Rooms", "Café", "Housekeeping", "Visual Merchandising"];
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
