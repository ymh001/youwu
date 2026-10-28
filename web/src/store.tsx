import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import { useAccount } from "./account";
import { localDay, prepareTrends } from "./utils/trendCache";
import type { TrendBundle } from "./utils/trendBundle";
import type {
  Asset,
  AssetInput,
  AssetStatus,
  Category,
  Stats,
  Tag,
} from "./types";

type Theme = "system" | "light" | "dark";

interface Settings {
  currency: string;
  decimals: 0 | 1 | 2;
  thousands: boolean;
  theme: Theme;
}

const DEFAULT_SETTINGS: Settings = {
  currency: "CNY",
  decimals: 2,
  thousands: true,
  theme: "system",
};

const CURRENCIES: Record<string, string> = {
  CNY: "¥",
  USD: "$",
  EUR: "€",
  JPY: "¥",
  GBP: "£",
  HKD: "HK$",
};

interface StoreValue {
  loading: boolean;
  trends: TrendBundle | null;
  trendsError: boolean;
  retryTrends: () => void;
  assets: Asset[];
  wishes: Asset[];
  categories: Category[];
  tags: Tag[];
  stats: Stats | null;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  money: (value: number) => string;
  reload: () => Promise<void>;
  createAsset: (input: AssetInput) => Promise<Asset>;
  updateAsset: (id: string, input: AssetInput) => Promise<Asset>;
  deleteAsset: (id: string) => Promise<void>;
  setStatus: (
    id: string,
    status: AssetStatus,
    extra?: {
      sold_price?: number | null;
      sold_date?: string | null;
      retired_date?: string | null;
    },
  ) => Promise<void>;
  useAsset: (id: string) => Promise<void>;
  createCategory: (input: Partial<Category>) => Promise<Category>;
  updateCategory: (id: string, input: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  reorderCategories: (ids: string[]) => Promise<void>;
  reorderTags: (ids: string[]) => Promise<void>;
  createTag: (input: Partial<Tag>) => Promise<void>;
  updateTag: (id: string, input: Partial<Tag>) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;
  reset: () => Promise<void>;
  importData: (payload: unknown) => Promise<void>;
  toast: (message: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function readSettings(): Settings {
  try {
    // Read the previous app key once so an upgrade keeps display preferences.
    const raw =
      localStorage.getItem("keeps.settings") ??
      localStorage.getItem("\u0079\u006f\u0075\u0073\u0068\u0075.settings");
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_SETTINGS;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { username, guestMode } = useAccount();
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState(localDay);
  const [assetsDay, setAssetsDay] = useState<string | null>(null);
  const [assetLoadError, setAssetLoadError] = useState(false);
  const [trendResult, setTrendResult] = useState<{ assets: Asset[]; day: string; data: TrendBundle | null; error: boolean } | null>(null);
  const reloadSequence = useRef(0);
  const lastRefresh = useRef(0);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [wishes, setWishes] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [settings, setSettings] = useState<Settings>(readSettings);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const toast = useCallback((message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 2200);
  }, []);

  const reload = useCallback(async () => {
    const sequence = ++reloadSequence.current;
    const day = localDay();
    setAssetLoadError(false);
    try {
    const [a, w, c, t, s] = await Promise.all([
      api.listAssets({ type: "asset" }),
      api.listAssets({ type: "wish" }),
      api.listCategories(),
      api.listTags(),
      api.stats(),
    ]);
    if (sequence !== reloadSequence.current) return;
    setAssetsDay(day);
    lastRefresh.current = Date.now();
    setAssets(a);
    setWishes(w);
    setCategories(c);
    setTags(t);
    setStats(s);
    } catch (error) {
      if (sequence === reloadSequence.current) setAssetLoadError(true);
      throw error;
    }
  }, []);

  // Warm all trend ranges after fresh, authenticated assets arrive, before visiting /trend.
  useEffect(() => {
    if (loading || assetsDay !== today) return;
    const controller = new AbortController();
    void prepareTrends(assets, JSON.stringify([username, guestMode]), controller.signal).then(result => {
      if (controller.signal.aborted) return;
      for (const source of ['memory', 'disk', 'computed']) performance.clearMarks(`youwu:trends:${source}`);
      performance.mark(`youwu:trends:${result.source}`);
      setTrendResult({ assets, day: today, data: result.data, error: false });
    }).catch(error => {
      if (error?.name !== 'AbortError' && !controller.signal.aborted) setTrendResult({ assets, day: today, data: null, error: true });
    });
    return () => controller.abort();
  }, [assets, assetsDay, today, loading, username, guestMode]);

  useEffect(() => {
    const refresh = (onFocus = false) => {
      const day = localDay();
      if (document.visibilityState === 'hidden') return;
      if (day !== today || (onFocus && Date.now() - lastRefresh.current > 60000)) {
        setToday(day);
        void reload().catch(() => {});
      }
    };
    const visible = () => refresh(true);
    const timer = window.setInterval(() => refresh(), 30000);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', visible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', visible); };
  }, [today, reload]);

  const trends = trendResult?.assets === assets && trendResult.day === today && assetsDay === today && !assetLoadError ? trendResult.data : null;
  const trendsError = assetLoadError || (trendResult?.assets === assets && trendResult.day === today && trendResult.error) || false;
  const retryTrends = useCallback(() => { void reload().catch(error => toast(error.message || '加载失败')); }, [reload, toast]);

  useEffect(() => {
    reload()
      .catch((err) => toast(err.message || "加载失败"))
      .finally(() => setLoading(false));
  }, [reload, toast]);

  useEffect(() => {
    try { localStorage.setItem("keeps.settings", JSON.stringify(settings)); } catch { /* Keep in-memory preferences when storage is unavailable. */ }
    const root = document.documentElement;
    const apply = () => {
      const dark =
        settings.theme === "dark" ||
        (settings.theme === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings]);

  const money = useCallback(
    (value: number) => {
      const symbol = CURRENCIES[settings.currency] ?? "¥";
      const fixed = Number(value || 0).toFixed(settings.decimals);
      const [int, dec] = fixed.split(".");
      const grouped = settings.thousands
        ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
        : int;
      return `${symbol}${grouped}${dec ? `.${dec}` : ""}`;
    },
    [settings],
  );

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const wrap = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      try {
        const result = await fn();
        await reload();
        return result;
      } catch (err) {
        toast((err as Error).message || "操作失败");
        throw err;
      }
    },
    [reload, toast],
  );

  const value = useMemo<StoreValue>(
    () => ({
      loading,
      trends,
      trendsError,
      retryTrends,
      assets,
      wishes,
      categories,
      tags,
      stats,
      settings,
      updateSettings,
      money,
      reload,
      toast,
      createAsset: (input) => wrap(() => api.createAsset(input)),
      updateAsset: (id, input) => wrap(() => api.updateAsset(id, input)),
      deleteAsset: (id) => wrap(() => api.deleteAsset(id)),
      setStatus: async (id, status, extra) => {
        await wrap(() => api.setStatus(id, status, extra));
      },
      useAsset: async (id) => {
        await wrap(() => api.useAsset(id));
      },
      createCategory: async (input) => {
        return wrap(() => api.createCategory(input));
      },
      updateCategory: async (id, input) => {
        await wrap(() => api.updateCategory(id, input));
      },
      reorderTags: async (ids) => { await wrap(() => api.reorderTags(ids)); },
      reorderCategories: async (ids) => {
        await wrap(() => api.reorderCategories(ids));
      },
      deleteCategory: async (id) => {
        await wrap(() => api.deleteCategory(id));
      },
      createTag: async (input) => {
        await wrap(() => api.createTag(input));
      },
      updateTag: async (id, input) => {
        await wrap(() => api.updateTag(id, input));
      },
      deleteTag: async (id) => {
        await wrap(() => api.deleteTag(id));
      },
      reset: async () => {
        await wrap(() => api.reset());
      },
      importData: async (payload) => {
        await wrap(() => api.importData(payload));
      },
    }),
    [
      trends,
      trendsError,
      retryTrends,
      assets,
      categories,
      loading,
      money,
      reload,
      settings,
      stats,
      tags,
      toast,
      updateSettings,
      wishes,
      wrap,
    ],
  );

  return (
    <StoreContext.Provider value={value}>
      {children}
      {toastMessage && <div className="toast">{toastMessage}</div>}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

export function currencySymbol(code: string): string {
  return CURRENCIES[code] ?? "¥";
}
