// Why this file exists
// ====================
//
// The shapes the backend actually returns, written down once so every screen
// agrees with it. Each type here mirrors a Pydantic model in the backend's
// `memory/models.py` - same field names, same optionality. If the backend
// changes a field, this file is the single place to follow it.
//
// Nothing here is invented: every field below exists in a request or response
// today.

// The error body every failing endpoint returns (memory/errors.py).
// The code is stable - screens branch on the code, never on the message.
export type ApiError = {
  code: string;
  message: string;
  correlation_id: string;
};

// The five memory types the backend allows (memory/models.py MEMORY_TYPES).
export type MemoryType =
  | "episode"
  | "explicit_preference"
  | "candidate_preference"
  | "exclusion"
  | "correction";

// The three product surfaces a request can come from.
export type Surface = "chat" | "player" | "search";

// The seven event types the backend accepts.
export type EventType =
  | "ai_interaction"
  | "playback"
  | "save"
  | "follow"
  | "skip"
  | "explicit_preference"
  | "correction";

// --- 1. POST /v1/events ----------------------------------------------------

// What we send. The eight required fields come from abc.md section 6.3;
// `content` is the free text, which a skip or a follow does not have.
export type EventRequest = {
  schema_version: string;
  subject_id: string;
  event_type: EventType;
  surface: Surface;
  locale: string;
  occurred_at: string;
  consent_state: "granted" | "denied" | "paused";
  source_event_id: string;
  idempotency_key: string;
  content?: string;
};

export type EventAccepted = {
  event_id: string;
  accepted: boolean;
  duplicate: boolean;
};

// --- 2. POST /v1/memories/extract -----------------------------------------

// One thing a memory is about, matched to the catalog where possible.
export type ResolvedEntity = {
  name: string;
  entity_id: string | null;
  canonical_name: string | null;
  entity_type: string | null;
  match_confidence: number;
};

// How a memory must be treated - set by the backend's rules, never the model.
export type PolicyClass = {
  sensitivity: string;
  retention_days: number;
  retrieval_eligibility: string[];
  expires_at: string;
};

// One memory the extractor proposes. Nothing here is trusted yet.
export type CandidateMemory = {
  memory_type: MemoryType;
  fact: string;
  entities: ResolvedEntity[];
  confidence: number;
  reason: string;
  policy: PolicyClass | null;
  source_event_ids: string[];
  evidence_count: number;
};

export type ExtractionResult = {
  event_id: string;
  candidates: CandidateMemory[];
  no_memory: boolean;
  rejected: string[];
};

// --- 3. POST /v1/memories -------------------------------------------------

export type CreateMemoryRequest = {
  subject_id: string;
  memory_type: MemoryType;
  fact: string;
  entities: string[];
  confidence: number;
  source_event_ids: string[];
  supersedes?: string | null;
};

export type MemoryCreated = {
  memory_id: string;
  graph_version: number;
  policy_state: string;
  superseded: string | null;
};

// --- 4. POST /v1/memories/search ------------------------------------------

// One result, with the score broken into the signals that produced it.
export type RankedMemory = {
  memory_id: string;
  memory_type: string;
  fact: string;
  confidence: number;
  score: number;
  signals: Record<string, number>;
  entities: string[];
  evidence_count: number;
};

export type SearchResult = {
  results: RankedMemory[];
  removed: string[];
  considered: number;
  trace_id: string;
};

// --- 5. POST /v1/context/compose ------------------------------------------

// One memory inside a context package.
export type ContextItem = {
  memory_id: string;
  fact: string;
  memory_type: string;
  confidence: number;
  source_class: string;
  relevance_reason: string;
  evidence_count: number;
};

// The pack an orchestrator uses.
export type ContextPackage = {
  no_memory: boolean;
  reason: string;
  context_block: string;
  items: ContextItem[];
  removed: string[];
  token_estimate: number;
  fence_open: string;
  fence_close: string;
  trace_id: string;
};

// --- 6. PATCH /v1/memories/{memory_id} ------------------------------------

// A correction replaces the fact and keeps the old memory as history; an
// expiry just closes it. `expected_version` is the optimistic-concurrency
// check - a stale version is refused rather than silently overwritten.
export type PatchMemoryRequest = {
  subject_id: string;
  operation: "correct" | "expire";
  expected_version: number;
  fact?: string;
  entities?: string[];
  confidence?: number;
};

export type MemoryUpdated = {
  memory_id: string;
  graph_version: number;
  status: string;
  superseded: string | null;
};

// --- 7 and 8. DELETE /v1/memories/{id}, GET /v1/deletions/{job_id} --------

export type DeletionAccepted = {
  job_id: string;
  memory_id: string;
  status: string;
};

// One field per store, so a partial failure is visible rather than hidden
// behind a single flag.
export type DeletionStatus = {
  job_id: string;
  memory_id: string;
  status: string;
  stores: Record<string, string>;
  requested_at: string;
  completed_at: string | null;
  error: string | null;
};

// --- 9. POST /v1/feedback -------------------------------------------------

export type FeedbackRequest = {
  subject_id: string;
  kind: "relevance" | "correction" | "rejection" | "experience";
  sentiment: "helpful" | "unhelpful" | "wrong";
  memory_id?: string | null;
  trace_id?: string | null;
};

export type FeedbackRecorded = {
  feedback_id: string;
  recorded: boolean;
  reinforced: boolean;
  reinforce_reason: string;
};

// --- 10. GET /v1/traces/{trace_id} ----------------------------------------

// One decision taken while answering a request. Identifiers and reasons only.
export type TraceDecision = {
  stage: string;
  decision: string;
  memory_id: string | null;
  reason: string | null;
  score: number | null;
  recorded_at: string;
};

export type TraceRecord = {
  trace_id: string;
  decisions: TraceDecision[];
  actions: Record<string, unknown>[];
  redacted: boolean;
};
