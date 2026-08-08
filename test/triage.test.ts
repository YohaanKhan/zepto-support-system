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
});
