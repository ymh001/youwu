import type { Asset } from '../types';
import { computeRangeStats, RANGE_OPTIONS, type RangeKey, type RangeStats } from './stats.ts';
import { cashFlow, holdingHistory, dailyRanking } from './trendViews.ts';
import { targetProgress } from './target.ts';

// Increment whenever the projection, schema, or statistics formula changes.
export const TREND_CACHE_VERSION = 2;
type AssetLabel = Pick<Asset, 'id' | 'name'>;
export type TrendRank = Pick<Asset, 'id' | 'name' | 'icon' | 'daily_cost'>;
export type TrendCash = Omit<ReturnType<typeof cashFlow>, 'months'> & {
  months: Array<{
    label: string; purchase: number; sale: number;
    events: Array<{ asset: AssetLabel; date: string; amount: number; kind: 'purchase' | 'sale' }>;
  }>;
};
export type TrendHoldings = ReturnType<typeof holdingHistory>;
export type TrendGoals = {
  items: Array<{ asset: AssetLabel; progress: NonNullable<ReturnType<typeof targetProgress>> }>;
  achieved: number; near: number; ongoing: number; stopped: number;
};
export type TrendRange = {
  stats: Pick<RangeStats, 'count' | 'byStatus' | 'statusValue' | 'categories'>;
  cash: TrendCash;
  holdings: TrendHoldings;
  ranking: { ascending: TrendRank[]; descending: TrendRank[] };
};
export type TrendBundle = {
  version: typeof TREND_CACHE_VERSION;
  ranges: Record<RangeKey, TrendRange>;
  goals: TrendGoals;
};

/** Only fields consumed by the statistics/helpers or their labels cross into the worker/cache key.
 * It deliberately returns the existing helper input type, with unused Asset fields absent.
 */
export function projectTrendAssets(assets: Asset[]): Asset[] {
  return assets.map(a => ({
    id: a.id, name: a.name, icon: a.icon, type: a.type, status: a.status,
    price: a.price, total_cost: a.total_cost, daily_cost: a.daily_cost,
    combined_cost: a.combined_cost, combined_daily: a.combined_daily,
    purchase_date: a.purchase_date, wish_date: a.wish_date,
    sold_date: a.sold_date, sold_price: a.sold_price, retired_date: a.retired_date,
    category_id: a.category_id, category_name: a.category_name,
    category_icon: a.category_icon, category_color: a.category_color,
    exclude_total: a.exclude_total, exclude_daily: a.exclude_daily, cost_rule: a.cost_rule,
    days: a.days, target_mode: a.target_mode, target_daily: a.target_daily,
    target_date: a.target_date, target_quantity: a.target_quantity,
    target_completed: a.target_completed, target_unit: a.target_unit,
  } as Asset));
}
const rankLabel = (a: Asset): TrendRank => ({id:a.id,name:a.name,icon:a.icon,daily_cost:a.daily_cost});

/** Runs once for all ranges, rather than whenever the trend route mounts or a chip changes. */
export function buildTrendBundle(assets: Asset[], now = new Date()): TrendBundle {
  const input = projectTrendAssets(assets);
  const ranges = {} as TrendBundle['ranges'];
  for (const {key} of RANGE_OPTIONS) {
    const stats = computeRangeStats(input, key, now);
    const cash = cashFlow(input, key, now);
    ranges[key] = {
      stats: {count:stats.count,byStatus:stats.byStatus,statusValue:stats.statusValue,categories:stats.categories},
      cash: {...cash,months:cash.months.map(month=>({...month,events:month.events.map(event=>({
        date:event.date,amount:event.amount,kind:event.kind,asset:{id:event.asset.id,name:event.asset.name},
      }))}))},
      holdings: holdingHistory(input,key,now),
      ranking: {
        ascending:dailyRanking(input,key,true,now).map(rankLabel),
        descending:dailyRanking(input,key,false,now).map(rankLabel),
      },
    };
  }
  const items: TrendGoals['items'] = [];
  let achieved=0,near=0,ongoing=0,stopped=0;
  for (const asset of input) {
    if(asset.type!=='asset')continue;
    const progress=targetProgress(asset);
    if(!progress)continue;
    items.push({asset:{id:asset.id,name:asset.name},progress});
    if(progress.achieved)achieved++;
    else if(asset.status!=='serving')stopped++;
    else if(progress.percent>=80)near++;
    else ongoing++;
  }
  items.sort((a,b)=>b.progress.percent-a.progress.percent);
  return {version:TREND_CACHE_VERSION,ranges,goals:{items,achieved,near,ongoing,stopped}};
}

const object = (v:unknown):v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v);
const number = (v:unknown):v is number => typeof v==='number' && Number.isFinite(v);
const count = (v:unknown):v is number => number(v) && Number.isInteger(v) && v>=0;
const string = (v:unknown):v is string => typeof v==='string';
const list = (v:unknown, item:(v:unknown)=>boolean):boolean => Array.isArray(v) && v.every(item);
const label = (v:unknown):boolean => object(v) && string(v.id) && string(v.name);
const statusValues = (v:unknown, check:(v:unknown)=>boolean):boolean => object(v) && ['serving','retired','sold'].every(k=>check(v[k]));
const rank = (v:unknown):boolean => label(v) && object(v) && string(v.icon) && number(v.daily_cost);
const category = (v:unknown):boolean => object(v) && label(v) && string(v.icon) && string(v.color) && number(v.value) && count(v.count) && number(v.pct);
const event = (v:unknown):boolean => object(v) && label(v.asset) && string(v.date) && number(v.amount) && (v.kind==='purchase'||v.kind==='sale');
const month = (v:unknown):boolean => object(v) && string(v.label) && number(v.purchase) && number(v.sale) && list(v.events,event);
const point = (v:unknown):boolean => object(v) && string(v.date) && count(v.owned) && count(v.serving);
const goal = (v:unknown):boolean => {
  if(!object(v)||!label(v.asset)||!object(v.progress))return false;
  const p=v.progress;
  return number(p.percent)&&p.percent>=0&&p.percent<=100&&string(p.title)&&string(p.detail)&&typeof p.achieved==='boolean';
};
/** Treat corrupt/old persisted data as a cache miss; never pass it into chart components. */
export function isTrendBundle(value:unknown):value is TrendBundle {
  if(!object(value)||value.version!==TREND_CACHE_VERSION||!object(value.ranges)||!object(value.goals))return false;
  const goals=value.goals;
  if(!list(goals.items,goal)||!['achieved','near','ongoing','stopped'].every(k=>count(goals[k])))return false;
  for(const {key} of RANGE_OPTIONS){
    const range=value.ranges[key];
    if(!object(range)||!object(range.stats)||!object(range.cash)||!object(range.holdings)||!object(range.ranking))return false;
    const {stats,cash,holdings,ranking}=range;
    if(!count(stats.count)||!statusValues(stats.byStatus,count)||!statusValues(stats.statusValue,number)||!list(stats.categories,category))return false;
    if(!list(cash.months,month)||!number(cash.purchase)||!number(cash.sale)||!number(cash.net)||!count(cash.missingDates)||typeof cash.sparseMonths!=='boolean')return false;
    if(!list(holdings.points,point)||!count(holdings.missingDates))return false;
    if(!list(ranking.ascending,rank)||!list(ranking.descending,rank))return false;
  }
  return true;
}
