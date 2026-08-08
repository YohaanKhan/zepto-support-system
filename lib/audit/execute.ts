import type { SupabaseClient } from "@supabase/supabase-js";
import type { Decision } from "@/lib/types";

// Stage 4 (part) — simulate the action. NOTHING touches a real payment system
// (Invariant #8). Auto-lane actions are 'simulated'; human-lane actions are
// 'pending_approval'. Every action carries an idempotency key so re-running the
// pipeline over the same ticket cannot double-refund (ARCHITECTURE §4.4).

/** {ticket_id}:{action}:{attempt} — unique-constrained in the DB. */
export function idempotencyKey(
  ticketId: string,
  action: string,
  attempt = 1,
): string {
  return `${ticketId}:${action}:${attempt}`;
}

export async function executeAction(
  db: SupabaseClient,
  decision: Decision,
  decisionId: string,
): Promise<void> {
  const row = {
    decision_id: decisionId,
    type: decision.action,
    amount_inr: decision.amountInr,
    status: decision.lane === "auto" ? "simulated" : "pending_approval",
    idempotency_key: idempotencyKey(decision.ticketId, decision.action),
  };
  // ON CONFLICT (idempotency_key) DO NOTHING — the guard against double-refund.
  const { error } = await db
    .from("actions")
    .upsert(row, { onConflict: "idempotency_key", ignoreDuplicates: true });
  if (error) throw new Error(`executeAction: ${error.message}`);
}
