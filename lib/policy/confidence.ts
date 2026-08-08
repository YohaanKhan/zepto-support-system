import type { Candidate } from "@/lib/types";

// confidence = topSimilarity × voteShare  (ARCHITECTURE §2.1)
//
// Both factors are necessary and neither is sufficient:
//   • similarity alone is ~1.0 for every shipped ticket (verbatim matches),
//     so gating on it auto-resolves everything — fails scenarios 2 and 3.
//   • vote share alone ignores whether the precedents are even about this
//     ticket — needed for the paraphrase / novel case.
//
// NOTE: G5 (weak evidence) tests topSimilarity directly, NOT this product —
// see guardrails.ts for why conflating them mislabels a disagreement case.

export function computeConfidence(
  candidate: Pick<Candidate, "topSimilarity" | "voteShare">,
): number {
  return candidate.topSimilarity * candidate.voteShare;
}
