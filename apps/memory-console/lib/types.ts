// Why this file exists
// ====================
//
// The shapes the backend actually returns, written down once so every screen
// agrees with it. Each type here mirrors a Pydantic model in the backend's
// `memory/models.py` - same field names, same optionality. If the backend
// changes a field, this file is the single place to follow it.
//
// Nothing here is invented: every field below exists in a response today.

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

// One result from POST /v1/memories/search, with the score broken into the
// signals that produced it.
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

// What POST /v1/memories/search returns.
export type SearchResult = {
  results: RankedMemory[];
  removed: string[];
  considered: number;
  trace_id: string;
};

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

// What POST /v1/context/compose returns - the pack an orchestrator uses.
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
