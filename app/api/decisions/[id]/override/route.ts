import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/persist";
import { ENABLE_WRITE_BACK } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase";
import { resetRetriever } from "@/lib/triage";
import {
  isResolutionAction,
  type ResolutionAction,
  type TicketCategory,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sprint 11 — human approve / override.
//
//   POST /api/decisions/:id/override
//   body: { approved: boolean, overrideAction?, overrideAmount?, reason }
//
// The audit log is ALWAYS appended (append-only, Invariant #7) and the pending
// action is flipped to 'simulated' so the loop is visibly closed. Corpus
// write-back (a new human_approved precedent) is gated behind ENABLE_WRITE_BACK
// so it never mutates vote shares during judging (CLAUDE.md demo-day trap).

// Heuristic action→category map. Only used for the gated write-back path; the
// decision row doesn't persist the inferred category, and write-back is off by
// default, so an approximate label here is acceptable.
const CATEGORY_FOR_ACTION: Record<ResolutionAction, TicketCategory> = {
  partial_refund: "refund_pending",
  full_refund: "refund_pending",
  refund_reissue: "refund_pending",
  redelivery: "missing_item",
  coupon: "quality_issue",
  apology_no_action: "order_late",
  escalation: "quality_issue",
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      approved?: boolean;
      overrideAction?: string;
      overrideAmount?: number;
      reason?: string;
    };

    const approved = body.approved !== false; // default: approve
    const reason = (body.reason ?? "").trim() || (approved ? "Approved as proposed" : "Overridden by agent");

    const db = supabaseAdmin();
    const { data: decision, error: dErr } = await db
      .from("decisions")
      .select("*")
      .eq("id", id)
      .single();
    if (dErr || !decision) {
      return NextResponse.json({ ok: false, error: `decision ${id} not found` }, { status: 404 });
    }

    // Resolve the effective action/amount (override wins when supplied).
    let finalAction = decision.action as ResolutionAction;
    let finalAmount = decision.amount_inr as number | null;
    if (!approved && body.overrideAction) {
      if (!isResolutionAction(body.overrideAction)) {
        return NextResponse.json(
          { ok: false, error: `invalid overrideAction "${body.overrideAction}"` },
          { status: 400 },
        );
      }
      finalAction = body.overrideAction;
      finalAmount =
        typeof body.overrideAmount === "number" ? body.overrideAmount : null;
    }

    const ticketId = decision.ticket_id as string;

    // 1) Append to the immutable audit log (always).
    await appendAuditLog(db, ticketId, approved ? "human_approved" : "human_override", "human", {
      decisionId: id,
      approved,
      reason,
      originalAction: decision.action,
      finalAction,
      finalAmount,
      writeBack: ENABLE_WRITE_BACK,
    });

    // 2) Close the loop on the action: the human-approved outcome is now simulated.
    await db.from("actions").upsert(
      {
        decision_id: id,
        type: finalAction,
        amount_inr: finalAmount,
        status: "simulated",
        idempotency_key: `${ticketId}:${finalAction}:human`,
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    );

    // 3) Gated write-back to the precedent corpus.
    let wroteBack = false;
    if (ENABLE_WRITE_BACK) {
      const { data: ticket } = await db
        .from("tickets")
        .select("description")
        .eq("ticket_id", ticketId)
        .single();
      const synthId = `HA-${ticketId}-${Date.now()}`;
      const { error: wbErr } = await db.from("resolved_tickets").insert({
        ticket_id: synthId,
        category: CATEGORY_FOR_ACTION[finalAction],
        description: (ticket?.description as string) ?? "",
        resolution_action: finalAction,
        resolution_note: approved ? "human approved" : `human override: ${reason}`,
        time_to_resolve_min: 25,
        csat: 4,
        source: "human_approved",
      });
      if (wbErr) throw new Error(`write-back: ${wbErr.message}`);
      wroteBack = true;
      resetRetriever(); // next triage rebuilds the index including this row
    }

    return NextResponse.json({
      ok: true,
      approved,
      finalAction,
      finalAmount,
      wroteBack,
      writeBackEnabled: ENABLE_WRITE_BACK,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
