import Papa from "papaparse";
import pako from "pako";
import { AppConfig } from "@/config/AppConfig";

export interface RawRow {
  timestamp: string;
  ride_name: string;
  wait_time: string | number;
  availability: string | number;
}

export interface HourlyData {
  hour: number;
  label: string;
  avgWait: number;
}

export interface RideData {
  name: string;
  available: boolean;
  hourlyData: HourlyData[];
  currentHourIndex: number;
}

function formatHourLabel(hour: number): string {
  if (hour === 0) return "12a";
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return "12p";
  return `${hour - 12}p`;
}

export function validateColumns(headers: string[]): string | null {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const col of AppConfig.requiredColumns) {
    if (!lower.includes(col)) {
      return `Missing required column: "${col}"`;
    }
  }
  return null;
}

export function processCSVData(rows: RawRow[]): RideData[] {
  const currentHour = new Date().getHours();
  const rideMap = new Map<
    string,
    { hourSums: Map<number, number[]>; available: boolean }
  >();

  for (const row of rows) {
    const name = row.ride_name?.trim();
    if (!name) continue;

    const waitTime = Number(row.wait_time) || 0;
    const available = String(row.availability).toLowerCase() === "true" || Number(row.availability) === 1;
    const ts = new Date(row.timestamp);
    if (isNaN(ts.getTime())) continue;
    const hour = ts.getHours();

    if (!rideMap.has(name)) {
      rideMap.set(name, { hourSums: new Map(), available });
    }

    const entry = rideMap.get(name)!;
    // If any row is available, ride is available
    if (available) entry.available = true;

    if (!entry.hourSums.has(hour)) {
      entry.hourSums.set(hour, []);
    }
    entry.hourSums.get(hour)!.push(available ? waitTime : 0);
  }

  const results: RideData[] = [];

  for (const [name, data] of rideMap) {
    const hours = Array.from(data.hourSums.keys()).sort((a, b) => a - b);
    const hourlyData: HourlyData[] = hours.map((hour) => {
      const vals = data.hourSums.get(hour)!;
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
      return { hour, label: formatHourLabel(hour), avgWait: Math.round(avg) };
    });

    const currentHourIndex = hourlyData.findIndex((h) => h.hour === currentHour);

    results.push({
      name,
      available: data.available,
      hourlyData,
      currentHourIndex,
    });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export async function parseGzippedCSV(buffer: ArrayBuffer): Promise<RawRow[]> {
  const decompressed = pako.ungzip(new Uint8Array(buffer), { to: "string" });
  return new Promise((resolve, reject) => {
    Papa.parse<RawRow>(decompressed, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const err = validateColumns(results.meta.fields || []);
        if (err) reject(new Error(err));
        else resolve(results.data);
      },
      error: (err: Error) => reject(err),
    });
  });
}

export function parseCSVText(text: string): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawRow>(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const err = validateColumns(results.meta.fields || []);
        if (err) reject(new Error(err));
        else resolve(results.data);
      },
      error: (err: Error) => reject(err),
    });
  });
}
