# Quality review — screen document

**Screen 6 of 7** · **Route:** `/quality` · **File:** `apps/memory-console/app/quality/page.tsx`

**Requirement — `abc.md:344`:** *"Quality review: Golden-set runs, failure
clusters, multilingual cases, contradiction cases, and side-by-side
memory-enabled comparisons."*

---

## Call flow

There is none. This screen makes no request, because there is nothing to request.

All five things asked for need a **golden set**: cases with a known expected
result, so a run can be scored. `abc.md:148` and `abc.md:239` require them, and
`abc.md:295` says what each case must specify — expected graph state, expected top
memories, prohibited memories, context budget, and the correction or deletion
outcome.

The backend has none. `data/golden-sets/` does not exist, and no endpoint runs an
evaluation or reports a score.

---

## Why it shows no numbers

A launch decision depends on this screen. `abc.md:361`:

> *"No launch if cross-subject leakage is observed, deletion propagation is
> incomplete, provenance falls below threshold, or personalized output materially
> underperforms the memory-disabled baseline."*

A placeholder precision figure on the screen that gates a release is worse than an
empty one. So the screen shows the five required parts, each marked **blocked**,
each with the specific thing standing between it and a number.

It also lists the two checks that **do** run today, so the screen is not simply
empty: the backend's test suite, and `scripts/verify_endpoints.py`, which checks
all ten endpoints against the requirement lines they come from. That is the nearest
thing to a golden-set run that exists, but it checks behaviour rather than
retrieval precision, and the screen says so.

---

## What each part needs

| Asked for | What is missing |
|---|---|
| Golden-set runs | The cases themselves, under `data/golden-sets/`, then an endpoint to run them |
| Failure clusters | Scored runs to group — with no run there is no failure to cluster |
| Multilingual cases | Cases in more than one language. The retrieval path already works cross-lingually; nothing records that as a scored case |
| Contradiction cases | Cases where one memory contradicts another, with the expected supersession outcome. Supersession is implemented; the cases that check it are not |
| Side-by-side comparisons | A memory-disabled baseline, which means cohort allocation (`abc.md:146`). No cohort assignment exists, and no endpoint accepts a memory-disabled flag |

---

## Functions

| Function | File | Why it exists |
|---|---|---|
| `QualityReviewPage()` | `app/quality/page.tsx` | The screen. Static — it holds no state and makes no call. |
| `REQUIRED` | same | The five parts the requirement asks for, each with what it needs to exist, so the gap is actionable rather than vague. |

---

## What would unblock it

Three things, in order:

1. Golden cases under `data/golden-sets/`, each specifying what `abc.md:295`
   requires.
2. A backend scorer that runs them and reports precision at the top of the
   retrieved set, contradiction rate and provenance completeness.
3. Cohort allocation, so a memory-disabled baseline exists to compare against.

Until the first exists, nothing on this screen can be filled in honestly.
