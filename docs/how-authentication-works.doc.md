# How authentication works — and why there is nothing to paste

**Files:** `app/api/backend/[...path]/route.ts`, `components/SubjectBar.tsx`,
`lib/subjects.ts`, `lib/useSubject.ts`

---

## The short version

You open the console, pick a subject from a dropdown, and use it. There is no
login, no token, and nothing to copy.

---

## Why there is no login

The backend has no login endpoint, and that is deliberate. Its own
`memory/auth.py` says why:

> *"There is no login here on purpose. The callers are Spotify's AI surfaces
> (services), not people. **In production the API gateway mints these tokens
> after verifying the listener's existing Spotify session**; for the pilot we
> mint them ourselves with the same secret."*

So the specification does say who hands out tokens — an **API gateway**. Adding
a `/login` endpoint would be inventing an eleventh endpoint the requirements do
not list, and `abc.md:303-322` fixes the list at ten.

`scripts/make_token.py` in the backend exists for Postman. Its own docstring
says so: *"This script exists so you can try the API by hand."* It is a testing
tool, and putting it in front of a person using the console was the wrong call.

---

## What plays the gateway's role

`app/api/backend/[...path]/route.ts` — a catch-all route on the console's own
Next.js server.

```
browser                    console server                     backend
   |                            |                                |
   |-- POST /api/backend/ ----->|                                |
   |   v1/context/compose       |                                |
   |   (no credentials at all)  |                                |
   |                            |-- read the subject cookie      |
   |                            |-- check it is on the           |
   |                            |   approved list                |
   |                            |-- sign a 15-minute token       |
   |                            |   with MEMORY_JWT_SECRET       |
   |                            |                                |
   |                            |-- POST :8000/v1/context/... -->|
   |                            |   Authorization: Bearer eyJ... |
   |                            |<-------------------------------|
   |<---------------------------|                                |
```

Three things follow from doing it on the server rather than in the browser:

1. **Nobody handles a token.** Not the operator, not the browser.
2. **The secret never leaves the server**, and neither does the token. Neither
   env var is prefixed `NEXT_PUBLIC_`, so Next.js will not ship them.
3. **CORS stops mattering.** The browser only ever calls its own origin, so it
   never needs the backend's permission to do so.

The token claims are exactly what the backend expects — `sub`, `svc`, `iat`,
`exp` — with a 15-minute lifetime matching `TOKEN_LIFETIME` in
`memory/auth.py`. The `svc` claim is `memory-console`, so an operator's actions
are distinguishable from a listener's surface in the audit log.

---

## What stops the console acting as anyone it likes

`abc.md:340` says the memory explorer must *"search only with approved support
or test identities"*. So `lib/subjects.ts` holds that allow-list — the five
subjects the backend's migration seeds — and the route checks the cookie against
it **before it signs anything**. An unapproved value falls back to `user_001`
rather than minting a token for it.

Verified: a cookie saying `somebody_elses_account` comes back acting as
`user_001`.

The cookie holds a subject id and nothing else. No secret, no token, nothing
worth stealing.

---

## What this does *not* claim to be

Being straight about the limits, because the gateway shortcut has real ones.

- **Anyone who can open the console can act as any approved subject.** That is
  correct for an internal operator tool — `abc.md:339-345` describes these
  screens as operator views — but it means the console must not be exposed
  publicly without a real sign-in in front of it.
- **The console holds the backend's signing secret.** A real deployment would
  have the gateway verify a Spotify session and mint from there, so the console
  would receive a token rather than create one. This is the pilot shortcut the
  backend's own comment describes, moved one layer up.
- **There is no listener-facing app yet.** `abc.md:253-254` describes two
  frontends. This is the operator console. A listener looking at their own
  memories would be locked to their own subject with no picker, and would get
  their token from a real session — not from this route.

---

## Functions

| Function | File | Why it exists |
|---|---|---|
| `proxy()` | `app/api/backend/[...path]/route.ts` | Mints the token and forwards one request. All four method exports are two lines over it. |
| `mintToken()` | same | Signs `sub`, `svc`, `iat`, `exp` with the shared secret — the same claims `memory/auth.py` reads. |
| `currentSubject()` | same | Reads the cookie and refuses anything not on the approved list. |
| `GET` / `POST` / `PATCH` / `DELETE` | same | Next needs one export per method. |
| `SubjectBar` | `components/SubjectBar.tsx` | The dropdown. Writes the cookie, reloads so every screen refetches, and shows the consent state. |
| `SUBJECTS`, `isApprovedSubject()` | `lib/subjects.ts` | The allow-list, shared by the picker and the server so they cannot disagree. |
| `useSubject()` | `lib/useSubject.ts` | Lets a screen put the right `subject_id` in a request body. If a screen disagreed with the server, the backend would answer 403 SUBJECT_MISMATCH. |

---

## Worth pointing at in a demo

**Switch the dropdown to `user_005`.** Consent is paused for that subject, so
the context package comes back `no_memory: true` with the reason *"consent is
paused"* — not an error. The experience carries on without memory, which is
`abc.md:158`.

**Switch to `user_004`.** Consent is denied, and the write path answers
`403 CONSENT_DENIED`.

**Cross-subject isolation is still the backend's job, not the console's.** The
console minting the token changed nothing about that: a token for `user_002`
asking for `user_001` is refused with `403 SUBJECT_MISMATCH`, verified.
