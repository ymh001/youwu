import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrendBundle } from '../src/utils/trendBundle.ts';
import { prepareTrends, clearTrendCache, trendFingerprint } from '../src/utils/trendCache.ts';

globalThis.window = globalThis;
const records = new Map();
const fakeDB = { open() {
  const open = {};
  queueMicrotask(() => { open.result = {
    close() {}, objectStoreNames: { contains: () => true },
    transaction() {
      const tx = { objectStore() {
        const request = value => {
          const req = {};
          queueMicrotask(() => { req.result = structuredClone(value); req.onsuccess?.(); tx.oncomplete?.(); });
          return req;
        };
        return {
          get: key => request(records.get(key)),
          put: (value, key) => { records.set(key, structuredClone(value)); return request(key); },
          clear: () => { records.clear(); return request(undefined); },
        };
      }};
      return tx;
    },
  }; open.onsuccess?.(); });
  return open;
}};
globalThis.indexedDB = fakeDB;
let jobs = 0;
class FakeWorker {
  postMessage({assets,now}) { jobs++; this.timer = setTimeout(() => this.onmessage?.({data:{data:buildTrendBundle(assets,new Date(now))}}), 10); }
  terminate() { clearTimeout(this.timer); }
}
globalThis.Worker = FakeWorker;
const now = new Date(2026,9,28,12);
const assets = [{id:'a',name:'相机',icon:'📷',type:'asset',status:'serving',price:100,total_cost:100,daily_cost:1,combined_cost:100,combined_daily:1,purchase_date:'2026-01-01',sold_price:null,days:100,target_mode:'none'}];

test('precompute once, reuse memory, and notes are not part of the statistics key', async () => {
  await clearTrendCache(); jobs=0;
  assert.equal((await prepareTrends(assets,'account-a',undefined,now)).source,'computed');
  assert.equal((await prepareTrends(assets.map(a=>({...a,notes:'private text'})),'account-a',undefined,now)).source,'memory');
  assert.equal(jobs,1);
});
test('persisted bundle is reused by a fresh client; corrupt data is recomputed', async () => {
  await clearTrendCache();
  await prepareTrends(assets,'account-a',undefined,now);
  await new Promise(resolve=>setTimeout(resolve,0));
  const fresh = await import('../src/utils/trendCache.ts?fresh-client');
  const count=jobs;
  assert.equal((await fresh.prepareTrends(assets,'account-a',undefined,now)).source,'disk');
  assert.equal(jobs,count);
  records.get('account-a').data.ranges.all.cash.months=null;
  const another=await import('../src/utils/trendCache.ts?corrupt-client');
  assert.equal((await another.prepareTrends(assets,'account-a',undefined,now)).source,'computed');
});
test('changed values, dates, and accounts invalidate the reusable result', async () => {
  await clearTrendCache();
  await prepareTrends(assets,'account-a',undefined,now);
  const changed=assets.map(a=>({...a,price:200,total_cost:200}));
  assert.equal((await prepareTrends(changed,'account-a',undefined,now)).data.ranges.all.cash.purchase,200);
  assert.equal((await prepareTrends(changed,'account-b',undefined,now)).source,'computed');
  assert.notEqual(trendFingerprint(assets,now),trendFingerprint(assets,new Date(2026,9,29,12)));
  assert.equal((await prepareTrends(changed,'account-b',undefined,new Date(2026,9,29,12))).source,'computed');
});
test('abort and logout prevent an in-flight result from becoming a new cached record', async () => {
  await clearTrendCache();
  const controller = new AbortController();
  const pending = prepareTrends(assets,'cancelled',controller.signal,now);
  controller.abort();
  await assert.rejects(pending,{name:'AbortError'});
  const later=prepareTrends(assets,'logged-out',undefined,now);
  await clearTrendCache();
  await assert.rejects(later,{name:'AbortError'});
  assert.equal(records.size,0);
});
test('denied storage and unavailable Worker still produce correct trends', async () => {
  await clearTrendCache();
  globalThis.indexedDB=undefined;
  globalThis.Worker=class { constructor(){throw new Error('blocked');} };
  try {
    const result=await prepareTrends(assets,'fallback',undefined,now);
    assert.equal(result.data.ranges.all.cash.purchase,100);
    assert.equal(result.source,'computed');
  } finally { globalThis.indexedDB=fakeDB;globalThis.Worker=FakeWorker; }
});
