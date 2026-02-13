/**
 * revenue_calculation_connector.ts
 * 
 * WHAT: Computes ticketing and FastPASS revenue from forecasted attendance and pricing inputs.
 * WHY: Fully decoupled from forecasting logic — forecasts are never recomputed due to selection.
 * HOW: Filters forecasts to the selected time range, then applies pricing formulas.
 * 
 * Revenue scoping:
 *   - No selection → full forecast horizon
 *   - Single day → that day only
 *   - Range → only selected range
 */

import { ForecastRecord } from './forecast_model_connector';
import { TimeRangeSelection } from './time_range_selection_connector';

// --- Types ---

export interface RevenueInputs {
  ticketPrice: number;      // € per visitor
  fastpassPrice: number;    // € per FastPASS
  fastpassUptake: number;   // 0–1 (proportion of visitors buying FastPASS)
}

export interface RevenueResult {
  totalRevenue: number;
  ticketRevenue: number;
  fastpassRevenue: number;
  avgRevenuePerVisitor: number;
}

export interface DailyRevenue {
  date: Date;
  ticketRevenue: number;
  fastpassRevenue: number;
  totalRevenue: number;
}

/**
 * filterForecastsBySelection
 * WHAT: Scopes forecast records to the user's time range selection.
 */
function filterForecastsBySelection(
  forecasts: ForecastRecord[],
  selection: TimeRangeSelection
): ForecastRecord[] {
  if (selection.selection_mode === 'none') return forecasts;

  return forecasts.filter(f => {
    const d = f.date.getTime();
    return d >= selection.start_date!.getTime() && d <= selection.end_date!.getTime();
  });
}

/**
 * calculateRevenue
 * WHAT: Computes aggregate revenue KPIs from scoped forecast data.
 * WHY: Provides the 4 KPI card values.
 */
export function calculateRevenue(
  forecasts: ForecastRecord[],
  inputs: RevenueInputs,
  selection: TimeRangeSelection
): RevenueResult {
  const scoped = filterForecastsBySelection(forecasts, selection);

  let totalAttendance = 0;
  let ticketRevenue = 0;
  let fastpassRevenue = 0;

  for (const f of scoped) {
    totalAttendance += f.forecasted_attendance;
    ticketRevenue += f.forecasted_attendance * inputs.ticketPrice;
    fastpassRevenue += f.forecasted_attendance * inputs.fastpassUptake * inputs.fastpassPrice;
  }

  const totalRevenue = ticketRevenue + fastpassRevenue;
  const avgRevenuePerVisitor = totalAttendance > 0 ? totalRevenue / totalAttendance : 0;

  return { totalRevenue, ticketRevenue, fastpassRevenue, avgRevenuePerVisitor };
}

/**
 * calculateDailyRevenue
 * WHAT: Computes per-day revenue breakdown for the revenue chart.
 * WHY: Powers the stacked revenue breakdown visualization.
 */
export function calculateDailyRevenue(
  forecasts: ForecastRecord[],
  inputs: RevenueInputs,
  selection: TimeRangeSelection
): DailyRevenue[] {
  const scoped = filterForecastsBySelection(forecasts, selection);

  return scoped.map(f => ({
    date: f.date,
    ticketRevenue: f.forecasted_attendance * inputs.ticketPrice,
    fastpassRevenue: f.forecasted_attendance * inputs.fastpassUptake * inputs.fastpassPrice,
    totalRevenue: f.forecasted_attendance * (inputs.ticketPrice + inputs.fastpassUptake * inputs.fastpassPrice),
  }));
}
