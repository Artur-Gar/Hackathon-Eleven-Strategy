/**
 * attendance_data_connector.ts
 * 
 * WHAT: Loads, filters, and cleans raw attendance CSV data for PortAventura World.
 * WHY: Provides a single, auditable source of cleaned historical data for the dashboard.
 * HOW: Implements the exact 5-step cleaning pipeline specified in the data spec.
 * 
 * This connector is the ONLY source of historical data for the UI and forecast engine.
 */

// --- Types ---

export interface CleanedAttendanceRecord {
  date: Date;
  attendance: number | null; // null = missing (inserted date with no data)
  is_closed: boolean;        // true = park was closed (original attendance was negative)
  is_covid_period: boolean;  // true = date falls within configurable COVID range
  day_of_week: number;       // 0 = Sunday, 6 = Saturday
  week_of_year: number;
  month: number;             // 1-12
  year: number;
}

// --- Configurable COVID date range ---
// These can be changed without modifying any other logic.
const COVID_START = new Date('2020-03-14');
const COVID_END = new Date('2021-06-30');

// --- Helper: get ISO week number ---
function getWeekOfYear(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// --- Helper: add days ---
function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

// --- Helper: format date to YYYY-MM-DD for comparison ---
function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * parseCSV
 * WHAT: Parses raw CSV text into typed records, filtering to PortAventura World only.
 * WHY: Isolates parsing from cleaning logic for testability.
 */
function parseCSV(csvText: string): { date: Date; attendance: number }[] {
  const lines = csvText.trim().split('\n');
  const records: { date: Date; attendance: number }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 3) continue;

    const facilityName = parts[1].trim();
    if (facilityName !== 'PortAventura World') continue;

    const date = new Date(parts[0].trim() + 'T00:00:00');
    const attendance = parseInt(parts[2].trim(), 10);

    if (!isNaN(date.getTime()) && !isNaN(attendance)) {
      records.push({ date, attendance });
    }
  }

  return records;
}

/**
 * cleanAttendanceData
 * WHAT: Applies the full 5-step cleaning pipeline to raw CSV text.
 * WHY: Ensures all downstream consumers receive consistently cleaned data.
 * HOW: Steps are applied in order, each deterministic and reproducible.
 */
export function cleanAttendanceData(csvText: string): CleanedAttendanceRecord[] {
  // Step 1: Parse, sort by date ascending
  const raw = parseCSV(csvText);
  raw.sort((a, b) => a.date.getTime() - b.date.getTime());

  if (raw.length === 0) return [];

  // Build a lookup map for raw data by date key
  const rawMap = new Map<string, number>();
  for (const r of raw) {
    rawMap.set(toDateKey(r.date), r.attendance);
  }

  // Determine full date range and fill gaps
  const startDate = raw[0].date;
  const endDate = raw[raw.length - 1].date;
  const result: CleanedAttendanceRecord[] = [];
  let current = new Date(startDate);

  while (current <= endDate) {
    const key = toDateKey(current);
    const rawAttendance = rawMap.get(key);

    // Step 4: Missing dates get null attendance (no imputation)
    let attendance: number | null = rawAttendance !== undefined ? rawAttendance : null;

    // Step 2: Negative attendance → 0 + is_closed flag
    let is_closed = false;
    if (attendance !== null && attendance < 0) {
      attendance = 0;
      is_closed = true;
    }

    // Step 3: COVID period flag (configurable range)
    const is_covid_period = current >= COVID_START && current <= COVID_END;

    // Step 5: Derive calendar features (non-destructive)
    result.push({
      date: new Date(current),
      attendance,
      is_closed,
      is_covid_period,
      day_of_week: current.getDay(),
      week_of_year: getWeekOfYear(current),
      month: current.getMonth() + 1,
      year: current.getFullYear(),
    });

    current = addDays(current, 1);
  }

  return result;
}
