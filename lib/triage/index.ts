import { THRESHOLDS } from "@/lib/policy/thresholds";
import { loadPrecedentsFromSupabase } from "@/lib/retrieval/corpus";
import { HybridRetriever } from "@/lib/retrieval/hybrid";
import { QdrantRetriever } from "@/lib/retrieval/qdrant";
import { TfIdfRetriever } from "@/lib/retrieval/tfidf";
import type { Retriever } from "@/lib/retrieval/types";
import type {
  Candidate,
  ScoredPrecedent,
  TicketCategory,
} from "@/lib/types";
import { computeVote } from "./vote";

// Stage 1 — Triage. Retrieve precedents, vote, assemble a Candidate. Reads NO
// order context (Invariant #1). Pure and deterministic given a retriever.

/** Majority category among the voters (fallback: rank-1 precedent). */
function inferCategory(
  voters: ScoredPrecedent[],
  fallback: ScoredPrecedent | undefined,
): TicketCategory {
  if (voters.length === 0) {
    return fallback?.category ?? "refund_pending";
  }
  const counts = new Map<TicketCategory, number>();
  for (const v of voters) counts.set(v.category, (counts.get(v.category) ?? 0) + 1);
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
  )[0][0];
}

/**
 * Triage one ticket.
 *
 * Note: takes `ticketId` in addition to `description` (PLAN wrote
 * `triage(description)`, but `Candidate.ticketId` requires the id, so the
 * caller must supply it). Vote over EVERY precedent ≥ MIN_SIMILARITY, capped at
 * K — never a top-10 slice (CLAUDE.md data fact 5).
 */
export async function triage(
  ticketId: string,
  description: string,
  retriever: Retriever,
): Promise<Candidate> {
  const scored = await retriever.search(description, THRESHOLDS.K);
  const voters = scored.filter((s) => s.similarity >= THRESHOLDS.MIN_SIMILARITY);

  // Vote over the voters when any clear the floor; otherwise the ticket is
  // novel — vote over the single best match just to surface a suggestion, and
  // G5 will veto on the (low) topSimilarity in Stage 2.
  const votingSet = voters.length > 0 ? voters : scored.slice(0, 1);
  const vote = computeVote(votingSet);

  return {
    ticketId,
    precedents: voters, // all voters; UI shows top 3
    proposedAction: vote.proposedAction,
    topSimilarity: scored[0]?.similarity ?? 0,
    voteShare: vote.voteShare,
    voteMargin: vote.voteMargin,
    inferredCategory: inferCategory(voters, scored[0]),
    runnerUpAction: vote.runnerUpAction,
  };
}

// ── Runtime retriever singleton (used by the Sprint 6 pipeline) ────────────
// Built once from Supabase and cached for the process. Tests bypass this and
// inject a CSV-backed TfIdfRetriever directly.

let cached: Promise<Retriever> | null = null;

/**
 * Build the runtime retriever. TF-IDF is always constructed (it is the fallback
 * and can never fail on 300 in-memory docs). When RETRIEVER=hybrid we wrap it
 * with a Qdrant dense retriever fused by RRF — but if the Qdrant client can't
 * even be constructed (no QDRANT_URL, bad env), we log and stay on TF-IDF.
 * A Qdrant that is configured-but-unreachable degrades per-request inside
 * HybridRetriever (Invariant #10).
 */
export function getRetriever(): Promise<Retriever> {
  if (!cached) {
    cached = loadPrecedentsFromSupabase().then((precedents) => {
      const tfidf = new TfIdfRetriever(precedents);
      const mode = (process.env.RETRIEVER ?? "tfidf").toLowerCase();
      if (mode !== "hybrid") return tfidf;
      try {
        // QdrantRetriever() throws if QDRANT_URL is unset; a configured-but-dead
        // Qdrant instead degrades per-request inside HybridRetriever.
        return new HybridRetriever(tfidf, new QdrantRetriever());
      } catch (err) {
        console.warn(
          `[triage] RETRIEVER=hybrid requested but Qdrant is unavailable; using TF-IDF. ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return tfidf;
      }
    });
  }
  return cached;
}

/** For tests / reindex: drop the cached retriever so the next call rebuilds. */
export function resetRetriever(): void {
  cached = null;
}
