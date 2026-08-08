import type {
  Candidate,
  GuardrailResult,
  OrderRow,
  ResolutionAction,
} from "@/lib/types";
import { computeAmount } from "./amounts";
import { THRESHOLDS } from "./thresholds";

// Hard business guardrails (ARCHITECTURE §2.3). Each is a pure function; every
// rule is evaluated and recorded (pass, veto, or mutate) so the UI can show the
// full "why" panel — a fired guardrail is a feature to show off, not hide.
//
//   G1  cancelled order ⇒ redelivery forbidden        → veto  (human lane)
//   G2  refund amount ≤ order.value_inr               → mutate (clamp)
//   G3  partial_refund = floor(value_inr / items)     → mutate (set amount)
//   G4  escalation never auto-executes                → veto  (human lane)
//   G5  topSimilarity < MIN_SIMILARITY ⇒ weak evidence → veto  (human lane)

/** G2 as a standalone, unit-tested helper: no refund may exceed order value. */
export function clampRefund(
  amount: number,
  order: Pick<OrderRow, "value_inr">,
): number {
  return Math.min(amount, order.value_inr);
}

const REFUND_ACTIONS: readonly ResolutionAction[] = ["full_refund", "partial_refund"];

export interface GuardrailOutcome {
  action: ResolutionAction; // unchanged from the proposal; a veto blocks, it does not rewrite
  amountInr: number | null;
  results: GuardrailResult[]; // all five, in order, pass or not
  vetoedBy: string | null; // first veto in G-order, or null
}

export function applyGuardrails(
  candidate: Candidate,
  order: OrderRow,
): GuardrailOutcome {
  const action = candidate.proposedAction;
  let amount = computeAmount(action, order);
  const results: GuardrailResult[] = [];
  let vetoedBy: string | null = null;
  const veto = (id: string) => {
    if (!vetoedBy) vetoedBy = id;
  };

  // G1 — no redelivery on a cancelled order (Scenario 4).
  if (action === "redelivery" && order.delivery_status === "cancelled") {
    results.push({
      id: "G1",
      status: "veto",
      reason: `cannot redeliver order ${order.order_id} — it was cancelled`,
    });
    veto("G1");
  } else {
    results.push({
      id: "G1",
      status: "pass",
      reason:
        action === "redelivery"
          ? "order was delivered — redelivery allowed"
          : "not a redelivery",
    });
  }

  // G2 — refund cap. The last line of defence against a runaway refund.
  if (REFUND_ACTIONS.includes(action) && amount !== null) {
    const capped = clampRefund(amount, order);
    if (capped < amount) {
      results.push({
        id: "G2",
        status: "mutate",
        reason: `refund capped at order value ₹${order.value_inr}`,
        mutatedAmount: capped,
      });
      amount = capped;
    } else {
      results.push({
        id: "G2",
        status: "pass",
        reason: `refund ₹${amount} ≤ order value ₹${order.value_inr}`,
      });
    }
  } else {
    results.push({ id: "G2", status: "pass", reason: "no refund amount to cap" });
  }

  // G3 — partial refund is the per-item average (our stated policy, not learned).
  if (action === "partial_refund") {
    results.push({
      id: "G3",
      status: "mutate",
      reason: `partial refund = floor(₹${order.value_inr} / ${order.items} items) = ₹${amount}`,
      mutatedAmount: amount ?? undefined,
    });
  } else {
    results.push({ id: "G3", status: "pass", reason: "not a partial refund" });
  }

  // G4 — escalation means "a human must look". Auto-executing it is a contradiction.
  if (action === "escalation") {
    results.push({
      id: "G4",
      status: "veto",
      reason: "escalation requires human review",
    });
    veto("G4");
  } else {
    results.push({ id: "G4", status: "pass", reason: "not an escalation" });
  }

  // G5 — weak evidence. Test topSimilarity, NOT confidence: a strongly-matched
  // but split ticket (sim 0.90 × share 0.50 = 0.45) is a DISAGREEMENT case
  // (Scenario 3), not weak evidence (Scenario 2). Conflating them prints
  // "evidence too weak" on a strongly-matched card, which is visibly wrong.
  if (candidate.topSimilarity < THRESHOLDS.MIN_SIMILARITY) {
    results.push({
      id: "G5",
      status: "veto",
      reason: `evidence too weak — top similarity ${candidate.topSimilarity.toFixed(
        2,
      )} < ${THRESHOLDS.MIN_SIMILARITY}`,
    });
    veto("G5");
  } else {
    results.push({
      id: "G5",
      status: "pass",
      reason: `top similarity ${candidate.topSimilarity.toFixed(2)} ≥ ${THRESHOLDS.MIN_SIMILARITY}`,
    });
  }

  return { action, amountInr: amount, results, vetoedBy };
}
