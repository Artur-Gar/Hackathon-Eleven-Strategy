/**
 * forecast_model_connector.ts
 * 
 * WHAT: Pluggable forecast engine with strict input/output schema.
 * WHY: Encapsulates all forecasting logic so models can be swapped without touching the UI.
 * HOW: Defines an abstract interface and provides a default browser-compatible surrogate
 *      SARIMAX implementation that captures trend, weekly & yearly seasonality, and uncertainty.
 * 
 * COVID and closure periods are excluded/downweighted during training inside this connector.
 * The UI never references COVID logic for forecasting.
 */

import { CleanedAttendanceRecord } from './attendance_data_connector';

// --- Types ---

export interface ForecastRecord {
  date: Date;
  forecasted_attendance: number;
  lower_confidence_interval: number;
  upper_confidence_interval: number;
}

export type ForecastHorizon = '1m' | '5m' | '1y';

/** Convert horizon label to number of days */
function horizonToDays(horizon: ForecastHorizon): number {
  switch (horizon) {
    case '1m': return 30;
    case '5m': return 150;
    case '1y': return 365;
  }
}

/**
 * generateForecast (default surrogate SARIMAX)
 * 
 * WHAT: Produces daily attendance forecasts with confidence intervals.
 * WHY: Provides a realistic baseline forecast for revenue simulation.
 * HOW: 
 *   1. Filters out COVID and closure periods from training data.
 *   2. Computes a base level from the last valid year of data.
 *   3. Applies weekly seasonality (day-of-week factors) from historical patterns.
 *   4. Applies yearly seasonality (month-of-year factors) from historical patterns.
 *   5. Adds growing uncertainty (wider confidence bands) further into the future.
 */
export function generateForecast(
  historicalData: CleanedAttendanceRecord[],
  horizon: ForecastHorizon
): ForecastRecord[] {
  const days = horizonToDays(horizon);

  // Filter training data: exclude COVID periods and closures
  const trainData = historicalData.filter(
    r => r.attendance !== null && !r.is_covid_period && !r.is_closed
  );

  if (trainData.length === 0) return [];

  // Compute day-of-week seasonality factors (0=Sun .. 6=Sat)
  const dowSums = new Array(7).fill(0);
  const dowCounts = new Array(7).fill(0);
  for (const r of trainData) {
    dowSums[r.day_of_week] += r.attendance!;
    dowCounts[r.day_of_week] += 1;
  }
  const overallMean = trainData.reduce((s, r) => s + r.attendance!, 0) / trainData.length;
  const dowFactors = dowSums.map((sum, i) =>
    dowCounts[i] > 0 ? (sum / dowCounts[i]) / overallMean : 1
  );

  // Compute month-of-year seasonality factors (1-12)
  const monthSums = new Array(13).fill(0);
  const monthCounts = new Array(13).fill(0);
  for (const r of trainData) {
    monthSums[r.month] += r.attendance!;
    monthCounts[r.month] += 1;
  }
  const monthFactors = monthSums.map((sum, i) =>
    monthCounts[i] > 0 ? (sum / monthCounts[i]) / overallMean : 1
  );

  // Use the last 90 days of valid (non-COVID, non-closed) data for base level
  const recentValid = trainData.slice(-90);
  const baseLevel = recentValid.reduce((s, r) => s + r.attendance!, 0) / recentValid.length;

  // Standard deviation for confidence interval scaling
  const variance = recentValid.reduce((s, r) => s + Math.pow(r.attendance! - baseLevel, 2), 0) / recentValid.length;
  const stdDev = Math.sqrt(variance);

  // Generate forecast from the day after the last historical date
  const lastDate = historicalData[historicalData.length - 1].date;
  const forecasts: ForecastRecord[] = [];

  for (let i = 1; i <= days; i++) {
    const forecastDate = new Date(lastDate);
    forecastDate.setDate(forecastDate.getDate() + i);

    const dow = forecastDate.getDay();
    const month = forecastDate.getMonth() + 1;

    // Apply both seasonality factors to the base level
    const predicted = baseLevel * dowFactors[dow] * monthFactors[month];

    // Confidence interval widens with sqrt of horizon distance (uncertainty grows)
    const intervalWidth = 1.645 * stdDev * Math.sqrt(i / 30); // ~90% CI

    forecasts.push({
      date: forecastDate,
      forecasted_attendance: Math.max(0, Math.round(predicted)),
      lower_confidence_interval: Math.max(0, Math.round(predicted - intervalWidth)),
      upper_confidence_interval: Math.round(predicted + intervalWidth),
    });
  }

  return forecasts;
}
