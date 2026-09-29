# Full flow — screen document

**Route:** `/flow`
**File:** `apps/memory-console/app/flow/page.tsx`
**Covers:** all ten endpoints, `abc.md:303-322`

---

## What this screen is for

Every other screen answers one question. This one proves the pipeline actually
joins up.

An event goes in, a memory comes out, it gets found, ranked, packed into a
prompt, corrected, fed back on, deleted across every store, and the trace
explains what happened. Ten buttons, in the order the endpoints depend on each
other, against the live backend.

Nothing is faked. Each step shows the request it sent and the response it got,
and each step hands its identifiers to the next.

---

## Call flow

The screen holds one object, `flow`, and each step reads what it needs from it
and writes back what the next step needs. That chaining is the whole point — it
is what makes this a flow rather than ten unrelated calls.

```
step 1  POST   /v1/events                        -> event_id
step 2  POST   /v1/memories/extract              <- event_id        -> candidates
step 3  POST   /v1/memories                      <- event_id, fact  -> memory_id, graph_version
step 4  POST   /v1/memories/search                                  -> ranked results
step 5  POST   /v1/context/compose                                  -> context pack, trace_id
step 6  PATCH  /v1/memories/{memory_id}          <- memory_id, graph_version
                                                                    -> NEW memory_id, superseded
step 7  POST   /v1/feedback                      <- memory_id, trace_id
step 8  DELETE /v1/memories/{memory_id}          <- memory_id       -> job_id
step 9  GET    /v1/deletions/{job_id}            <- job_id          -> one status per store
step 10 GET    /v1/traces/{trace_id}             <- trace_id        -> decisions, audited actions
```

Each of those ten calls goes through **`post`, `get`, `patch` or `del` in
`lib/api.ts`**, which attaches the bearer token, sends the JSON and turns a
failure into an `ApiFailure` carrying the backend's stable code. The panel
**Identifiers being carried forward** shows what the flow is holding at any
moment, so the chaining is visible rather than implied.

Which stores each step touches, on the backend side:

