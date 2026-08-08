import type { Candidate, Decision, OrderRow } from "@/lib/types";
import { computeConfidence } from "./confidence";
import { applyGate } from "./gate";
import { applyGuardrails } from "./guardrails";
import { buildReasoning } from "./reasoning";

// Stage 2 — Policy. THE DECISION LIVES HERE. Fixed order (ARCHITECTURE §2):
// compute confidence → apply guardrails → apply the gate. Guardrails run before
// the gate so a veto is recorded even on a ticket that would have been
// escalated anyway — that is what populates the "why" panel.
//
// Fully deterministic and model-free (Invariant #2): the same Candidate + order
// always yields the same Decision, which is what makes /api/replay possible.

export function makeDecision(candidate: Candidate, order: OrderRow): Decision {
  const confidence = computeConfidence(candidate);
  const { action, amountInr, results, vetoedBy } = applyGuardrails(candidate, order);
  const lane = applyGate(candidate, results);
  const reasoning = buildReasoning({
    candidate,
    action,
    amountInr,
    confidence,
    lane,
    vetoedBy,
    guardrails: results,
  });

  return {
    ticketId: candidate.ticketId,
    lane,
    action,
    amountInr,
    confidence,
    voteShare: candidate.voteShare,
    voteMargin: candidate.voteMargin,
    topSimilarity: candidate.topSimilarity,
    precedentIds: candidate.precedents.map((p) => p.ticketId),
    guardrails: results,
    vetoedBy,
    reasoning,
  };
}
