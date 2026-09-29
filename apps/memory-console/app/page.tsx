"use client";

// Why this file exists
// ====================
//
// The landing page. It does two small jobs: says whether the backend is
// reachable, and names the operator screens with an honest note on which are
// built yet. The full Overview - ingestion lag, fallback rate, deletion
// backlog (abc.md:339) - is added to this page when the screen is built.

import Link from "next/link";
import { useEffect, useState } from "react";
import { API_BASE, getHealth } from "@/lib/api";
import { Badge, Card } from "@/components/ui";

// The screens from abc.md:339-345, with what each one is for.
const SCREENS = [
  {
    href: "/flow",
    label: "Full flow",
    line: "All ten endpoints end to end: an event in, a memory out, found, ranked, packed, corrected, deleted across every store, and the trace that explains it.",
    ready: true,
  },
  {
    href: "/context",
    label: "Context preview",
    line: "Enter an intent and surface; see retrieval, ranking, policy removals, the final pack and its token cost.",
    ready: true,
  },
  {
    href: "/memories",
    label: "Subject-scoped memory explorer",
    line: "What we hold for one subject: timeline, relationships, source type, confidence, status.",
    ready: false,
  },
  {
    href: "/corrections",
    label: "Correction and deletion",
    line: "Correct or remove a memory, and watch propagation finish rather than half-finish.",
    ready: false,
  },
  {
    href: "/policy",
    label: "Schema and policy",
    line: "Read-only: allowed fields, retention, sensitivity and retrieval eligibility per memory type.",
    ready: false,
  },
  {
    href: "/trace",
    label: "Audit trace",
    line: "For one trace id: the decisions taken, memory identifiers and outcomes. No memory text.",
    ready: false,
  },
];

export default function HomePage() {
  const [health, setHealth] = useState<"checking" | "up" | "down">("checking");

  // Ask the backend once, on load. /health needs no token.
  useEffect(() => {
    getHealth()
      .then(() => setHealth("up"))
      .catch(() => setHealth("down"));
  }, []);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="mt-1 text-sm text-muted">
          Operator views over the governed memory layer.
        </p>
      </header>

      <Card title="Backend" hint={API_BASE}>
        {health === "checking" && <Badge>checking...</Badge>}
        {health === "up" && <Badge tone="good">reachable</Badge>}
        {health === "down" && (
          <div className="text-sm">
            <Badge tone="bad">unreachable</Badge>
            <p className="mt-2 text-muted">
              Start the API, and the worker beside it:
            </p>
            <pre className="mt-2 rounded-lg border border-edge bg-base p-3 font-mono text-[11px] text-muted">
              {"python -m uvicorn memory.api:app --reload --port 8000\npython scripts/run_processor.py --forever"}
            </pre>
          </div>
        )}
      </Card>

      <Card title="Screens" hint="abc.md:339-345">
        <ul className="flex flex-col gap-2">
          {SCREENS.map((screen) =>
            screen.ready ? (
              <li key={screen.href}>
                <Link
                  href={screen.href}
                  className="block rounded-lg border border-edge bg-raised p-3 transition hover:border-accent/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">{screen.label}</span>
                    <Badge tone="good">built</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">{screen.line}</p>
                </Link>
              </li>
            ) : (
              <li
                key={screen.href}
                className="rounded-lg border border-edge bg-raised/40 p-3 opacity-60"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted">{screen.label}</span>
                  <Badge>next</Badge>
                </div>
                <p className="mt-1 text-xs text-faint">{screen.line}</p>
              </li>
            ),
          )}
        </ul>
      </Card>
    </div>
  );
}
