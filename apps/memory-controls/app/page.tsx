"use client";

// Why this file exists
// ====================
//
// The whole listener-facing app, on one page.
//
// abc.md:253 - "memory-controls/ # Review, correction, deletion UI"
// abc.md:51  - "Memory Control Experience: User-facing controls to review,
//               correct, remove, pause, or opt out of eligible memory behavior."
// abc.md:136 - "Provide review, correction, deletion, pause, and opt-out paths
//               with clear state and propagation status."
//
// Five paths are asked for. Review, correct and remove work here against the
// live service. Pause and opt-out change consent state, and no endpoint in
// abc.md:303-322 changes consent - so those two say so plainly instead of
// pretending to work. A control that looks like it turned memory off without
// turning it off would be the worst failure this app could have.
//
// The language is deliberately plain. No memory ids, no confidence scores, no
// graph vocabulary - the transcript's Product Design Lead asks for "Spotify
// remembered this preference", not a node inspector.

import { useEffect, useState } from "react";
import { ApiFailure, del, get, patch, post } from "@/lib/api";
import type {
  DeletionAccepted,
  DeletionStatus,
  MemoryUpdated,
  RankedMemory,
  SearchResult,
} from "@/lib/types";
import { Badge, Button, Card, ErrorNote, inputClass } from "@/components/ui";

// How to describe each memory type to the person it is about. The stored names
// are for operators; these are for listeners.
const IN_PLAIN_WORDS: Record<string, string> = {
  explicit_preference: "You told us this",
  exclusion: "You asked us not to",
  correction: "You corrected this",
  candidate_preference: "We noticed this",
  episode: "Something you did",
};

// Did the listener say it, or did we infer it? Only the second kind needs the
// softer "we noticed" framing and an easy way to say no.
function weGuessed(memoryType: string): boolean {
  return memoryType === "candidate_preference" || memoryType === "episode";
}

