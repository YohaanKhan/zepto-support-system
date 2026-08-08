import type { OrderRow, ResolutionAction } from "@/lib/types";

// The single source of refund amounts (ARCHITECTURE §2.3). History records NO
// amounts (DATA.md §1.2) — every figure here is our stated policy, not learned.
//
//   full_refund     → order.value_inr
//   partial_refund  → floor(value_inr / items), clamped to value_inr   (G3)
//   coupon          → ₹50 flat (the only value in history)
//   everything else → null (no money moves)

const COUPON_INR = 50;

/** G3 — per-item average, clamped so it can never exceed the order value. */
export function computePartialRefund(order: Pick<OrderRow, "value_inr" | "items">): number {
  const perItem = Math.floor(order.value_inr / order.items);
  return Math.min(perItem, order.value_inr);
}

export function computeAmount(
  action: ResolutionAction,
  order: Pick<OrderRow, "value_inr" | "items">,
): number | null {
  switch (action) {
    case "full_refund":
      return order.value_inr;
    case "partial_refund":
      return computePartialRefund(order);
    case "coupon":
      return Math.min(COUPON_INR, order.value_inr);
    case "redelivery":
    case "refund_reissue":
    case "escalation":
    case "apology_no_action":
      return null;
  }
}
