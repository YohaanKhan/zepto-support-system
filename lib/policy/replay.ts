import { THRESHOLDS } from "./thresholds";

// Sprint 9 — what-if replay. Re-partition a decision using ONLY its persisted
// scores at a caller-supplied threshold set. No retrieval, no voting, no LLM —
// this is the same gate as lib/policy/gate.ts but with the thresholds injected
// instead of read from the frozen THRESHOLDS constant.
//
// A hard veto is permanent: no slider position can auto-resolve a ticket a
// guardrail blocked (G1 on a cancelled order, G4 on escalation). Only the
// three tunable gates move cards.

export interface ReplayThresholds {
  minSimilarity: number;
  minVoteShare: number;
  minVoteMargin: number;
}

export interface ReplayScores {
  topSimilarity: number;
  voteShare: number;
  voteMargin: number;
  vetoedBy: string | null;
}

/** The default thresholds the board ships with (from the single source of truth). */
export const DEFAULT_REPLAY_THRESHOLDS: ReplayThresholds = {
  minSimilarity: THRESHOLDS.MIN_SIMILARITY,
  minVoteShare: THRESHOLDS.MIN_VOTE_SHARE,
  minVoteMargin: THRESHOLDS.MIN_VOTE_MARGIN,
};

/** Which lane a decision falls into at the given thresholds. Pure. */
export function laneAtThresholds(
  scores: ReplayScores,
  thresholds: ReplayThresholds,
): "auto" | "human" {
  if (scores.vetoedBy) return "human"; // a fired veto is never overridable
  const pass =
    scores.topSimilarity >= thresholds.minSimilarity &&
    scores.voteShare >= thresholds.minVoteShare &&
    scores.voteMargin >= thresholds.minVoteMargin;
  return pass ? "auto" : "human";
}

/** Clamp a raw query param into [0,1], falling back to a default. */
export function clamp01(value: string | number | null | undefined, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === null || n === undefined || Number.isNaN(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}
