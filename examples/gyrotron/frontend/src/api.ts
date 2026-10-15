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
  dashboard: () => fetchJSON<DashboardData>("/dashboard"),
  list: (page: number, search: string) =>
    fetchJSON<ShotPage>(`/shots?page=${page}&page_size=20&search=${encodeURIComponent(search)}`),
  get: (id: number) => fetchJSON<Shot>(`/shots/${id}`),
  create: (shot: ShotForm) =>
    fetchJSON<Shot>("/shots", { method: "POST", body: JSON.stringify(shot) }),
  update: (id: number, shot: ShotForm) =>
    fetchJSON<Shot>(`/shots/${id}`, { method: "PUT", body: JSON.stringify(shot) }),
  remove: (id: number) =>
    fetchJSON<void>(`/shots/${id}`, { method: "DELETE" }),
};
