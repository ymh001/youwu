import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RangeKey } from '../utils/stats';
import type { TrendCash, TrendHoldings, TrendGoals } from '../utils/trendBundle';
import './TrendViews.css';

type CashProps = {data:TrendCash;range:RangeKey;money:(value:number)=>string};
function usePlotSize() {
  const ref=useRef<HTMLDivElement>(null);const [width,setWidth]=useState(600);const [height,setHeight]=useState(220);
  useEffect(()=>{const ob=new ResizeObserver(([e])=>{setWidth(Math.max(1,e.contentRect.width));setHeight(Math.max(1,e.contentRect.height));});if(ref.current)ob.observe(ref.current);return()=>ob.disconnect();},[]);
  return {ref,width,height};
}
const shortDate=(s:string)=>s.replace(/-/g,'/');
const k=(n:number)=>`${Number((n/1000).toFixed(3))}k`;
function niceMax(value:number){const rough=Math.max(1,value)/4;const power=10**Math.floor(Math.log10(rough));return ([1,2,5,10].find(n=>n*power>=rough)||10)*power*4;}
export function CashFlowView({data,range,money}:CashProps) {
  const [selected,setSelected]=useState<string|null>(null);const {ref,width,height}=usePlotSize();
  useEffect(()=>setSelected(null),[range]);
  const amounts=data.months.flatMap(m=>[m.purchase,m.sale]);
  const max=niceMax(Math.max(0,...amounts));
  const low=Math.min(0,...amounts),min=low<0?-niceMax(-low):0;
  const active=data.months.find(m=>m.label===selected);
  const left=48,right=12,top=12,bottom=30;
  const plot=Math.max(1,width-left-right),step=plot/Math.max(1,data.months.length);
  const y=(n:number)=>top+(height-top-bottom)*(max-n)/(max-min);
  const labelCount=Math.min(data.months.length,width<500?3:7);
  const labelIndices=new Set(Array.from({length:labelCount},(_,i)=>Math.round(i*(data.months.length-1)/Math.max(1,labelCount-1))));
  return <section className="card trend-primary trend-view">
    <div className="card-title"><span>投入与回收</span><span className="muted small">月度</span></div>
    <div className="trend-totals"><div><span>购入</span><strong>{money(data.purchase)}</strong></div><div><span>回收</span><strong>{money(data.sale)}</strong></div><div><span>净支出</span><strong>{money(data.net)}</strong></div></div>
    <div className="trend-key"><span><i style={{background:'var(--accent)'}}/>购入</span><span><i style={{background:'#62a894'}}/>回收</span><span className="muted">金额 · k</span></div>
    <div ref={ref} className="trend-plot">
      {!data.months.length?<div className="trend-empty">这个时段还没有购入或卖出记录</div>:<svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="月度购入与卖出回收金额，纵轴以k为单位">
        {[0,1,2,3,4].map(i=><g key={i}><line x1={left} x2={width-right} y1={y(min+(max-min)*i/4)} y2={y(min+(max-min)*i/4)} stroke="var(--line)"/><text x={left-8} y={y(min+(max-min)*i/4)} dy=".35em" textAnchor="end">{k(min+(max-min)*i/4)}</text></g>)}
        {data.months.map((m,i)=>{const center=left+step*(i+.5),bar=Math.max(1,Math.min(18,step*.3));return <g key={m.label}>
          <rect x={center-bar-1} y={y(Math.max(0,m.purchase))} width={bar} height={Math.abs(y(0)-y(m.purchase))} rx={Math.min(3,bar/2)} fill="var(--accent)" opacity={selected&&selected!==m.label?0.5:1}/>
          <rect x={center+1} y={y(Math.max(0,m.sale))} width={bar} height={Math.abs(y(0)-y(m.sale))} rx={Math.min(3,bar/2)} fill="#62a894"/>
          {labelIndices.has(i)&&<text x={center} y={height-8} textAnchor="middle">{m.label.slice(2).replace('-','/')}</text>}
          <rect className="trend-chart-hit" x={left+i*step} y={top} width={step} height={height-top-bottom} fill="transparent" tabIndex={0} role="button" aria-label={`${m.label}，购入${money(m.purchase)}，回收${money(m.sale)}`} onClick={()=>setSelected(selected===m.label?null:m.label)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(selected===m.label?null:m.label);}}}><title>{m.label} · 购入 {money(m.purchase)} · 回收 {money(m.sale)}</title></rect>
        </g>;})}
      </svg>}
    </div>
    {!!data.months.length&&<div className="trend-month-select"><label>查看月份<select aria-label="查看月份记录" value={selected||''} onChange={e=>setSelected(e.target.value||null)}><option value="">选择月份</option>{data.months.map(m=><option key={m.label} value={m.label}>{m.label}</option>)}</select></label></div>}
    {active&&<div className="trend-month-detail"><div className="trend-detail-heading"><strong>{shortDate(active.label)}</strong><button type="button" className="link" onClick={()=>setSelected(null)}>收起</button></div>{!active.events.length&&<p className="trend-data-note">这个月没有购入或卖出记录</p>}{active.events.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(e=><Link key={`${e.asset.id}-${e.kind}`} to={`/asset/${e.asset.id}`} className="trend-event"><span>{e.asset.name}<small>{e.date} · {e.kind==='purchase'?'购入':'卖出'}</small></span><strong>{money(e.amount)}</strong></Link>)}</div>}
    <p className="trend-data-note">按购入价与卖出价统计，不含“不计入总价”的物品。{data.sparseMonths?'跨度较长，仅展示有记录月份。':''}</p>
    {!!data.missingDates&&<p className="trend-data-note">{data.missingDates} 条记录缺少有效日期，未计入。</p>}
  </section>;
}
export function HoldingsView({data}:{data:TrendHoldings}) {
  const {points,missingDates}=data;const {ref,width,height}=usePlotSize();
  const last=points[points.length-1];const [active,setActive]=useState<number|null>(null);useEffect(()=>setActive(null),[points]);
  const left=34,right=12,top=12,bottom=30,plot=Math.max(1,width-left-right);
  const max=Math.max(1,...points.map(p=>p.owned));const ceiling=Math.max(1,Math.ceil(max/4)*4);
  const ts=(s:string)=>Date.parse(`${s}T00:00:00Z`);const first=points.length?ts(points[0].date):0,lastTime=points.length?ts(points[points.length-1].date):0;
  const x=(i:number)=>left+(lastTime===first?plot/2:(ts(points[i].date)-first)/(lastTime-first)*plot);
  const y=(n:number)=>top+(height-top-bottom)*(1-n/ceiling);
  const path=(field:'owned'|'serving')=>points.map((p,i)=>i?`H${x(i)}V${y(p[field])}`:`M${x(i)},${y(p[field])}`).join(' ');
  const current=active===null?last:points[active];
  return <section className="card trend-view"><div className="card-title"><span>持有数量变化</span><span className="muted small">件</span></div>
    <div className="trend-key"><span><i style={{background:'var(--accent)'}}/>仍持有 <b>{current?.owned??0}</b></span><span><i style={{background:'#62a894'}}/>服役中 <b>{current?.serving??0}</b></span><span className="muted">{current?.date}</span></div>
    <div ref={ref} className="trend-plot">{!points.length?<div className="trend-empty">还没有可展示的持有记录</div>:<svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="持有数量变化，退役仍算持有，卖出后不再持有">
      {[0,1,2,3,4].map(i=><g key={i}><line x1={left} x2={width-right} y1={y(ceiling*i/4)} y2={y(ceiling*i/4)} stroke="var(--line)"/><text x={left-8} y={y(ceiling*i/4)} dy=".35em" textAnchor="end">{ceiling*i/4}</text></g>)}
      <path d={path('owned')} fill="none" stroke="var(--accent)" strokeWidth="2"/><path d={path('serving')} fill="none" stroke="#62a894" strokeWidth="2" strokeDasharray="5 3"/>
      {points.length===1&&<circle cx={x(0)} cy={y(points[0].owned)} r="3" fill="var(--accent)"/>}
      <text x={left} y={height-7}>{shortDate(points[0].date)}</text>{points.length>1&&<text x={width-right} y={height-7} textAnchor="end">{shortDate(points[points.length-1].date)}</text>}
      <rect x={left} y={top} width={plot} height={height-top-bottom} fill="transparent" tabIndex={0} role="slider" aria-label="查看持有数量" aria-valuemin={0} aria-valuemax={points.length-1} aria-valuenow={active??points.length-1} aria-valuetext={`${current?.date}，持有${current?.owned}件，服役中${current?.serving}件`} onPointerMove={e=>{const rect=e.currentTarget.ownerSVGElement!.getBoundingClientRect();const time=first+Math.max(0,Math.min(1,(e.clientX-rect.left-left)/plot))*(lastTime-first);let index=0;points.forEach((p,i)=>{if(ts(p.date)<=time)index=i});setActive(index);}} onPointerLeave={()=>setActive(null)} onFocus={()=>setActive(points.length-1)} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setActive(i=>Math.max(0,Math.min(points.length-1,(i??points.length-1)+(e.key==='ArrowRight'?1:-1))));}}}/>
    </svg>}</div>
    <p className="trend-data-note">退役仍计入持有，卖出后移出。{missingDates>0?` ${missingDates} 件缺少有效起止日期，未计入。`:''}</p>
  </section>;
}
export function GoalsView({data}:{data:TrendGoals}) {
  const {items:goals,achieved,near,ongoing,stopped}=data;
  return <section className="card trend-view"><div className="card-title"><span>目标达成概览</span><span className="muted small">当前全部目标</span></div>
    {!goals.length?<div className="trend-empty">为物品设定一个目标，在这里看见进度</div>:<><div className="trend-goal-counts"><span><b>{achieved}</b>已达成</span><span><b>{near}</b>接近目标</span><span><b>{ongoing}</b>进行中</span>{stopped>0&&<span><b>{stopped}</b>已停止</span>}</div><div className="trend-goal-list">{goals.map(({asset,progress})=><Link className="trend-goal" key={asset.id} to={`/asset/${asset.id}`}><div><strong>{asset.name}</strong><span>{Math.round(progress.percent)}%</span></div><div className="trend-progress" role="progressbar" aria-label={asset.name} aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${progress.percent}%`}}/></div><small>{progress.title} · {progress.detail}</small></Link>)}</div></>}
  </section>;
}
