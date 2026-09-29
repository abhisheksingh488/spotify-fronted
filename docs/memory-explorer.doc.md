# Memory explorer — screen document

**Screen 2 of 7** · **Route:** `/memories` · **File:** `apps/memory-console/app/memories/page.tsx`

**Requirement — `abc.md:340`:** *"Subject-scoped memory explorer: Search only with
approved support or test identities; show timeline, graph relationships, source
type, confidence, and status."*

---

## Call flow

1. **`load(query)`** — `app/memories/page.tsx`
   Runs on arrival, and again whenever the subject or the surface changes. An
   empty search box becomes a broad intent, which is how the screen lists
   everything rather than only what matches a phrase.

2. **`post("/v1/memories/search", …)`** — `lib/api.ts`
   → `/api/backend/v1/memories/search` on the console's own server, which mints
   the token for the selected subject and forwards it.
   → **Backend `POST /v1/memories/search`** → **`retrieval.search()`** in
   `memory/retrieval.py`:
   - **Neo4j** — `graph_candidates()` walks `:ABOUT` edges for relational matches
   - **Neo4j vector index** — `similar()` for semantic matches on `embedding_384`
   - **PostgreSQL** — `db.negative_feedback()`, one of the six scoring signals
   - the policy registry then drops types this surface may not use

3. **`setResult()`** — renders four cards: the counts, what policy hides on this
   surface, the memories themselves, and the one field that cannot be shown.

Filtering by type happens in the browser on the results already returned; it is a
view control, not another query.

---

## "Search only with approved support or test identities"

This is why there is no free-text subject box on this screen.

The subject comes from the picker in the header, whose list is
`lib/subjects.ts` — the five identities the backend's migration seeds. The
console's gateway checks the cookie against that same list **before it signs a
token**, so editing the cookie by hand cannot widen what the console can reach.
Verified: a cookie naming `somebody_elses_account` comes back acting as
`user_001`.

---

## What is shown, against the requirement

Five things are asked for. Three are returned by the endpoint.

| Asked for | Shown |
|---|---|
| Source type | Yes — the memory type, plus *stated* or *observed* |
| Confidence | Yes — on every memory |
| Graph relationships | Yes — the canonical entities each memory is `:ABOUT` |
| Status | Partly — `active` only, because search returns nothing else |
| Timeline | **No** — see below |

**Timeline** is the real gap. The graph stores `recorded_at`, `valid_from` and
`valid_to` on every memory, and `RankedMemory` returns none of them, so memories
cannot be placed in time. Superseded and expired memories are not returned either,
so the other statuses cannot be shown. Both facts are stated in a **Not
available** card on the screen.

Two things are shown beyond the list, because they explain what the operator is
looking at: how many candidates the graph held versus how many are retrievable
here, and the per-type counts.

---

## Functions

| Function | File | Why it exists |
|---|---|---|
| `MemoryExplorerPage()` | `app/memories/page.tsx` | The screen; holds the query, surface, type filter and results. |
| `load()` | same | One search for the selected subject. Turns an empty box into a broad intent. |
| `sourceClass()` | same | Stated or observed — the distinction that matters most when judging whether a memory should have been used. |
| `TYPES` | same | The five memory types `abc.md:112` names, for the filter. |
| `useSubject()` | `lib/useSubject.ts` | The subject the console is acting as, so the request body matches the token. |
| `post()` | `lib/api.ts` | A POST through the gateway. |
| `typeTone()` | `components/ui.tsx` | Green for stated, amber for inferred, red for an exclusion. |

---

## Worth pointing at

**Switch the surface from chat to player.** Episodes and candidate preferences
disappear, and the **Held, but not retrievable on this surface** card names each
one and why. That is the policy registry being enforced, visible rather than
described.
