import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type {
  BoardCard,
  BoardResponse,
  DeliveryStatus,
  GuardrailResult,
  PrecedentView,
  ResolutionAction,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Assemble both lanes. Pure read: decisions carry every score and their top-3
// precedents already, so no re-inference happens here. If a ticket has been
// processed more than once (e.g. after an override), the latest decision wins.
export async function GET() {
  try {
    const db = supabaseAdmin();
    const [{ data: decisions, error: dErr }, { data: tickets }, { data: orders }] =
      await Promise.all([
        db.from("decisions").select("*").order("created_at", { ascending: true }),
        db.from("tickets").select("ticket_id, order_id, description"),
        db.from("orders").select("order_id, items, value_inr, delivery_status"),
      ]);
    if (dErr) throw new Error(dErr.message);

    const ticketMap = new Map(
      (tickets ?? []).map((t) => [t.ticket_id as string, t]),
    );
    const orderMap = new Map((orders ?? []).map((o) => [o.order_id as string, o]));

    // Latest decision per ticket (ascending order → later overwrites earlier).
    const latest = new Map<string, Record<string, unknown>>();
    for (const d of decisions ?? []) latest.set(d.ticket_id as string, d);

    const cards: BoardCard[] = [...latest.values()].map((d) => {
      const ticket = ticketMap.get(d.ticket_id as string);
      const order = ticket ? orderMap.get(ticket.order_id as string) : undefined;
      return {
        ticketId: d.ticket_id as string,
        description: (ticket?.description as string) ?? "",
        order: order
          ? {
              orderId: order.order_id as string,
              items: Number(order.items),
              valueInr: Number(order.value_inr),
              deliveryStatus: order.delivery_status as DeliveryStatus,
            }
          : null,
        lane: d.lane as "auto" | "human",
        action: d.action as ResolutionAction,
        amountInr: d.amount_inr as number | null,
        confidence: Number(d.confidence),
        voteShare: Number(d.vote_share),
        voteMargin: Number(d.vote_margin),
        topSimilarity: Number(d.top_similarity),
        guardrails: (d.guardrails as GuardrailResult[]) ?? [],
        vetoedBy: (d.vetoed_by as string | null) ?? null,
        reasoning: (d.reasoning as string) ?? "",
        draftReply: (d.draft_reply as string | null) ?? null,
        replySource: (d.reply_source as "llm" | "template" | null) ?? null,
        precedents: (d.top_precedents as PrecedentView[]) ?? [],
      };
    });

    // Stable order within a lane: by ticket id.
    cards.sort((a, b) => (a.ticketId < b.ticketId ? -1 : a.ticketId > b.ticketId ? 1 : 0));

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
    };
    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
