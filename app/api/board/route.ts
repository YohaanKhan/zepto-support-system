import { NextResponse } from "next/server";
import { loadBoardCards } from "@/lib/board";
import { computeSavings } from "@/lib/metrics";
import { DEFAULT_REPLAY_THRESHOLDS } from "@/lib/policy/replay";
import { supabaseAdmin } from "@/lib/supabase";
import type { BoardResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Assemble both lanes. Pure read: decisions carry every score and their top-3
// precedents already, so no re-inference happens here. Cards are partitioned by
// the lane persisted at decision time; the Sprint 9 slider replays them at other
// thresholds via GET /api/replay.
export async function GET() {
  try {
    const db = supabaseAdmin();
    const cards = await loadBoardCards(db);

    const autoResolved = cards.filter((c) => c.lane === "auto");
    const needsHuman = cards.filter((c) => c.lane === "human");
    const body: BoardResponse = {
      autoResolved,
      needsHuman,
      counts: {
        auto: autoResolved.length,
        human: needsHuman.length,
        total: cards.length,
      },
      savings: computeSavings(autoResolved.length),
      retriever: process.env.RETRIEVER ?? "tfidf",
      thresholds: DEFAULT_REPLAY_THRESHOLDS,
    };
    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
