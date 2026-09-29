# Spotify Personalized AI — frontend

The operator consoles for the governed memory system. The backend lives in its
own repository, because the two deploy separately:

**Backend:** https://github.com/omsemwal/spotify-personalized-ai

---

## What is in here

```
apps/
  memory-console/     Next.js 16, TypeScript, Tailwind — the operator screens
```

`abc.md:200` names the stack: *Next.js, React, Tailwind CSS*.

---

## The screens

From `abc.md:339-345`. One entry per screen the specification asks for.

| Screen | What it is for | State |
|---|---|---|
| Overview | Service health, ingestion lag, fallback rate, deletion backlog | health only |
| Memory explorer | One subject's memories: timeline, relationships, source, confidence | not built |
| **Context preview** | **Intent and surface in; retrieval, ranking, policy removals, the pack and its token cost out** | **built** |
| Correction and deletion | Correct or remove a memory, with propagation status | not built |
| Schema and policy | Read-only: allowed fields, retention, sensitivity, eligibility | not built |
| Audit trace | Decisions, memory identifiers, outcomes — no memory text | not built |
| Quality review | Golden-set runs, failure clusters, multilingual cases | blocked — the backend has no golden sets yet |

---

## Running it

The backend has to be up first — the consoles are a window onto it, and hold no
data of their own.

**1. Start the backend** (in the backend repository, two terminals):

```bash
python -m uvicorn memory.api:app --reload --port 8000
python scripts/run_processor.py --forever
```

**2. Start the console:**

```bash
cd apps/memory-console
npm install
npm run dev
```

Open **http://localhost:3000**.

**3. Paste a token.** There is no login screen, and that is deliberate: the
backend's callers are services, so it mints per-subject service tokens and has
no user accounts. Make one in the backend repository:

```bash
python scripts/make_token.py user_001
```

Paste it into the bar across the top of the console. It lasts fifteen minutes,
and the bar counts down so an expiry never looks like a bug.

---

## Pointing at a different backend

```bash
cp apps/memory-console/.env.local.example apps/memory-console/.env.local
# then edit
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

The backend allows this origin explicitly (its `memory/api.py` CORS list), so a
new origin has to be added there too.

---

## How the code is laid out

| | |
|---|---|
| `app/layout.tsx` | The frame: sidebar, token bar, screen |
| `app/page.tsx` | Overview |
| `app/context/page.tsx` | Context preview |
| `components/Nav.tsx` | The sidebar, one entry per screen |
| `components/TokenBar.tsx` | Where the operator's token goes, and when it dies |
| `components/ui.tsx` | Card, Field, Button, Badge, ScoreBar, Stat, ErrorNote |
| `lib/api.ts` | The only place that calls the backend |
| `lib/types.ts` | The response shapes, mirroring the backend's models |
| `docs/` | One document per screen: what it shows and how the calls flow |
