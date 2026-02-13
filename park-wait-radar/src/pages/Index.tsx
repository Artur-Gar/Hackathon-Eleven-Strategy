import { useState } from "react";
import { DateSelector } from "@/components/DateSelector";
import { TimeSlider } from "@/components/TimeSlider";
import { ParkMap } from "@/components/ParkMap";
import { WaitLegend } from "@/components/WaitLegend";
import { ItineraryPlanner } from "@/components/ItineraryPlanner";
import { slotToTime } from "@/data/attractions";
import { RouteStep } from "@/utils/routeOptimizer";
import { format } from "date-fns";

const Index = () => {
  const [selectedDate, setSelectedDate] = useState(new Date("2022-07-26T12:00:00"));
  const [slotIndex, setSlotIndex] = useState(8); // default 12:00
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header
        className="px-6 py-3 flex items-center"
        style={{
          background: "linear-gradient(135deg, hsl(215 55% 25%), hsl(210 60% 35%))",
        }}
      >
        <div>
          <h1 className="text-lg font-heading font-bold text-white tracking-tight">Welcome to PortAventura World 🎢</h1>
          <p className="text-[11px] text-white/60 font-body">
            Live waiting times · {format(selectedDate, "EEEE, MMMM d")} · {slotToTime(slotIndex)}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <a
            href="https://portaventa-simu-visor.lovable.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs font-medium text-white bg-white/15 hover:bg-white/25 rounded-md transition-colors"
          >
            Revenue
          </a>
          <a
            href="https://parkpal-wait-watcher.lovable.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs font-medium text-white bg-white/15 hover:bg-white/25 rounded-md transition-colors"
          >
            Average Wait Times
          </a>
        </div>
      </header>

      {/* Controls */}
      <div className="px-4 py-2 space-y-2 bg-background">
        <DateSelector selectedDate={selectedDate} onDateChange={setSelectedDate} />
        <TimeSlider slotIndex={slotIndex} onSlotChange={setSlotIndex} />
      </div>

      {/* Map */}
      <div className="flex-1 relative mx-4 mb-2">
        <ParkMap selectedDate={selectedDate} slotIndex={slotIndex} routeSteps={routeSteps} />
        <WaitLegend />
      </div>

      {/* Itinerary Planner */}
      <div className="px-4 pb-4">
        <ItineraryPlanner selectedDate={selectedDate} onRouteChange={setRouteSteps} />
      </div>
    </div>
  );
};

export default Index;
