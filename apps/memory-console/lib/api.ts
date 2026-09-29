// Why this file exists
// ====================
//
// One place that talks to the backend. Every screen calls `post()` from here
// rather than using `fetch` itself, so the bearer token, the error shape and
// the base URL are handled once instead of ten times.
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

// Pull the subject out of a token so a screen can prefill it. A JWT's middle
// part is base64url JSON; we only read it, we never trust it - the backend
// verifies the signature and rejects a subject that does not match.
export function tokenSubject(token: string): string {
  try {
    const body = token.split(".")[1];
    if (!body) return "";
    const json = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
    return (JSON.parse(json).sub as string) ?? "";
  } catch {
    return "";
  }
}

// When the token expires, as a Date, or null if it cannot be read.
export function tokenExpiry(token: string): Date | null {
  try {
    const body = token.split(".")[1];
    if (!body) return null;
    const json = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = JSON.parse(json).exp as number | undefined;
    return exp ? new Date(exp * 1000) : null;
  } catch {
    return null;
  }
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

// POST a JSON body to the backend and return the parsed response.
export async function post<T>(path: string, body: unknown): Promise<T> {
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
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
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

// GET a path that needs no token, used for /health.
export async function getHealth(): Promise<unknown> {
  const response = await fetch(`${API_BASE}/health`);
  if (!response.ok) throw await toFailure(response);
  return response.json();
}
