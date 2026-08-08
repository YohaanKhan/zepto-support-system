import type { ResolutionAction, ScoredPrecedent, VoteResult } from "@/lib/types";

// CSAT-weighted precedent vote (ARCHITECTURE §1.2).
//
//   weight(p)          = similarity(p) × csat(p)
//   voteWeight(action) = Σ weight(p) for p with that action
//   share  = voteWeight(winner) / Σ all voteWeight
//   margin = share(winner) − share(runner-up)
//
// CSAT only spans 3..5 in this data, so it is a tiebreaker, not a dominant
// term — do not over-claim it (DATA.md §4.2). Because every member of a cluster
// shares the identical description, they all score similarity 1.0 and the whole
// cluster votes; the share then reduces to the csat-weighted share within the
// cluster, matching DATA.md §1.3 exactly.

/**
 * Vote over the given precedents. Caller is responsible for having already
 * filtered to those ≥ MIN_SIMILARITY and capped at K — this function votes over
 * exactly what it is handed.
 */
export function computeVote(precedents: ScoredPrecedent[]): VoteResult {
  const weights = new Map<ResolutionAction, number>();
  let total = 0;
  for (const p of precedents) {
    const w = p.similarity * p.csat;
    weights.set(p.action, (weights.get(p.action) ?? 0) + w);
    total += w;
  }

  // Rank actions by weight DESC. Tie-break by action name ASC so a split is
  // deterministic (the curd 7–7 tie must resolve the same way every run).
  const tallies = [...weights.entries()]
    .map(([action, weight]) => ({ action, weight }))
    .sort((a, b) => b.weight - a.weight || (a.action < b.action ? -1 : 1));

  if (tallies.length === 0 || total === 0) {
    // No usable voters (novel ticket). Caller's G5 will veto on topSimilarity.
    return {
      proposedAction: "escalation",
      voteShare: 0,
      voteMargin: 0,
      runnerUpAction: null,
      tallies,
    };
  }

  const winner = tallies[0];
  const runnerUp = tallies[1] ?? null;
  const voteShare = winner.weight / total;
  const runnerUpShare = runnerUp ? runnerUp.weight / total : 0;

  return {
    proposedAction: winner.action,
    voteShare,
    voteMargin: voteShare - runnerUpShare,
    runnerUpAction: runnerUp ? runnerUp.action : null,
    tallies,
  };
}
