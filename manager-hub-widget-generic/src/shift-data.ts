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

// Shared data contract with a standalone employee-facing shift widget, if
// one is paired with this dashboard. Both would run on the same Staffbase
// branch origin, so localStorage under these keys acts as a common data
// store between them — same no-backend-needed pattern this widget already
// uses for requisitions and role changes (see REQUISITION_STORAGE_KEY /
// ROLE_CHANGE_STORAGE_KEY). This copy has no dependency on that widget
// existing — it seeds and reads its own baseline roster either way.

export type ShiftLocation = "Front Desk" | "Warehouse" | "Sales Floor" | "Training Room" | "Café" | "Facilities";

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

const ROSTER_KEY = "manager-hub:roster";
const REQUESTS_KEY = "manager-hub:shift-requests";

const COST_CENTERS_BY_LOCATION: Record<ShiftLocation, string> = {
  "Front Desk": "CC-1100 · Springfield – Member Services",
  Warehouse: "CC-1108 · Springfield – Warehouse",
  "Sales Floor": "CC-1110 · Springfield – Sales Floor",
  "Training Room": "CC-1112 · Springfield – Training",
  Café: "CC-1120 · Springfield – Café",
  Facilities: "CC-1101 · Springfield – Facilities",
};

// Placeholder roster — swap in a real client's team when customizing this
// template for a demo.
const ROSTER_NAMES: { name: string; initials: string; position: string; location: ShiftLocation }[] = [
  { name: "Jamie Cole", initials: "JC", position: "Member Services Associate", location: "Front Desk" },
  { name: "Priya Shah", initials: "PS", position: "Warehouse Associate", location: "Warehouse" },
  { name: "Chris Diaz", initials: "CD", position: "Sales Associate", location: "Sales Floor" },
  { name: "Derek Simmons", initials: "DS", position: "Sales Floor Attendant", location: "Sales Floor" },
  { name: "Natalie Cho", initials: "NC", position: "Café Associate", location: "Café" },
  { name: "Daniel Esposito", initials: "DE", position: "Member Services Associate", location: "Front Desk" },
  { name: "Zoe Bennett", initials: "ZB", position: "Warehouse Associate", location: "Warehouse" },
  { name: "Owen Park", initials: "OP", position: "Facilities Associate", location: "Facilities" },
  { name: "Felicia Grant", initials: "FG", position: "Training Coordinator", location: "Training Room" },
  { name: "Trevor Nash", initials: "TN", position: "Sales Floor Attendant", location: "Sales Floor" },
  { name: "Taylor Reed", initials: "TR", position: "Training Coordinator", location: "Training Room" },
];

// This widget's featured/default demo persona — the roster still models a
// whole team, but when no real logged-in user matches a roster name, the
// widget centers on Taylor rather than whichever name happens to be first.
const FEATURED_EMPLOYEE = "Taylor Reed";

// Extra Training Room shifts left unstaffed on the baseline roster — e.g.
// another coordinator's slot that opened up — so there are always real open
// shifts to demo pickup/coverage against, not just assigned schedules.
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

  OPEN_TRAINING_SHIFT_DAY_OFFSETS.forEach((dayOffset) => {
    const date = isoDateOffset(dayOffset);
    const template = SHIFT_TEMPLATES[dayOffset % SHIFT_TEMPLATES.length];
    shifts.push({
      id: `open-training-room-${date}`,
      employeeName: "Open Shift",
      initials: "OS",
      date,
      position: "Training Coordinator",
      location: "Training Room",
      costCenter: COST_CENTERS_BY_LOCATION["Training Room"],
      scheduleTag: template.scheduleTag,
      start: template.start,
      end: template.end,
    });
  });

  return shifts;
}

// `allowSeed` mirrors this widget's demoMode toggle: when off, an empty
// roster stays empty instead of blending in the sample roster (same "no
// sample data when demo mode is off" rule as requisitions/journeys).
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
  return ["Front Desk", "Warehouse", "Sales Floor", "Training Room", "Café", "Facilities"];
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function featuredEmployeeName(): string {
  return FEATURED_EMPLOYEE;
}
