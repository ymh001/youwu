import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyTrend } from '../src/utils/dailyTrend.ts';
import { computeScopedStats } from '../src/utils/stats.ts';

const now = new Date(2026, 9, 27, 12);
const asset = { type: 'asset', status: 'serving', purchase_date: '2026-10-25', cost_rule: 'per_day', total_cost: 300, daily_cost: 100, price: 300, exclude_daily: false };

test('includes purchase day and decreases daily without inventing earlier costs', () => {
  assert.deepEqual(dailyTrend([asset], '7d', now), [
    { label: '2026-10-25', value: 300 },
    { label: '2026-10-26', value: 150 },
    { label: '2026-10-27', value: 100 },
  ]);
});
test('sold and retired costs stop amortizing at their end date', () => {
  for (const status of ['sold', 'retired']) {
    const series = dailyTrend([{ ...asset, status, [`${status}_date`]: '2026-10-26', total_cost: 200 }], 'all', now);
    assert.deepEqual(series.map(p => p.value), [200, 100, 100]);
  }
});
test('per-use, future, wish and excluded assets never enter daily aggregate', () => {
  const skipped = [
    {...asset, cost_rule:'per_use'}, {...asset, purchase_date:'2026-11-01'},
    {...asset, type:'wish'}, {...asset, exclude_daily:true},
  ];
  assert.deepEqual(dailyTrend(skipped, 'all', now), []);
  assert.equal(computeScopedStats([{...asset,cost_rule:'per_use'}]).totalDaily, 0);
});
test('zero custom cost and sale profit retain their meaning', () => {
  assert.deepEqual(dailyTrend([{...asset,cost_rule:'custom',custom_daily:0}], 'all', now).map(p=>p.value), [0,0,0]);
  assert.equal(dailyTrend([{...asset,total_cost:-300}], 'all', now).at(-1).value, -100);
});
test('long ranges retain every day, including a purchase spike between old sampling intervals', () => {
  const series = dailyTrend([{...asset, purchase_date:'2020-01-01',total_cost:0}, {...asset,purchase_date:'2026-10-26',total_cost:3000}], 'all', now);
  assert.ok(series.length > 2000);
  assert.equal(series.find(p=>p.label==='2026-10-26').value,3000);
  assert.equal(series.at(-1).value,1500);
});
