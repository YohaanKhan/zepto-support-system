import type { Candidate, GuardrailResult } from "@/lib/types";
import { THRESHOLDS } from "./thresholds";

// The gate (ARCHITECTURE §2.2). Auto-resolve IFF all three thresholds hold AND
// no guardrail vetoed. MIN_VOTE_MARGIN is what makes Scenario 3 pass
// structurally: a 50/50 split has margin 0.00 and can never auto-resolve,
// whatever the similarity.

export function applyGate(
  candidate: Pick<Candidate, "topSimilarity" | "voteShare" | "voteMargin">,
  guardrails: GuardrailResult[],
): "auto" | "human" {
  const vetoed = guardrails.some((g) => g.status === "veto");
  const pass =
    candidate.topSimilarity >= THRESHOLDS.MIN_SIMILARITY &&
    candidate.voteShare >= THRESHOLDS.MIN_VOTE_SHARE &&
    candidate.voteMargin >= THRESHOLDS.MIN_VOTE_MARGIN &&
    !vetoed;
  return pass ? "auto" : "human";
}
