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
