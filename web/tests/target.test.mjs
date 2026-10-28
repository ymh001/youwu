import test from 'node:test';
import assert from 'node:assert/strict';
import {targetProgress} from '../src/utils/target.ts';
const a={type:'asset',status:'serving',purchase_date:'2026-01-21',days:280,cost_rule:'per_day',combined_cost:7999,combined_daily:7999/280};
test('date goal counts purchase day, including leap days',()=>{const g=targetProgress({...a,target_mode:'date',target_date:'2031-01-21'});assert.equal(g.title,'目标 1827 天');assert.equal(g.percent,280/1827*100);});
test('price goal estimates from net combined cost and caps attainment',()=>{assert.equal(targetProgress({...a,target_mode:'price',target_daily:7999/10}).detail,'已达成');const g=targetProgress({...a,days:5,combined_cost:100,combined_daily:20,target_mode:'price',target_daily:10});assert.equal(g.percent,50);assert.equal(g.detail,'预计 2026-01-30');});
test('custom quantity is independent of days and cost rule',()=>{const g=targetProgress({...a,target_mode:'custom',target_quantity:10,target_completed:3,target_unit:'次'});assert.equal(g.percent,30);assert.equal(g.title,'3 / 10 次');assert.equal(targetProgress({...a,target_mode:'none',target_daily:5}),null);});
test('stopped assets never promise a future achievement date',()=>{assert.equal(targetProgress({...a,status:'sold',target_mode:'price',target_daily:1}).detail,'已停止累计');});
