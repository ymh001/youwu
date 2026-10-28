import type {
  Asset,
  AssetInput,
  AssetStatus,
  Category,
  Stats,
  Tag,
} from "./types";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json", "X-Keeps-Request": "1", ...(init?.headers || {}) },
    ...init,
  });
  if (res.status === 401) window.dispatchEvent(new Event("keeps-auth-expired"));
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message =
        typeof body.detail === "string"
          ? body.detail
          : JSON.stringify(body.detail ?? body);
    } catch {
      /* ignore */
    }
    throw new Error(message || "请求失败");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function qs(params: Record<string, string | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`,
    );
  return parts.length ? `?${parts.join("&")}` : "";
}

export const api = {
  reorderWishes(ids:string[]) { return request<{ok:boolean}>('/wishes/reorder',{method:'POST',body:JSON.stringify({ids})}); },
  incrementTarget(id:string) { return request<Asset>(`/assets/${id}/target/increment`,{method:'POST'}); },
  async uploadImage(
    file: File,
  ): Promise<{ image_url: string; original_url: string }> {
    const response = await fetch(BASE + "/images", {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream", "X-Keeps-Request": "1" },
      body: file,
    });
    if (response.status === 401) window.dispatchEvent(new Event("keeps-auth-expired"));
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "图片上传失败");
    }
    return response.json();
  },
  deleteUnusedImage(url: string) {
    const match = url.match(/^\/media\/([a-f0-9]{32})\/display\.png$/);
    return match
      ? request<void>(`/images/${match[1]}`, { method: "DELETE" })
      : Promise.resolve();
  },
  listAssets(params: Record<string, string | undefined> = {}) {
    return request<Asset[]>(`/assets${qs(params)}`);
  },
  getAsset(id: string) {
    return request<Asset>(`/assets/${id}`);
  },
  createAsset(input: AssetInput) {
    return request<Asset>("/assets", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  updateAsset(id: string, input: AssetInput) {
    return request<Asset>(`/assets/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  deleteAsset(id: string) {
    return request<void>(`/assets/${id}`, { method: "DELETE" });
  },
  setStatus(
    id: string,
    status: AssetStatus,
    extra: {
      sold_price?: number | null;
      sold_date?: string | null;
      retired_date?: string | null;
    } = {},
  ) {
    return request<Asset>(`/assets/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status, ...extra }),
    });
  },
  useAsset(id: string, count = 1) {
    return request<Asset>(`/assets/${id}/use?count=${count}`, {
      method: "POST",
    });
  },

  listCategories() {
    return request<Category[]>("/categories");
  },
  createCategory(input: Partial<Category>) {
    return request<Category>("/categories", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  updateCategory(id: string, input: Partial<Category>) {
    return request<Category>(`/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  reorderTags(ids: string[]) {
    return request<Tag[]>("/tags/reorder", {method:"POST",body:JSON.stringify({ids})});
  },
  reorderCategories(ids: string[]) {
    return request<Category[]>("/categories/reorder", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
  },
  deleteCategory(id: string) {
    return request<void>(`/categories/${id}`, { method: "DELETE" });
  },

  listTags() {
    return request<Tag[]>("/tags");
  },
  createTag(input: Partial<Tag>) {
    return request<Tag>("/tags", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  updateTag(id: string, input: Partial<Tag>) {
    return request<Tag>(`/tags/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  deleteTag(id: string) {
    return request<void>(`/tags/${id}`, { method: "DELETE" });
  },

  stats() {
    return request<Stats>("/stats");
  },
  exportData() {
    return request<Record<string, unknown>>("/export");
  },
  importData(payload: unknown) {
    return request<{ ok: boolean; assets: number }>("/import", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  trash() {
    return request<{
      retention_days: 7 | 30 | 180 | null;
      items: (Asset & { deleted_at: string })[];
    }>("/trash");
  },
  setTrashRetention(retention_days: 7 | 30 | 180 | null) {
    return request<{ retention_days: 7 | 30 | 180 | null; removed: number }>(
      "/trash/settings",
      { method: "PATCH", body: JSON.stringify({ retention_days }) },
    );
  },
  restoreAsset(id: string) {
    return request<Asset>(`/trash/${id}/restore`, { method: "POST" });
  },
  deletePermanently(id: string) {
    return request<void>(`/trash/${id}`, { method: "DELETE" });
  },
  emptyTrash() {
    return request<void>("/trash", { method: "DELETE" });
  },
  reset() {
    return request<{ ok: boolean }>("/reset", { method: "POST" });
  },
};
