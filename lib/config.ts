// Runtime feature flags. Kept tiny and centralised so the demo can be reasoned
// about from one place.

/**
 * Sprint 11 — approve/override write-back to the precedent corpus.
 *
 * ⚠️ Turn OFF during judging. When on, approving a decision appends a new
 * `human_approved` row to `resolved_tickets`, which changes the CSAT-weighted
 * vote shares mid-demo and invalidates the 11/19 board table (CLAUDE.md
 * "demo-day traps"). The approve/override endpoints and the audit log still
 * work with this off — only the corpus mutation is gated.
 */
export const ENABLE_WRITE_BACK =
  (process.env.ENABLE_WRITE_BACK ?? "false").toLowerCase() === "true";
