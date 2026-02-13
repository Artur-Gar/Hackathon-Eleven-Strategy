/**
 * RevenueChart.tsx
 * 
 * WHAT: Stacked area chart showing Ticket vs FastPASS revenue over time.
 * WHY: Visualizes revenue composition for the selected time scope.
 * HOW: Consumes DailyRevenue from the revenue connector. Matches KPI card scope.
 */

import { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { DailyRevenue } from '@/connectors/revenue_calculation_connector';

interface RevenueChartProps {
  dailyRevenue: DailyRevenue[];
}

function formatDateShort(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function RevenueChart({ dailyRevenue }: RevenueChartProps) {
  const chartData = useMemo(() => {
    // Downsample to weekly for readability
    const weekly: { ts: number; ticketRevenue: number; fastpassRevenue: number }[] = [];
    for (let i = 0; i < dailyRevenue.length; i += 7) {
      const chunk = dailyRevenue.slice(i, i + 7);
      const sum = (fn: (d: DailyRevenue) => number) => chunk.reduce((s, d) => s + fn(d), 0);
      weekly.push({
        ts: chunk[Math.floor(chunk.length / 2)].date.getTime(),
        ticketRevenue: Math.round(sum(d => d.ticketRevenue)),
        fastpassRevenue: Math.round(sum(d => d.fastpassRevenue)),
      });
    }
    return weekly;
  }, [dailyRevenue]);

  if (chartData.length === 0) {
    return <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">No data for selected range</div>;
  }

  return (
    <div className="w-full h-[250px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(32, 22%, 88%)" />
          <XAxis
            dataKey="ts"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={formatDateShort}
            tick={{ fontSize: 10, fill: 'hsl(220, 15%, 45%)' }}
            stroke="hsl(32, 22%, 88%)"
          />
          <YAxis
            tickFormatter={v => `€${(v / 1000).toFixed(0)}K`}
            tick={{ fontSize: 10, fill: 'hsl(220, 15%, 45%)' }}
            stroke="hsl(32, 22%, 88%)"
            width={55}
          />
          <Tooltip
            labelFormatter={v => formatDateShort(Number(v))}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                ticketRevenue: 'Ticket Revenue',
                fastpassRevenue: 'FastPASS Revenue',
              };
              return [`€${value.toLocaleString()}`, labels[name] || name];
            }}
            contentStyle={{
              background: 'hsl(0, 0%, 100%)',
              border: '1px solid hsl(32, 22%, 88%)',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          />
          <Area
            type="monotone"
            dataKey="ticketRevenue"
            stackId="1"
            stroke="hsl(210, 60%, 35%)"
            fill="hsl(210, 60%, 35%)"
            fillOpacity={0.4}
          />
          <Area
            type="monotone"
            dataKey="fastpassRevenue"
            stackId="1"
            stroke="hsl(43, 91%, 55%)"
            fill="hsl(43, 91%, 55%)"
            fillOpacity={0.5}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
