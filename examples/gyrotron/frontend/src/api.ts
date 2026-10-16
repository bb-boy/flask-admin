import type { DashboardData, Shot, ShotForm, ShotPage } from "./types";

const BASE = "/api/v1";

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(BASE + path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch {
    throw new Error("无法连接服务器，请检查网络或服务状态");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "操作失败，请重试" }));
    throw new Error(typeof body.error === "string" ? body.error : "操作失败，请重试");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  dashboard: (serial = "") => fetchJSON<DashboardData>("/dashboard?serial=" + encodeURIComponent(serial)),
  serials: () => fetchJSON<{name: string; latest_date: string | null}[]>("/serials"),
  nextShot: (serial: string) => fetchJSON<{shot: string}>("/next-shot?serial=" + encodeURIComponent(serial)),
  suggestions: (serial: string) => fetchJSON<{name: string; description: string | null; unit: string | null; data_type: string; source: string}[]>(
    "/parameter-suggestions?serial=" + encodeURIComponent(serial)),
  list: (page: number, search: string) =>
    fetchJSON<ShotPage>("/shots?page=" + page + "&page_size=20&search=" + encodeURIComponent(search)),
  filtered: (filters: Record<string, string>, page = 1, size = 200) =>
    fetchJSON<ShotPage>("/shots?" + new URLSearchParams({ ...filters, page: String(page), page_size: String(size) }).toString()),
  get: (id: number) => fetchJSON<Shot>("/shots/" + id),
  create: (shot: ShotForm) =>
    fetchJSON<Shot>("/shots", { method: "POST", body: JSON.stringify(shot) }),
  update: (id: number, shot: ShotForm) =>
    fetchJSON<Shot>("/shots/" + id, { method: "PUT", body: JSON.stringify(shot) }),
  remove: (id: number) =>
    fetchJSON<void>("/shots/" + id, { method: "DELETE" }),
  exportURL: (filters: Record<string, string>, format: "xlsx" | "csv") =>
    BASE + "/shots/export?" + new URLSearchParams({ ...filters, format }).toString(),
  deletePreview: (filters: Record<string, unknown>) =>
    fetchJSON<{ count: number; snapshot: string }>("/shots/delete-preview",
      { method: "POST", body: JSON.stringify({ filters }) }),
  bulkDelete: (filters: Record<string, unknown>, snapshot: string) =>
    fetchJSON<{ deleted: number }>("/shots/bulk-delete",
      { method: "POST", body: JSON.stringify({ filters, snapshot }) }),
};
