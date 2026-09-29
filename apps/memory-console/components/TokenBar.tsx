"use client";

// Why this file exists
// ====================
//
// Every screen needs a bearer token, and there is no login to get one from.
// The backend's callers are services (backend `memory/auth.py`), so it mints
// per-subject service tokens and has no user accounts. This bar is where an
// operator pastes one, and it says who the token is for and when it dies -
// a fifteen-minute expiry is the most common reason a screen suddenly 401s.

import { useEffect, useState } from "react";
import { API_BASE, getToken, setToken, tokenExpiry, tokenSubject } from "@/lib/api";
import { Badge, Button, inputClass } from "./ui";

export default function TokenBar() {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState("");
  const [now, setNow] = useState(() => Date.now());

  // Load whatever was saved last time, after mount so the server and the
  // browser render the same thing.
  useEffect(() => setSaved(getToken()), []);

  // Tick once a second so the countdown is honest.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Save the pasted token and show who it belongs to.
  function save() {
    setSaved(setToken(value));
    setValue("");
  }

  const subject = saved ? tokenSubject(saved) : "";
  const expiry = saved ? tokenExpiry(saved) : null;
  const secondsLeft = expiry ? Math.round((expiry.getTime() - now) / 1000) : 0;
  const expired = Boolean(expiry) && secondsLeft <= 0;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-edge bg-panel px-4 py-2 text-sm">
      {saved ? (
        <>
          <Badge tone={expired ? "bad" : "good"}>
            {expired ? "token expired" : "token active"}
          </Badge>
          <span className="text-muted">
            subject <span className="font-mono text-ink">{subject || "unknown"}</span>
          </span>
          {expiry && !expired && (
            <span className="text-faint">
              expires in {Math.floor(secondsLeft / 60)}m {secondsLeft % 60}s
            </span>
          )}
          <Button variant="ghost" onClick={() => setSaved(setToken(""))}>
            Clear
          </Button>
        </>
      ) : (
        <>
          <Badge tone="warn">no token</Badge>
          <input
            className={`${inputClass} max-w-md flex-1`}
            placeholder="Paste the token from: python scripts/make_token.py user_001"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && save()}
          />
          <Button onClick={save} disabled={!value.trim()}>
            Use token
          </Button>
        </>
      )}
      <span className="ml-auto font-mono text-[11px] text-faint">{API_BASE}</span>
    </div>
  );
}
