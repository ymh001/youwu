import { buildTrendBundle } from '../utils/trendBundle';
import type { Asset } from '../types';

self.onmessage = (event: MessageEvent<{ assets: Asset[]; now: string }>) => {
  try {
    self.postMessage({ data: buildTrendBundle(event.data.assets, new Date(event.data.now)) });
  } catch {
    self.postMessage({ error: '无法生成趋势数据' });
  }
};
