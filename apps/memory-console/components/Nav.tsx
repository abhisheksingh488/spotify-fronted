"use client";

// Why this file exists
// ====================
//
// The sidebar. One entry per operator screen from the specification's
// frontend section (abc.md:339-345), with the current one highlighted.
//
// A screen marked `off` is not clickable yet. Quality review is off for good:
// it needs golden-set runs, and the backend has no golden sets. The others are
// off only until they are built. Showing them greyed out is more honest than
// hiding them or linking to a page that is not there.

import Link from "next/link";
import { usePathname } from "next/navigation";

// The screens, in the order an operator meets them.
const SCREENS = [
  { href: "/", label: "Overview", note: "health, lag, fallbacks" },
  { href: "/memories", label: "Memory explorer", note: "what we hold, per subject", off: true },
  { href: "/context", label: "Context preview", note: "retrieval, ranking, the pack" },
  { href: "/corrections", label: "Correction & deletion", note: "fix or remove", off: true },
  { href: "/policy", label: "Schema & policy", note: "retention, eligibility", off: true },
  { href: "/trace", label: "Audit trace", note: "who decided what", off: true },
  { href: "/quality", label: "Quality review", note: "needs golden sets", off: true },
];

export default function Nav() {
  const path = usePathname();

  return (
    <nav className="flex w-60 shrink-0 flex-col gap-1 border-r border-edge bg-panel p-3">
      <div className="px-2 pb-3">
        <div className="text-sm font-semibold text-ink">Memory console</div>
        <div className="text-[11px] text-faint">operator views</div>
      </div>

      {SCREENS.map((screen) =>
        screen.off ? (
          <div
            key={screen.href}
            className="cursor-not-allowed rounded-lg px-2 py-2 opacity-40"
            title="Not built yet"
          >
            <div className="text-sm text-muted">{screen.label}</div>
            <div className="text-[11px] text-faint">{screen.note}</div>
          </div>
        ) : (
          <Link
            key={screen.href}
            href={screen.href}
            className={`rounded-lg px-2 py-2 transition ${
              path === screen.href
                ? "bg-raised text-ink"
                : "text-muted hover:bg-raised/60 hover:text-ink"
            }`}
          >
            <div className="text-sm font-medium">{screen.label}</div>
            <div className="text-[11px] text-faint">{screen.note}</div>
          </Link>
        ),
      )}
    </nav>
  );
}
