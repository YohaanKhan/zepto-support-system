import type {
  Candidate,
  GuardrailResult,
  ResolutionAction,
} from "@/lib/types";
import { THRESHOLDS } from "./thresholds";

// Deterministic, template-built "why this action?" string (ARCHITECTURE §2.3).
// NOT the LLM. Must be identical on every replay of the same ticket.

export interface ReasoningInput {
  candidate: Candidate;
  action: ResolutionAction;
  amountInr: number | null;
  confidence: number;
  lane: "auto" | "human";
  vetoedBy: string | null;
  guardrails: GuardrailResult[];
}

export function buildReasoning({
  candidate: c,
  action,
  amountInr,
  confidence,
  lane,
  vetoedBy,
  guardrails,
}: ReasoningInput): string {
  const n = c.precedents.length;
  const amt = amountInr !== null ? ` (₹${amountInr})` : "";
  const head =
    `Matched ${n} precedent${n === 1 ? "" : "s"} · top similarity ` +
    `${c.topSimilarity.toFixed(2)}, vote share ${c.voteShare.toFixed(2)}, ` +
    `margin ${c.voteMargin.toFixed(2)} → proposed ${action}${amt}. ` +
    `Confidence ${confidence.toFixed(2)}.`;

  if (lane === "auto") {
    return `${head} All gates passed → auto-resolved.`;
  }

  // Human lane — say precisely why. A guardrail veto takes precedence in the
  // explanation; otherwise the gate failed on the numbers.
  if (vetoedBy) {
    const g = guardrails.find((x) => x.id === vetoedBy);
    return `${head} Blocked by ${vetoedBy}: ${g?.reason ?? ""}. Routed to human review.`;
  }

  const reasons: string[] = [];
  if (c.topSimilarity < THRESHOLDS.MIN_SIMILARITY) {
    reasons.push(
      `similarity ${c.topSimilarity.toFixed(2)} < ${THRESHOLDS.MIN_SIMILARITY}`,
    );
  }
  if (c.voteShare < THRESHOLDS.MIN_VOTE_SHARE) {
    reasons.push(`vote share ${c.voteShare.toFixed(2)} < ${THRESHOLDS.MIN_VOTE_SHARE}`);
  }
  if (c.voteMargin < THRESHOLDS.MIN_VOTE_MARGIN) {
    reasons.push(`margin ${c.voteMargin.toFixed(2)} < ${THRESHOLDS.MIN_VOTE_MARGIN}`);
  }
  const why = reasons.length > 0 ? reasons.join("; ") : "gate not satisfied";
  return `${head} Precedents disagree (${why}) → routed to human review.`;
}
