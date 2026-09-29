"use client";

// Why this file exists
// ====================
//
// Screens need to put `subject_id` in a request body, and it has to be the same
// subject the server is minting the token for. If they disagree, the backend
// answers 403 SUBJECT_MISMATCH - which is the isolation check working, but it
// would look like a broken screen.
//
// So no screen keeps its own subject. They all read it from here, which reads
// the one cookie the subject picker writes.

import { useEffect, useState } from "react";
import { DEFAULT_SUBJECT, SUBJECT_COOKIE, isApprovedSubject } from "./subjects";

// The subject this console is currently acting as.
export function useSubject(): string {
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);

  // Read it after mount, so the server and the browser render the same first
  // pass and React does not complain about a mismatch.
  useEffect(() => {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${SUBJECT_COOKIE}=([^;]*)`),
    );
    const saved = match ? decodeURIComponent(match[1]) : "";
    if (saved && isApprovedSubject(saved)) setSubject(saved);
  }, []);

  return subject;
}
