import { format, addDays } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateSelectorProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

export function DateSelector({ selectedDate, onDateChange }: DateSelectorProps) {
  const today = new Date("2022-07-26T12:00:00");
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  const minDate = new Date("2022-07-19T00:00:00");
  const maxDate = new Date("2022-07-26T23:59:59");

  const isSelected = (d: Date) =>
    format(d, "yyyy-MM-dd") === format(selectedDate, "yyyy-MM-dd");

  return (
    <div className="relative">
      <div className="flex items-center gap-1 rounded-lg bg-card p-1.5 shadow-sm border border-border overflow-x-auto">
        {days.map((day, i) => (
          <button
            key={i}
            onClick={() => onDateChange(day)}
            className={`flex flex-col items-center px-3 py-2 rounded-md text-sm font-heading transition-colors min-w-[72px] ${
              isSelected(day)
                ? "bg-primary text-primary-foreground shadow-md"
                : "hover:bg-muted text-foreground"
            }`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
              {i === 0 ? "Today" : format(day, "EEE")}
            </span>
            <span className="text-base font-bold">{format(day, "d")}</span>
            <span className="text-[10px] opacity-60">{format(day, "MMM")}</span>
          </button>
        ))}

        <div className="ml-auto pl-2 border-l border-border">
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="p-2.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
                title="View past dates"
              >
                <CalendarIcon className="w-5 h-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) onDateChange(new Date(format(date, "yyyy-MM-dd") + "T12:00:00"));
                }}
                disabled={(date) => date < minDate || date > maxDate}
                defaultMonth={maxDate}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
