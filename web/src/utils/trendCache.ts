import type { Asset } from '../types';
import { buildTrendBundle, isTrendBundle, projectTrendAssets, TREND_CACHE_VERSION, type TrendBundle } from './trendBundle.ts';

const DB = 'youwu-trend-cache';
const STORE = 'statistics';
type Entry = { fingerprint: string; data: TrendBundle };
const memory = new Map<string, Entry>();
let epoch = 0;
export const localDay = (now = new Date()) => `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
export function trendFingerprint(assets: Asset[], now = new Date()) {
  return JSON.stringify({ version: TREND_CACHE_VERSION, day: localDay(now), zone: Intl.DateTimeFormat().resolvedOptions().timeZone, offset: now.getTimezoneOffset(), assets });
}
function check(signal?: AbortSignal, generation = epoch) {
  if (signal?.aborted || generation !== epoch) throw new DOMException('Cancelled', 'AbortError');
}

// Storage is optional: denial, quota failures and a blocked upgrade must not block the page.
function storage<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return new Promise(resolve => {
    let db: IDBDatabase | undefined;
    let done = false;
    const finish = (value?: T) => { if (done) return; done = true; clearTimeout(timer); db?.close(); resolve(value); };
    const timer = window.setTimeout(() => finish(), 1200);
    try {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE); };
      open.onerror = () => finish();
      open.onblocked = () => finish();
      open.onsuccess = () => {
        db = open.result;
        if (done) { db.close(); return; }
        try {
          const tx = db.transaction(STORE, mode);
          const request = action(tx.objectStore(STORE));
          let result: T | undefined;
          request.onsuccess = () => { result = request.result; };
          tx.oncomplete = () => finish(result);
          tx.onerror = tx.onabort = () => finish();
        } catch { finish(); }
      };
    } catch { finish(); }
  });
}

async function calculate(assets: Asset[], now: Date, signal?: AbortSignal): Promise<TrendBundle> {
  check(signal);
  try {
    return await new Promise<TrendBundle>((resolve, reject) => {
      const worker = new Worker(new URL('../workers/trend.worker.ts', import.meta.url), { type: 'module' });
      const clean = () => { clearTimeout(timeout); worker.terminate(); signal?.removeEventListener('abort', abort); };
      const abort = () => { clean(); reject(new DOMException('Cancelled', 'AbortError')); };
      const timeout = window.setTimeout(() => { clean(); reject(new Error('Trend worker timeout')); }, 30000);
      signal?.addEventListener('abort', abort, { once: true });
      worker.onmessage = event => {
        clean();
        if (isTrendBundle(event.data?.data)) resolve(event.data.data);
        else reject(new Error('Invalid trend result'));
      };
      worker.onerror = () => { clean(); reject(new Error('Trend worker unavailable')); };
      try { worker.postMessage({ assets, now: now.toISOString() }); } catch (error) { clean(); reject(error); }
    });
  } catch (error) {
    check(signal);
    // Older browsers or restrictive CSP can disallow Workers. Yield before the fallback.
    await new Promise(resolve => setTimeout(resolve, 0));
    check(signal);
    return buildTrendBundle(assets, now);
  }
}

export async function prepareTrends(assets: Asset[], scope: string, signal?: AbortSignal, now = new Date()) {
  const generation = epoch;
  check(signal, generation);
  const input = projectTrendAssets(assets);
  const fingerprint = trendFingerprint(input, now);
  const cached = memory.get(scope);
  if (cached?.fingerprint === fingerprint) return { data: cached.data, source: 'memory' as const };
  const saved = await storage<unknown>('readonly', store => store.get(scope));
  check(signal, generation);
  if (saved && typeof saved === 'object' && 'fingerprint' in saved && saved.fingerprint === fingerprint && 'data' in saved && isTrendBundle(saved.data)) {
    memory.set(scope, { fingerprint, data: saved.data });
    return { data: saved.data, source: 'disk' as const };
  }
  const data = await calculate(input, now, signal);
  check(signal, generation);
  if (memory.size > 1) memory.clear();
  memory.set(scope, { fingerprint, data });
  // Keep one current result per account, never accumulate daily/range histories.
  const entry = { fingerprint, data };
  if (JSON.stringify(entry).length <= 4_000_000) {
    void storage('readwrite', store => generation === epoch && !signal?.aborted ? store.put(entry, scope) : store.get(scope));
  }
  return { data, source: 'computed' as const };
}

export async function clearTrendCache() {
  epoch++;
  memory.clear();
  await storage('readwrite', store => store.clear());
}
