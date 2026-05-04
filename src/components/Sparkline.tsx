interface Point { day: string; km: number }

export default function Sparkline({ data, width = 360, height = 80 }: { data: Point[]; width?: number; height?: number }) {
  if (data.length === 0) return null;
  const pad = { top: 8, right: 8, bottom: 18, left: 8 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const max = Math.max(1, ...data.map((d) => d.km));
  const step = w / Math.max(1, data.length - 1);

  const points = data.map((d, i) => {
    const x = pad.left + i * step;
    const y = pad.top + h - (d.km / max) * h;
    return [x, y, d.km, d.day] as const;
  });
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${path} L${points[points.length - 1][0].toFixed(1)},${pad.top + h} L${points[0][0].toFixed(1)},${pad.top + h} Z`;

  const todayIdx = data.length - 1;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F8CB46" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#F8CB46" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkfill)" />
      <path d={path} fill="none" stroke="#F8CB46" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map(([x, y, km, day], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={i === todayIdx ? 3.5 : 2} fill="#F8CB46" stroke="#fff" strokeWidth="1.5" />
          <text x={x} y={height - 4} fontSize="10" fill="#8A8A8A" textAnchor="middle">{day}</text>
          {i === todayIdx && (
            <text x={x} y={y - 6} fontSize="10" fill="#1A1A1A" textAnchor="middle" fontWeight="600">
              {km.toFixed(0)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
