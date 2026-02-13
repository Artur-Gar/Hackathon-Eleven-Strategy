/**
 * Index.tsx — Forecast Dashboard (Single Page)
 * 
 * WHAT: Executive-facing attendance forecasting & revenue simulation dashboard.
 * WHY: Enables pricing and demand sensitivity analysis for PortAventura World.
 * HOW: Composes all connector outputs through the useDashboardState hook.
 */

import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboardState } from '@/hooks/useDashboardState';
import { InputPanel } from '@/components/dashboard/InputPanel';
import { AttendanceChart } from '@/components/dashboard/AttendanceChart';
import { KpiCards } from '@/components/dashboard/KpiCards';
import { RevenueChart } from '@/components/dashboard/RevenueChart';

/** Configurable navigation route — change this to your home page route when ready */
const HOME_ROUTE = 'https://park-wait-radar.lovable.app';
const Index = () => {
  const state = useDashboardState();
  return <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 bg-[#24598f]">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl text-destructive-foreground font-extrabold">
              PortAventura World
            </h1>
            <p className="text-xs text-destructive-foreground">
              Attendance Forecast & Revenue Simulator
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.location.href = HOME_ROUTE} className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Input Panel */}
        <InputPanel ticketPrice={state.ticketPrice} setTicketPrice={state.setTicketPrice} fastpassPrice={state.fastpassPrice} setFastpassPrice={state.setFastpassPrice} fastpassUptake={state.fastpassUptake} setFastpassUptake={state.setFastpassUptake} horizon={state.horizon} setHorizon={state.setHorizon} />

        {/* Attendance Forecast Chart */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-foreground">
              Attendance Forecast
            </CardTitle>
            <p className="text-[10px] text-muted-foreground">
              Click on the forecast region to select a day or range for revenue analysis
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <AttendanceChart historicalData={state.historicalData} forecasts={state.forecasts} selection={state.selection} onChartClick={state.onChartClick} />
          </CardContent>
        </Card>

        {/* KPI Cards */}
        <KpiCards revenue={state.revenue} selectionMode={state.selection.selection_mode} />

        {/* Revenue Breakdown */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-foreground">
              Revenue Breakdown
            </CardTitle>
            <p className="text-[10px] text-muted-foreground">
              Ticket vs FastPASS revenue · {state.selection.selection_mode === 'none' ? 'Full forecast horizon' : 'Selected range'}
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <RevenueChart dailyRevenue={state.dailyRevenue} />
          </CardContent>
        </Card>
      </main>
    </div>;
};
export default Index;