// Why this file exists
// ====================
//
// The gateway for the listener-facing app, and the one important difference
// from the console's version: the subject is fixed.
//
// A listener can only ever see their own memories. There is no picker and no
// cookie to change, because there is nothing for them to choose. The subject
// comes from MEMORY_SUBJECT_ID on the server, standing in for the signed-in
// Spotify session that a real deployment would read
// (backend memory/auth.py: "the API gateway mints these tokens after verifying
// the listener's existing Spotify session").
//
// Nothing the browser sends can change which subject is used, so the strongest
// requirement in the whole document - one listener can never reach another
// listener's memories - holds here by construction rather than by a check.

import { NextRequest } from "next/server";
import { SignJWT } from "jose";

// Where the backend is. Server-side only, so the browser never learns it.
const BACKEND = process.env.MEMORY_API_BASE_URL ?? "http://127.0.0.1:8000";

// The same secret the backend signs with.
const SECRET = process.env.MEMORY_JWT_SECRET;

// Who is signed in. In a real deployment this comes from the session, not an
// environment variable; here it is the one listener this app is running for.
const SUBJECT_ID = process.env.MEMORY_SUBJECT_ID ?? "user_001";

// Matches TOKEN_LIFETIME in the backend's memory/auth.py.
const LIFETIME_SECONDS = 15 * 60;

// Which service is calling, recorded beside every audited action so a
// listener's own change is distinguishable from an operator's.
const SERVICE_ID = "memory-controls";

// Only the endpoints this app is allowed to reach. A listener's app has no
// business calling /metrics or extraction, so the list is closed rather than
// open - abc.md:127 requires narrow, authorized access, not a general proxy.
const ALLOWED = [
  /^v1\/memories\/search$/,
  /^v1\/memories\/[^/]+$/,
  /^v1\/deletions\/[^/]+$/,
  /^v1\/feedback$/,
  /^health$/,
];

// Stamp a token for the signed-in listener.
async function mintToken(): Promise<string> {
  const key = new TextEncoder().encode(SECRET);
  return new SignJWT({ sub: SUBJECT_ID, svc: SERVICE_ID })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${LIFETIME_SECONDS}s`)
    .sign(key);
}

// A refusal in the same envelope the backend uses, so the app handles it the
// same way as any other failure.
function refuse(status: number, code: string, message: string): Response {
  return Response.json({ detail: { code, message, correlation_id: "" } }, { status });
}

// Mint, check the path is allowed, forward, hand back.
async function proxy(request: NextRequest, path: string[]): Promise<Response> {
  if (!SECRET) {
    return refuse(
      500,
      "APP_NOT_CONFIGURED",
      "MEMORY_JWT_SECRET is not set. Copy .env.local.example to .env.local and " +
        "put the backend's MEMORY_JWT_SECRET in it.",
    );
  }

  const joined = path.join("/");
  if (!ALLOWED.some((pattern) => pattern.test(joined))) {
    return refuse(403, "NOT_ALLOWED_HERE", `This app may not call /${joined}.`);
  }

  const token = await mintToken();

  // The subject is added here, not sent by the browser. The backend wants it in
  // the body on POST and PATCH, and in the query string on GET and DELETE, so
  // both are filled in from SUBJECT_ID. The page never mentions a subject at
  // all, which is what makes it impossible for it to ask for the wrong one.
  const query = new URLSearchParams(request.nextUrl.search);
  query.set("subject_id", SUBJECT_ID);
  const target = `${BACKEND}/${joined}?${query.toString()}`;

  const headers = new Headers({ Authorization: `Bearer ${token}` });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  // A GET or DELETE has no body to read.
  const hasBody = request.method !== "GET" && request.method !== "DELETE";

  // Put the subject into the body too, overwriting anything the browser sent.
  let body: string | undefined;
  if (hasBody) {
    const raw = await request.text();
    try {
      body = JSON.stringify({ ...(raw ? JSON.parse(raw) : {}), subject_id: SUBJECT_ID });
    } catch {
      return refuse(422, "VALIDATION_FAILED", "the request body is not valid JSON");
    }
  }

  let response: Response;
  try {
    response = await fetch(target, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });
  } catch {
    return refuse(
      503,
      "BACKEND_UNREACHABLE",
      `Cannot reach the memory service at ${BACKEND}. Start it with: ` +
        "python -m uvicorn memory.api:app --reload --port 8000",
    );
  }

  const out = new Headers();
  const returned = response.headers.get("content-type");
  if (returned) out.set("content-type", returned);
  const correlation = response.headers.get("x-correlation-id");
  if (correlation) out.set("x-correlation-id", correlation);

  return new Response(await response.text(), { status: response.status, headers: out });
}

// Next needs one export per method. This app needs four; extraction and event
// capture are not among them.
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
