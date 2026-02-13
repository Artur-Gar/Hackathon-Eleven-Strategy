import { HourlyData } from "@/lib/DataProcessor";
import { useState } from "react";

interface DetailedChartProps {
  data: HourlyData[];
  currentHourIndex: number;
}

export function DetailedChart({ data, currentHourIndex }: DetailedChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (data.length === 0) return null;

  const maxWait = Math.max(...data.map((d) => d.avgWait), 1);
  const barWidth = 14;
  const gap = 8;
  const chartHeight = 120;
  const dotRadius = 3.5;
  const totalWidth = data.length * (barWidth + gap) - gap;
  const svgW = totalWidth + 30;
  const svgH = chartHeight + 36;

  return (
    <div className="w-full flex flex-col items-center px-2">
      <svg
        width="100%"
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="overflow-visible"
      >
        {/* Dashed current hour line behind bars */}
        {currentHourIndex >= 0 && (
          <line
            x1={15 + currentHourIndex * (barWidth + gap) + barWidth / 2}
            y1={0}
            x2={15 + currentHourIndex * (barWidth + gap) + barWidth / 2}
            y2={chartHeight + 4}
            stroke="hsl(var(--park-bar-current))"
            strokeWidth={1.5}
            strokeDasharray="4,4"
            opacity={0.4}
          />
        )}

        {data.map((d, i) => {
          const x = 15 + i * (barWidth + gap);
          const barH = Math.max(6, (d.avgWait / maxWait) * chartHeight);
          const y = chartHeight - barH;
          const isCurrent = i === currentHourIndex;
          const isHovered = i === hoveredIndex;

          return (
            <g
              key={i}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{ cursor: "pointer" }}
            >
              {/* Shadow */}
              <rect
                x={x + 1}
                y={y + 2}
                width={barWidth}
                height={barH}
                rx={barWidth / 2}
                ry={barWidth / 2}
                fill="rgba(0,0,0,0.08)"
              />
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
                    : isHovered
                    ? "hsl(var(--primary))"
                    : "hsl(var(--park-bar-default))"
                }
                opacity={isCurrent || isHovered ? 1 : 0.7}
                style={{ transition: "opacity 0.15s, fill 0.15s" }}
              />
              {/* Dot */}
              <circle
                cx={x + barWidth / 2}
                cy={chartHeight + 12}
                r={dotRadius}
                fill={
                  isCurrent
                    ? "hsl(var(--park-bar-current))"
                    : "hsl(var(--park-dot))"
                }
              />
              {/* Label */}
              <text
                x={x + barWidth / 2}
                y={chartHeight + 28}
                textAnchor="middle"
                fontSize="9"
                fill="hsl(var(--muted-foreground))"
                fontFamily="Nunito, sans-serif"
                fontWeight="600"
              >
                {d.label}
              </text>

              {/* Tooltip on hover */}
              {isHovered && (
                <>
                  <rect
                    x={x + barWidth / 2 - 16}
                    y={y - 22}
                    width={32}
                    height={18}
                    rx={4}
                    fill="hsl(var(--foreground))"
                  />
                  <text
                    x={x + barWidth / 2}
                    y={y - 10}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="700"
                    fill="hsl(var(--background))"
                    fontFamily="Nunito, sans-serif"
                  >
                    {d.avgWait}m
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
