# Spotify Personalized AI — frontend

The two web apps for the governed memory system. The backend lives in its own
repository, because the two deploy separately:

**Backend:** https://github.com/omsemwal/spotify-personalized-ai

---

## What is in here

`abc.md:252-253` names two apps. Both are here.

```
apps/
  memory-console/     Next.js — the seven internal operator screens
  memory-controls/    Next.js — the listener-facing review, correction and deletion UI
```

Stack is `abc.md:200`: *Next.js, React, Tailwind CSS*.

---

## The seven console screens

Exactly the seven of `abc.md:339-345`, in the document's own order. Nothing else.

| # | Screen | State |
|---|---|---|
| 1 | **Overview** — service health, ingestion lag, rejection rate | built · 3 of 7 metrics have a data source |
| 2 | **Subject-scoped memory explorer** — source type, confidence, relationships, status | built · timeline needs fields the search endpoint does not return |
| 3 | **Context preview** — retrieval, ranking, policy removals, the pack, token usage | built · complete |
| 4 | **Correction and deletion** — correct, expire, remove, propagation status | built · complete |
| 5 | **Schema and policy view** — allowed fields, contract version, read-only | built · retention and sensitivity have no endpoint |
| 6 | **Quality review** — golden-set runs, failure clusters, comparisons | built · blocked, `data/golden-sets/` does not exist |
| 7 | **Audit trace** — decisions, identifiers, timestamps, redacted outcomes | built · complete |

Each screen states on itself which of its required parts have no data source, and
why. No number is invented.

## The controls app

`abc.md:51` asks for five listener paths: review, correct, remove, pause, opt out.

| Path | State |
|---|---|
| Review | built |
| Correct | built |
| Remove, with propagation status | built |
| Pause | not connected — no endpoint changes consent state |
| Opt out | not connected — same reason |

The two unconnected controls are shown disabled with the reason, rather than as
switches that would appear to work.

---

## Running it

Four terminals. The first two are in the backend repository.

```bash
# 1 - the API
python -m uvicorn memory.api:app --reload --port 8000

# 2 - the worker, which turns events into memories
python scripts/run_processor.py --forever

# 3 - the operator console            http://localhost:3000
cd apps/memory-console && npm install && npm run dev

# 4 - the listener controls           http://localhost:3001
cd apps/memory-controls && npm install && npm run dev
```

The worker is the one people forget. Without it, events are accepted and no
memory ever appears, which looks exactly like a bug.

**One-time setup per app.** Each needs the backend's signing secret, because each
signs its own requests — there is no login and nothing to paste:

```bash
cp apps/memory-console/.env.local.example  apps/memory-console/.env.local
cp apps/memory-controls/.env.local.example apps/memory-controls/.env.local
# then put the backend's MEMORY_JWT_SECRET in both
```

Neither variable is prefixed `NEXT_PUBLIC_`, so neither reaches a browser. See
[how-authentication-works.doc.md](docs/how-authentication-works.doc.md).

In the console, pick which test subject to view as from the dropdown at the top.
The controls app is fixed to one listener, which is the point of it.

---

## Documents

One per screen: what it shows, which requirement line it comes from, the call
flow through to the store, and the functions behind it.

| | |
|---|---|
| [overview.doc.md](docs/overview.doc.md) | Screen 1 |
| [memory-explorer.doc.md](docs/memory-explorer.doc.md) | Screen 2 |
| [context-preview.doc.md](docs/context-preview.doc.md) | Screen 3 |
| [correction-and-deletion.doc.md](docs/correction-and-deletion.doc.md) | Screen 4 |
| [schema-and-policy.doc.md](docs/schema-and-policy.doc.md) | Screen 5 |
| [quality-review.doc.md](docs/quality-review.doc.md) | Screen 6 |
| [audit-trace.doc.md](docs/audit-trace.doc.md) | Screen 7 |
| [memory-controls.doc.md](docs/memory-controls.doc.md) | The listener app |
| [how-authentication-works.doc.md](docs/how-authentication-works.doc.md) | Why there is nothing to paste |

---

## How the code is laid out

Both apps share the same shape.

| | |
|---|---|
| `app/layout.tsx` | The frame |
| `app/<screen>/page.tsx` | One screen |
| `app/api/backend/[...path]/route.ts` | The gateway: mints the token, forwards the request |
| `components/Nav.tsx` | The sidebar — one entry per required screen (console only) |
| `components/SubjectBar.tsx` | Which test subject to view as (console only) |
| `components/ui.tsx` | Card, Field, Button, Badge, ScoreBar, Stat, ErrorNote |
| `lib/api.ts` | The only place that calls the backend |
| `lib/types.ts` | Response shapes, mirroring the backend's Pydantic models |
| `lib/subjects.ts` | The approved test identities (`abc.md:340`) |
