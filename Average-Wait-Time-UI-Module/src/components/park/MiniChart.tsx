import { HourlyData } from "@/lib/DataProcessor";

interface MiniChartProps {
  data: HourlyData[];
  currentHourIndex: number;
}

export function MiniChart({ data, currentHourIndex }: MiniChartProps) {
  if (data.length === 0) return null;

  const maxWait = Math.max(...data.map((d) => d.avgWait), 1);
  const barWidth = 8;
  const gap = 4;
  const chartHeight = 60;
  const dotRadius = 2.5;
  const totalWidth = data.length * (barWidth + gap) - gap;

  // Show fewer labels on mini chart
  const showLabel = (i: number) => {
    if (data.length <= 6) return true;
    return i % 3 === 0 || i === data.length - 1;
  };

  return (
    <div className="w-full flex flex-col items-center">
      <svg
        width="100%"
        viewBox={`0 0 ${totalWidth + 20} ${chartHeight + 24}`}
        className="overflow-visible"
      >
        {data.map((d, i) => {
          const x = 10 + i * (barWidth + gap);
          const barH = Math.max(4, (d.avgWait / maxWait) * chartHeight);
          const y = chartHeight - barH;
          const isCurrent = i === currentHourIndex;

          return (
            <g key={i}>
              {/* Bar */}
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                rx={barWidth / 2}
                ry={barWidth / 2}
                fill={
                  isCurrent
                    ? "hsl(var(--park-bar-current))"
                    : "hsl(var(--park-bar-default))"
                }
                opacity={isCurrent ? 1 : 0.7}
              />
              {/* Dot */}
              <circle
                cx={x + barWidth / 2}
                cy={chartHeight + 8}
                r={dotRadius}
                fill={
                  isCurrent
                    ? "hsl(var(--park-bar-current))"
                    : "hsl(var(--park-dot))"
                }
              />
              {/* Label */}
              {showLabel(i) && (
                <text
                  x={x + barWidth / 2}
                  y={chartHeight + 20}
                  textAnchor="middle"
                  fontSize="7"
                  fill="hsl(var(--muted-foreground))"
                  fontFamily="Nunito, sans-serif"
                  fontWeight="600"
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Dashed current hour line */}
        {currentHourIndex >= 0 && (
          <line
            x1={10 + currentHourIndex * (barWidth + gap) + barWidth / 2}
            y1={0}
            x2={10 + currentHourIndex * (barWidth + gap) + barWidth / 2}
            y2={chartHeight + 2}
            stroke="hsl(var(--park-bar-current))"
            strokeWidth={1}
            strokeDasharray="3,3"
            opacity={0.5}
          />
        )}
      </svg>
    </div>
  );
}
