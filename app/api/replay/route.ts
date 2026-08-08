import { NextResponse } from "next/server";
import { loadBoardCards } from "@/lib/board";
import { computeSavings } from "@/lib/metrics";
import {
  clamp01,
  DEFAULT_REPLAY_THRESHOLDS,
  laneAtThresholds,
  type ReplayThresholds,
} from "@/lib/policy/replay";
import { supabaseAdmin } from "@/lib/supabase";
import type { BoardResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sprint 9 — what-if replay. Re-partition the persisted decisions at a new
// threshold set WITHOUT re-running triage, policy, or the LLM. Every score is
// already on the decision row; this only moves cards between lanes.
//
//   GET /api/replay?sim=0.45&share=0.55&margin=0.15
//
// The board UI mirrors this exact pure function client-side for zero-latency
// dragging (see lib/policy/replay.ts, laneAtThresholds); this endpoint is the
// server-side source of truth and lets you prove "no re-inference" with a curl.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const thresholds: ReplayThresholds = {
      minSimilarity: clamp01(url.searchParams.get("sim"), DEFAULT_REPLAY_THRESHOLDS.minSimilarity),
      minVoteShare: clamp01(url.searchParams.get("share"), DEFAULT_REPLAY_THRESHOLDS.minVoteShare),
      minVoteMargin: clamp01(url.searchParams.get("margin"), DEFAULT_REPLAY_THRESHOLDS.minVoteMargin),
    };

    const db = supabaseAdmin();
    const cards = await loadBoardCards(db);

    // Re-partition purely from stored scores.
    const replayed = cards.map((card) => ({
      ...card,
      lane: laneAtThresholds(card, thresholds),
    }));

    const autoResolved = replayed.filter((c) => c.lane === "auto");
    const needsHuman = replayed.filter((c) => c.lane === "human");
    const body: BoardResponse = {
      autoResolved,
      needsHuman,
      counts: {
        auto: autoResolved.length,
        human: needsHuman.length,
        total: replayed.length,
      },
      savings: computeSavings(autoResolved.length),
      retriever: process.env.RETRIEVER ?? "tfidf",
      thresholds,
    };
    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