export default function MemoryControlsPage() {
  const [memories, setMemories] = useState<RankedMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  // Which memory is being edited, and the wording being typed.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // What just happened, in one line, so an action never completes silently.
  const [note, setNote] = useState<string | null>(null);

  // Deletion is not instant - it has to reach four stores - so its progress is
  // tracked per memory and shown until every store is accounted for.
  const [removing, setRemoving] = useState<string | null>(null);
  const [removal, setRemoval] = useState<DeletionStatus | null>(null);

  const [busy, setBusy] = useState(false);

  // Everything we hold about this listener. The subject is fixed on the server,
  // so there is nothing to pass here and nothing they could change.
  async function load() {
    setLoading(true);
    setFailure(null);
    try {
      const found = await post<SearchResult>("/v1/memories/search", {
        // A broad intent, because this is a review screen and not a search.
        intent: "everything you have told us",
        // chat allows the most memory types, so nothing is hidden from the
        // person it belongs to.
        surface: "chat",
        limit: 50,
      });
      setMemories(found.results);
    } catch (error) {
      setFailure(error as ApiFailure);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Correct the wording. The old version is kept as history rather than
  // overwritten, so a correction can itself be reviewed later.
  async function saveCorrection(memory: RankedMemory) {
    setBusy(true);
    setFailure(null);
    try {
      const updated = await patch<MemoryUpdated>(`/v1/memories/${memory.memory_id}`, {
        operation: "correct",
        expected_version: 1,
        fact: draft,
        entities: [],
        confidence: 1.0,
      });
      setEditing(null);
      setNote("Saved. We will use your wording from now on.");
      // Tell the service this came from the listener, not from us.
      await post("/v1/feedback", {
        kind: "correction",
        sentiment: "wrong",
        memory_id: updated.memory_id,
      }).catch(() => undefined);
      await load();
    } catch (error) {
      setFailure(error as ApiFailure);
    } finally {
      setBusy(false);
    }
  }

  // Say this is wrong without rewriting it. abc.md:149 - negative feedback from
  // the listener always counts, even on something we only guessed.
  async function sayItsWrong(memory: RankedMemory) {
    setBusy(true);
    setFailure(null);
    try {
      await post("/v1/feedback", {
        kind: "rejection",
        sentiment: "wrong",
        memory_id: memory.memory_id,
      });
      setNote("Thanks. We will stop leaning on that.");
    } catch (error) {
      setFailure(error as ApiFailure);
    } finally {
      setBusy(false);
    }
  }

  // Remove it everywhere, and keep watching until every store has answered.
  async function remove(memory: RankedMemory) {
    setBusy(true);
    setFailure(null);
    setRemoving(memory.memory_id);
    setRemoval(null);
    try {
      const accepted = await del<DeletionAccepted>(`/v1/memories/${memory.memory_id}`);
      for (let attempt = 0; attempt < 15; attempt += 1) {
        const status = await get<DeletionStatus>(`/v1/deletions/${accepted.job_id}`);
        setRemoval(status);
        if (status.status !== "pending" && status.status !== "in_progress") break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      await load();
    } catch (error) {
      setFailure(error as ApiFailure);
    } finally {
      setBusy(false);
    }
  }

  // Which stores, if any, did not finish. Shown to the listener in plain words,
  // because abc.md:342 forbids letting a partial removal look complete.
  const stillThere = Object.entries(removal?.stores ?? {}).filter(
    ([, state]) => !["deleted", "nothing_to_delete", "retained_by_policy"].includes(state),
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      {note && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-sm text-accent">
          {note}
        </div>
      )}

      {failure && (
        <ErrorNote
          code={failure.code}
          message={failure.message}
          correlationId={failure.correlationId}
        />
      )}

      {/* Review - the first of the five paths. */}
      <Card
        title="What we remember"
        hint="Only things you have told us, or that we noticed and marked as a guess."
        right={
          <Button variant="ghost" onClick={load} disabled={loading || busy}>
            Refresh
          </Button>
        }
      >
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : memories.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing yet. As you use Spotify&apos;s AI features, anything worth
            remembering will appear here — and you can change or remove it.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {memories.map((memory) => (
              <li
                key={memory.memory_id}
                className="rounded-lg border border-edge bg-raised p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={weGuessed(memory.memory_type) ? "warn" : "good"}>
                    {IN_PLAIN_WORDS[memory.memory_type] ?? memory.memory_type}
                  </Badge>
                  {weGuessed(memory.memory_type) && (
                    <span className="text-[11px] text-faint">
                      a guess, not something you said
                    </span>
                  )}
                </div>

                {editing === memory.memory_id ? (
                  <div className="mt-2 flex flex-col gap-2">
                    <input
                      className={inputClass}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={() => saveCorrection(memory)}
                        disabled={busy || !draft.trim() || draft === memory.fact}
                      >
                        {busy ? "Saving…" : "Save"}
                      </Button>
                      <Button variant="ghost" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-ink wrap-anywhere">{memory.fact}</p>

                    {/* Correct and remove - paths two and three. */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setEditing(memory.memory_id);
                          setDraft(memory.fact);
                          setNote(null);
                        }}
                      >
                        Change the wording
                      </Button>
                      {weGuessed(memory.memory_type) && (
                        <Button
                          variant="ghost"
                          onClick={() => sayItsWrong(memory)}
                          disabled={busy}
                        >
                          That&apos;s not right
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        onClick={() => remove(memory)}
                        disabled={busy}
                      >
                        {removing === memory.memory_id && busy ? "Removing…" : "Remove"}
                      </Button>
                    </div>
                  </>
                )}

                {/* Propagation status - abc.md:136 asks for it by name, and
                    abc.md:342 forbids a partial removal looking finished. */}
                {removing === memory.memory_id && removal && (
                  <div className="mt-3 rounded-lg border border-edge bg-base px-3 py-2">
                    {stillThere.length > 0 ? (
                      <>
                        <p className="text-sm font-semibold text-bad">
                          Not fully removed yet
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          We could not finish removing this everywhere. It may
                          still be used. Please try again in a moment.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-accent">Removed</p>
                        <p className="mt-1 text-xs text-muted">
                          Gone from everywhere we use it. A copy may remain in a
                          backup until that backup expires, which we cannot
                          delete early — but nothing will read it.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Pause and opt out - paths four and five. Nothing in the API changes
          consent, so this says so rather than offering a switch that does
          nothing. */}
      <Card
        title="Pause or turn off memory"
        hint="abc.md:136 asks for these. They are not connected yet."
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warn">not available yet</Badge>
          </div>
          <p className="text-sm text-muted">
            Pausing and turning off memory both change your consent state. The
            memory service reads that state and already honours it — while paused,
            it uses no memory at all and says so — but none of its ten endpoints
            can change it, so there is nothing for these controls to call.
          </p>
          <p className="text-xs text-faint">
            No switch is shown here on purpose. A control that looked like it
            turned memory off without turning it off would be worse than no
            control at all.
          </p>
          <div className="flex gap-2 opacity-40">
            <Button variant="ghost" disabled>
              Pause memory
            </Button>
            <Button variant="ghost" disabled>
              Turn memory off
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
