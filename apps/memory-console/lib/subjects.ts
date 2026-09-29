// Why this file exists
// ====================
//
// The subjects an operator can look at, in one list, so the picker and the
// server agree on what is allowed.
//
// abc.md:340 - the memory explorer must "search only with approved support or
// test identities". This list IS that allow-list: the server refuses to mint a
// token for anything not named here, so the console cannot be pointed at a real
// listener by editing a cookie.
//
// These five are the ones the backend's migration seeds
// (infrastructure/database-migrations/001_consent_and_ingestion.sql), which is
// why their consent states are already what they are.

export type Subject = {
  id: string;
  consent: "granted" | "denied" | "paused";
  note: string;
};

export const SUBJECTS: Subject[] = [
  { id: "user_001", consent: "granted", note: "normal testing" },
  { id: "user_002", consent: "granted", note: "checking one subject cannot see another's" },
  { id: "user_003", consent: "granted", note: "spare" },
  { id: "user_004", consent: "denied", note: "consent is enforced - expect 403" },
  { id: "user_005", consent: "paused", note: "the no-memory fallback" },
];

// The one the console starts on.
export const DEFAULT_SUBJECT = "user_001";

// Is this a subject we are allowed to act as? Checked on the server before any
// token is minted.
export function isApprovedSubject(id: string): boolean {
  return SUBJECTS.some((subject) => subject.id === id);
}

// The cookie the picker writes and the server reads. It holds a subject id and
// nothing else - no secret, no token.
export const SUBJECT_COOKIE = "spotifymem.subject";
