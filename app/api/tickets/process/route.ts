import { NextResponse } from "next/server";
import { processPendingTickets } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Run the full pipeline over every ticket that has no decision yet. Idempotent:
// already-processed tickets are skipped, and action idempotency keys prevent a
// second action row even if a ticket is somehow reprocessed.
export async function POST() {
  try {
    const decisions = await processPendingTickets();
    return NextResponse.json({
      ok: true,
      processed: decisions.length,
      auto: decisions.filter((d) => d.lane === "auto").length,
      human: decisions.filter((d) => d.lane === "human").length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
