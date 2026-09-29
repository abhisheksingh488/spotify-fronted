"use client";

// Why this file exists
// ====================
//
// Screen 5 of 7. abc.md:343 - "Schema and policy view: Read-only view for most
// roles; version history, allowed fields, retention, sensitivity, and rollout
// state."
//
// Read-only is the whole design: there is nothing to press on this screen, and
// no endpoint it calls can change anything.
//
// Allowed fields and the contract version are read live from the backend's own
// OpenAPI document, so this screen can never drift from the running service the
// way a copied table would. Every field, type, constraint and allowed value
// below is what the API will actually accept right now.
//
// Retention, sensitivity, rollout state and version history are NOT here,
// because no endpoint reports them. They live in the backend's
// data/policy_registry.yaml, which nothing serves. That gap is stated at the
// bottom rather than filled in from a duplicate copy that could go stale.

import { useEffect, useState } from "react";
import { ApiFailure, get } from "@/lib/api";
import { Badge, Card, ErrorNote, Stat } from "@/components/ui";

// Just the parts of an OpenAPI document this screen reads.
type OpenApi = {
  info: { title: string; version: string };
  paths: Record<string, Record<string, unknown>>;
  components?: { schemas?: Record<string, JsonSchema> };
};

type JsonSchema = {
  title?: string;
  description?: string;
  required?: string[];
  properties?: Record<string, FieldSchema>;
};

type FieldSchema = {
  type?: string;
  title?: string;
  description?: string;
  enum?: string[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  default?: unknown;
  anyOf?: FieldSchema[];
  items?: FieldSchema;
};

// The contracts worth showing, in the order a request travels through them.
// Named explicitly rather than listing all 25 schemas, because the internal ones
// are not part of what a caller may send.
const CONTRACTS = [
  { name: "Event", why: "What POST /v1/events accepts — the versioned event contract" },
  { name: "CreateMemoryRequest", why: "What POST /v1/memories accepts" },
  { name: "SearchRequest", why: "What POST /v1/memories/search accepts" },
  { name: "ComposeRequest", why: "What POST /v1/context/compose accepts" },
  { name: "PatchMemoryRequest", why: "What PATCH /v1/memories/{id} accepts" },
  { name: "FeedbackRequest", why: "What POST /v1/feedback accepts" },
  { name: "PolicyClass", why: "The policy class attached to every memory" },
];

// What abc.md:343 asks for that no endpoint reports.
const NO_DATA_SOURCE = [
  {
    label: "Retention, per memory type",
    why: "The backend holds this in data/policy_registry.yaml — exclusion 730 days, correction 730, explicit_preference 365, candidate_preference 90, episode 30 — but no endpoint serves that file. It is visible per candidate in a POST /v1/memories/extract response, one memory at a time, never as a registry.",
  },
  {
    label: "Sensitivity, per memory type",
    why: "Same file, same reason. Every type is currently `normal`.",
  },
  {
    label: "Retrieval eligibility, per memory type",
    why: "Same file. It is observable indirectly: the Memory explorer shows which memories a surface hides, which is this rule being applied.",
  },
  {
    label: "Version history",
    why: "The event contract reports one supported version (1.0) and rejects anything else, but no endpoint lists past versions or migrations.",
  },
  {
    label: "Rollout state",
    why: "Nothing in the backend tracks whether a policy change is rolled out, staged or pending review.",
  },
];

// One field's constraints in a single readable line.
function constraints(field: FieldSchema): string {
  const parts: string[] = [];
  // A nullable field arrives as anyOf [type, null]; read the real half.
  const real = field.anyOf?.find((option) => option.type && option.type !== "null") ?? field;

  if (real.type === "array" && real.items?.type) parts.push(`array of ${real.items.type}`);
  else if (real.type) parts.push(real.type);
  if (field.anyOf?.some((option) => option.type === "null")) parts.push("optional");
  if (real.minLength !== undefined) parts.push(`min length ${real.minLength}`);
  if (real.maxLength !== undefined) parts.push(`max length ${real.maxLength}`);
  if (real.minimum !== undefined) parts.push(`min ${real.minimum}`);
  if (real.maximum !== undefined) parts.push(`max ${real.maximum}`);
  if (field.default !== undefined && field.default !== null) {
    parts.push(`default ${JSON.stringify(field.default)}`);
  }
  return parts.join(" · ");
}

export default function SchemaAndPolicyPage() {
  const [spec, setSpec] = useState<OpenApi | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  // Read the live contract once on load.
  useEffect(() => {
    get<OpenApi>("/openapi.json")
      .then(setSpec)
      .catch((error) => setFailure(error as ApiFailure));
  }, []);

  const schemas = spec?.components?.schemas ?? {};

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold">Schema and policy</h1>
        <p className="mt-1 text-sm text-muted">
          Read-only. Every field below is read live from the running service, so
          it cannot be out of date.
        </p>
      </header>

      {failure && (
        <ErrorNote
          code={failure.code}
          message={failure.message}
          correlationId={failure.correlationId}
        />
      )}

      {spec && (
        <>
          <Card title="Contract version" hint="From the service's own OpenAPI document.">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="API version" value={spec.info.version} />
              <Stat label="event schema_version accepted" value="1.0" />
              <Stat label="endpoints" value={Object.keys(spec.paths).length} />
            </div>
            <p className="mt-3 text-[11px] text-faint">
              An event declaring any other schema_version is refused with
              UNSUPPORTED_SCHEMA_VERSION before anything is stored.
            </p>
          </Card>

          {/* Allowed fields - abc.md:343. */}
          {CONTRACTS.filter((contract) => schemas[contract.name]).map((contract) => {
            const schema = schemas[contract.name];
            const required = new Set(schema.required ?? []);
            return (
              <Card key={contract.name} title={contract.name} hint={contract.why}>
                <ul className="flex flex-col gap-1">
                  {Object.entries(schema.properties ?? {}).map(([field, spec]) => {
                    const allowed =
                      spec.enum ??
                      spec.anyOf?.find((option) => option.enum)?.enum ??
                      undefined;
                    return (
                      <li
                        key={field}
                        className="rounded-lg border border-edge bg-raised px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-ink">{field}</span>
                          {required.has(field) ? (
                            <Badge tone="bad">required</Badge>
                          ) : (
                            <Badge>optional</Badge>
                          )}
                          <span className="ml-auto text-[11px] text-faint">
                            {constraints(spec)}
                          </span>
                        </div>

                        {/* Allowed values, where the contract fixes them. This is
                            the part that stops a caller inventing a value. */}
                        {allowed && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {allowed.map((value) => (
                              <span
                                key={value}
                                className="rounded border border-accent/30 px-1.5 py-0.5 font-mono text-[10px] text-accent"
                              >
                                {value}
                              </span>
                            ))}
                          </div>
                        )}

                        {spec.description && (
                          <p className="mt-1 text-[11px] text-faint wrap-anywhere">
                            {spec.description}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </>
      )}

      {/* What abc.md:343 asks for that no endpoint reports. */}
      <Card
        title="Not available"
        hint="abc.md:343 asks for these. No endpoint serves them, so nothing is shown rather than a copy that could go stale."
      >
        <ul className="flex flex-col gap-2">
          {NO_DATA_SOURCE.map((item) => (
            <li
              key={item.label}
              className="rounded-lg border border-edge bg-raised/40 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted">{item.label}</span>
                <Badge tone="warn">no data source</Badge>
              </div>
              <p className="mt-1 text-[11px] text-faint">{item.why}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
