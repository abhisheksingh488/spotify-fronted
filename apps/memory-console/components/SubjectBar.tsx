"use client";

// Why this file exists
// ====================
//
// This replaced a box that asked an operator to paste a JWT.
//
// Pasting a token is not a product - it is a test harness. The console's own
// server now mints the token (app/api/backend/[...path]/route.ts), so all that
// is left to choose is which subject we are looking at. That is one dropdown.
//
// The cookie this writes holds a subject id and nothing else. No secret, no
// token. The server checks the id against the approved list before it signs
// anything, so changing the cookie by hand cannot widen what the console can
// see (abc.md:340 - approved support or test identities only).

import { useEffect, useState } from "react";
import { DEFAULT_SUBJECT, SUBJECTS, SUBJECT_COOKIE } from "@/lib/subjects";
import { Badge, inputClass } from "./ui";

// Read one cookie from the browser, or an empty string.
function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

export default function SubjectBar() {
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);

  // Pick up whatever was chosen last time, after mount so the server and the
  // browser render the same thing.
  useEffect(() => {
    const saved = readCookie(SUBJECT_COOKIE);
    if (saved) setSubject(saved);
  }, []);

  // Remember the choice and reload, so every screen re-fetches as the new
  // subject rather than showing the previous one's results.
  function choose(next: string) {
    setSubject(next);
    document.cookie = `${SUBJECT_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=86400; samesite=lax`;
    window.location.reload();
  }

  const current = SUBJECTS.find((entry) => entry.id === subject);
  const consent = current?.consent ?? "granted";

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-edge bg-panel px-4 py-2 text-sm">
      <span className="text-muted">Viewing as</span>

      <select
        className={`${inputClass} w-auto py-1`}
        value={subject}
        onChange={(event) => choose(event.target.value)}
      >
        {SUBJECTS.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.id} — {entry.note}
          </option>
        ))}
      </select>

      {/* Consent is the first thing every endpoint checks, so it belongs where
          it cannot be missed. A denied or paused subject is not a broken
          console - it is the policy working. */}
      <Badge
        tone={consent === "granted" ? "good" : consent === "paused" ? "warn" : "bad"}
      >
        consent: {consent}
      </Badge>

      {consent === "denied" && (
        <span className="text-[11px] text-faint">
          expect 403 CONSENT_DENIED on the write path
        </span>
      )}
      {consent === "paused" && (
        <span className="text-[11px] text-faint">
          expect a no-memory context package, not an error
        </span>
      )}

      <span className="ml-auto text-[11px] text-faint">
        the console signs its own requests — no token to handle
      </span>
    </div>
  );
}
