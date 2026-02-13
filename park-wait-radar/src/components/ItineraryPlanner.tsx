import { useState, useMemo, useEffect } from "react";
import { Clock, Check, Route, Footprints } from "lucide-react";
import { ATTRACTIONS, TOTAL_SLOTS, getWaitTime } from "@/data/attractions";
import { getRealWaitTime, hasRealData } from "@/data/waitTimeData";
import { optimizeRoute, RouteStep } from "@/utils/routeOptimizer";
import { format } from "date-fns";

interface ItineraryPlannerProps {
  selectedDate: Date;
  onRouteChange: (steps: RouteStep[]) => void;
}

export function ItineraryPlanner({ selectedDate, onRouteChange }: ItineraryPlannerProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const useReal = hasRealData(dateStr);

  function getAvgWait(attractionId: string): number {
    let total = 0;
    let count = 0;
    for (let s = 0; s < TOTAL_SLOTS; s++) {
      const w = useReal
        ? getRealWaitTime(attractionId, dateStr, s)
        : getWaitTime(attractionId, dateStr, s);
      if (w !== null && w !== undefined) {
        total += w;
        count++;
      }
    }
    return count > 0 ? Math.round(total / count) : 0;
  }

  function toggleAttraction(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const groupedByArea = ATTRACTIONS.reduce(
    (acc, attr) => {
      if (!acc[attr.area]) acc[attr.area] = [];
      acc[attr.area].push(attr);
      return acc;
    },
    {} as Record<string, typeof ATTRACTIONS>
  );

  const sortedAreas = Object.keys(groupedByArea).sort((a, b) => {
    const aIndex = ATTRACTIONS.findIndex((x) => x.area === a);
    const bIndex = ATTRACTIONS.findIndex((x) => x.area === b);
    return aIndex - bIndex;
  });

  const optimizedRoute: RouteStep[] = useMemo(() => {
    if (selectedIds.length < 2) return [];
    const selected = ATTRACTIONS.filter((a) => selectedIds.includes(a.id));
    return optimizeRoute(selected, getAvgWait);
  }, [selectedIds, dateStr]);

  useEffect(() => {
    onRouteChange(optimizedRoute);
  }, [optimizedRoute, onRouteChange]);

  const totalWalkDist = optimizedRoute.reduce((s, r) => s + r.walkingDistance, 0);
  const totalWalkTime = optimizedRoute.reduce((s, r) => s + r.walkingTime, 0);
  const totalWaitTime = optimizedRoute.reduce((s, r) => s + r.waitTime, 0);
  const totalAvgWait = selectedIds.reduce((sum, id) => sum + getAvgWait(id), 0);

  return (
    <div className="rounded-lg bg-card p-3 shadow-sm border border-border">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-4 h-4 text-primary" />
        <span className="text-xs font-heading font-semibold text-muted-foreground uppercase tracking-wider">
          My Itinerary
        </span>
        {selectedIds.length > 0 && (
          <>
            <span className="ml-auto text-xs font-heading font-bold text-primary">
              {selectedIds.length} ride{selectedIds.length > 1 ? "s" : ""} · ~{totalAvgWait} min total avg wait
            </span>
            <button
              onClick={() => setSelectedIds([])}
              className="ml-2 px-2 py-1 text-xs font-heading font-semibold rounded hover:bg-muted transition-colors text-muted-foreground"
            >
              Clear
            </button>
          </>
        )}
      </div>

      <div className="flex gap-3">
        {/* Attraction list grouped by area */}
        <div className="max-h-64 overflow-y-auto space-y-2 flex-1 min-w-0">
          {sortedAreas.map((area) => (
            <div key={area}>
              <div
                className="px-3 py-1.5 rounded-md text-xs font-heading font-semibold uppercase tracking-wider mb-1"
                style={{
                  backgroundColor: groupedByArea[area][0].areaColor + "20",
                  color: groupedByArea[area][0].areaColor,
                }}
              >
                {area}
              </div>
              <div className="space-y-0.5 pl-2">
                {groupedByArea[area].map((attr) => {
                  const isSelected = selectedIds.includes(attr.id);
                  const avg = getAvgWait(attr.id);
                  return (
                    <button
                      key={attr.id}
                      onClick={() => toggleAttraction(attr.id)}
                      className={`w-full flex items-center justify-between rounded-md px-3 py-2 text-sm font-body transition-colors text-left ${
                        isSelected
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                            isSelected
                              ? "bg-primary border-primary"
                              : "border-muted-foreground/40"
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <span className="font-medium">{attr.name}</span>
                      </div>
                      <span className="text-xs font-heading font-semibold text-muted-foreground min-w-[45px] text-right">
                        ~{avg} min
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Optimized Route - side panel */}
        {optimizedRoute.length >= 2 && (
          <div className="flex-1 min-w-0 border-l border-border pl-3 max-h-64 overflow-y-auto">
            <div className="flex items-center gap-2 mb-2">
              <Route className="w-4 h-4 text-primary" />
              <span className="text-xs font-heading font-semibold text-muted-foreground uppercase tracking-wider">
                Optimal Route
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 px-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Footprints className="w-3 h-3" />
                <span className="font-heading font-semibold">
                  {totalWalkDist >= 1000
                    ? `${(totalWalkDist / 1000).toFixed(1)} km`
                    : `${totalWalkDist} m`}
                </span>
                <span>walk</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span className="font-heading font-semibold">~{totalWalkTime} min</span>
                <span>walking</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3 text-primary" />
                <span className="font-heading font-semibold text-primary">~{totalWaitTime + totalWalkTime} min</span>
                <span>total</span>
              </div>
            </div>

            <div className="space-y-0 pl-2">
              {optimizedRoute.map((step, i) => {
                const attr = ATTRACTIONS.find((a) => a.id === step.attractionId)!;
                return (
                  <div key={step.attractionId}>
                    {i > 0 && (
                      <div className="flex items-center gap-2 pl-4 py-0.5">
                        <div className="w-px h-4 bg-border ml-[7px]" />
                        <span className="text-[10px] text-muted-foreground font-body">
                          ↓ {step.walkingDistance} m · ~{step.walkingTime} min walk
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/30">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-heading font-bold text-white shrink-0"
                        style={{ backgroundColor: attr.areaColor }}
                      >
                        {i + 1}
                      </div>
                      <span className="text-sm font-body font-medium flex-1">{attr.name}</span>
                      <span className="text-xs font-heading font-semibold text-muted-foreground">
                        ~{step.waitTime} min wait
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
