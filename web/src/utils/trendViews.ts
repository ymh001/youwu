import type { Asset } from '../types';
import type { RangeKey } from './stats';

export type CashEvent = { asset: Asset; date: string; amount: number; kind: 'purchase' | 'sale' };
export type CashMonth = { label: string; purchase: number; sale: number; events: CashEvent[] };
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function calendarDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const s=value.slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d=new Date(`${s}T12:00:00`);
  return Number.isFinite(d.getTime()) && key(d)===s ? s : null;
}
export function trendPeriod(range: RangeKey, now=new Date()) {
  const end=key(now);
  if(range==='all') return {start:null,end};
  const d=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);
  if(range==='month')d.setDate(1);
  else d.setDate(d.getDate()-(Number(range.slice(0,-1))-1));
  return {start:key(d),end};
}
export function cashFlow(assets: Asset[], range: RangeKey, now=new Date()) {
  const {start,end}=trendPeriod(range,now);
  const months=new Map<string,CashMonth>();let missingDates=0;
  const add=(asset:Asset,kind:CashEvent['kind'],date:string|null,amount:number)=>{
    if(!date){missingDates++;return;}
    if(date>end||(start&&date<start)||!Number.isFinite(amount))return;
    const label=date.slice(0,7);const m=months.get(label)||{label,purchase:0,sale:0,events:[]};
    m[kind]+=amount;m.events.push({asset,kind,date,amount});months.set(label,m);
  };
  for(const a of assets){
    if(a.type!=='asset'||a.exclude_total)continue;
    add(a,'purchase',calendarDate(a.purchase_date),a.price);
    if(a.status==='sold'&&a.sold_price!==null)add(a,'sale',calendarDate(a.sold_date),a.sold_price);
  }
  let sparseMonths=false;
  if(months.size){
    const firstMonth=(start||[...months.keys()].sort()[0]).slice(0,7);
    const lastMonth=end.slice(0,7);
    const index=(s:string)=>Number(s.slice(0,4))*12+Number(s.slice(5,7))-1;
    const count=index(lastMonth)-index(firstMonth)+1;
    // Protect rendering from pathological ancient dates; keep every actual event.
    if(count<=1200)for(let i=index(firstMonth);i<=index(lastMonth);i++){
      const label=`${String(Math.floor(i/12)).padStart(4,'0')}-${String(i%12+1).padStart(2,'0')}`;
      if(!months.has(label))months.set(label,{label,purchase:0,sale:0,events:[]});
    }else sparseMonths=true;
  }
  const rows=[...months.values()].sort((a,b)=>a.label.localeCompare(b.label));
  const purchase=rows.reduce((s,m)=>s+m.purchase,0),sale=rows.reduce((s,m)=>s+m.sale,0);
  return {months:rows,purchase,sale,net:purchase-sale,missingDates,sparseMonths};
}
export type HoldingPoint = { date: string; owned: number; serving: number };
export function holdingHistory(assets:Asset[],range:RangeKey,now=new Date()) {
  const {start,end}=trendPeriod(range,now);let missingDates=0;
  const events=new Map<string,{owned:number;serving:number}>();
  const add=(date:string,owned:number,serving:number)=>{if(date>end)return;const e=events.get(date)||{owned:0,serving:0};e.owned+=owned;e.serving+=serving;events.set(date,e);};
  for(const a of assets){
    if(a.type!=='asset')continue;
    const purchase=calendarDate(a.purchase_date);
    if(!purchase){missingDates++;continue;}
    if(purchase>end)continue;
    const sale=a.status==='sold'?calendarDate(a.sold_date):null;
    const retired=a.status!=='serving'?calendarDate(a.retired_date):null;
    // Unknown stopping dates cannot establish a trustworthy historical series.
    if((a.status==='sold'&&(!sale||sale<purchase))||(a.status==='retired'&&(!retired||retired<purchase))){missingDates++;continue;}
    add(purchase,1,1);
    const stop=[sale,retired].filter((d):d is string=>!!d&&d>=purchase).sort()[0];
    if(stop)add(stop,0,-1);
    if(sale)add(sale,-1,0);
  }
  const entries=[...events].sort(([a],[b])=>a.localeCompare(b));
  if(!entries.length)return {points:[] as HoldingPoint[],missingDates};
  const first=start||entries[0][0];let owned=0,serving=0;
  const points:HoldingPoint[]=[];
  for(const [date,e] of entries){
    if(date<first){owned+=e.owned;serving+=e.serving;continue;}
    if(!points.length&&date>first)points.push({date:first,owned,serving});
    owned+=e.owned;serving+=e.serving;points.push({date,owned,serving});
  }
  if(!points.length)points.push({date:first,owned,serving});
  if(points[points.length-1].date!==end)points.push({date:end,owned,serving});
  return {points,missingDates};
}

export function dailyRanking(assets:Asset[],range:RangeKey,ascending=false,now=new Date()) {
  const {start,end}=trendPeriod(range,now);
  return assets.filter(a=>{
    const date=calendarDate(a.purchase_date);
    return a.type==='asset' && a.status==='serving' && !a.exclude_daily &&
      a.cost_rule!=='per_use' && Number.isFinite(a.daily_cost) &&
      (!date || date<=end) && (!start || (!!date && date>=start));
  }).sort((a,b)=>(ascending?1:-1)*(a.daily_cost-b.daily_cost)||a.id.localeCompare(b.id)).slice(0,5);
}
