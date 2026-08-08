// Sprint 13 — local sentence embeddings via @xenova/transformers.
//
// Xenova/all-MiniLM-L6-v2 runs entirely in-process (WASM/ONNX): no API key, no
// cost, no rate limit, and 384 dims that match the resolved_tickets.embedding
// vector(384) column. It is only 300 documents (offline reindex) plus one query
// embedding per hybrid search.
//
// The transformers package is imported DYNAMICALLY so the default RETRIEVER=tfidf
// build never pulls it into the bundle, and a missing/broken install degrades to
// "embeddings unavailable" rather than crashing (Invariant #10).

const MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIM = 384;

// Cache the pipeline promise so the model loads once per process.
let extractorPromise: Promise<unknown> | null = null;

async function getExtractor(): Promise<(text: string, opts: unknown) => Promise<{ data: Float32Array }>> {
  if (!extractorPromise) {
    extractorPromise = import("@xenova/transformers").then((mod) => {
      // Prefer the bundled WASM backend; don't hit the network for a local model cache.
      return mod.pipeline("feature-extraction", MODEL);
    });
  }
  // The pipeline is callable: (text, { pooling, normalize }) => Tensor
  return extractorPromise as Promise<
    (text: string, opts: unknown) => Promise<{ data: Float32Array }>
  >;
}

/** Embed one string into a 384-dim L2-normalised vector. Throws if unavailable. */
export async function embed(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

/** Embed many strings sequentially (used by the offline reindex script). */
export async function embedMany(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (const t of texts) out.push(await embed(t));
  return out;
}
