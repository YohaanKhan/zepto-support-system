import type { ScoredPrecedent } from "@/lib/types";
import type { Retriever } from "./types";

// Sprint 13 — hybrid retrieval. Runs the sparse (TF-IDF) and dense (Qdrant)
// retrievers in parallel and fuses their ranked lists.
//
// ── Why not raw Reciprocal Rank Fusion for the score? ──────────────────────
// The G1–G5 thresholds (MIN_SIMILARITY 0.45, G5 weak-evidence) are calibrated
// against cosine-similarity *magnitude*, where a verbatim match scores 1.0. Raw
// RRF scores are ~1/61 ≈ 0.016, which would trip G5 on every ticket and destroy
// the 11/19 board. So we keep `similarity` on the [0,1] cosine scale
// (max across the two retrievers, which is exactly the paraphrase-robustness
// win — a dense-only match lifts a ticket TF-IDF missed) and use the RRF score
// as the fusion tie-break that orders items within a similarity tier and, via
// the unioned candidate pool, decides inclusion.
//
// Fallback (Invariant #10): if Qdrant errors or times out, we log and return the
// TF-IDF results unchanged. Nothing 500s.

const RRF_K = 60;

export class HybridRetriever implements Retriever {
  constructor(
    private readonly sparse: Retriever,
    private readonly dense: Retriever,
  ) {}

  async search(text: string, k: number): Promise<ScoredPrecedent[]> {
    const [sparseRes, denseRes] = await Promise.allSettled([
      this.sparse.search(text, k),
      this.dense.search(text, k),
    ]);

    if (sparseRes.status !== "fulfilled") {
      // TF-IDF should never throw; if it somehow does, lean on dense.
      if (denseRes.status === "fulfilled") return denseRes.value;
      throw sparseRes.reason;
    }
    const sparseList = sparseRes.value;

    if (denseRes.status !== "fulfilled") {
      console.warn(
        `[hybrid] Qdrant retrieval failed, degrading to TF-IDF: ${
          denseRes.reason instanceof Error ? denseRes.reason.message : String(denseRes.reason)
        }`,
      );
      return sparseList;
    }
    const denseList = denseRes.value;

    // Merge on ticketId. similarity = max magnitude; rrf = sum of 1/(K+rank).
    type Fused = ScoredPrecedent & { rrf: number };
    const fused = new Map<string, Fused>();

    const fold = (list: ScoredPrecedent[]) => {
      list.forEach((p, rank) => {
        const existing = fused.get(p.ticketId);
        const rrf = 1 / (RRF_K + rank);
        if (existing) {
          existing.rrf += rrf;
          existing.similarity = Math.max(existing.similarity, p.similarity);
        } else {
          fused.set(p.ticketId, { ...p, rrf });
        }
      });
    };
    fold(sparseList);
    fold(denseList);

    const merged = [...fused.values()].sort(
      (a, b) =>
        b.similarity - a.similarity || // magnitude leads (keeps G1–G5 calibrated)
        b.rrf - a.rrf || // RRF fusion tie-break
        b.csat - a.csat ||
        (a.ticketId < b.ticketId ? -1 : a.ticketId > b.ticketId ? 1 : 0),
    );

    // Strip the internal rrf field before returning.
    return merged.slice(0, k).map(({ rrf: _rrf, ...p }) => p);
  }
}
