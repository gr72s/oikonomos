interface ApiErrorShape {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

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

export async function apiGet<T>(path: string, query?: Record<string, string | undefined | null>): Promise<T> {
  const response = await fetch(buildUrl(path, query));
  if (!response.ok) {
    return parseError(response);
  }
  return (await response.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    return parseError(response);
  }
  return (await response.json()) as T;
}
