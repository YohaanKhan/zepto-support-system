// Shared domain types.
//
// Sprint 1 scope: only the closed unions and the CSV row shapes the ingest
// route needs (Invariant #9 — define ResolutionAction now, reference
// everywhere). Candidate / Decision / GuardrailResult are Sprint 2+ and are
// intentionally NOT defined here yet.

/**
 * The label the system predicts. Closed union of EXACTLY the seven values
 * present in resolved_tickets.csv. The system may never emit an eighth.
 * (ARCHITECTURE §1.2, DATA.md §1, Invariant #9.)
 */
export type ResolutionAction =
  | "redelivery"
  | "partial_refund"
  | "full_refund"
  | "refund_reissue"
  | "coupon"
  | "escalation"
  | "apology_no_action";

/** Runtime-checkable list of the union above. Use this to validate CSV input. */
export const RESOLUTION_ACTIONS = [
  "redelivery",
  "partial_refund",
  "full_refund",
  "refund_reissue",
  "coupon",
  "escalation",
  "apology_no_action",
] as const satisfies readonly ResolutionAction[];

export function isResolutionAction(v: unknown): v is ResolutionAction {
  return (
    typeof v === "string" &&
    (RESOLUTION_ACTIONS as readonly string[]).includes(v)
  );
}

/** Human-assigned class on the history corpus (DATA.md §1). Five values. */
export type TicketCategory =
  | "refund_pending"
  | "missing_item"
  | "wrong_item"
  | "quality_issue"
  | "order_late";

export const TICKET_CATEGORIES = [
  "refund_pending",
  "missing_item",
  "wrong_item",
  "quality_issue",
  "order_late",
] as const satisfies readonly TicketCategory[];

/**
 * Order state. A STRING enum, not a boolean — the column is `delivery_status`,
 * there is no `is_cancelled` flag (DATA.md §3.1). G1 tests this === 'cancelled'.
 */
export type DeliveryStatus = "delivered" | "cancelled";

export const DELIVERY_STATUSES = [
  "delivered",
  "cancelled",
] as const satisfies readonly DeliveryStatus[];

export function isDeliveryStatus(v: unknown): v is DeliveryStatus {
  return v === "delivered" || v === "cancelled";
}

// ── CSV row shapes (post-parse, typed) ─────────────────────────────────────

/** resolved_tickets.csv — 300 rows, 7 columns. */
export interface ResolvedTicketRow {
  ticket_id: string;
  category: string;
  description: string;
  resolution_action: ResolutionAction;
  resolution_note: string;
  time_to_resolve_min: number;
  csat: number;
}

/** orders_context.csv — 30 rows, 5 columns. */
export interface OrderRow {
  order_id: string;
  items: number;
  value_inr: number;
  delivery_time_min: number;
  delivery_status: DeliveryStatus;
}

/** new_tickets.csv — 30 rows, 4 columns. created_at is naive IST (DATA.md §2). */
export interface NewTicketRow {
  ticket_id: string;
  created_at: string;
  order_id: string;
  description: string;
}

export function isTicketCategory(v: unknown): v is TicketCategory {
  return (
    typeof v === "string" &&
    (TICKET_CATEGORIES as readonly string[]).includes(v)
  );
}

// ── Pipeline domain types (ARCHITECTURE §1.2, §2.3) ────────────────────────

/**
 * A history row as the retriever consumes it. Note there is NO order context
 * here — Triage is deliberately context-blind (Invariant #1). resolution_note
 * and time_to_resolve_min are deliberately absent: the note leaks the label
 * (DATA.md §4.3) and the time only feeds the savings counter.
 */
export interface Precedent {
  ticketId: string;
  category: TicketCategory;
  description: string;
  action: ResolutionAction;
  csat: number;
}

/** A precedent with its similarity to the query attached. */
export interface ScoredPrecedent extends Precedent {
  similarity: number;
}

/** Result of the CSAT-weighted vote over a set of scored precedents. */
export interface VoteResult {
  proposedAction: ResolutionAction;
  voteShare: number; // 0..1 — winner's share of total weight
  voteMargin: number; // 0..1 — winner minus runner-up
  runnerUpAction: ResolutionAction | null;
  /** Per-action weights, sorted winner-first. Debug / UI only. */
  tallies: { action: ResolutionAction; weight: number }[];
}

/** Output of Stage 1 — Triage. Persists nothing on its own (ARCHITECTURE §1.2). */
export interface Candidate {
  ticketId: string;
  precedents: ScoredPrecedent[]; // all voters ≥ MIN_SIMILARITY; top 3 surface in UI
  proposedAction: ResolutionAction;
  topSimilarity: number; // similarity of rank-1 precedent
  voteShare: number;
  voteMargin: number;
  inferredCategory: TicketCategory; // majority category among voters
  runnerUpAction: ResolutionAction | null;
}

/** A single guardrail evaluation (ARCHITECTURE §2.3). Sprint 3 fills the rules. */
export interface GuardrailResult {
  id: string; // 'G1' … 'G5'
  status: "pass" | "veto" | "mutate";
  reason: string;
  mutatedAction?: ResolutionAction;
  mutatedAmount?: number;
}

/** Output of Stage 2 — Policy. The decision itself (ARCHITECTURE §2.3). */
export interface Decision {
  ticketId: string;
  lane: "auto" | "human";
  action: ResolutionAction;
  amountInr: number | null;
  confidence: number;
  voteShare: number;
  voteMargin: number;
  topSimilarity: number;
  precedentIds: string[]; // ordered, all voters
  guardrails: GuardrailResult[];
  vetoedBy: string | null; // e.g. 'G1'
  reasoning: string; // deterministic template — NOT LLM
  draftReply?: string; // Sprint 4/8
  replySource?: "llm" | "template"; // Sprint 4/8
}

// ── Board / API view types (Sprint 6) ──────────────────────────────────────

/** A top-3 precedent as persisted on the decision and shown on the card. */
export interface PrecedentView {
  ticketId: string;
  similarity: number;
  action: ResolutionAction;
  csat: number;
}

/** Everything one board card needs, assembled by GET /api/board. */
export interface BoardCard {
  /** The persisted decision row id — needed to approve/override (Sprint 11). */
  decisionId: string;
  ticketId: string;
  description: string;
  order: {
    orderId: string;
    items: number;
    valueInr: number;
    deliveryStatus: DeliveryStatus;
  } | null;
  lane: "auto" | "human";
  action: ResolutionAction;
  amountInr: number | null;
  confidence: number;
  voteShare: number;
  voteMargin: number;
  topSimilarity: number;
  guardrails: GuardrailResult[];
  vetoedBy: string | null;
  reasoning: string;
  draftReply: string | null;
  replySource: "llm" | "template" | null;
  precedents: PrecedentView[];
}

export interface BoardResponse {
  autoResolved: BoardCard[];
  needsHuman: BoardCard[];
  counts: { auto: number; human: number; total: number };
  /** Agent-minutes saved by the auto-resolved lane (Sprint 10). */
  savings: number;
  /** Which retriever produced these decisions: 'tfidf' | 'hybrid' (Sprint 13). */
  retriever: string;
  /** The threshold set applied to this partition (defaults unless replayed). */
  thresholds: {
    minSimilarity: number;
    minVoteShare: number;
    minVoteMargin: number;
  };
}
