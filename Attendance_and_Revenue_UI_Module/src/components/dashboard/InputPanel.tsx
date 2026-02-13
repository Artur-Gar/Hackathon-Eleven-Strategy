/**
 * InputPanel.tsx
 * 
 * WHAT: Top-of-page control panel for pricing inputs and forecast horizon.
 * WHY: Provides the interactive levers for revenue simulation.
 */

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ForecastHorizon } from '@/connectors/forecast_model_connector';

interface InputPanelProps {
  ticketPrice: number;
  setTicketPrice: (v: number) => void;
  fastpassPrice: number;
  setFastpassPrice: (v: number) => void;
  fastpassUptake: number;
  setFastpassUptake: (v: number) => void;
  horizon: ForecastHorizon;
  setHorizon: (h: ForecastHorizon) => void;
}

const horizonOptions: { value: ForecastHorizon; label: string }[] = [
  { value: '1m', label: '1 Month' },
  { value: '5m', label: '5 Months' },
  { value: '1y', label: '1 Year' },
];

export function InputPanel({
  ticketPrice, setTicketPrice,
  fastpassPrice, setFastpassPrice,
  fastpassUptake, setFastpassUptake,
  horizon, setHorizon,
}: InputPanelProps) {
  return (
    <div className="flex flex-wrap items-end gap-6">
      {/* Ticket Price */}
      <div className="space-y-1.5">
        <Label htmlFor="ticket-price" className="text-xs font-medium text-muted-foreground">
          Ticket Price (€)
        </Label>
        <Input
          id="ticket-price"
          type="number"
          min={0}
          step={1}
          value={ticketPrice}
          onChange={e => setTicketPrice(Math.max(0, Number(e.target.value)))}
          className="w-28 h-9 text-sm"
        />
      </div>

      {/* FastPASS Price */}
      <div className="space-y-1.5">
        <Label htmlFor="fastpass-price" className="text-xs font-medium text-muted-foreground">
          FastPASS Price (€)
        </Label>
        <Input
          id="fastpass-price"
          type="number"
          min={0}
          step={1}
          value={fastpassPrice}
          onChange={e => setFastpassPrice(Math.max(0, Number(e.target.value)))}
          className="w-28 h-9 text-sm"
        />
      </div>

      {/* FastPASS Uptake Slider */}
      <div className="space-y-1.5 min-w-[180px]">
        <Label className="text-xs font-medium text-muted-foreground">
          FastPASS Uptake: {Math.round(fastpassUptake * 100)}%
        </Label>
        <Slider
          value={[fastpassUptake * 100]}
          onValueChange={([v]) => setFastpassUptake(v / 100)}
          min={0}
          max={100}
          step={1}
          className="mt-2"
        />
      </div>

      {/* Spacer to push horizon toggle right */}
      <div className="flex-1" />

      {/* Forecast Horizon Toggle */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Forecast Horizon</Label>
        <div className="flex gap-1">
          {horizonOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setHorizon(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                horizon === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
