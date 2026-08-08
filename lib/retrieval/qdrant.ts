import { QdrantClient } from "@qdrant/js-client-rest";
import {
  isResolutionAction,
  isTicketCategory,
  type ScoredPrecedent,
} from "@/lib/types";
import { embed } from "./embeddings";
import type { Retriever } from "./types";

// Sprint 13 — dense retrieval over Qdrant.
//
// The collection stores one point per resolved ticket, with the FULL precedent
// payload ({ ticketId, category, description, action, csat }) so search results
// are self-contained — no second DB round-trip to hydrate them. Cosine distance,
// 384-dim MiniLM vectors.

export const QDRANT_COLLECTION = "resolved_tickets";

export interface QdrantPayload extends Record<string, unknown> {
  ticketId: string;
  category: string;
  description: string;
  action: string;
  csat: number;
}

export function makeQdrantClient(): QdrantClient {
  const url = process.env.QDRANT_URL;
  if (!url) throw new Error("QDRANT_URL not set");
  return new QdrantClient({
    url,
    apiKey: process.env.QDRANT_API_KEY || undefined,
    // Fail fast so a dead Qdrant degrades to TF-IDF instead of hanging the demo.
    timeout: Number(process.env.QDRANT_TIMEOUT_MS ?? 4000),
  });
}

export class QdrantRetriever implements Retriever {
  private readonly client: QdrantClient;

  constructor(client?: QdrantClient) {
    this.client = client ?? makeQdrantClient();
  }

  async search(text: string, k: number): Promise<ScoredPrecedent[]> {
    const vector = await embed(text);
    // New Query API (the installed client has no `.search`): returns { points }.
    const result = await this.client.query(QDRANT_COLLECTION, {
      query: vector,
      limit: k,
      with_payload: true,
    });

    const scored: ScoredPrecedent[] = [];
    for (const hit of result.points) {
      const p = hit.payload as unknown as QdrantPayload | null;
      if (!p) continue;
      if (!isTicketCategory(p.category) || !isResolutionAction(p.action)) continue;
      scored.push({
        ticketId: p.ticketId,
        category: p.category,
        description: p.description,
        action: p.action,
        csat: Number(p.csat),
        similarity: Number(hit.score), // cosine similarity in [-1,1], ~[0,1] here
      });
    }
    return scored;
  }
}
