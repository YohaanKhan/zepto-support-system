import { describe, expect, it } from "vitest";
import { loadPrecedentsFromCsv } from "@/lib/retrieval/corpus";
import { TfIdfRetriever } from "@/lib/retrieval/tfidf";
import { triage } from "@/lib/triage";

// End-to-end triage over the real corpus, loaded from CSV so the DATA.md §1.3
// vote shares are locked in without a database. These numbers ARE the board.

const retriever = new TfIdfRetriever(loadPrecedentsFromCsv());
const run = (desc: string) => triage("N-TEST", desc, retriever);

describe("triage — DATA.md §1.3 vote shares", () => {
  it("bread not in the bag → partial_refund, share ~0.68, margin ~0.35", async () => {
    const c = await run("bread not in the bag");
    expect(c.proposedAction).toBe("partial_refund");
    expect(c.topSimilarity).toBeGreaterThan(0.999);
    expect(Math.abs(c.voteShare - 0.68)).toBeLessThan(0.02);
    expect(Math.abs(c.voteMargin - 0.35)).toBeLessThan(0.02);
    expect(c.inferredCategory).toBe("missing_item");
  });

  it("milk packet missing from my order → share ~0.57 (below the 0.60 gate)", async () => {
    const c = await run("milk packet missing from my order");
    expect(c.proposedAction).toBe("partial_refund");
    expect(Math.abs(c.voteShare - 0.57)).toBeLessThan(0.02);
    expect(c.voteShare).toBeLessThan(0.6); // will fall to the human lane in Sprint 3
  });

  it("curd delivered warm and spoiled → margin ~0.00 (7–7 tie)", async () => {
    const c = await run("curd delivered warm and spoiled");
    expect(c.voteMargin).toBeLessThan(0.01);
  });

  it("wrong brand of rice delivered → redelivery, clears the gate (share ~0.62)", async () => {
    const c = await run("wrong brand of rice delivered");
    expect(c.proposedAction).toBe("redelivery");
    expect(Math.abs(c.voteShare - 0.62)).toBeLessThan(0.02);
    expect(c.voteMargin).toBeGreaterThan(0.15);
  });
});

describe("triage — determinism", () => {
  it("produces identical shares/margins across 5 runs (no flapping)", async () => {
    const runs = await Promise.all(
      Array.from({ length: 5 }, () => run("bread not in the bag")),
    );
    const first = runs[0];
    for (const r of runs) {
      expect(r.proposedAction).toBe(first.proposedAction);
      expect(r.voteShare).toBe(first.voteShare);
      expect(r.voteMargin).toBe(first.voteMargin);
      expect(r.precedents.map((p) => p.ticketId)).toEqual(
        first.precedents.map((p) => p.ticketId),
      );
    }
  });
});

describe("triage — novel ticket", () => {
  it("keeps topSimilarity below the floor for an unrelated query", async () => {
    const c = await run("please help me change my registered mobile number");
    expect(c.topSimilarity).toBeLessThan(0.45);
  });

  // Vetted demo strings for the live box (Scenario 2). They MUST fall below
  // MIN_SIMILARITY so G5 (weak evidence) fires — that is what makes Scenario 2
  // demonstrable. If one creeps over 0.45, pick a different string; do NOT move
  // the threshold or weaken the tokenizer (that would shift the 11/19 board).
  it.each([
    "app crashed and charged me twice for the same order",
    "I want to close my account",
    "the driver was extremely rude to me",
  ])("vetted novel demo string %j → topSimilarity < 0.45 (G5 fires)", async (s) => {
    const c = await run(s);
    expect(c.topSimilarity).toBeLessThan(0.45);
  });

  // Known near-miss: VALIDATION §2 lists this, but it shares "the bag" (→ bread
  // not in the bag) and "delivery" tokens with the corpus, so TF-IDF scores it
  // ~0.456 — just OVER the floor. It is NOT a clean G5 demo. Documented so we
  // don't reach for it on stage.
  it("'threw the bag' string sits just above the floor — do not demo it", async () => {
    const c = await run("delivery person was rude and threw the bag at my door");
    expect(c.topSimilarity).toBeGreaterThanOrEqual(0.45);
  });
});
