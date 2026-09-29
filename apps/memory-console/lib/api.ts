// Why this file exists
// ====================
//
// One place that talks to the backend. Every screen calls `post`, `get`,
// `patch` or `del` from here rather than using `fetch` itself, so the bearer
// token, the error shape and the base URL are handled once instead of ten
// times.
//
// There is no login screen on purpose. The backend mints service tokens
// (backend `memory/auth.py`) - its callers are services, not people, so it
// has no user accounts and no login endpoint. An operator pastes a token
// made by `python scripts/make_token.py user_001`, and we keep it in the
// browser for the fifteen minutes it lasts.

import type { ApiError } from "./types";

// Where the backend is. Set NEXT_PUBLIC_API_BASE_URL to point somewhere else.
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

// The localStorage key holding the operator's token.
const TOKEN_KEY = "spotifymem.token";

// Read the saved token, or an empty string when there is none.
export function getToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

// Save a token. Accepts a whole "Authorization: Bearer xxx" line and keeps
// only the token, because that is what the script prints and what an
// operator will paste.
export function setToken(raw: string): string {
  const token = raw.trim().replace(/^Authorization:\s*/i, "").replace(/^Bearer\s+/i, "");
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // A browser with storage blocked still works for this one page load.
  }
  return token;
}

// Read one claim out of a token without verifying it. We only display these -
// the backend checks the signature and rejects a subject that does not match.
function claim(token: string, name: string): unknown {
  try {
    const body = token.split(".")[1];
    if (!body) return undefined;
    const json = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json)[name];
  } catch {
    return undefined;
  }
}

// Which subject this token is for, so a screen can prefill it.
export function tokenSubject(token: string): string {
  return (claim(token, "sub") as string) ?? "";
}

// When the token expires, as a Date, or null if it cannot be read.
export function tokenExpiry(token: string): Date | null {
  const exp = claim(token, "exp") as number | undefined;
  return exp ? new Date(exp * 1000) : null;
}

// An error carrying the backend's stable code, so a screen can say something
// useful instead of "request failed".
export class ApiFailure extends Error {
  code: string;
  status: number;
  correlationId: string;

  constructor(status: number, body: ApiError) {
    super(body.message);
    this.status = status;
    this.code = body.code;
    this.correlationId = body.correlation_id;
  }
}

// Turn a failed response into an ApiFailure, whatever shape it arrived in.
async function toFailure(response: Response): Promise<ApiFailure> {
  let body: ApiError = {
    code: "REQUEST_FAILED",
    message: `${response.status} ${response.statusText}`,
    correlation_id: response.headers.get("X-Correlation-Id") ?? "",
  };
  try {
    const parsed = await response.json();
    // The backend wraps its envelope in `detail` (memory/errors.py).
    const detail = parsed?.detail ?? parsed;
    if (detail && typeof detail === "object" && "code" in detail) {
      body = detail as ApiError;
    }
  } catch {
    // Not JSON - keep the status-line fallback above.
  }
  return new ApiFailure(response.status, body);
}

// The one function that actually calls the backend. Everything below is a
// two-line wrapper over it.
async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken();
  if (!token) {
    throw new ApiFailure(401, {
      code: "NO_TOKEN",
      message: "Paste a token first - python scripts/make_token.py user_001",
      correlation_id: "",
    });
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch only throws when the request never arrived.
    throw new ApiFailure(0, {
      code: "BACKEND_UNREACHABLE",
      message: `Cannot reach ${API_BASE} - is the API running on that port?`,
      correlation_id: "",
    });
  }

  if (!response.ok) throw await toFailure(response);
  return (await response.json()) as T;
}

// POST a JSON body - endpoints 1, 2, 3, 4, 5 and 9.
export function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>("POST", path, body);
}

// GET - endpoints 8 and 10, and /metrics.
export function get<T>(path: string): Promise<T> {
  return request<T>("GET", path);
}

// PATCH - endpoint 6, correcting or expiring a memory.
export function patch<T>(path: string, body: unknown): Promise<T> {
  return request<T>("PATCH", path, body);
}

// DELETE - endpoint 7, starting a cross-store deletion. Named `del` because
// `delete` is a reserved word.
export function del<T>(path: string): Promise<T> {
  return request<T>("DELETE", path);
}

// GET a path that needs no token, used for /health.
export async function getHealth(): Promise<unknown> {
  const response = await fetch(`${API_BASE}/health`);
  if (!response.ok) throw await toFailure(response);
  return response.json();
}
