/**
 * external_forecast_loader.ts
 * 
 * WHAT: Loads pre-computed LightGBM quantile regression forecasts from CSV.
 * WHY: Forecasts are generated externally — the app only consumes them.
 * HOW: Parses the CSV (weekly granularity) into ForecastRecord[] compatible
 *      with the existing dashboard pipeline.
 * 
 * The CSV contains weekly aggregates. Each row becomes one ForecastRecord
 * with the week-start date. Revenue calculations and charts consume these
 * exactly as they would daily forecasts.
 */

import { ForecastRecord, ForecastHorizon } from './forecast_model_connector';

/**
 * parseExternalForecast
 * WHAT: Parses the LightGBM CSV into ForecastRecord[].
 */
export function parseExternalForecast(csvRaw: string): ForecastRecord[] {
  const lines = csvRaw.trim().split('\n');
  const records: ForecastRecord[] = [];

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 4) continue;

    const date = new Date(cols[0].trim());
    const predicted = parseFloat(cols[1]);
    const lower = parseFloat(cols[2]);
    const upper = parseFloat(cols[3]);

    if (isNaN(date.getTime()) || isNaN(predicted)) continue;

    records.push({
      date,
      forecasted_attendance: Math.round(predicted),
      lower_confidence_interval: Math.round(lower),
      upper_confidence_interval: Math.round(upper),
    });
  }

  return records.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * filterByHorizon
 * WHAT: Filters external forecasts to match the selected horizon.
 * WHY: Preserves the existing horizon toggle behavior.
 */
export function filterByHorizon(
  forecasts: ForecastRecord[],
  horizon: ForecastHorizon
): ForecastRecord[] {
  if (forecasts.length === 0) return [];

  const start = forecasts[0].date.getTime();
  const msPerDay = 86400000;
  let maxDays: number;

  switch (horizon) {
    case '1m': maxDays = 30; break;
    case '5m': maxDays = 150; break;
    case '1y': maxDays = 365; break;
  }

  return forecasts.filter(f => (f.date.getTime() - start) / msPerDay <= maxDays);
}
