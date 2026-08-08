// Sprint 10 — savings counter.
//
// Every auto-resolved ticket is one a human agent did not have to touch. We
// value that at the median historical handling time (25 min, DATA.md §1 /
// PLAN Sprint 10). This is the ONLY place that constant lives.

/** Median historical time_to_resolve_min across the 300-row corpus. */
export const MINUTES_PER_TICKET = 25;

/** Agent-minutes saved by auto-resolving `autoResolvedCount` tickets. */
export function computeSavings(autoResolvedCount: number): number {
  return Math.max(0, Math.round(autoResolvedCount)) * MINUTES_PER_TICKET;
}
