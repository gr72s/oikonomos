interface ApiErrorShape {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}

interface RequestOptions {
  skipAuthRetry?: boolean;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

let accessTokenProvider: (() => string | null) | null = null;
let refreshHandler: (() => Promise<boolean>) | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function configureAuthClient(options: {
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<boolean>;
  onUnauthorized: () => void;
}): void {
  accessTokenProvider = options.getAccessToken;
  refreshHandler = options.refreshAccessToken;
  unauthorizedHandler = options.onUnauthorized;
}

function buildUrl(path: string, query?: Record<string, string | undefined | null>): string {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    });
  }
  return `${url.pathname}${url.search}`;
}

async function parseError(response: Response): Promise<never> {
  let message = `Request failed with status ${response.status}`;
  try {
    const payload = (await response.json()) as ApiErrorShape;
    if (payload?.message) {
      message = payload.message;
    }
  } catch {
    // Keep fallback message when response body is not JSON.
  }
  throw new Error(message);
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  query?: Record<string, string | undefined | null>,
  body?: unknown,
  options?: RequestOptions,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = accessTokenProvider?.();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(buildUrl(path, query), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && !options?.skipAuthRetry && refreshHandler) {
    const refreshed = await refreshHandler();
    if (refreshed) {
      const retryToken = accessTokenProvider?.();
      const retryHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (retryToken) {
        retryHeaders.Authorization = `Bearer ${retryToken}`;
      }
      const retryResponse = await fetch(buildUrl(path, query), {
        method,
        headers: retryHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!retryResponse.ok) {
        if (retryResponse.status === 401) {
          unauthorizedHandler?.();
        }
        return parseError(retryResponse);
      }
      return (await retryResponse.json()) as T;
    }
    unauthorizedHandler?.();
  }

  if (!response.ok) {
    if (response.status === 401) {
      unauthorizedHandler?.();
    }
    return parseError(response);
  }

  return (await response.json()) as T;
}

export function apiGet<T>(
  path: string,
  query?: Record<string, string | undefined | null>,
  options?: RequestOptions,
): Promise<T> {
  return request<T>("GET", path, query, undefined, options);
}

export function apiPost<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
  return request<T>("POST", path, undefined, body, options);
}
