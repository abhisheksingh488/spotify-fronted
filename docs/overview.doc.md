# Overview — screen document

**Screen 1 of 7** · **Route:** `/` · **File:** `apps/memory-console/app/page.tsx`

**Requirement — `abc.md:339`:** *"Overview: Service health, ingestion lag,
retrieval SLO, fallback rate, quality metrics, experiment status, and deletion
backlog."*

---

## Call flow

This screen starts on load, then repeats every ten seconds.

1. **`refresh()`** — `app/page.tsx`
   Asks for health first. If the service is down there is nothing else worth
   asking for, so it stops there.

2. **`getHealth()`** → **`get("/health")`** — `lib/api.ts`
   Through `/api/backend/health` on the console's own server, which mints the
   token and forwards it.
   → **Backend `GET /health`** — answers `{"status": "ok"}` and touches no store.

3. **`get<Metrics>("/metrics")`** — `lib/api.ts`
   → **Backend `GET /metrics`** → **`db.ingestion_metrics()`** in `memory/db.py`
   → reads **PostgreSQL**: `audit_log` grouped by outcome and by reason, and
   `max(received_at)` from `ingested_event` for the lag.

4. **`setMetrics()`** — renders four cards: health, ingestion lag, event intake
   with the rejection rate, and the rejection reasons.

Everything comes from the audit table the backend already writes, so there is no
separate counter that could drift out of step with reality.

---

## What is shown, against the requirement

`abc.md:339` asks for seven things. Three have a data source.

| Asked for | Shown |
|---|---|
| Service health | Yes — `GET /health` |
| Ingestion lag | Yes — seconds since the newest event, in words |
| Retrieval SLO | **No** — nothing reports per-request latency |
| Fallback rate | **No** — `no_memory` is per request, never aggregated |
| Quality metrics | **No** — needs golden sets, which do not exist |
| Experiment status | **No** — no cohort allocation is implemented |
| Deletion backlog | **No** — only one job at a time is readable |

The four missing ones are listed on the screen in a **Not instrumented** card,
each with the reason. This follows the backend README's own convention: an
operations console must not show an invented number, and must not quietly omit a
metric an operator is looking for.

Two extra numbers are shown beyond the list, because `/metrics` returns them and
`abc.md:143` asks for them: the **policy rejection rate** and the **top rejection
reasons**.

---

## Functions

| Function | File | Why it exists |
|---|---|---|
| `OverviewPage()` | `app/page.tsx` | The screen; holds health, metrics and any failure. |
| `refresh()` | same | One poll: health, then metrics. Stops early if the service is down. |
| `lagText()` | same | Seconds into words — `42s`, `18m`, `2.1h`. Seconds alone are unreadable past a minute. |
| `NOT_INSTRUMENTED` | same | The four missing metrics and the reason for each, so the gap is on the screen rather than in a document. |
| `getHealth()` | `lib/api.ts` | The unauthenticated health check, through the same gateway as everything else. |
| `get()` | `lib/api.ts` | A GET through the gateway; the token is added server-side. |
| `Stat`, `Card`, `Badge`, `ErrorNote` | `components/ui.tsx` | A number with a caption, a panel, a state pill, a failure with its stable code. |

---

## Worth pointing at

**Stop the backend and watch this screen.** Within ten seconds it turns red and
prints the two commands that start the API and the worker. That is the fallback
behaviour `abc.md:158` asks for, applied to the console itself.
