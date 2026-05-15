// Structured flow logging helper.
//
// Every user action that kicks off the resume pipeline gets a flow id.
// The id rides through client → server → back to client so we can
// trace one user action across all the agents and find exactly where
// it breaks.
//
// Format:
//   [flow:<step>] <action> id=<flowId> took=<ms>ms <key>=<value>...
//
// Conventions:
//   - START: logged at entry. Includes input shape (sizes, not full content).
//   - OK:    logged at success. Includes output shape + tookMs.
//   - ERR:   logged at error. Includes err message + tookMs.
//   - INFO:  intermediate signal (e.g. "pills rendered", "chip clicked").
//
// Server routes read the `x-stackle-flow-id` header to continue the
// trace. If missing, the server generates its own and the client
// can correlate later via response headers.

export type FlowStep =
  | "upload"
  | "parse-file"
  | "extract"
  | "orchestrate"
  | "stackle-orchestrate"
  | "analyze"
  | "market"
  | "synthesize"
  | "chat-receive"
  | "pills-render"
  | "chip-click"
  | "artifact-push"
  | "artifact-open";

export function newFlowId(): string {
  // Short, sortable, no deps. Format: "f-<base36 ms>-<rand>"
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 6);
  return `f-${ts}-${rnd}`;
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === "string") {
    if (v.length > 60) return `"${v.slice(0, 57)}..."(${v.length})`;
    return `"${v}"`;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `arr(${v.length})`;
  if (typeof v === "object") return `obj(${Object.keys(v as object).length}k)`;
  return String(v);
}

function fmtFields(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${k}=${fmtValue(v)}`)
    .join(" ");
}

export function flowStart(
  step: FlowStep,
  flowId: string,
  input: Record<string, unknown> = {},
): { end: (output?: Record<string, unknown>) => void; err: (e: unknown) => void } {
  const start = Date.now();
  // eslint-disable-next-line no-console
  console.log(`[flow:${step}] START id=${flowId} ${fmtFields(input)}`);
  return {
    end(output: Record<string, unknown> = {}) {
      const took = Date.now() - start;
      // eslint-disable-next-line no-console
      console.log(`[flow:${step}] OK    id=${flowId} took=${took}ms ${fmtFields(output)}`);
    },
    err(e: unknown) {
      const took = Date.now() - start;
      const msg = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error(`[flow:${step}] ERR   id=${flowId} took=${took}ms err="${msg}"`);
    },
  };
}

export function flowInfo(step: FlowStep, flowId: string, fields: Record<string, unknown> = {}) {
  // eslint-disable-next-line no-console
  console.log(`[flow:${step}] INFO  id=${flowId} ${fmtFields(fields)}`);
}

// Server-side helper: pulls the flow id from a Headers object. Falls
// back to a new id so the trace at least has continuity within that
// request even if the client didn't propagate one.
export function flowIdFromHeaders(h: Headers): string {
  return h.get("x-stackle-flow-id") || newFlowId();
}
