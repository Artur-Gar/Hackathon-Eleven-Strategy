/**
 * useDashboardState.ts
 * 
 * WHAT: Central state hook for the dashboard — wires all connectors together.
 * WHY: Keeps Index.tsx clean and connector interactions in one place.
 * HOW: Loads CSV, runs cleaning, generates forecasts, computes revenue reactively.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import attendanceCSV from '@/data/attendance.csv?raw';
import externalForecastCSV from '@/data/lightgbm_quantile_regression.csv?raw';
import { cleanAttendanceData, CleanedAttendanceRecord } from '@/connectors/attendance_data_connector';
import { ForecastRecord, ForecastHorizon } from '@/connectors/forecast_model_connector';
import { parseExternalForecast, filterByHorizon } from '@/connectors/external_forecast_loader';
import {
  createEmptySelection,
  handleChartClick,
  TimeRangeSelection,
} from '@/connectors/time_range_selection_connector';
import {
  calculateRevenue,
  calculateDailyRevenue,
  RevenueInputs,
  RevenueResult,
  DailyRevenue,
} from '@/connectors/revenue_calculation_connector';

export interface DashboardState {
  // Data
  historicalData: CleanedAttendanceRecord[];
  forecasts: ForecastRecord[];

  // Inputs
  ticketPrice: number;
  setTicketPrice: (v: number) => void;
  fastpassPrice: number;
  setFastpassPrice: (v: number) => void;
  fastpassUptake: number;
  setFastpassUptake: (v: number) => void;
  horizon: ForecastHorizon;
  setHorizon: (h: ForecastHorizon) => void;

  // Selection
  selection: TimeRangeSelection;
  onChartClick: (date: Date) => void;

  // Revenue
  revenue: RevenueResult;
  dailyRevenue: DailyRevenue[];
}

export function useDashboardState(): DashboardState {
  // --- Pricing inputs ---
  const [ticketPrice, setTicketPrice] = useState(45);
  const [fastpassPrice, setFastpassPrice] = useState(15);
  const [fastpassUptake, setFastpassUptake] = useState(0.25);
  const [horizon, setHorizon] = useState<ForecastHorizon>('5m');
  const [selection, setSelection] = useState<TimeRangeSelection>(createEmptySelection());

  // --- Data cleaning (runs once) ---
  const historicalData = useMemo(() => cleanAttendanceData(attendanceCSV), []);

  // --- External forecasts (loaded from LightGBM CSV, filtered by horizon) ---
  const allForecasts = useMemo(() => parseExternalForecast(externalForecastCSV), []);
  const forecasts = useMemo(
    () => filterByHorizon(allForecasts, horizon),
    [allForecasts, horizon]
  );

  // Reset selection when horizon changes
  useEffect(() => {
    setSelection(createEmptySelection());
  }, [horizon]);

  // --- Chart click handler ---
  const onChartClick = useCallback(
    (date: Date) => {
      // Only allow selection on forecast dates
      const firstForecast = forecasts[0]?.date.getTime();
      const lastForecast = forecasts[forecasts.length - 1]?.date.getTime();
      if (!firstForecast || date.getTime() < firstForecast || date.getTime() > lastForecast) return;
      setSelection(prev => handleChartClick(prev, date));
    },
    [forecasts]
  );

  // --- Revenue computation ---
  const revenueInputs: RevenueInputs = useMemo(
    () => ({ ticketPrice, fastpassPrice, fastpassUptake }),
    [ticketPrice, fastpassPrice, fastpassUptake]
  );

  const revenue = useMemo(
    () => calculateRevenue(forecasts, revenueInputs, selection),
    [forecasts, revenueInputs, selection]
  );

  const dailyRevenue = useMemo(
    () => calculateDailyRevenue(forecasts, revenueInputs, selection),
    [forecasts, revenueInputs, selection]
  );

  return {
    historicalData,
    forecasts,
    ticketPrice, setTicketPrice,
    fastpassPrice, setFastpassPrice,
    fastpassUptake, setFastpassUptake,
    horizon, setHorizon,
    selection, onChartClick,
    revenue, dailyRevenue,
  };
}
