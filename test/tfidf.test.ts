import { describe, expect, it } from "vitest";
import { loadPrecedentsFromCsv } from "@/lib/retrieval/corpus";
import { TfIdfRetriever } from "@/lib/retrieval/tfidf";

const corpus = loadPrecedentsFromCsv();
const retriever = new TfIdfRetriever(corpus);

describe("TfIdfRetriever", () => {
  it("scores a verbatim query at ~1.0 against its identical cluster", async () => {
    const hits = await retriever.search("bread not in the bag", 50);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].similarity).toBeGreaterThan(0.999);
    expect(hits[0].description).toBe("bread not in the bag");
  });

  it("isolates the cluster: nothing above the 0.45 floor is from another cluster", async () => {
    // If cross-cluster terms leaked above MIN_SIMILARITY, the vote shares would
    // drift from DATA.md §1.3. This guards that the floor cleanly separates.
    const hits = await retriever.search("bread not in the bag", 50);
    const aboveFloor = hits.filter((h) => h.similarity >= 0.45);
    expect(aboveFloor.length).toBe(17); // the bread cluster size (DATA.md §1.3)
    for (const h of aboveFloor) {
      expect(h.description).toBe("bread not in the bag");
    }
  });

  it("returns a clearly-novel query with all similarities below the floor", async () => {
    const hits = await retriever.search(
      "please help me change my registered mobile number",
      50,
    );
    const top = hits[0]?.similarity ?? 0;
    expect(top).toBeLessThan(0.45);
  });

  it("orders ties deterministically (similarity, then csat desc, then id asc)", async () => {
    const a = await retriever.search("bread not in the bag", 50);
    const b = await retriever.search("bread not in the bag", 50);
    expect(a.map((x) => x.ticketId)).toEqual(b.map((x) => x.ticketId));
    // Within the tied top cluster, csat is non-increasing.
    const cluster = a.filter((x) => x.similarity > 0.999);
    for (let i = 1; i < cluster.length; i++) {
      expect(cluster[i - 1].csat).toBeGreaterThanOrEqual(cluster[i].csat);
    }
  });
});
