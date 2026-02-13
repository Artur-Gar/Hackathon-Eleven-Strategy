/**
 * AttendanceChart.tsx
 * 
 * WHAT: Main time series chart showing historical attendance + forecast with confidence band.
 * WHY: Primary visualization for the executive dashboard.
 * HOW: Uses Recharts ComposedChart with Area (CI band), Line (forecast), and ReferenceArea (COVID).
 *      Click events on forecast region are forwarded to the time_range_selection_connector.
 */

import { useMemo } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceArea, CartesianGrid,
} from 'recharts';
import { CleanedAttendanceRecord } from '@/connectors/attendance_data_connector';
import { ForecastRecord } from '@/connectors/forecast_model_connector';
import { TimeRangeSelection } from '@/connectors/time_range_selection_connector';

interface AttendanceChartProps {
  historicalData: CleanedAttendanceRecord[];
  forecasts: ForecastRecord[];
  selection: TimeRangeSelection;
  onChartClick: (date: Date) => void;
}

// COVID range for visual shading (matches connector defaults)
const COVID_START = new Date('2020-03-14').getTime();
const COVID_END = new Date('2021-06-30').getTime();

function formatDateShort(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDateFull(ts: number): string {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function AttendanceChart({
  historicalData, forecasts, selection, onChartClick,
}: AttendanceChartProps) {
  // Merge historical + forecast into a single series for the chart
  const chartData = useMemo(() => {
    // Downsample historical to weekly for performance (take max per week)
    const weeklyHistorical: { ts: number; attendance: number | null }[] = [];
    let weekBucket: { ts: number; val: number }[] = [];

    for (const r of historicalData) {
      const ts = r.date.getTime();
      if (r.attendance !== null) {
        weekBucket.push({ ts, val: r.attendance });
      } else {
        // Flush current bucket before the gap
        if (weekBucket.length > 0) {
          const avg = weekBucket.reduce((s, b) => s + b.val, 0) / weekBucket.length;
          weeklyHistorical.push({ ts: weekBucket[Math.floor(weekBucket.length / 2)].ts, attendance: Math.round(avg) });
          weekBucket = [];
        }
        // Insert a null point to break the line
        weeklyHistorical.push({ ts, attendance: null });
      }
      // Flush every 7 days
      if (weekBucket.length >= 7) {
        const avg = weekBucket.reduce((s, b) => s + b.val, 0) / weekBucket.length;
        weeklyHistorical.push({ ts: weekBucket[Math.floor(weekBucket.length / 2)].ts, attendance: Math.round(avg) });
        weekBucket = [];
      }
    }
    if (weekBucket.length > 0) {
      const avg = weekBucket.reduce((s, b) => s + b.val, 0) / weekBucket.length;
      weeklyHistorical.push({ ts: weekBucket[Math.floor(weekBucket.length / 2)].ts, attendance: Math.round(avg) });
    }

    const historicalPoints = weeklyHistorical.map(r => ({
      ts: r.ts,
      historical: r.attendance ?? undefined,
      forecast: undefined as number | undefined,
      ciLower: undefined as number | undefined,
      ciUpper: undefined as number | undefined,
    }));

    // Downsample forecasts too (weekly)
    const weeklyForecasts: typeof forecasts = [];
    for (let i = 0; i < forecasts.length; i += 7) {
      const chunk = forecasts.slice(i, i + 7);
      const avg = (arr: number[]) => Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
      weeklyForecasts.push({
        date: chunk[Math.floor(chunk.length / 2)].date,
        forecasted_attendance: avg(chunk.map(c => c.forecasted_attendance)),
        lower_confidence_interval: avg(chunk.map(c => c.lower_confidence_interval)),
        upper_confidence_interval: avg(chunk.map(c => c.upper_confidence_interval)),
      });
    }

    // Add bridge point: last historical value as first forecast point
    const lastHist = historicalData[historicalData.length - 1];
    if (lastHist && lastHist.attendance !== null) {
      historicalPoints.push({
        ts: lastHist.date.getTime(),
        historical: lastHist.attendance,
        forecast: lastHist.attendance,
        ciLower: lastHist.attendance,
        ciUpper: lastHist.attendance,
      });
    }

    const forecastPoints = weeklyForecasts.map(f => ({
      ts: f.date.getTime(),
      historical: undefined as number | undefined,
      forecast: f.forecasted_attendance,
      ciLower: f.lower_confidence_interval,
      ciUpper: f.upper_confidence_interval,
    }));

    return [...historicalPoints, ...forecastPoints];
  }, [historicalData, forecasts]);

  // Selection highlight bounds
  const selStart = selection.start_date?.getTime();
  const selEnd = selection.end_date?.getTime();

  return (
    <div className="w-full h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          onClick={(e) => {
            if (e?.activePayload?.[0]?.payload?.ts) {
              onChartClick(new Date(e.activePayload[0].payload.ts));
            }
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(32, 22%, 88%)" />
          <XAxis
            dataKey="ts"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={formatDateShort}
            tick={{ fontSize: 11, fill: 'hsl(220, 15%, 45%)' }}
            stroke="hsl(32, 22%, 88%)"
          />
          <YAxis
            tickFormatter={v => `${(v / 1000).toFixed(0)}K`}
            tick={{ fontSize: 11, fill: 'hsl(220, 15%, 45%)' }}
            stroke="hsl(32, 22%, 88%)"
            width={50}
          />
          <Tooltip
            labelFormatter={formatDateFull}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                historical: 'Historical',
                forecast: 'Forecast',
                ciUpper: 'Upper CI',
                ciLower: 'Lower CI',
              };
              return [value?.toLocaleString() ?? '–', labels[name] || name];
            }}
            contentStyle={{
              background: 'hsl(0, 0%, 100%)',
              border: '1px solid hsl(32, 22%, 88%)',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          />

          {/* COVID period shading */}
          <ReferenceArea
            x1={COVID_START}
            x2={COVID_END}
            fill="hsl(30, 24%, 92%)"
            fillOpacity={0.6}
            label={{ value: 'COVID', position: 'insideTop', fontSize: 10, fill: 'hsl(220, 15%, 45%)' }}
          />

          {/* Selection highlight */}
          {selStart && selEnd && (
            <ReferenceArea
              x1={selStart}
              x2={selEnd}
              fill="hsl(24, 85%, 50%)"
              fillOpacity={0.15}
              stroke="hsl(24, 85%, 50%)"
              strokeOpacity={0.4}
            />
          )}

          {/* Confidence interval band */}
          <Area
            dataKey="ciUpper"
            stroke="none"
            fill="hsl(43, 91%, 55%)"
            fillOpacity={0.15}
            isAnimationActive={false}
          />
          <Area
            dataKey="ciLower"
            stroke="none"
            fill="hsl(36, 38%, 97%)"
            fillOpacity={1}
            isAnimationActive={false}
          />

          {/* Historical line */}
          <Line
            dataKey="historical"
            stroke="hsl(210, 60%, 35%)"
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />

          {/* Forecast line */}
          <Line
            dataKey="forecast"
            stroke="hsl(24, 85%, 50%)"
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
