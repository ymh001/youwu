import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTrendBundle,projectTrendAssets,isTrendBundle,TREND_CACHE_VERSION} from '../src/utils/trendBundle.ts';
import {computeRangeStats,RANGE_OPTIONS,rangeStart} from '../src/utils/stats.ts';
import {cashFlow,holdingHistory,dailyRanking} from '../src/utils/trendViews.ts';
import {targetProgress} from '../src/utils/target.ts';
const now=new Date(2026,9,28,15);
const asset=(extra={})=>({
 id:'camera',name:'相机',icon:'📷',type:'asset',status:'serving',price:1200,
 purchase_date:'2026-10-23',wish_date:null,sold_date:null,sold_price:null,retired_date:null,
 total_cost:1200,daily_cost:200,combined_cost:1200,combined_daily:200,days:6,
 category_id:'device',category_name:'设备',category_icon:'',category_color:'#123456',
 exclude_total:false,exclude_daily:false,cost_rule:'per_day',target_mode:'price',target_daily:100,
 target_date:null,target_quantity:null,target_completed:0,target_unit:'次',
 notes:'PRIVATE_NOTE_MARKER',legacy_data:'PRIVATE_LEGACY_MARKER',image_url:'/PRIVATE_IMAGE_MARKER',
 attachments:[{id:'PRIVATE_ATTACHMENT_MARKER',url:'/PRIVATE_URL_MARKER',name:'票据'}],
 tags:[{id:'PRIVATE_TAG_MARKER'}],...extra,
});
const fixture=[asset(),asset({id:'sold',name:'旧镜头',status:'sold',purchase_date:'2025-01-01',sold_date:'2026-10-26',sold_price:700,total_cost:500,target_mode:'none'}),asset({id:'retired',status:'retired',retired_date:'2026-10-25',target_mode:'custom',target_quantity:100,target_completed:40}),asset({id:'goal',target_mode:'custom',target_quantity:100,target_completed:85}),asset({id:'wish',type:'wish'})];
const compactCash=result=>({...result,months:result.months.map(m=>({...m,events:m.events.map(e=>({...e,asset:{id:e.asset.id,name:e.asset.name}}))}))});
const compactRank=rows=>rows.map(({id,name,icon,daily_cost})=>({id,name,icon,daily_cost}));

test('all seven cached ranges exactly match existing helpers using the same clock',()=>{
 const bundle=buildTrendBundle(fixture,now);
 assert.equal(bundle.version,TREND_CACHE_VERSION);
 assert.equal(isTrendBundle(bundle),true);
 for(const {key} of RANGE_OPTIONS){
   const expected=computeRangeStats(fixture,key,now),range=bundle.ranges[key];
   assert.deepEqual(range.stats,{count:expected.count,byStatus:expected.byStatus,statusValue:expected.statusValue,categories:expected.categories});
   assert.deepEqual(range.cash,compactCash(cashFlow(fixture,key,now)));
   assert.deepEqual(range.holdings,holdingHistory(fixture,key,now));
   assert.deepEqual(range.ranking.ascending,compactRank(dailyRanking(fixture,key,true,now)));
   assert.deepEqual(range.ranking.descending,compactRank(dailyRanking(fixture,key,false,now)));
 }
 const goals=fixture.filter(a=>a.type==='asset').map(a=>({asset:{id:a.id,name:a.name},progress:targetProgress(a)})).filter(a=>a.progress).sort((a,b)=>b.progress.percent-a.progress.percent);
 assert.deepEqual(bundle.goals.items,goals);
 assert.deepEqual([bundle.goals.achieved,bundle.goals.near,bundle.goals.ongoing,bundle.goals.stopped],[0,1,1,1]);
});
test('projection strips private heavy fields and bundles never repeat full asset records',()=>{
 const projection=projectTrendAssets(fixture),bundle=buildTrendBundle(fixture,now);
 assert.equal(JSON.stringify(projection).includes('PRIVATE_'),false);
 assert.equal(JSON.stringify(bundle).includes('PRIVATE_'),false);
 assert.equal('notes' in projection[0],false);
 assert.equal('attachments' in projection[0],false);
 assert.deepEqual(buildTrendBundle(projection,now),bundle);
 assert.deepEqual(Object.keys(bundle.ranges.all.cash.months.find(m=>m.events.length).events[0].asset).sort(),['id','name']);
 assert.deepEqual(Object.keys(bundle.ranges.all.ranking.descending[0]).sort(),['daily_cost','icon','id','name']);
 assert.deepEqual(Object.keys(bundle.goals.items[0].asset).sort(),['id','name']);
 assert.equal(fixture[0].notes,'PRIVATE_NOTE_MARKER');
 assert.notEqual(projection[0],fixture[0]);
});
test('price changes, selling, renaming and deletion produce updated cache results',()=>{
 const original=asset(),before=buildTrendBundle([original],now);
 const changed=asset({name:'新名称',price:2400,total_cost:1800,status:'sold',sold_price:600,sold_date:'2026-10-28'});
 const after=buildTrendBundle([changed],now);
 assert.notDeepEqual(projectTrendAssets([original]),projectTrendAssets([changed]));
 assert.equal(after.ranges.month.cash.purchase,2400);assert.equal(after.ranges.month.cash.sale,600);
 assert.equal(after.ranges.month.stats.byStatus.sold,1);assert.equal(after.ranges.month.ranking.descending.length,0);
 assert.equal(after.ranges.month.holdings.points.at(-1).owned,0);
 assert.equal(after.ranges.month.cash.months[0].events[0].asset.name,'新名称');
 assert.notDeepEqual(after,before);
 const deleted=buildTrendBundle([],now);
 assert.equal(deleted.ranges.all.stats.count,0);assert.equal(deleted.ranges.all.cash.months.length,0);assert.equal(deleted.goals.items.length,0);
 assert.equal(isTrendBundle(deleted),true);
});
test('explicit date controls all range calculations without changing legacy range semantics',()=>{
 const a=asset({purchase_date:'2026-10-28'});
 assert.equal(buildTrendBundle([a],new Date(2026,9,27,23,59)).ranges.all.cash.purchase,0);
 assert.equal(buildTrendBundle([a],new Date(2026,9,28,0,1)).ranges.all.cash.purchase,1200);
 assert.equal(buildTrendBundle([a],new Date(2026,10,1,0,1)).ranges.month.stats.count,0);
 // Existing status/category ranges remain the original rolling 7*24h cutoff.
 assert.equal(rangeStart('7d',now).getTime(),now.getTime()-7*86400000);
});
test('cache validator rejects corrupt nested chart data and old versions',()=>{
 const good=buildTrendBundle(fixture,now);
 for(const breakIt of [
   b=>{b.version=0},b=>{delete b.ranges['7d']},b=>{b.ranges.all.stats.byStatus=null},
   b=>{b.ranges.all.stats.categories[0].value=NaN},b=>{b.ranges.all.cash.months[0].events=null},
   b=>{b.ranges.all.holdings.points[0].owned='3'},b=>{b.ranges.all.ranking.ascending={}},
   b=>{b.goals.items[0].progress.percent=Infinity},b=>{b.goals.items[0].asset.name=null},
   b=>{b.goals.near=-1},b=>{b.ranges.month.cash.net=undefined},
 ]){const broken=structuredClone(good);breakIt(broken);assert.equal(isTrendBundle(broken),false);}
 assert.equal(isTrendBundle(null),false);assert.equal(isTrendBundle([]),false);
 assert.equal(isTrendBundle(JSON.parse(JSON.stringify(good))),true);
});
