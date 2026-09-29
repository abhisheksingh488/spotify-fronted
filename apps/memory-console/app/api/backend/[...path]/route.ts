// Why this file exists
// ====================
//
// This is the gateway, and it is the reason nobody has to handle a token.
//
// The backend has no login endpoint, on purpose. Its `memory/auth.py` says why:
//
//   "There is no login here on purpose. The callers are Spotify's AI surfaces
//    (services), not people. In production the API gateway mints these tokens
//    after verifying the listener's existing Spotify session."
//
// That gateway is the piece this file plays. The browser calls
// /api/backend/v1/... with no credentials at all. This route runs on the
// console's own server, works out which subject the operator selected, mints a
// short-lived token with the shared secret, and forwards the request to the
// backend with the Authorization header attached.
//
// Three things follow from doing it here rather than in the browser:
//
//   1. The operator never sees, pastes or stores a token.
//   2. The secret never reaches the browser, and neither does the token.
//   3. The browser never calls port 8000, so CORS stops mattering.
//
// The subject is NOT taken on trust. It is checked against the approved list in
// lib/subjects.ts before anything is signed, so editing the cookie cannot point
// the console at a subject it is not allowed to see (abc.md:340).

import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { DEFAULT_SUBJECT, SUBJECT_COOKIE, isApprovedSubject } from "@/lib/subjects";

// Where the backend is. Server-side only - no NEXT_PUBLIC_ prefix, because the
// browser has no business knowing.
const BACKEND = process.env.MEMORY_API_BASE_URL ?? "http://127.0.0.1:8000";

// The same secret the backend signs with (its .env MEMORY_JWT_SECRET). Without
// it this route cannot mint anything, and says so plainly.
const SECRET = process.env.MEMORY_JWT_SECRET;

// Matches the backend's TOKEN_LIFETIME in memory/auth.py. Short on purpose -
// abc.md's threat model calls out replay of stale tokens.
const LIFETIME_SECONDS = 15 * 60;

// Which service is calling. The backend records this beside the subject on
// every audited action, so an operator's work is distinguishable from a
// listener's surface.
const SERVICE_ID = "memory-console";

// The headers worth passing through in each direction. Everything else is
// dropped rather than forwarded blindly.
const FORWARD_TO_BACKEND = ["content-type", "x-correlation-id"];
const RETURN_TO_BROWSER = ["content-type", "x-correlation-id"];

// Stamp a token for one subject - the same claims memory/auth.py expects:
// sub, svc, iat and exp.
async function mintToken(subjectId: string): Promise<string> {
  const key = new TextEncoder().encode(SECRET);
  return new SignJWT({ sub: subjectId, svc: SERVICE_ID })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${LIFETIME_SECONDS}s`)
    .sign(key);
}

// Which subject the operator is currently acting as, refusing anything that is
// not on the approved list.
async function currentSubject(): Promise<string> {
  const store = await cookies();
  const chosen = store.get(SUBJECT_COOKIE)?.value ?? DEFAULT_SUBJECT;
  return isApprovedSubject(chosen) ? chosen : DEFAULT_SUBJECT;
}

// Do the work for whichever method came in: mint, forward, hand back.
async function proxy(request: NextRequest, path: string[]): Promise<Response> {
  if (!SECRET) {
    return Response.json(
      {
        detail: {
          code: "CONSOLE_NOT_CONFIGURED",
          message:
            "MEMORY_JWT_SECRET is not set for the console. Copy .env.local.example " +
            "to .env.local and put the backend's MEMORY_JWT_SECRET in it.",
          correlation_id: "",
        },
      },
      { status: 500 },
    );
  }

  const subjectId = await currentSubject();
  const token = await mintToken(subjectId);

  // Keep the query string - endpoints 8, 9 and 10 take subject_id there.
  const target = `${BACKEND}/${path.join("/")}${request.nextUrl.search}`;

  const headers = new Headers({ Authorization: `Bearer ${token}` });
  for (const name of FORWARD_TO_BACKEND) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  // A GET or DELETE has no body to read.
  const hasBody = request.method !== "GET" && request.method !== "DELETE";

  let response: Response;
  try {
    response = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.text() : undefined,
      cache: "no-store",
    });
  } catch {
    // The backend is not running, or not on that port. Say which, because
    // this is the single most common thing to go wrong in a demo.
    return Response.json(
      {
        detail: {
          code: "BACKEND_UNREACHABLE",
          message: `The console cannot reach the backend at ${BACKEND}. Start it with: python -m uvicorn memory.api:app --reload --port 8000`,
          correlation_id: "",
        },
      },
      { status: 503 },
    );
  }

  const out = new Headers();
  for (const name of RETURN_TO_BROWSER) {
    const value = response.headers.get(name);
    if (value) out.set(name, value);
  }
  // So a screen can show which subject the answer is about without guessing.
  out.set("X-Acting-Subject", subjectId);

  return new Response(await response.text(), {
    status: response.status,
    headers: out,
  });
}

// Next needs one export per method. Each is the same two lines.
export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await context.params).path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await context.params).path);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await context.params).path);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await context.params).path);
}
