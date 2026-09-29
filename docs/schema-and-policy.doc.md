# Schema and policy — screen document

**Screen 5 of 7** · **Route:** `/policy` · **File:** `apps/memory-console/app/policy/page.tsx`

**Requirement — `abc.md:343`:** *"Schema and policy view: Read-only view for most
roles; version history, allowed fields, retention, sensitivity, and rollout
state."*

---

## Call flow

1. **`useEffect`** on load → **`get<OpenApi>("/openapi.json")`** — `lib/api.ts`
   → `/api/backend/openapi.json` on the console's own server, which mints the
   token and forwards it.
   → **Backend `GET /openapi.json`** — FastAPI generates this from the Pydantic
   models in `memory/models.py`. It touches no store.

2. **`setSpec()`** — renders the contract version, one card per contract, then the
   parts that have no data source.

That is the only call. The screen is read-only in the strongest sense: there is
nothing to press, and the one endpoint it uses cannot change anything.

---

## Why it reads the live contract instead of a copied table

Every field, type, constraint and allowed value on this screen is generated from
the models the running service validates against. A hand-written table would drift
the first time a field changed; this cannot. If the backend adds an `event_type`,
it appears here without anyone editing the frontend.

---

## What is shown, against the requirement

| Asked for | Shown |
|---|---|
| Read-only for most roles | Yes — nothing on the screen writes |
| Allowed fields | Yes — per contract, with type, required or optional, length and range limits, defaults and enumerated values |
| Version history | Partly — the API version and the one accepted `schema_version` (1.0); no past versions or migrations |
| Retention | **No** — see below |
| Sensitivity | **No** — see below |
| Rollout state | **No** — nothing in the backend tracks it |

**Retention, sensitivity and retrieval eligibility** live in the backend's
`data/policy_registry.yaml` — exclusion 730 days, correction 730,
explicit_preference 365, candidate_preference 90, episode 30, all `normal`
sensitivity — and **no endpoint serves that file**. They are observable one memory
at a time inside a `POST /v1/memories/extract` response, never as a registry.

No copy of those values is embedded in this screen, on purpose. A duplicated policy
table that silently disagreed with the one being enforced would be worse than an
empty card, so the screen names the gap and says where the truth lives.

---

## Functions

| Function | File | Why it exists |
|---|---|---|
| `SchemaAndPolicyPage()` | `app/policy/page.tsx` | The screen; holds the fetched OpenAPI document. |
| `constraints()` | same | One field's type and limits as a single readable line, unwrapping the `anyOf [type, null]` shape a nullable field arrives in. |
| `CONTRACTS` | same | The seven contracts worth showing, in the order a request travels through them — not all 25 schemas, because the internal ones are not part of what a caller may send. |
| `NO_DATA_SOURCE` | same | What the requirement asks for that no endpoint reports, with the reason for each. |
| `get()` | `lib/api.ts` | The one GET this screen makes. |

---

## Worth pointing at

**The enumerated values.** `event_type` shows all seven accepted values,
`memory_type` all five, `surface` all three, `consent_state` all three. These are
the closed lists that stop a caller inventing a value — the same lists that make
`422 VALIDATION_FAILED` happen before any application code runs.
