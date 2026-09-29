"use client";

// Why this file exists
// ====================
//
// Screen 6 of 7. abc.md:344 - "Quality review: Golden-set runs, failure
// clusters, multilingual cases, contradiction cases, and side-by-side
// memory-enabled comparisons."
//
// Every one of those five needs a golden set: a set of cases with an expected
// result, so a run can be scored. abc.md:148 and abc.md:239 require them, and
// abc.md:295 says what each case must specify. The backend has none -
// data/golden-sets/ does not exist - and there is no endpoint to run an
// evaluation or report a score.
//
// So this screen shows no numbers. Inventing a precision figure on the screen a
// release gate depends on (abc.md:361 blocks launch on provenance and
// regression thresholds) would be worse than an honest empty state. What it does
// show is precisely what is missing, and what each part would need, so the gap
// is actionable rather than vague.

import { Badge, Card } from "@/components/ui";

// The five things abc.md:344 asks for, and what each one needs to exist.
const REQUIRED = [
  {
    label: "Golden-set runs",
    needs:
      "A set of cases under data/golden-sets/, each specifying the expected graph state, expected top memories, prohibited memories, context budget and correction or deletion outcome (abc.md:295). Then an endpoint to run them and report a score.",
  },
  {
    label: "Failure clusters",
    needs:
      "Scored runs to group. With no run there is no failure to cluster.",
  },
  {
    label: "Multilingual cases",
    needs:
      "Golden cases written in more than one language (abc.md:148). The retrieval path already works across languages — the embedding model is multilingual, and a Spanish intent does match an English memory — but nothing records that as a scored case.",
  },
  {
    label: "Contradiction cases",
    needs:
      "Golden cases where one memory contradicts another, with the expected supersession outcome. The backend implements supersession (PATCH /v1/memories/{id}); what is missing is the cases that check it.",
  },
  {
    label: "Side-by-side memory-enabled comparisons",
    needs:
      "A memory-disabled baseline to compare against, which means cohort allocation (abc.md:146). No cohort assignment exists, and no endpoint accepts a memory-disabled flag.",
  },
];

export default function QualityReviewPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold">Quality review</h1>
        <p className="mt-1 text-sm text-muted">
          Golden-set runs, failure clusters and memory-enabled comparisons.
        </p>
      </header>

      <Card title="Nothing to show yet">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warn">no golden sets</Badge>
            <Badge tone="warn">no evaluation endpoint</Badge>
            <Badge tone="warn">no cohort allocation</Badge>
          </div>

          <p className="text-sm text-muted">
            This screen scores the system against cases with known expected
            results. The backend has no such cases —{" "}
            <span className="font-mono text-xs">data/golden-sets/</span> does not
            exist — and no endpoint runs an evaluation or reports a score.
          </p>

          <p className="text-sm text-muted">
            No number is shown here on purpose. A launch decision depends on this
            screen (<span className="whitespace-nowrap">abc.md:361</span> blocks
            release if provenance falls below threshold or personalized output
            underperforms the memory-disabled baseline), so a placeholder figure
            would be worse than an empty one.
          </p>
        </div>
      </Card>

      <Card
        title="What each part needs"
        hint="abc.md:344 asks for five things. This is what stands between each of them and a number."
      >
        <ul className="flex flex-col gap-2">
          {REQUIRED.map((item) => (
            <li
              key={item.label}
              className="rounded-lg border border-edge bg-raised/40 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted">{item.label}</span>
                <Badge tone="warn">blocked</Badge>
              </div>
              <p className="mt-1 text-[11px] text-faint">{item.needs}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="What does exist" hint="Checks that run today, outside this screen.">
        <ul className="flex flex-col gap-2 text-sm text-muted">
          <li className="rounded-lg border border-edge bg-raised px-3 py-2">
            <span className="font-mono text-xs text-ink">python -m pytest -q</span>
            <p className="mt-1 text-[11px] text-faint">
              Unit and integration tests in the backend repository, including
              cross-subject isolation and prompt-injection containment.
            </p>
          </li>
          <li className="rounded-lg border border-edge bg-raised px-3 py-2">
            <span className="font-mono text-xs text-ink">
              python scripts/verify_endpoints.py
            </span>
            <p className="mt-1 text-[11px] text-faint">
              Checks all ten endpoints against the requirement lines they come
              from. This is the closest thing to a golden-set run that exists,
              but it checks behaviour rather than retrieval precision.
            </p>
          </li>
        </ul>
      </Card>
    </div>
  );
}
