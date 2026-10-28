import { useEffect, useId, useRef, useState } from 'react';

import { useStore } from '../store';

type Point = { label: string; value: number };
export default function DailyChart({ points }: { points: Point[] }) {
  const { money } = useStore();
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);
  const [active, setActive] = useState<number | null>(null);
  const id = useId().replace(/:/g, '');
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, entry.contentRect.width)));
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setActive(null), [points]);
  const height = width < 600 ? 240 : 280;
  const left = width < 600 ? 48 : 60, right = 12, top = 18, bottom = 32;
  const plotWidth = Math.max(1, width - left - right), plotHeight = height - top - bottom;
  const low = Math.min(0, ...points.map(p => p.value));
  const high = Math.max(0, ...points.map(p => p.value));
  const roughStep = (high - low || 1) / 4;
  const power = 10 ** Math.floor(Math.log10(roughStep));
  const step = ([1, 2, 5, 10].find(n => n * power >= roughStep) || 10) * power;
  const min = Math.floor(low / step) * step, max = Math.max(min + step, Math.ceil(high / step) * step);
  const x = (i: number) => left + (points.length <= 1 ? plotWidth / 2 : i / (points.length - 1) * plotWidth);
  const y = (v: number) => top + (max - v) / (max - min) * plotHeight;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
  const ticks = Array.from({length: Math.round((max - min) / step) + 1}, (_, i) => min + i * step);
  const dates = [...new Set(Array.from({length: Math.min(points.length, width < 600 ? 3 : 5)}, (_, i) => Math.round(i * (points.length - 1) / Math.max(1, Math.min(points.length, width < 600 ? 3 : 5) - 1))))];
  const selected = active === null ? null : points[active];
  const fullYear = points[0]?.label.slice(0, 4) !== points[points.length - 1]?.label.slice(0, 4);
  return <div className="value-chart" ref={container}>
    {!points.length ? <div className="chart-empty">暂无日均数据</div> : <>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="日均价值变化，横轴日期，纵轴元每天">
        <defs><clipPath id={`clip${id}`}><rect x={left - 2} y={top - 2} width={plotWidth + 4} height={plotHeight + 4}/></clipPath></defs>
        {ticks.map(v => <g key={v}>
          <line x1={left} x2={width - right} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1"/>
          <text x={left - 10} y={y(v)} dy=".35em" textAnchor="end">{v.toLocaleString('zh-CN', {maximumFractionDigits: step < 1 ? 2 : 0})}</text>
        </g>)}
        {dates.map(i => <text key={i} x={x(i)} y={height - 7} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>{fullYear ? points[i].label.slice(0, 7).replace('-', '/') : points[i].label.slice(5).replace('-', '/')}</text>)}
        <path d={path} clipPath={`url(#clip${id})`} fill="none" stroke="var(--accent, #007aff)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"/>
        {points.length === 1 && <circle cx={x(0)} cy={y(points[0].value)} r="3" fill="#007aff"/>}
        {selected && active !== null && <g><line x1={x(active)} x2={x(active)} y1={top} y2={height-bottom} stroke="var(--muted)" strokeDasharray="3 4" opacity=".45"/><circle cx={x(active)} cy={y(selected.value)} r="4" fill="#007aff" stroke="var(--card)" strokeWidth="2"/></g>}
        <rect x={left} y={top} width={plotWidth} height={plotHeight} fill="transparent" tabIndex={0} role="slider" aria-label="查看每日数值" aria-valuemin={0} aria-valuemax={points.length - 1} aria-valuenow={active ?? points.length - 1} aria-valuetext={`${(selected ?? points[points.length-1]).label}，${(selected ?? points[points.length-1]).value} 元每天`}
          onPointerMove={e => {const r=e.currentTarget.ownerSVGElement!.getBoundingClientRect();setActive(Math.max(0,Math.min(points.length-1,Math.round((e.clientX-r.left-left)/plotWidth*(points.length-1)))));}}
          onPointerLeave={() => setActive(null)} onFocus={() => setActive(points.length-1)} onBlur={() => setActive(null)}
          onKeyDown={e => {if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setActive(i=>Math.max(0,Math.min(points.length-1,(i??points.length-1)+(e.key==='ArrowRight'?1:-1))));}}}/>
      </svg>
      {selected && active !== null && <div className="value-chart-tooltip" style={{left:Math.max(0,Math.min(width-160,x(active)-80))}}><span>{selected.label}</span><strong>{money(selected.value)}<small> / 天</small></strong></div>}
    </>}
  </div>;
}
