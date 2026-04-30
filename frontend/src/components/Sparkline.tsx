import React, { useMemo } from "react";

interface Props {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  baselineColor?: string | null;
}

/**
 * Tiny inline-SVG sparkline. Pure rendering, no chart library needed,
 * so it stays cheap when rendered in dozens of table rows.
 */
export const Sparkline: React.FC<Props> = ({
  values,
  width = 96,
  height = 28,
  stroke,
  fill,
  strokeWidth = 1.4,
  baselineColor = "rgba(148, 163, 184, 0.45)",
}) => {
  const { path, area, baselineY, color, areaColor } = useMemo(() => {
    if (values.length < 2) {
      return {
        path: "",
        area: "",
        baselineY: height / 2,
        color: stroke ?? "#94a3b8",
        areaColor: fill ?? "rgba(148, 163, 184, 0.18)",
      };
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const stepX = width / (values.length - 1);

    const points = values.map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return [x, y] as const;
    });

    const isUp = values[values.length - 1] >= values[0];
    const color = stroke ?? (isUp ? "#059669" : "#dc2626");
    const areaColor = fill ?? (isUp ? "rgba(5, 150, 105, 0.16)" : "rgba(220, 38, 38, 0.14)");

    const pathStr = points
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" ");
    const areaStr = `${pathStr} L${width.toFixed(1)},${height.toFixed(1)} L0,${height.toFixed(1)} Z`;

    const base = values[0];
    const baseY = height - ((base - min) / range) * (height - 4) - 2;

    return { path: pathStr, area: areaStr, baselineY: baseY, color, areaColor };
  }, [values, width, height, stroke, fill]);

  if (values.length < 2) {
    return (
      <span className="qp-sparkline">
        <svg width={width} height={height}>
          <line
            x1={0}
            x2={width}
            y1={height / 2}
            y2={height / 2}
            stroke="#cbd5e1"
            strokeDasharray="3 3"
          />
        </svg>
      </span>
    );
  }

  return (
    <span className="qp-sparkline" aria-hidden>
      <svg width={width} height={height}>
        <path d={area} fill={areaColor} stroke="none" />
        <path d={path} fill="none" stroke={color} strokeWidth={strokeWidth} />
        {baselineColor && (
          <line
            x1={0}
            x2={width}
            y1={baselineY}
            y2={baselineY}
            stroke={baselineColor}
            strokeDasharray="3 3"
            strokeWidth={1}
          />
        )}
      </svg>
    </span>
  );
};
