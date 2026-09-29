// Why this file exists
// ====================
//
// It does not, any more. Nothing imports it.
//
// This used to be a box that asked an operator to paste a JWT, because the
// backend has no login endpoint. That was a test harness dressed as a product:
// a token printed by `python scripts/make_token.py` and copied into a browser
// is fine for Postman and wrong for anyone using the console.
//
// It was replaced by two things:
//
//   components/SubjectBar.tsx            a dropdown - which subject to view as
//   app/api/backend/[...path]/route.ts   the console's server, which mints the
//                                        token and forwards the request
//
// That route is the API gateway the backend's own memory/auth.py says should
// exist: "In production the API gateway mints these tokens after verifying the
// listener's existing Spotify session." Doing it there means the browser never
// holds a token, the secret never leaves the server, and there is nothing to
// paste.
//
// The file is kept only so the change is legible in one place. It is safe to
// delete whenever you like - its working version is in git history at the first
// frontend commit.

export {};
