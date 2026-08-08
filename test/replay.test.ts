import { describe, expect, it } from "vitest";
import { computeSavings, MINUTES_PER_TICKET } from "@/lib/metrics";
import {
  clamp01,
  DEFAULT_REPLAY_THRESHOLDS,
  laneAtThresholds,
  type ReplayScores,
} from "@/lib/policy/replay";
import { THRESHOLDS } from "@/lib/policy/thresholds";

// Sprint 9 (replay) + Sprint 10 (savings) — pure functions, no DB.

const base = DEFAULT_REPLAY_THRESHOLDS;

function scores(partial: Partial<ReplayScores>): ReplayScores {
  return { topSimilarity: 1, voteShare: 1, voteMargin: 1, vetoedBy: null, ...partial };
}

describe("laneAtThresholds", () => {
  it("defaults mirror the frozen THRESHOLDS", () => {
    expect(base.minSimilarity).toBe(THRESHOLDS.MIN_SIMILARITY);
    expect(base.minVoteShare).toBe(THRESHOLDS.MIN_VOTE_SHARE);
    expect(base.minVoteMargin).toBe(THRESHOLDS.MIN_VOTE_MARGIN);
  });

  it("auto-resolves when every gate clears and nothing vetoed", () => {
    expect(laneAtThresholds(scores({ topSimilarity: 1, voteShare: 0.68, voteMargin: 0.35 }), base)).toBe("auto");
  });

  it("a fired veto can never be overridden by loosening thresholds", () => {
    const loose = { minSimilarity: 0, minVoteShare: 0, minVoteMargin: 0 };
    expect(laneAtThresholds(scores({ vetoedBy: "G1" }), loose)).toBe("human");
  });

  it("the milk-packet case flips human→auto when share drops 0.60→0.55", () => {
    const milk = scores({ topSimilarity: 1, voteShare: 0.57, voteMargin: 0.2 });
    expect(laneAtThresholds(milk, base)).toBe("human"); // 0.57 < 0.60 default
    expect(laneAtThresholds(milk, { ...base, minVoteShare: 0.55 })).toBe("auto");
  });

  it("a 7–7 tie (margin 0.00) stays human even at similarity 1.0", () => {
    expect(laneAtThresholds(scores({ voteMargin: 0 }), base)).toBe("human");
  });
});

describe("clamp01", () => {
  it("clamps out-of-range and falls back on garbage", () => {
    expect(clamp01("1.5", 0.4)).toBe(1);
    expect(clamp01("-2", 0.4)).toBe(0);
    expect(clamp01("0.55", 0.4)).toBe(0.55);
    expect(clamp01("abc", 0.4)).toBe(0.4);
    expect(clamp01(null, 0.4)).toBe(0.4);
  });
});

describe("computeSavings", () => {
  it("is auto-count × 25 median agent-minutes", () => {
    expect(MINUTES_PER_TICKET).toBe(25);
    expect(computeSavings(11)).toBe(275);
    expect(computeSavings(0)).toBe(0);
  });
});
