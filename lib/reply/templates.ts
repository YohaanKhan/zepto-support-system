import type { Decision, OrderRow, ResolutionAction } from "@/lib/types";

// Deterministic per-action reply templates. This is the FALLBACK path and it is
// built FIRST (ARCHITECTURE §3): a dead LLM key must never break the demo
// (Invariant #10). The Sprint 8 LLM path sits in front of this and degrades to
// it on any error, timeout, or missing key.

const DRAFT_PREFIX = "[DRAFT — AWAITING APPROVAL] ";

/** The ticket shape a reply needs. `description` feeds the LLM prompt (Sprint 8). */
export interface ReplyTicket {
  ticketId: string;
  orderId: string;
  description?: string;
}

function body(
  action: ResolutionAction,
  amountInr: number | null,
  orderId: string,
): string {
  const amount = amountInr ?? 0;
  switch (action) {
    case "redelivery":
      return `We apologize for the inconvenience. We're arranging redelivery of your order #${orderId}.`;
    case "partial_refund":
      return `We're processing a refund of ₹${amount} for the affected item(s). You should see it in 3-5 business days.`;
    case "full_refund":
      return `We're processing a full refund of ₹${amount}. You should see it in 3-5 business days.`;
    case "refund_reissue":
      return `We're re-triggering your refund. Please allow 3-5 business days.`;
    case "coupon":
      return `We've issued a ₹${amount} coupon to your account as a goodwill gesture.`;
    case "escalation":
      return `We've escalated your case to our specialist team. They'll reach out within 24 hours.`;
    case "apology_no_action":
      return `We sincerely apologize for the delay. We're working to improve our delivery times.`;
  }
}

/**
 * Render a customer reply from templates. Runs for BOTH lanes — the customer
 * gets a reply either way — but a human-lane reply is a DRAFT awaiting approval
 * and is prefixed to say so.
 *
 * `order` is accepted for signature parity with the LLM path (which uses order
 * context); the templates themselves only need the order id and the amount.
 */
export function generateTemplateReply(
  decision: Pick<Decision, "action" | "amountInr" | "lane">,
  ticket: ReplyTicket,
  _order?: OrderRow,
): string {
  const text = body(decision.action, decision.amountInr, ticket.orderId);
  return decision.lane === "human" ? DRAFT_PREFIX + text : text;
}
