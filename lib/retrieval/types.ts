import type { ScoredPrecedent } from "@/lib/types";

/**
 * One interface, two implementations (ARCHITECTURE §1.1): TfIdfRetriever
 * always, QdrantRetriever optionally (Sprint 13), fused by a HybridRetriever.
 * `search` returns the top-k precedents by similarity, sorted descending with a
 * deterministic tie-break (similarity DESC, csat DESC, ticket_id ASC).
 */
export interface Retriever {
  search(text: string, k: number): Promise<ScoredPrecedent[]>;
}
