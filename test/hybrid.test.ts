import { describe, expect, it } from "vitest";
import { HybridRetriever } from "@/lib/retrieval/hybrid";
import type { Retriever } from "@/lib/retrieval/types";
import type { ScoredPrecedent } from "@/lib/types";

// Sprint 13 — hybrid fusion + graceful fallback. Pure; no live Qdrant.

function p(ticketId: string, similarity: number): ScoredPrecedent {
  return { ticketId, category: "missing_item", description: ticketId, action: "partial_refund", csat: 5, similarity };
}

function fixed(list: ScoredPrecedent[]): Retriever {
  return { search: async () => list };
}

const dead: Retriever = {
  search: async () => {
    throw new Error("Qdrant unreachable");
  },
};

describe("HybridRetriever", () => {
  it("degrades to TF-IDF when Qdrant throws (Invariant #10)", async () => {
    const sparse = fixed([p("A", 1.0), p("B", 0.5)]);
    const hybrid = new HybridRetriever(sparse, dead);
    const out = await hybrid.search("q", 10);
    expect(out.map((r) => r.ticketId)).toEqual(["A", "B"]);
    expect(out[0].similarity).toBe(1.0);
  });

  it("keeps similarity on the cosine scale (max), so G1–G5 stay calibrated", async () => {
    // A is a verbatim sparse match (1.0) also seen by dense at 0.9 → stays 1.0.
    const sparse = fixed([p("A", 1.0), p("B", 0.5)]);
    const dense = fixed([p("C", 0.7), p("A", 0.9)]);
    const out = await new HybridRetriever(sparse, dense).search("q", 10);
    const a = out.find((r) => r.ticketId === "A");
    expect(a?.similarity).toBe(1.0); // magnitude preserved, not an RRF ~0.016
  });

  it("unions the pools so a dense-only paraphrase is included and ranked by magnitude", async () => {
    const sparse = fixed([p("A", 1.0)]);
    const dense = fixed([p("C", 0.7)]); // TF-IDF never saw C
    const out = await new HybridRetriever(sparse, dense).search("q", 10);
    expect(out.map((r) => r.ticketId)).toEqual(["A", "C"]);
    expect(out.map((r) => r.similarity)).toEqual([1.0, 0.7]);
  });
});
