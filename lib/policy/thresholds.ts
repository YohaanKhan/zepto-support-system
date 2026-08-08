// The ONLY tunable constants in the system. Single source of truth
// (ARCHITECTURE §2.2, Invariant #3). No threshold may be hardcoded anywhere
// else, ever. The Sprint 9 slider manipulates exactly these three gates; K is
// a cap, not a tuning knob.
//
// Calibrated against the real CSAT-weighted vote shares (DATA.md §1.3) to
// produce an 11 auto / 19 needs-human board on the 30 shipped tickets.
// Not used until Sprint 3 — defined now per Sprint 1 invariant checkpoint.

export const THRESHOLDS = {
  /** Below this top similarity, the ticket is "novel" → human lane (G5). */
  MIN_SIMILARITY: 0.45,
  /** Precedents must actually agree this much on the winning action. */
  MIN_VOTE_SHARE: 0.6,
  /** ...and must beat the runner-up by at least this margin (Scenario 3). */
  MIN_VOTE_MARGIN: 0.15,
  /** Cap on voters; the real cut is the MIN_SIMILARITY floor, not this. */
  K: 50,
} as const;

export type Thresholds = typeof THRESHOLDS;
