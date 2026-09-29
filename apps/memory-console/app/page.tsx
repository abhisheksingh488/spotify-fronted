"use client";

// Why this file exists
// ====================
//
// Screen 1 of 7. abc.md:339 - "Overview: Service health, ingestion lag,
// retrieval SLO, fallback rate, quality metrics, experiment status, and
// deletion backlog."
//
// Seven things are asked for. The backend reports three of them through
// GET /health and GET /metrics. The other four have no endpoint behind them, so
// this screen names them and says so instead of inventing a number - a made-up
// SLO on an operations console is worse than an empty one.

import { useEffect, useState } from "react";
import { ApiFailure, get, getHealth } from "@/lib/api";
import type { Metrics } from "@/lib/types";
import { Badge, Card, ErrorNote, Stat } from "@/components/ui";

// The four numbers abc.md:339 asks for that no endpoint reports, each with the
// reason. Shown rather than hidden, because a missing metric is an operational
// fact an operator needs to know about.
const NOT_INSTRUMENTED = [
  {
    label: "Retrieval SLO",
    why: "abc.md:170 sets a 250 ms P95 budget, but no endpoint reports per-request latency, so there is nothing to average.",
  },
  {
    label: "Fallback rate",
    why: "POST /v1/context/compose returns no_memory per request; nothing aggregates it across requests.",
  },
  {
    label: "Quality metrics",
    why: "abc.md:148 wants precision and contradiction rate from golden-set runs. data/golden-sets/ does not exist yet.",
  },
  {
    label: "Experiment status",
    why: "abc.md:146 asks for memory-enabled and memory-disabled cohorts. No cohort allocation is implemented.",
  },
  {
    label: "Deletion backlog",
    why: "Deletion jobs are stored in PostgreSQL, but the only read is GET /v1/deletions/{job_id} - one job at a time, with no queue view.",
  },
];

export default function OverviewPage() {
  const [health, setHealth] = useState<"checking" | "up" | "down">("checking");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  // Ask once on load, then every ten seconds, so an operator watching this
  // screen sees ingestion lag move rather than a frozen number.
  useEffect(() => {
    let live = true;

    async function refresh() {
      try {
        await getHealth();
        if (live) setHealth("up");
      } catch {
        if (live) setHealth("down");
        return;
      }
      try {
        const next = await get<Metrics>("/metrics");
        if (live) {
          setMetrics(next);
          setFailure(null);
        }
      } catch (error) {
        if (live) setFailure(error as ApiFailure);
      }
    }

    refresh();
    const timer = setInterval(refresh, 10000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  // Ingestion lag in words. Seconds are precise and unreadable past a minute.
  function lagText(seconds: number | null): string {
    if (seconds === null) return "no events yet";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="mt-1 text-sm text-muted">
          Service health, ingestion lag and policy rejections. Refreshes every
          ten seconds.
        </p>
      </header>

      {/* Service health - the first thing abc.md:339 asks for. */}
      <Card title="Service health" hint="GET /health">
        {health === "checking" && <Badge>checking…</Badge>}
        {health === "up" && <Badge tone="good">memory service is up</Badge>}
        {health === "down" && (
          <div>
            <Badge tone="bad">memory service is down</Badge>
            <p className="mt-2 text-sm text-muted">
              Start the API, and the worker beside it:
            </p>
            <pre className="mt-2 rounded-lg border border-edge bg-base p-3 font-mono text-[11px] text-muted">
              {"python -m uvicorn memory.api:app --reload --port 8000\npython scripts/run_processor.py --forever"}
            </pre>
          </div>
        )}
      </Card>

      {failure && (
        <ErrorNote
          code={failure.code}
          message={failure.message}
          correlationId={failure.correlationId}
        />
      )}

      {metrics && (
        <>
          {/* Ingestion lag - the second thing abc.md:339 asks for. */}
          <Card
            title="Ingestion lag"
            hint="How long ago the newest event arrived. If this grows, events have stopped coming in."
          >
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-semibold tabular-nums text-ink">
                {lagText(metrics.ingestion_lag_seconds)}
              </span>
              <Badge
                tone={
                  metrics.ingestion_lag_seconds === null
                    ? "neutral"
                    : metrics.ingestion_lag_seconds < 300
                      ? "good"
                      : "warn"
                }
              >
                {metrics.ingestion_lag_seconds === null
                  ? "nothing ingested"
                  : metrics.ingestion_lag_seconds < 300
                    ? "fresh"
                    : "quiet"}
              </Badge>
            </div>
          </Card>

          {/* Event intake and the policy rejection rate - abc.md:143. */}
          <Card title="Event intake" hint="Counts from the audit trail.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="accepted" value={metrics.events.accepted} />
              <Stat label="rejected" value={metrics.events.rejected} />
              <Stat label="duplicate (idempotent)" value={metrics.events.duplicate} />
              <Stat label="stored raw events" value={metrics.events.stored} />
            </div>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted">Policy rejection rate</span>
                <span className="font-mono text-ink">
                  {(metrics.rejection_rate * 100).toFixed(1)}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-raised">
                <div
                  className={`h-2 rounded-full ${
                    metrics.rejection_rate > 0.3 ? "bg-warn" : "bg-accent"
                  }`}
                  style={{ width: `${Math.min(100, metrics.rejection_rate * 100)}%` }}
                />
              </div>
            </div>
          </Card>

          {/* Why things were refused. abc.md:143 - "policy rejection rate". */}
          <Card
            title="Top rejection reasons"
            hint="The stable error code each refusal returned."
          >
            {Object.keys(metrics.rejections_by_reason).length === 0 ? (
              <p className="text-sm text-muted">Nothing has been refused.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {Object.entries(metrics.rejections_by_reason)
                  .sort((a, b) => b[1] - a[1])
                  .map(([reason, count]) => (
                    <li
                      key={reason}
                      className="flex items-center justify-between rounded-lg border border-edge bg-raised px-3 py-1.5"
                    >
                      <span className="font-mono text-xs text-muted">{reason}</span>
                      <span className="text-sm font-semibold tabular-nums text-ink">
                        {count}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {/* What abc.md:339 asks for that cannot be shown. Named, with the
          reason, rather than left off the screen or filled with a guess. */}
      <Card
        title="Not instrumented"
        hint="abc.md:339 asks for these. No endpoint reports them, so no number is shown."
      >
        <ul className="flex flex-col gap-2">
          {NOT_INSTRUMENTED.map((item) => (
            <li
              key={item.label}
              className="rounded-lg border border-edge bg-raised/40 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted">{item.label}</span>
                <Badge tone="warn">no data source</Badge>
              </div>
              <p className="mt-1 text-[11px] text-faint">{item.why}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
