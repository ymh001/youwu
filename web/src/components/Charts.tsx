import { useId } from "react";

export function Sparkline({
  points,
  width = 320,
  height = 120,
  stroke = "#007aff",
  fill = true,
  zeroBaseline = false,
}: {
  points: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: boolean;
  zeroBaseline?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  if (points.length === 0) return <div className="chart-empty">暂无数据</div>;
  const data = points.length === 1 ? [points[0], points[0]] : points;
  const min = zeroBaseline ? Math.min(0, ...data) : Math.min(...data);
  const max = zeroBaseline ? Math.max(0, ...data) : Math.max(...data);
  const span = max - min;
  const stepX = width / (data.length - 1);
  const coords = data.map((p, i) => {
    const x = i * stepX;
    const y =
      span === 0
        ? height / 2
        : height - 10 - ((p - min) / span) * (height - 24);
    return [x, y] as const;
  });
  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="sparkline"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0.15, 0.5, 0.85].map((y) => (
        <line
          key={y}
          x1="0"
          x2={width}
          y1={y * height}
          y2={y * height}
          className="chart-grid-line"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {fill && <path d={area} fill={`url(#g${id})`} />}
      <path
        pathLength="1"
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.8"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Donut({
  segments,
  size = 132,
  thickness = 16,
}: {
  segments: Array<{ value: number; color: string }>;
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--line)"
        strokeWidth={thickness}
      />
      {segments.map((seg, i) => {
        const len = (seg.value / total) * c;
        const dash = `${Math.max(0, len - 2)} ${c - Math.max(0, len - 2)}`;
        const el = (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={thickness}
            strokeDasharray={dash}
            strokeDashoffset={-offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
        offset += len;
        return el;
      })}
    </svg>
  );
}

export function Bars({
  data,
  height = 120,
}: {
  data: Array<{ label: string; value: number }>;
  height?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="bars" style={{ height }}>
      {data.map((d, i) => (
        <div className="bar-col" key={i}>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}
            />
          </div>
          <span className="bar-label">{d.label.slice(-2)}</span>
        </div>
      ))}
    </div>
  );
}
