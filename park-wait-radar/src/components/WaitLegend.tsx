export function WaitLegend() {
  const items = [
    { color: "bg-wait-low", label: "0–10 min", desc: "Short wait" },
    { color: "bg-wait-medium", label: "10–20 min", desc: "Moderate" },
    { color: "bg-wait-high", label: "20–30 min", desc: "Long wait" },
    { color: "bg-wait-extreme", label: "40+ min", desc: "Very long" },
  ];

  return (
    <div className="absolute bottom-6 left-6 z-[1000] bg-card/95 backdrop-blur-sm rounded-lg shadow-lg border border-border p-3">
      <h4 className="text-xs font-heading font-bold text-foreground uppercase tracking-wider mb-2">
        Waiting Times
      </h4>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div className={`w-4 h-3 rounded-sm ${item.color}`} />
            <span className="text-xs font-body text-foreground font-medium">{item.label}</span>
            <span className="text-[10px] text-muted-foreground">({item.desc})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
