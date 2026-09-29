"use client";

// Why this file exists
// ====================
//
// The whole system, end to end, as ten buttons in order.
//
// Every other screen answers one question. This one proves the pipeline
// actually joins up: an event goes in, a memory comes out, it gets found,
// ranked, packed into a prompt, corrected, fed back on, deleted across every
// store, and the trace explains what happened. That is all ten endpoints of
// abc.md:303-322, run against the live backend, in the order they depend on
// each other.
//
// Nothing is faked. Each step shows the request it sent and the response it
// got back, and each step feeds its identifiers into the next - the event id
// into extraction, the memory id into search and correction, the job id into
// the deletion status, the trace id into the audit trace. That chaining is the
// point: it is what makes the flow a flow rather than ten unrelated calls.

import { useState } from "react";
import { ApiFailure, del, get, patch, post } from "@/lib/api";
import type {
  ContextPackage,
  DeletionAccepted,
  DeletionStatus,
  EventAccepted,
  ExtractionResult,
  FeedbackRecorded,
  MemoryCreated,
  MemoryType,
  MemoryUpdated,
  SearchResult,
  Surface,
  TraceRecord,
} from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  ErrorNote,
  Field,
  Stat,
  inputClass,
  typeTone,
} from "@/components/ui";

// Everything the flow has learned so far. Each step reads what it needs from
// here and writes what the next step needs back into it.
type Flow = {
  eventId?: string;
  duplicate?: boolean;
  extraction?: ExtractionResult;
  created?: MemoryCreated;
  memoryId?: string;
  memoryVersion?: number;
  search?: SearchResult;
  // How many seconds step 4 had to wait for the new memory to be indexed.
  searchWaited?: number;
  pack?: ContextPackage;
  updated?: MemoryUpdated;
  feedback?: FeedbackRecorded;
  deletion?: DeletionAccepted;
  status?: DeletionStatus;
  trace?: TraceRecord;
  traceId?: string;
};

