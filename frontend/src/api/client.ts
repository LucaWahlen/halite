export interface Ingredient {
  amount: number;
  unit: string;
  name: string;
}

export interface RecipeSummary {
  id: string;
  title: string;
  description: string;
  servings: number;
  prep_minutes: number;
  cook_minutes: number;
  total_minutes: number;
  tags: string[];
  has_image: boolean;
  image_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Recipe extends RecipeSummary {
  ingredients: Ingredient[];
  steps: string[];
}

export interface RecipePage {
  items: RecipeSummary[];
  total: number;
  page: number;
  page_size: number;
}

export type RecipeSort = "newest" | "oldest" | "title" | "title_desc" | "updated" | "quickest";

export interface RecipeListParams {
  page?: number;
  pageSize?: number;
  sort?: RecipeSort;
  q?: string;
  tag?: string;
}

export interface RecipeInput {
  title: string;
  description: string;
  servings: number;
  prep_minutes: number;
  cook_minutes: number;
  ingredients: Ingredient[];
  steps: string[];
  tags: string[];
}

export interface AppSettings {
  imprint_text: string;
  privacy_text: string;
}

export interface ImportCounts {
  recipes: number;
  images: number;
}

export interface ImportResult {
  imported: ImportCounts;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: { path: string; message: string }[];

  constructor(
    status: number,
    code: string,
    message: string,
    details: { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let code = "error";
  let message = `HTTP ${res.status}`;
  let details: { path: string; message: string }[] = [];
  try {
    const parsed = (await res.json()) as {
      error?: { code?: string; message?: string; details?: typeof details };
    };
    if (parsed.error) {
      code = parsed.error.code ?? code;
      message = parsed.error.message ?? message;
      details = parsed.error.details ?? details;
    }
  } catch {
    // ignore non-JSON error bodies
  }
  return new ApiError(res.status, code, message, details);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  if (!res.ok) {
    throw await toApiError(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

async function requestBody<T>(method: string, path: string, body: BodyInit, contentType?: string): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: contentType ? { "Content-Type": contentType } : undefined,
    body,
    credentials: "same-origin",
  });
  if (!res.ok) {
    throw await toApiError(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const api = {
  listRecipes: (params: RecipeListParams = {}) => {
    const query = new URLSearchParams();
    if (params.page !== undefined) query.set("page", String(params.page));
    if (params.pageSize !== undefined) query.set("page_size", String(params.pageSize));
    if (params.sort !== undefined) query.set("sort", params.sort);
    if (params.q) query.set("q", params.q);
    if (params.tag) query.set("tag", params.tag);
    const qs = query.toString();
    return request<RecipePage>("GET", `/api/v1/recipes${qs ? `?${qs}` : ""}`);
  },

  getRecipe: (id: string) => request<Recipe>("GET", `/api/v1/recipes/${id}`),

  listTags: () => request<{ tags: string[] }>("GET", "/api/v1/tags"),

  getSettings: () => request<AppSettings>("GET", "/api/v1/settings"),

  login: (password: string) => request<{ status: string }>("POST", "/api/v1/admin/login", { password }),
  logout: () => request<void>("POST", "/api/v1/admin/logout"),
  session: () => request<{ authenticated: boolean }>("GET", "/api/v1/admin/session"),

  getAdminSettings: () => request<AppSettings>("GET", "/api/v1/admin/settings"),
  putAdminSettings: (input: AppSettings) => request<AppSettings>("PUT", "/api/v1/admin/settings", input),

  createRecipe: (input: RecipeInput) => request<Recipe>("POST", "/api/v1/admin/recipes", input),
  updateRecipe: (id: string, input: RecipeInput) => request<Recipe>("PUT", `/api/v1/admin/recipes/${id}`, input),
  deleteRecipe: (id: string) => request<void>("DELETE", `/api/v1/admin/recipes/${id}`),

  uploadImage: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return requestBody<Recipe>("POST", `/api/v1/admin/recipes/${id}/image`, form);
  },
  deleteImage: (id: string) => request<void>("DELETE", `/api/v1/admin/recipes/${id}/image`),

  exportUrl: "/api/v1/admin/export" as const,
  importBundle: (file: File) =>
    requestBody<ImportResult>("POST", "/api/v1/admin/import", file, "application/zip"),
};
