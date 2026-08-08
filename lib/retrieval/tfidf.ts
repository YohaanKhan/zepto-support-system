import type { Precedent, ScoredPrecedent } from "@/lib/types";
import type { Retriever } from "./types";

// TF-IDF over word unigrams + bigrams, cosine similarity. ~40 lines of maths
// over 300 documents — no Python service, no external index (CLAUDE.md
// anti-pattern #1). Explainable and instant.
//
// Weighting is sklearn-style so it behaves predictably:
//   idf(t) = ln((1 + N) / (1 + df(t))) + 1     (smoothed)
//   weight = tf * idf, then each document vector is L2-normalised.
// Cosine of two L2-normalised vectors is their dot product, so a verbatim query
// against an identical document scores exactly 1.0 — which is the whole shipped
// dataset (DATA.md §2.1).

function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const grams = [...words];
  for (let i = 0; i < words.length - 1; i++) {
    grams.push(`${words[i]} ${words[i + 1]}`);
  }
  return grams;
}

/** Raw term-frequency map for one document. */
function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

type DocVector = {
  precedent: Precedent;
  /** L2-normalised tf-idf weights, keyed by term. */
  weights: Map<string, number>;
};

export class TfIdfRetriever implements Retriever {
  private readonly idf = new Map<string, number>();
  private readonly docs: DocVector[] = [];

  constructor(precedents: Precedent[]) {
    const n = precedents.length;

    // Document frequency per term.
    const df = new Map<string, number>();
    const tokenizedDocs = precedents.map((p) => {
      const tf = termFreq(tokenize(p.description));
      for (const term of tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);
      return { p, tf };
    });

    // Smoothed idf.
    for (const [term, dft] of df) {
      this.idf.set(term, Math.log((1 + n) / (1 + dft)) + 1);
    }

    // Build and L2-normalise each document vector.
    for (const { p, tf } of tokenizedDocs) {
      this.docs.push({ precedent: p, weights: this.vectorize(tf) });
    }
  }

  /** tf map → L2-normalised tf-idf weight map. */
  private vectorize(tf: Map<string, number>): Map<string, number> {
    const raw = new Map<string, number>();
    let sumSq = 0;
    for (const [term, count] of tf) {
      const idf = this.idf.get(term);
      if (idf === undefined) continue; // term unseen in corpus → no idf → skip
      const w = count * idf;
      raw.set(term, w);
      sumSq += w * w;
    }
    if (sumSq === 0) return raw;
    const norm = Math.sqrt(sumSq);
    for (const [term, w] of raw) raw.set(term, w / norm);
    return raw;
  }

  async search(text: string, k: number): Promise<ScoredPrecedent[]> {
    const query = this.vectorize(termFreq(tokenize(text)));

    const scored: ScoredPrecedent[] = this.docs.map((doc) => {
      // Cosine = dot product of two L2-normalised vectors. Iterate the smaller.
      const [small, large] =
        query.size < doc.weights.size
          ? [query, doc.weights]
          : [doc.weights, query];
      let dot = 0;
      for (const [term, w] of small) {
        const other = large.get(term);
        if (other !== undefined) dot += w * other;
      }
      return { ...doc.precedent, similarity: dot };
    });

    // Deterministic order: similarity DESC, then csat DESC, then ticket_id ASC.
    // Identical descriptions score identically, so the tie-break is what makes
    // the top-3 and the voter list stable across runs (DATA.md §2.1).
    scored.sort(
      (a, b) =>
        b.similarity - a.similarity ||
        b.csat - a.csat ||
        (a.ticketId < b.ticketId ? -1 : a.ticketId > b.ticketId ? 1 : 0),
    );

    return scored.slice(0, k);
  }
}
