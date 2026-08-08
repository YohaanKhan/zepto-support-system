import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BoardCard,
  DeliveryStatus,
  GuardrailResult,
  PrecedentView,
  ResolutionAction,
} from "@/lib/types";

// Shared board assembly. GET /api/board renders cards by their persisted lane;
// GET /api/replay renders the SAME cards re-partitioned at different thresholds.
// Both read decisions + tickets + orders and map to BoardCard — pure read, no
// re-inference (every score already lives on the decision row).

/**
 * Load the latest decision per ticket as fully-hydrated board cards.
 * If a ticket has multiple decisions (e.g. after an override), the most recent
 * created_at wins.
 */
export async function loadBoardCards(db: SupabaseClient): Promise<BoardCard[]> {
  const [{ data: decisions, error: dErr }, { data: tickets }, { data: orders }] =
    await Promise.all([
      db.from("decisions").select("*").order("created_at", { ascending: true }),
      db.from("tickets").select("ticket_id, order_id, description"),
      db.from("orders").select("order_id, items, value_inr, delivery_status"),
    ]);
  if (dErr) throw new Error(dErr.message);

  const ticketMap = new Map((tickets ?? []).map((t) => [t.ticket_id as string, t]));
  const orderMap = new Map((orders ?? []).map((o) => [o.order_id as string, o]));

  // Ascending order → later rows overwrite earlier ones = latest wins.
  const latest = new Map<string, Record<string, unknown>>();
  for (const d of decisions ?? []) latest.set(d.ticket_id as string, d);

  const cards: BoardCard[] = [...latest.values()].map((d) => {
    const ticket = ticketMap.get(d.ticket_id as string);
    const order = ticket ? orderMap.get(ticket.order_id as string) : undefined;
    return {
      decisionId: d.id as string,
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

  // Stable order by ticket id so lanes never flap between requests.
  cards.sort((a, b) => (a.ticketId < b.ticketId ? -1 : a.ticketId > b.ticketId ? 1 : 0));
  return cards;
}