export default function FullFlowPage() {
  const [subjectId, setSubjectId] = useState("user_001");
  const [surface, setSurface] = useState<Surface>("player");
  const [content, setContent] = useState("I really do not want any country music");
  const [intent, setIntent] = useState("put some music on");

  // Step 3 needs a fact and a type. Extraction fills these in when it runs;
  // they stay editable so the flow still works without a model key.
  const [fact, setFact] = useState("Does not want country music");
  const [memoryType, setMemoryType] = useState<MemoryType>("exclusion");

  // Step 6 needs the corrected wording.
  const [correction, setCorrection] = useState(
    "Does not want country music, except Johnny Cash",
  );

  const [flow, setFlow] = useState<Flow>({});
  const [failures, setFailures] = useState<Record<string, ApiFailure>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, unknown>>({});

  // Run one step: remember the request, call the backend, keep the result or
  // the failure. Every step below is three lines because of this.
  async function step(id: string, body: unknown, call: () => Promise<Partial<Flow>>) {
    setBusy(id);
    setFailures((previous) => ({ ...previous, [id]: undefined as never }));
    setSent((previous) => ({ ...previous, [id]: body }));
    try {
      const learned = await call();
      setFlow((previous) => ({ ...previous, ...learned }));
    } catch (error) {
      setFailures((previous) => ({ ...previous, [id]: error as ApiFailure }));
    } finally {
      setBusy(null);
    }
  }

  // 1. Capture the interaction. A fresh idempotency key each press, because
  // the same key returns the first event instead of making a new one - which
  // is the endpoint working, but confusing to watch.
  function runEvent() {
    const stamp = Date.now();
    const body = {
      schema_version: "1.0",
      subject_id: subjectId,
      event_type: "ai_interaction" as const,
      surface,
      locale: "en-US",
      occurred_at: new Date().toISOString(),
      consent_state: "granted" as const,
      source_event_id: `console_${stamp}`,
      idempotency_key: `console_${stamp}`,
      content,
    };
    return step("event", body, async () => {
      const accepted = await post<EventAccepted>("/v1/events", body);
      return { eventId: accepted.event_id, duplicate: accepted.duplicate };
    });
  }

  // 2. Classify it. The worker does this by itself from the queue; here we
  // call it directly so the candidates are visible instead of happening
  // somewhere off screen.
  function runExtract() {
    const body = { subject_id: subjectId, event_id: flow.eventId };
    return step("extract", body, async () => {
      const result = await post<ExtractionResult>("/v1/memories/extract", body);
      // Offer the strongest candidate to step 3, still editable.
      const best = result.candidates[0];
      if (best) {
        setFact(best.fact);
        setMemoryType(best.memory_type);
      }
      return { extraction: result };
    });
  }

  // 3. Store an approved memory in the graph.
  function runCreate() {
    const body = {
      subject_id: subjectId,
      memory_type: memoryType,
      fact,
      entities: [] as string[],
      confidence: 1.0,
      source_event_ids: flow.eventId ? [flow.eventId] : [],
    };
    return step("create", body, async () => {
      const created = await post<MemoryCreated>("/v1/memories", body);
      return {
        created,
        memoryId: created.memory_id,
        memoryVersion: created.graph_version,
      };
    });
  }

  // 4. Find it again by meaning, not by keyword.
  //
  // Step 3 writes the embedding as a background task, so for a second or two
  // the new memory exists in the graph but is not searchable yet. Searching
  // straight away reports "not found", which looks like a bug in retrieval and
  // is not one. So we retry for a few seconds and say that we waited.
  function runSearch() {
    const body = { subject_id: subjectId, intent, surface, limit: 20 };
    return step("search", body, async () => {
      let result = await post<SearchResult>("/v1/memories/search", body);
      let waited = 0;

      const missing = () =>
        Boolean(flow.memoryId) &&
        !result.results.some((memory) => memory.memory_id === flow.memoryId);

      while (missing() && waited < 8) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        waited += 1;
        result = await post<SearchResult>("/v1/memories/search", body);
      }
      return { search: result, searchWaited: waited };
    });
  }

  // 5. Turn what was found into the prompt block an orchestrator receives.
  function runCompose() {
    const body = { subject_id: subjectId, intent, surface, token_budget: 500 };
    return step("compose", body, async () => {
      const pack = await post<ContextPackage>("/v1/context/compose", body);
      return { pack, traceId: pack.trace_id };
    });
  }

  // 6. Correct it. The old memory is superseded, not overwritten, and the
  // version we last saw is sent so a concurrent edit is refused.
  function runCorrect() {
    const body = {
      subject_id: subjectId,
      operation: "correct" as const,
      expected_version: flow.memoryVersion ?? 1,
      fact: correction,
      entities: [] as string[],
      confidence: 1.0,
    };
    return step("correct", body, async () => {
      const updated = await patch<MemoryUpdated>(
        `/v1/memories/${flow.memoryId}`,
        body,
      );
      // The correction is a new memory. Everything after this points at it.
      return {
        updated,
        memoryId: updated.memory_id,
        memoryVersion: updated.graph_version,
      };
    });
  }

  // 7. Record what the listener thought of it.
  function runFeedback() {
    const body = {
      subject_id: subjectId,
      kind: "relevance" as const,
      sentiment: "helpful" as const,
      memory_id: flow.memoryId,
      trace_id: flow.traceId,
    };
    return step("feedback", body, async () => {
      const recorded = await post<FeedbackRecorded>("/v1/feedback", body);
      return { feedback: recorded };
    });
  }

  // 8. Ask for it to be deleted everywhere. This returns a receipt, not a
  // result - the work happens across four stores afterwards.
  function runDelete() {
    return step("delete", { memory_id: flow.memoryId, subject_id: subjectId }, async () => {
      // subject_id goes in the query string here, not the body - a DELETE
      // has no body. Leaving it off answers 422.
      const accepted = await del<DeletionAccepted>(
        `/v1/memories/${flow.memoryId}?subject_id=${encodeURIComponent(subjectId)}`,
      );
      return { deletion: accepted };
    });
  }

  // 9. Check every store separately, so a partial deletion cannot hide.
  function runStatus() {
    return step("status", { job_id: flow.deletion?.job_id, subject_id: subjectId }, async () => {
      const status = await get<DeletionStatus>(
        `/v1/deletions/${flow.deletion?.job_id}` +
          `?subject_id=${encodeURIComponent(subjectId)}`,
      );
      return { status };
    });
  }

  // 10. Read back what was decided, by identifier only. No memory text.
  function runTrace() {
    return step("trace", { trace_id: flow.traceId, subject_id: subjectId }, async () => {
      const trace = await get<TraceRecord>(
        `/v1/traces/${flow.traceId}?subject_id=${encodeURIComponent(subjectId)}`,
      );
      return { trace };
    });
  }

  // Start again without reloading the page.
  function reset() {
    setFlow({});
    setFailures({});
    setSent({});
  }

  const done = Object.keys(flow).length > 0;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold">Full flow</h1>
        <p className="mt-1 text-sm text-muted">
          All ten endpoints, in the order they depend on each other. Each step
          feeds its identifiers to the next, against the live backend.
        </p>
      </header>

      <Card
        title="What this run is about"
        hint="Set once; every step below uses these."
        right={done ? <Button variant="ghost" onClick={reset}>Reset</Button> : undefined}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Subject" hint="Must match the subject in your token.">
            <input
              className={inputClass}
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
            />
          </Field>
          <Field label="Surface">
            <select
              className={inputClass}
              value={surface}
              onChange={(event) => setSurface(event.target.value as Surface)}
            >
              <option value="player">player</option>
              <option value="chat">chat</option>
              <option value="search">search</option>
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="What the listener said"
              hint="Untrusted free text. It is never put in a system instruction."
            >
              <textarea
                className={inputClass}
                rows={2}
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="What they ask for later" hint="Used by steps 4 and 5.">
              <input
                className={inputClass}
                value={intent}
                onChange={(event) => setIntent(event.target.value)}
              />
            </Field>
          </div>
        </div>
      </Card>

      {/* What the flow is carrying. This is the whole idea of the screen, so
          it sits above the steps rather than being buried in them. */}
      {done && (
        <Card title="Identifiers being carried forward">
          <div className="grid gap-2 sm:grid-cols-2">
            <Carried label="event_id" value={flow.eventId} />
            <Carried label="memory_id" value={flow.memoryId} />
            <Carried label="graph_version" value={flow.memoryVersion} />
            <Carried label="trace_id" value={flow.traceId} />
            <Carried label="job_id" value={flow.deletion?.job_id} />
            <Carried label="superseded" value={flow.updated?.superseded ?? undefined} />
          </div>
        </Card>
      )}

      {/* 1 */}
      <Step
        n={1}
        title="Capture the interaction"
        endpoint="POST /v1/events"
        requirement="abc.md:303 - accept an eligible interaction event"
        why="Validates subject, consent, schema version, idempotency and source, then puts the event on the Redpanda queue. It never waits for a model, so a listener never waits either."
        run={runEvent}
        busy={busy === "event"}
        blocked={null}
        sent={sent.event}
        failure={failures.event}
      >
        {flow.eventId && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="good">accepted</Badge>
            {flow.duplicate && <Badge tone="warn">duplicate - same key as before</Badge>}
            <span className="font-mono text-xs text-muted">{flow.eventId}</span>
          </div>
        )}
      </Step>

      {/* 2 */}
      <Step
        n={2}
        title="Work out what is worth remembering"
        endpoint="POST /v1/memories/extract"
        requirement="abc.md:305 - return validated candidate memories with policy classes"
        why="Sends the stored event to the model with an allowed taxonomy, then throws out anything the rules reject. The worker does this by itself from the queue; calling it here makes the candidates visible. Needs a Gemini key - without one it returns a clean 503 and the flow carries on at step 3."
        run={runExtract}
        busy={busy === "extract"}
        blocked={flow.eventId ? null : "Run step 1 first - extraction needs an event id."}
        sent={sent.extract}
        failure={failures.extract}
      >
        {flow.extraction && (
          <div className="flex flex-col gap-2">
            {flow.extraction.no_memory ? (
              <Badge tone="info">no memory - nothing here is worth keeping</Badge>
            ) : (
              flow.extraction.candidates.map((candidate, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-edge bg-raised p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={typeTone(candidate.memory_type)}>
                      {candidate.memory_type}
                    </Badge>
                    <span className="text-[11px] text-faint">
                      confidence {candidate.confidence.toFixed(2)}
                    </span>
                    {candidate.policy && (
                      <span className="text-[11px] text-faint">
                        kept {candidate.policy.retention_days} days · allowed on{" "}
                        {candidate.policy.retrieval_eligibility.join(", ")}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm wrap-anywhere">{candidate.fact}</p>
                  {candidate.reason && (
                    <p className="mt-1 text-[11px] text-faint wrap-anywhere">
                      because: {candidate.reason}
                    </p>
                  )}
                  {candidate.entities.length > 0 && (
                    <p className="mt-1 text-[11px] text-faint">
                      about{" "}
                      {candidate.entities
                        .map((e) => e.canonical_name ?? e.name)
                        .join(", ")}
                    </p>
                  )}
                </div>
              ))
            )}
            {flow.extraction.rejected.length > 0 && (
              <div className="rounded-lg border border-warn/30 bg-warn/5 p-3">
                <div className="text-xs font-semibold text-warn">
                  Thrown out by our rules
                </div>
                <ul className="mt-1 flex flex-col gap-1">
                  {flow.extraction.rejected.map((line, index) => (
                    <li key={index} className="text-[11px] text-muted wrap-anywhere">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Step>

      {/* 3 */}
      <Step
        n={3}
        title="Store it in the graph"
        endpoint="POST /v1/memories"
        requirement="abc.md:306 - create an explicit or approved memory, return a stable id, graph version and policy state"
        why="Writes the memory into Neo4j with its provenance and policy class, and stores its 384-dimension embedding so step 4 can find it by meaning. Step 2 fills these two fields in when it runs."
        run={runCreate}
        busy={busy === "create"}
        blocked={fact.trim() ? null : "A memory needs a fact."}
        sent={sent.create}
        failure={failures.create}
        extra={
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Field label="Fact">
                <input
                  className={inputClass}
                  value={fact}
                  onChange={(event) => setFact(event.target.value)}
                />
              </Field>
            </div>
            <Field label="Type">
              <select
                className={inputClass}
                value={memoryType}
                onChange={(event) => setMemoryType(event.target.value as MemoryType)}
              >
                <option value="exclusion">exclusion</option>
                <option value="explicit_preference">explicit_preference</option>
                <option value="candidate_preference">candidate_preference</option>
                <option value="correction">correction</option>
                <option value="episode">episode</option>
              </select>
            </Field>
          </div>
        }
      >
        {flow.created && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="good">{flow.created.policy_state}</Badge>
            <span className="font-mono text-xs text-muted">
              {flow.created.memory_id}
            </span>
            <span className="text-[11px] text-faint">
              version {flow.created.graph_version}
            </span>
          </div>
        )}
      </Step>

      {/* 4 */}
      <Step
        n={4}
        title="Find it again by meaning"
        endpoint="POST /v1/memories/search"
        requirement="abc.md:309 - return ranked subject-scoped memories for intent, surface and locale"
        why="Hybrid search over this subject's memories only, scored by six weighted signals. The subject is in every query, so one listener can never see another's. Waits a few seconds if the memory from step 3 has not been indexed yet."
        run={runSearch}
        busy={busy === "search"}
        blocked={null}
        sent={sent.search}
        failure={failures.search}
      >
        {flow.search && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="considered" value={flow.search.considered} />
              <Stat label="returned" value={flow.search.results.length} />
              <Stat label="dropped by policy" value={flow.search.removed.length} />
            </div>
            {flow.searchWaited ? (
              <p className="text-[11px] text-faint">
                Waited {flow.searchWaited}s for the new memory to be indexed -
                step 3 writes its embedding in the background, so it is in the
                graph a moment before it is searchable.
              </p>
            ) : null}
            {flow.search.results.map((memory) => (
              <div
                key={memory.memory_id}
                className={`rounded-lg border p-2 text-sm ${
                  memory.memory_id === flow.memoryId
                    ? "border-accent/50 bg-raised"
                    : "border-edge bg-raised/40"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted">
                    {memory.score.toFixed(3)}
                  </span>
                  <Badge tone={typeTone(memory.memory_type)}>
                    {memory.memory_type}
                  </Badge>
                  {memory.memory_id === flow.memoryId && (
                    <Badge tone="good">the one we just stored</Badge>
                  )}
                </div>
                <p className="mt-1 wrap-anywhere">{memory.fact}</p>
              </div>
            ))}
          </div>
        )}
      </Step>

      {/* 5 */}
      <Step
        n={5}
        title="Build the prompt block"
        endpoint="POST /v1/context/compose"
        requirement="abc.md:311 - apply policy and build the context package consumed by an AI orchestrator"
        why="Drops what policy forbids on this surface, trims to the token budget, and fences the memory text as data with a warning line and a random per-request marker, so stored text cannot smuggle an instruction into the prompt."
        run={runCompose}
        busy={busy === "compose"}
        blocked={null}
        sent={sent.compose}
        failure={failures.compose}
      >
        {flow.pack && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="items in pack" value={flow.pack.items.length} />
              <Stat label="tokens of 500" value={flow.pack.token_estimate} />
              <Stat label="removed" value={flow.pack.removed.length} />
            </div>
            {flow.pack.no_memory ? (
              <div className="rounded-lg border border-info/30 bg-info/5 px-3 py-2 text-sm">
                <span className="font-semibold text-info">No memory used</span>
                <p className="mt-1 text-muted">{flow.pack.reason}</p>
              </div>
            ) : (
              <pre className="max-h-64 overflow-auto rounded-lg border border-edge bg-base p-3 font-mono text-[11px] text-muted">
                {flow.pack.context_block}
              </pre>
            )}
          </div>
        )}
      </Step>

      {/* 6 */}
      <Step
        n={6}
        title="Correct it"
        endpoint={`PATCH /v1/memories/${flow.memoryId ?? "{memory_id}"}`}
        requirement="abc.md:313 - correct, supersede or expire an eligible memory under optimistic concurrency"
        why="The old memory is superseded, never overwritten, so the history survives. We send the version we last saw; if anything changed underneath, the backend refuses with 409 rather than losing someone else's edit. The correction is a new memory, and every step after this points at it."
        run={runCorrect}
        busy={busy === "correct"}
        blocked={flow.memoryId ? null : "Run step 3 first - a correction needs a memory to correct."}
        sent={sent.correct}
        failure={failures.correct}
        extra={
          <Field label="Corrected wording" hint={`Sent with expected_version ${flow.memoryVersion ?? "-"}`}>
            <input
              className={inputClass}
              value={correction}
              onChange={(event) => setCorrection(event.target.value)}
            />
          </Field>
        }
      >
        {flow.updated && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="good">{flow.updated.status}</Badge>
            <span className="font-mono text-xs text-muted">
              {flow.updated.memory_id}
            </span>
            <span className="text-[11px] text-faint">
              version {flow.updated.graph_version}
            </span>
            {flow.updated.superseded && (
              <span className="text-[11px] text-faint">
                supersedes{" "}
                <span className="font-mono">{flow.updated.superseded}</span>
              </span>
            )}
          </div>
        )}
      </Step>

      {/* 7 */}
      <Step
        n={7}
        title="Record what the listener thought"
        endpoint="POST /v1/feedback"
        requirement="abc.md:318 - record relevance, correction, rejection or experience feedback without self-validating model output"
        why="Positive feedback can only strengthen something the listener actually said. On an inferred memory it is recorded but not allowed to reinforce, so the system cannot talk itself into believing its own guesses. Negative feedback always counts."
        run={runFeedback}
        busy={busy === "feedback"}
        blocked={flow.memoryId ? null : "Run step 3 first - feedback is about a memory."}
        sent={sent.feedback}
        failure={failures.feedback}
      >
        {flow.feedback && (
          <div className="text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="good">recorded</Badge>
              <Badge tone={flow.feedback.reinforced ? "good" : "warn"}>
                {flow.feedback.reinforced ? "reinforced" : "not reinforced"}
              </Badge>
              <span className="font-mono text-xs text-muted">
                {flow.feedback.feedback_id}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-faint wrap-anywhere">
              {flow.feedback.reinforce_reason}
            </p>
          </div>
        )}
      </Step>

      {/* 8 */}
      <Step
        n={8}
        title="Ask for it to be deleted everywhere"
        endpoint={`DELETE /v1/memories/${flow.memoryId ?? "{memory_id}"}`}
        requirement="abc.md:315 - start cross-store deletion and return a traceable job identifier"
        why="A receipt, not a result. Deletion has to reach the graph, the vectors, the cache and the operational store, so the endpoint hands back a job id and the work happens behind it."
        run={runDelete}
        busy={busy === "delete"}
        blocked={flow.memoryId ? null : "Run step 3 first - there is nothing to delete."}
        sent={sent.delete}
        failure={failures.delete}
      >
        {flow.deletion && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="good">{flow.deletion.status}</Badge>
            <span className="font-mono text-xs text-muted">{flow.deletion.job_id}</span>
          </div>
        )}
      </Step>

      {/* 9 */}
      <Step
        n={9}
        title="Check the deletion finished"
        endpoint={`GET /v1/deletions/${flow.deletion?.job_id ?? "{job_id}"}`}
        requirement="abc.md:317 - report graph, vector, cache, operational-store and backup-policy status"
        why="One line per store, because a partial deletion must be visible rather than hidden behind a single flag. Backups say retained_by_policy, which is the honest answer, not a failure."
        run={runStatus}
        busy={busy === "status"}
        blocked={flow.deletion ? null : "Run step 8 first - this needs a job id."}
        sent={sent.status}
        failure={failures.status}
      >
        {flow.status && (
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge tone={flow.status.status === "completed" ? "good" : "warn"}>
                {flow.status.status}
              </Badge>
              {flow.status.error && (
                <span className="text-[11px] text-bad">{flow.status.error}</span>
              )}
            </div>
            <ul className="flex flex-col gap-1">
              {Object.entries(flow.status.stores).map(([store, state]) => (
                <li
                  key={store}
                  className="flex items-center justify-between rounded-lg border border-edge bg-raised px-3 py-1.5"
                >
                  <span className="text-xs text-muted">{store}</span>
                  <Badge
                    tone={
                      state === "deleted"
                        ? "good"
                        : state === "retained_by_policy"
                          ? "info"
                          : "warn"
                    }
                  >
                    {state}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Step>

      {/* 10 */}
      <Step
        n={10}
        title="Read back what was decided"
        endpoint={`GET /v1/traces/${flow.traceId ?? "{trace_id}"}`}
        requirement="abc.md:320 - authorized retrieval and policy decisions with sensitive fields redacted"
        why="The audit answer to why did it say that. Stages, decisions, memory identifiers, scores and reasons - and no memory text at all, which is why it is safe for an operator to read."
        run={runTrace}
        busy={busy === "trace"}
        blocked={flow.traceId ? null : "Run step 5 first - the pack is what produces a trace id."}
        sent={sent.trace}
        failure={failures.trace}
      >
        {flow.trace && (
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">redacted: no memory text</Badge>
              <span className="text-[11px] text-faint">
                {flow.trace.decisions.length} decisions · {flow.trace.actions.length}{" "}
                audited actions
              </span>
            </div>
            <ul className="flex flex-col gap-1">
              {flow.trace.decisions.map((decision, index) => (
                <li
                  key={index}
                  className="rounded-lg border border-edge bg-raised px-3 py-1.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-ink">
                      {decision.stage}
                    </span>
                    <Badge>{decision.decision}</Badge>
                    {decision.score !== null && (
                      <span className="font-mono text-[11px] text-faint">
                        {decision.score.toFixed(3)}
                      </span>
                    )}
                    {decision.memory_id && (
                      <span className="font-mono text-[11px] text-faint">
                        {decision.memory_id}
                      </span>
                    )}
                  </div>
                  {decision.reason && (
                    <p className="mt-0.5 text-[11px] text-faint wrap-anywhere">
                      {decision.reason}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Step>
    </div>
  );
}

// One identifier the flow is carrying, or a dash when that step has not run.
function Carried({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-edge bg-raised px-3 py-1.5">
      <span className="text-[11px] text-faint">{label}</span>
      <span className="font-mono text-[11px] text-ink">{value ?? "-"}</span>
    </div>
  );
}

// One step of the flow: what it is for, the request it sent, the response it
// got, and the reason it cannot run yet if it cannot.
function Step({
  n,
  title,
  endpoint,
  requirement,
  why,
  run,
  busy,
  blocked,
  sent,
  failure,
  extra,
  children,
}: {
  n: number;
  title: string;
  endpoint: string;
  requirement: string;
  why: string;
  run: () => void;
  busy: boolean;
  blocked: string | null;
  sent?: unknown;
  failure?: ApiFailure;
  extra?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [showRequest, setShowRequest] = useState(false);

  return (
    <section className="rounded-xl border border-edge bg-panel">
      <header className="flex items-start gap-3 border-b border-edge px-4 py-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-edge text-xs font-semibold text-muted">
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 font-mono text-[11px] text-accent wrap-anywhere">
            {endpoint}
          </p>
          <p className="mt-1 text-[11px] text-faint wrap-anywhere">{requirement}</p>
        </div>
      </header>

      <div className="flex flex-col gap-3 p-4">
        <p className="text-xs text-muted">{why}</p>

        {extra}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={run} disabled={busy || blocked !== null}>
            {busy ? "Running..." : `Run step ${n}`}
          </Button>
          {blocked && <span className="text-[11px] text-faint">{blocked}</span>}
          {sent !== undefined && (
            <button
              type="button"
              onClick={() => setShowRequest((previous) => !previous)}
              className="text-[11px] text-faint underline hover:text-muted"
            >
              {showRequest ? "hide" : "show"} the request that was sent
            </button>
          )}
        </div>

        {showRequest && sent !== undefined && (
          <pre className="overflow-auto rounded-lg border border-edge bg-base p-3 font-mono text-[11px] text-faint">
            {JSON.stringify(sent, null, 2)}
          </pre>
        )}

        {failure && (
          <ErrorNote
            code={failure.code}
            message={failure.message}
            correlationId={failure.correlationId}
          />
        )}

        {children}
      </div>
    </section>
  );
}
