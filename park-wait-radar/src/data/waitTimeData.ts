import csvRaw from "./wait-times.csv?raw";
import { ATTRACTIONS, PARK_OPEN, SLOT_MINUTES } from "./attractions";

// Build a name → id map
const nameToId = new Map<string, string>();
ATTRACTIONS.forEach((a) => nameToId.set(a.name, a.id));

// Parse CSV into a lookup: "attractionId_yyyy-MM-dd_slotIndex" → WAIT_TIME_MAX
const realWaitTimes = new Map<string, number>();

const lines = csvRaw.trim().split("\n");
for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(",");
  // WORK_DATE, DEB_TIME, ENTITY_DESCRIPTION_SHORT, WAIT_TIME_MAX, ...
  const dateStr = cols[0]; // e.g. "2022-08-11"
  const debTime = cols[1]; // e.g. "2022-08-11 16:00:00.000"
  const name = cols[2];
  const waitMax = parseFloat(cols[3]);

  const id = nameToId.get(name);
  if (!id || isNaN(waitMax)) continue;

  // Extract hour:minute from DEB_TIME
  const timePart = debTime.trim().split(" ")[1]; // "16:00:00.000"
  const [hStr, mStr] = timePart.split(":");
  const totalMin = parseInt(hStr) * 60 + parseInt(mStr);
  const slotIndex = Math.round((totalMin - PARK_OPEN * 60) / SLOT_MINUTES);

  if (slotIndex < 0) continue;

  const key = `${id}_${dateStr}_${slotIndex}`;
  realWaitTimes.set(key, waitMax);
}

export function getRealWaitTime(
  attractionId: string,
  dateStr: string,
  slotIndex: number
): number | null {
  const key = `${attractionId}_${dateStr}_${slotIndex}`;
  const val = realWaitTimes.get(key);
  return val !== undefined ? val : null;
}

// Dates that have real data
export const REAL_DATA_MIN = "2022-07-19";
export const REAL_DATA_MAX = "2022-07-26";

export function hasRealData(dateStr: string): boolean {
  return dateStr >= REAL_DATA_MIN && dateStr <= REAL_DATA_MAX;
}
