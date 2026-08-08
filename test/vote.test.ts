import { describe, expect, it } from "vitest";
import { computeVote } from "@/lib/triage/vote";
import type { ScoredPrecedent } from "@/lib/types";

function p(
  action: ScoredPrecedent["action"],
  csat: number,
  similarity = 1.0,
): ScoredPrecedent {
  return {
    ticketId: `X-${action}-${csat}-${Math.random()}`,
    category: "missing_item",
    description: "synthetic",
    action,
    csat,
    similarity,
  };
}

describe("computeVote", () => {
  it("computes csat-weighted share and margin", () => {
    // 3×partial_refund@csat5 + 1×redelivery@csat5, all sim 1.0
    // weights: partial=15, redelivery=5, total=20 → share 0.75, margin 0.50
    const v = computeVote([
      p("partial_refund", 5),
      p("partial_refund", 5),
      p("partial_refund", 5),
      p("redelivery", 5),
    ]);
    expect(v.proposedAction).toBe("partial_refund");
    expect(v.runnerUpAction).toBe("redelivery");
    expect(v.voteShare).toBeCloseTo(0.75, 5);
    expect(v.voteMargin).toBeCloseTo(0.5, 5);
  });

  it("weights by similarity as well as csat", () => {
    // redelivery@csat3,sim1 = 3 ; partial@csat5,sim0.5 = 2.5 → redelivery wins
    const v = computeVote([p("redelivery", 3, 1.0), p("partial_refund", 5, 0.5)]);
    expect(v.proposedAction).toBe("redelivery");
    expect(v.voteShare).toBeCloseTo(3 / 5.5, 5);
  });

  it("reports margin 0 for an exact tie", () => {
    const v = computeVote([p("full_refund", 4), p("redelivery", 4)]);
    expect(v.voteMargin).toBeCloseTo(0, 5);
    expect(v.voteShare).toBeCloseTo(0.5, 5);
  });

  it("handles an empty voter set without throwing", () => {
    const v = computeVote([]);
    expect(v.voteShare).toBe(0);
    expect(v.voteMargin).toBe(0);
    expect(v.runnerUpAction).toBeNull();
  });
});