| Step | Reaches |
|---|---|
| 1 | **PostgreSQL** (consent, the event), **Redis** (idempotency, rate limit), **Redpanda** (the queue) |
| 2 | **PostgreSQL** (the stored event), **Gemini** (classification) |
| 3 | **Neo4j** (the memory node and its relationships), **the local embedding model** (384 dimensions) |
| 4 | **Neo4j** (graph and vectors), **PostgreSQL** (negative feedback, one of six signals) |
| 5 | **PostgreSQL** (consent), **Neo4j** (retrieval again) |
| 6 | **Neo4j** (supersede, never overwrite), **PostgreSQL** (audit) |
| 7 | **PostgreSQL** (the feedback row) |
| 8 | **Neo4j** (eligibility revoked at once), **PostgreSQL** (the job) |
| 9 | **PostgreSQL** (the job's per-store status) |
| 10 | **PostgreSQL** (decisions and the audit trail) |

---

## Two things this screen gets right that are easy to get wrong

Both were found by running the flow for real, not by reading the code.

**`subject_id` is a query parameter on steps 8, 9 and 10.** A `DELETE` has no
body, and the two `GET`s have no body either, so those three endpoints take the
subject in the query string. Leaving it off answers `422 VALIDATION_FAILED`
rather than anything that hints at the cause. Steps 1 to 7 take it in the body.

**Step 3 is not searchable the instant it returns.** `POST /v1/memories` writes
the memory to the graph immediately but stores its embedding as a background
task, so for a second or two the memory exists and cannot be found. Searching
straight away reported *not found*, which looks like a bug in retrieval and is
not one. Step 4 now retries for up to eight seconds and says on screen that it
waited, and why.

---

## Functions this screen uses

### `app/flow/page.tsx`

| Function | Why it exists |
|---|---|
| `FullFlowPage()` | The screen: holds the shared inputs, the `flow` object, the failures and which step is running. |
| `step()` | Runs one step — remembers the request, calls the backend, keeps the result or the failure. Every step below is three lines because of this. |
| `runEvent()` | Step 1. Uses a fresh idempotency key each press, because the same key correctly returns the first event instead of making a new one, which is confusing to watch. |
| `runExtract()` | Step 2. Also copies the strongest candidate into step 3's fields, still editable. |
| `runCreate()` | Step 3. Stores the approved memory and keeps its id and version. |
| `runSearch()` | Step 4. Retries until the new memory is indexed, and records how long it waited. |
| `runCompose()` | Step 5. Keeps the `trace_id`, which step 10 needs. |
| `runCorrect()` | Step 6. Sends the version last seen, and repoints the flow at the new memory the correction creates. |
| `runFeedback()` | Step 7. Ties the feedback to both the memory and the trace. |
| `runDelete()` | Step 8. Keeps the `job_id`. |
| `runStatus()` | Step 9. Reads one status per store. |
| `runTrace()` | Step 10. Reads the decisions back by identifier. |
| `reset()` | Clears the run so it can be done again without reloading. |
| `Step` | One step's frame: number, endpoint, requirement line, why it exists, the run button, the request, the response, and the reason it cannot run yet. |
| `Carried` | One identifier the flow is holding, or a dash when that step has not run. |

### `lib/api.ts`

| Function | Why it exists |
|---|---|
| `request()` | The only function that actually calls the backend. Everything below is a wrapper. |
| `post()` | Steps 1, 2, 3, 4, 5 and 7. |
| `get()` | Steps 9 and 10. |
| `patch()` | Step 6. |
| `del()` | Step 8. Named `del` because `delete` is a reserved word. |
| `claim()` | Reads one JWT claim for display. We never trust it — the backend verifies the signature. |
| `ApiFailure`, `toFailure()` | Carry the backend's stable code and correlation id, so a failed step says what went wrong and where to find it. |

---

## What each step demonstrates

| Step | The requirement it shows working |
|---|---|
| 1 | `abc.md:303` — validation, consent, idempotency, and a fast path that never waits for a model |
| 2 | `abc.md:305` — a bounded taxonomy, deterministic policy classes, and visible rejections |
| 3 | `abc.md:306` — a stable id, a graph version and a policy state |
| 4 | `abc.md:309` — ranked, subject-scoped results with the six signals behind the score |
| 5 | `abc.md:311` — policy applied, budget honoured, memory text fenced as data |
| 6 | `abc.md:313` — supersede rather than overwrite, under optimistic concurrency |
| 7 | `abc.md:318` — feedback recorded without letting the model validate itself |
| 8 | `abc.md:315` — a traceable job id, and eligibility revoked at once |
| 9 | `abc.md:317` — one status per store, so a partial deletion cannot hide |
| 10 | `abc.md:320` — decisions, identifiers and outcomes, with no memory text |

---

## Worth pointing at in a demo

**Step 2 failing is a feature.** If Gemini is busy it answers `503
SERVICE_UNAVAILABLE`, the screen shows the code, and step 3 still runs. The
system degrades rather than stopping.

**Step 6 twice.** Press it a second time without resetting. The version has
moved on, so the backend answers `409 CONFLICT` and names the version it is
actually at — nobody's edit is silently lost.

**Step 9's backup line.** It says `retained_by_policy`, not `deleted`. That is
the honest answer for a backup inside its retention window, and saying so is
the requirement.

**Step 10 holds no memory text at all** — stages, decisions, identifiers,
scores and reasons only. That is why it is safe for an operator to read.

---

## What is not here

- **Subject-wide deletion.** The backend deletes one memory per job; there is
  no "delete everything for this subject" endpoint yet.
- **Feedback changing the ranking.** Step 7 records reinforcement and says
  whether it was allowed, but the backend does not yet apply it to a later
  score.
- **The MCP tool path.** `abc.md:260` lists an MCP server as a sixth service.
  It is not built, so no step here goes through it.
