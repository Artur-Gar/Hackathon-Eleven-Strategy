import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  available: boolean;
}

export function StatusBadge({ available }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full",
        available
          ? "bg-park-status-ok/15 text-park-status-ok"
          : "bg-destructive/15 text-destructive"
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          available ? "bg-park-status-ok" : "bg-destructive"
        )}
      />
      {available ? "Operating" : "Unavailable"}
    </span>
  );
}
