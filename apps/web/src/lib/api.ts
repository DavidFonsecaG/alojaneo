// Thin fetch wrapper around the API. Attaches the JWT, parses JSON, and
// surfaces non-2xx responses as ApiError. On 401 it clears the stored token
// and notifies a registered handler so the app can bounce to /login.

const BASE_URL = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "alojaneo.token";
const LEGACY_TOKEN_KEY = "hrs.token"; // pre-rebrand; migrated on read

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export function getToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) return token;
  // Migrate a session stored under the old key so the rebrand doesn't log
  // existing users out.
  const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacy) {
    localStorage.setItem(TOKEN_KEY, legacy);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    return legacy;
  }
  return null;
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  // When true, a 401 does not trigger the global logout handler (used by the
  // login request itself, where 401 just means bad credentials).
  skipAuthRedirect?: boolean;
}

export async function apiRequest<T>(
  path: string,
  { method = "GET", body, skipAuthRedirect }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !skipAuthRedirect) {
    setToken(null);
    onUnauthorized?.();
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
      else if (data?.message) message = data.message;
    } catch {
      // response had no JSON body; keep the default message
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: "PUT", body }),
  del: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
};
