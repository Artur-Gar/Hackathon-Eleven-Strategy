import { slotToTime, TOTAL_SLOTS, SLOT_MINUTES, PARK_OPEN } from "@/data/attractions";

interface TimeSliderProps {
  slotIndex: number;
  onSlotChange: (slot: number) => void;
}

export function TimeSlider({ slotIndex, onSlotChange }: TimeSliderProps) {
  // Generate tick marks every hour (every 4 slots for 15-min intervals)
  const ticks = Array.from({ length: TOTAL_SLOTS }, (_, i) => i);

  return (
    <div className="rounded-lg bg-card p-3 shadow-sm border border-border">
      <div className="flex items-center gap-4 mb-1">
        <span className="text-xs font-heading font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
          Time
        </span>
        <span className="text-lg font-heading font-bold text-primary min-w-[56px]">
          {slotToTime(slotIndex)}
        </span>
        <input
          type="range"
          min={0}
          max={TOTAL_SLOTS - 1}
          value={slotIndex}
          onChange={(e) => onSlotChange(Number(e.target.value))}
          className="flex-1 h-2 rounded-full appearance-none cursor-pointer accent-primary bg-muted"
          style={{
            background: `linear-gradient(to right, hsl(25 85% 50%) 0%, hsl(25 85% 50%) ${(slotIndex / (TOTAL_SLOTS - 1)) * 100}%, hsl(35 20% 88%) ${(slotIndex / (TOTAL_SLOTS - 1)) * 100}%, hsl(35 20% 88%) 100%)`,
          }}
        />
      </div>
      {/* Time markers */}
      <div className="flex justify-between ml-[calc(56px+2.5rem)] mr-0">
        {ticks.map((i) => {
          const isHour = (i * SLOT_MINUTES) % 60 === 0;
          return (
            <button
              key={i}
              onClick={() => onSlotChange(i)}
              className="flex flex-col items-center cursor-pointer hover:opacity-100 transition-opacity"
              style={{ minWidth: 0, flex: "1 1 0" }}
            >
              <div
                className={`w-px ${isHour ? "h-2.5 bg-foreground/50" : "h-1.5 bg-foreground/25"}`}
              />
              {isHour && (
                <span className="text-[9px] text-muted-foreground font-body font-medium mt-0.5">
                  {slotToTime(i)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
