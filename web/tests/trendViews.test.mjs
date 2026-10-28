import test from 'node:test';
import assert from 'node:assert/strict';
import {cashFlow,holdingHistory,trendPeriod,calendarDate,dailyRanking} from '../src/utils/trendViews.ts';
const now=new Date(2026,9,28,15);
const asset=(extra={})=>({id:'a',name:'相机',type:'asset',price:100,status:'serving',purchase_date:'2026-01-01',sold_price:null,sold_date:null,retired_date:null,exclude_total:false,...extra});
test('cash uses event date and raw price, counting accessories once',()=>{
 const rows=[asset({price:1000,total_cost:1400,combined_cost:1800}),asset({id:'child',price:400,parent_id:'a'}),asset({id:'old',purchase_date:'2025-01-01',status:'sold',sold_date:'2026-10-20',sold_price:200})];
 assert.equal(cashFlow(rows,'month',now).purchase,0);assert.equal(cashFlow(rows,'month',now).sale,200);
 assert.equal(cashFlow(rows,'all',now).purchase,1500);
});
test('calendar ranges include today and six earlier calendar days',()=>{
 assert.deepEqual(trendPeriod('7d',now),{start:'2026-10-22',end:'2026-10-28'});
 assert.equal(calendarDate('2026-02-30'),null);
 assert.equal(cashFlow([asset({purchase_date:'2026-10-22'}),asset({purchase_date:'2026-10-29'})],'7d',now).purchase,100);
});
test('cash missing dates, excluded values and wishes are not fabricated',()=>{
 const result=cashFlow([asset({purchase_date:null}),asset({exclude_total:true}),asset({type:'wish'})],'all',now);
 assert.equal(result.months.length,0);assert.equal(result.missingDates,1);
});
test('holdings carries opening balance, retirement stays owned, sale removes ownership',()=>{
 const result=holdingHistory([asset(),asset({id:'retired',status:'retired',retired_date:'2026-10-23'}),asset({id:'sold',status:'sold',sold_date:'2026-10-24'})],'7d',now);
 assert.deepEqual(result.points,[{date:'2026-10-22',owned:3,serving:3},{date:'2026-10-23',owned:3,serving:2},{date:'2026-10-24',owned:2,serving:1},{date:'2026-10-28',owned:2,serving:1}]);
});
test('retired then sold only stops service once; unknown dates excluded',()=>{
 const result=holdingHistory([asset({status:'sold',retired_date:'2026-10-01',sold_date:'2026-10-20'}),asset({id:'unknown',status:'sold'}),asset({purchase_date:'2027-01-01'})],'month',now);
 assert.equal(result.missingDates,1);assert.equal(result.points.at(-1).owned,0);assert.equal(result.points.at(-1).serving,0);
});
test('no event in interval retains opening holdings and same day events are combined',()=>{
 assert.deepEqual(holdingHistory([asset()],'month',now).points,[{date:'2026-10-01',owned:1,serving:1},{date:'2026-10-28',owned:1,serving:1}]);
 assert.deepEqual(holdingHistory([asset({status:'sold',sold_date:'2026-01-01'})],'all',now).points[0],{date:'2026-01-01',owned:0,serving:0});
});

test('empty months are explicit zeros while zero and negative amounts remain real events',()=>{
 const result=cashFlow([asset({purchase_date:'2026-08-01',price:-10}),asset({purchase_date:'2026-10-01',price:0})],'all',now);
 assert.deepEqual(result.months.map(m=>[m.label,m.purchase]),[['2026-08',-10],['2026-09',0],['2026-10',0]]);
 assert.equal(result.months[2].events.length,1);
});

test('ranking sorts the whole eligible set before selecting five in either direction',()=>{
 const rows=Array.from({length:8},(_,i)=>asset({id:String(i),daily_cost:i,cost_rule:'per_day'}));
 rows.push(asset({id:'per-use',daily_cost:1000,cost_rule:'per_use'}));
 assert.deepEqual(dailyRanking(rows,'all',false,now).map(a=>a.daily_cost),[7,6,5,4,3]);
 assert.deepEqual(dailyRanking(rows,'all',true,now).map(a=>a.daily_cost),[0,1,2,3,4]);
});
