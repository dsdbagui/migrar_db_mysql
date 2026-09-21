/**
 * Cliente HTTP fino para a API já implementada em `src/features/<feature>/routes.ts` e
 * `src/core/profileRoutes.ts` (backend). Nenhum endpoint aqui é inventado — os contratos
 * espelham exatamente o que já existe, exceto o de relatório (`/jobs/:id/report`), novo
 * nesta entrega (ver `_reversa_forward/001-frontend-wizard-migracao-web/interfaces/relatorio-de-job.md`).
 */

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3000";

export type Feature = "routines" | "tables";

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json", ...(init?.headers ?? {}) } : init?.headers,
    });
  } catch {
    // Falha de rede (backend fora do ar, DNS, etc.) — tratada pelo chamador via friendlyError.
    return { ok: false, status: 0, data: null };
  }
  const text = await res.text();
  let data: T | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = text as unknown as T;
    }
  }
  return { ok: res.ok, status: res.status, data };
}

export interface ConnectionProfile {
  id: string;
  label: string;
  host: string;
  port: number;
  user: string;
  databaseName: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateProfileBody {
  label: string;
  host: string;
  port?: number;
  user: string;
  password: string;
  databaseName?: string;
}

export interface Issue {
  code: string;
  severity: "error" | "warning" | "info";
  description: string;
}

export interface PreviewItem {
  name: string;
  issues: Issue[];
}

export interface JobItem {
  itemType: "routine" | "table" | "collation_routine";
  name: string;
  applied: boolean;
  skipped: boolean;
  applyError: string | null;
  rowsCopied: number | null;
  issues: Issue[];
}

export interface JobStatusResponse {
  id: string;
  feature: Feature | "config" | "reports" | "collation_fix";
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  items: JobItem[];
}

export interface JobListItem {
  id: string;
  feature: Feature | "config" | "reports" | "collation_fix";
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  startedAt: string | null;
  finishedAt: string | null;
  createdBy: string;
  errorMessage: string | null;
  sourceProfileLabel: string | null;
  targetProfileLabel: string | null;
  createdAt: string;
}

export interface ListJobsFilters {
  feature?: JobListItem["feature"];
  status?: JobListItem["status"];
}

export interface RoutinesJobParams {
  select: "all" | string[];
  newDefiner?: string;
  dropExisting?: boolean;
}

export interface TablesJobParams {
  select: "all" | string[];
  copyData: boolean;
  skipCreate: boolean;
  forceInnodb: boolean;
  dropExisting?: boolean;
  filters?: Record<string, string>;
  columnDefaults?: Record<string, Record<string, string>>;
  restoreRemovedFks: boolean;
  createDatabaseIfMissing: boolean;
}

export const api = {
  listProfiles: () => request<ConnectionProfile[]>("/connection-profiles"),

  createProfile: (body: CreateProfileBody) =>
    request<ConnectionProfile>("/connection-profiles", { method: "POST", body: JSON.stringify(body) }),

  deleteProfile: (id: string) => request<{ error?: string }>(`/connection-profiles/${id}`, { method: "DELETE" }),

  previewRoutines: (sourceProfileId: string, params: RoutinesJobParams) =>
    request<{ items: PreviewItem[] }>("/routines/preview", {
      method: "POST",
      body: JSON.stringify({ sourceProfileId, ...params }),
    }),

  previewTables: (sourceProfileId: string, params: Pick<TablesJobParams, "select" | "forceInnodb">) =>
    request<{ items: PreviewItem[] }>("/tables/preview", {
      method: "POST",
      body: JSON.stringify({ sourceProfileId, ...params }),
    }),

  createRoutinesJob: (body: RoutinesJobParams & { sourceProfileId: string; targetProfileId: string }) =>
    request<{ id: string }>("/routines/jobs", { method: "POST", body: JSON.stringify(body) }),

  createTablesJob: (body: TablesJobParams & { sourceProfileId: string; targetProfileId: string }) =>
    request<{ id: string }>("/tables/jobs", { method: "POST", body: JSON.stringify(body) }),

  getJobStatus: (feature: Feature, id: string) => request<JobStatusResponse>(`/${feature}/jobs/${id}`),

  listJobs: (filters?: ListJobsFilters) => {
    const query = new URLSearchParams();
    if (filters?.feature) query.set("feature", filters.feature);
    if (filters?.status) query.set("status", filters.status);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<JobListItem[]>(`/jobs${suffix}`);
  },

  cancelJob: (jobId: string) =>
    request<{ id: string; status: "cancelled" }>(`/jobs/${jobId}/cancel`, { method: "POST" }),

  generateReport: (jobId: string) =>
    request<{ jobId: string; generatedAt: string }>(`/jobs/${jobId}/report`, { method: "POST" }),

  reportUrl: (jobId: string, format: "json" | "html" | "sql" | "retry") =>
    `${BASE_URL}/jobs/${jobId}/report?format=${format}`,
};
