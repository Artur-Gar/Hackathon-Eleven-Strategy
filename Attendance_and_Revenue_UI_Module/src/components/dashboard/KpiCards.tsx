/**
 * KpiCards.tsx
 * 
 * WHAT: 4 KPI cards showing revenue metrics scoped to the current selection.
 * WHY: Gives executives instant visibility into revenue impact of pricing decisions.
 */

import { Card, CardContent } from '@/components/ui/card';
import { RevenueResult } from '@/connectors/revenue_calculation_connector';
import { SelectionMode } from '@/connectors/time_range_selection_connector';
import { Euro, Ticket, Zap, TrendingUp } from 'lucide-react';

interface KpiCardsProps {
  revenue: RevenueResult;
  selectionMode: SelectionMode;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `€${(value / 1_000).toFixed(0)}K`;
  return `€${value.toFixed(0)}`;
}

const kpiConfigs = [
  { key: 'totalRevenue' as const, label: 'Total Revenue', icon: Euro, color: 'text-primary' },
  { key: 'ticketRevenue' as const, label: 'Ticket Revenue', icon: Ticket, color: 'text-secondary' },
  { key: 'fastpassRevenue' as const, label: 'FastPASS Revenue', icon: Zap, color: 'text-accent-foreground' },
  { key: 'avgRevenuePerVisitor' as const, label: 'Avg Revenue / Visitor', icon: TrendingUp, color: 'text-primary' },
];

export function KpiCards({ revenue, selectionMode }: KpiCardsProps) {
  const scopeLabel = selectionMode === 'none'
    ? 'Full forecast'
    : selectionMode === 'single_day'
    ? 'Selected day'
    : 'Selected range';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {kpiConfigs.map(({ key, label, icon: Icon, color }) => (
        <Card key={key} className={key === 'totalRevenue' ? 'bg-primary/10 border-primary/30 ring-1 ring-primary/20' : 'bg-card border-border'}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`h-4 w-4 ${color}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className={`${key === 'totalRevenue' ? 'text-2xl' : 'text-xl'} font-bold`} style={{ color: 'hsl(220, 70%, 25%)' }}>
              {key === 'avgRevenuePerVisitor'
                ? `€${revenue[key].toFixed(2)}`
                : formatCurrency(revenue[key])}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">{scopeLabel}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
