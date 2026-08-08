/**
 * Sprint 13 — rebuild the Qdrant dense index from Postgres.
 *
 *   npx tsx scripts/reindex.ts
 *
 * Reads the 300-row precedent corpus from Supabase (or falls back to the CSV),
 * embeds each description locally with Xenova/all-MiniLM-L6-v2 (384-dim), and
 * upserts one point per ticket into the `resolved_tickets` Qdrant collection
 * with the full precedent payload. Qdrant is a DISPOSABLE index — this script is
 * idempotent and safe to re-run.
 *
 * Requires QDRANT_URL (+ optional QDRANT_API_KEY). Uses Supabase if the env is
 * set, otherwise the local CSV so it works offline.
 */
import "dotenv/config";
import { QdrantClient } from "@qdrant/js-client-rest";
import { loadPrecedentsFromCsv, loadPrecedentsFromSupabase } from "../lib/retrieval/corpus";
import { embed, EMBEDDING_DIM } from "../lib/retrieval/embeddings";
import { QDRANT_COLLECTION, type QdrantPayload } from "../lib/retrieval/qdrant";
import type { Precedent } from "../lib/types";

async function loadCorpus(): Promise<Precedent[]> {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
    try {
      const rows = await loadPrecedentsFromSupabase();
      if (rows.length > 0) {
        console.log(`Loaded ${rows.length} precedents from Supabase.`);
        return rows;
      }
    } catch (err) {
      console.warn(`Supabase load failed, falling back to CSV: ${(err as Error).message}`);
    }
  }
  const rows = loadPrecedentsFromCsv();
  console.log(`Loaded ${rows.length} precedents from CSV.`);
  return rows;
}

async function main() {
  const url = process.env.QDRANT_URL;
  if (!url) throw new Error("QDRANT_URL is required to reindex.");
  const client = new QdrantClient({ url, apiKey: process.env.QDRANT_API_KEY || undefined });

  const corpus = await loadCorpus();

  // (Re)create the collection with cosine distance and the MiniLM dimension.
  console.log(`Recreating collection "${QDRANT_COLLECTION}" (${EMBEDDING_DIM}-dim, cosine)…`);
  await client.recreateCollection(QDRANT_COLLECTION, {
    vectors: { size: EMBEDDING_DIM, distance: "Cosine" },
  });

  console.log(`Embedding ${corpus.length} descriptions locally…`);
  const points = [];
  let i = 0;
  for (const p of corpus) {
    const vector = await embed(p.description);
    const payload: QdrantPayload = {
      ticketId: p.ticketId,
      category: p.category,
      description: p.description,
      action: p.action,
      csat: p.csat,
    };
    points.push({ id: i, vector, payload });
    i += 1;
    if (i % 50 === 0) console.log(`  …${i}/${corpus.length}`);
  }

  console.log(`Upserting ${points.length} points…`);
  await client.upsert(QDRANT_COLLECTION, { wait: true, points });

  const info = await client.getCollection(QDRANT_COLLECTION);
  console.log(`Done. Collection points: ${info.points_count ?? "unknown"}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
