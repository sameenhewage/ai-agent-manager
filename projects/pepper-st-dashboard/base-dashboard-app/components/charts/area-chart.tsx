import * as React from "react";

/**
 * Dependency-free area chart (Slice 7C), mirroring the demo prototype's `UI.areaChart`
 * grammar: gradient fill under a smooth line, light gridlines, end dots, sparse x labels.
 * PURE + hook-free (takes an explicit gradient `id`) so it renders in BOTH Server and
 * Client components. It draws whatever real series it is given — it fabricates nothing.
 */

export interface AreaChartProps {
  id: string; // unique gradient id (caller-provided; avoids useId so this stays server-safe)
  values: number[];
  labels: string[]; // same length as values; rendered sparsely on the x-axis
  color?: "accent" | "ai";
  height?: number;
  /** formats the per-point <title> tooltip (e.g. tokens vs conversations) */
  formatPoint?: (value: number, label: string) => string;
}

export function AreaChart({
  id,
  values,
  labels,
  color = "accent",
  height = 200,
  formatPoint,
}: AreaChartProps) {
  const W = 720;
  const H = height;
  const pl = 6;
  const pr = 6;
  const pt = 12;
  const pb = 22;
  const iw = W - pl - pr;
  const ih = H - pt - pb;
  const n = values.length;
  const max = Math.max(1, ...values) * 1.18;

  const X = (i: number) => pl + (iw * i) / (n - 1 || 1);
  const Y = (v: number) => pt + ih - (v / max) * ih;

  const linePts = values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const areaPts = `${pl.toFixed(1)},${(pt + ih).toFixed(1)} ${linePts} ${(pl + iw).toFixed(1)},${(
    pt + ih
  ).toFixed(1)}`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => pt + ih - f * ih);
  const labelEvery = Math.max(1, Math.ceil(n / 8));
  const colorVar = color === "ai" ? "var(--ai)" : "var(--accent)";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="block w-full"
      style={{ height: H + 6, color: colorVar }}
      role="img"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      {grid.map((y, i) => (
        <line
          key={i}
          x1={pl}
          y1={y.toFixed(1)}
          x2={W - pr}
          y2={y.toFixed(1)}
          stroke="var(--line)"
          strokeWidth={1}
        />
      ))}

      <polygon points={areaPts} fill={`url(#${id})`} />
      <polyline
        points={linePts}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {values.map((v, i) => (
        <circle key={i} cx={X(i).toFixed(1)} cy={Y(v).toFixed(1)} r={2.6} fill="currentColor">
          {formatPoint ? <title>{formatPoint(v, labels[i] ?? "")}</title> : null}
        </circle>
      ))}

      {labels.map((l, i) =>
        i % labelEvery === 0 || i === n - 1 ? (
          <text
            key={i}
            x={X(i).toFixed(1)}
            y={H - 6}
            textAnchor="middle"
            fontSize="10"
            fill="var(--faint)"
          >
            {l}
          </text>
        ) : null
      )}
    </svg>
  );
}
