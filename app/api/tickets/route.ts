import { NextResponse } from "next/server";
import { processTicket } from "@/lib/pipeline";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Submit one ad-hoc ticket — the live demo box. This is the ONLY way to exercise
// Scenario 2 (a novel complaint → weak evidence → human lane), because every
// seeded ticket matches history verbatim.

// A single shared demo order. UPSERT (not insert) so the second novel ticket
// you submit doesn't die on a primary-key collision mid-demo.
const DEMO_ORDER = {
  order_id: "ORD-DEMO",
  items: 2,
  value_inr: 500,
  delivery_time_min: 20,
  delivery_status: "delivered",
} as const;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      description?: unknown;
      orderId?: unknown;
    };
    const description = String(body.description ?? "").trim();
    if (!description) {
      return NextResponse.json(
        { ok: false, error: "description is required" },
        { status: 400 },
      );
    }

    const db = supabaseAdmin();
    let orderId = String(body.orderId ?? "").trim();

    if (orderId) {
      // Caller pinned an existing order — verify it exists (FK safety).
      const { data } = await db
        .from("orders")
        .select("order_id")
        .eq("order_id", orderId)
        .maybeSingle();
      if (!data) {
        return NextResponse.json(
          { ok: false, error: `order ${orderId} not found` },
          { status: 400 },
        );
      }
    } else {
      const { error } = await db
        .from("orders")
        .upsert(DEMO_ORDER, { onConflict: "order_id" });
      if (error) throw new Error(`demo order upsert: ${error.message}`);
      orderId = DEMO_ORDER.order_id;
    }

    // Unique id every time — never a fixed N-DEMO-001 that would collide.
    const ticketId = `N-DEMO-${Date.now()}`;
    const { error: tErr } = await db.from("tickets").insert({
      ticket_id: ticketId,
      created_at: new Date().toISOString(),
      order_id: orderId,
      description,
    });
    if (tErr) throw new Error(`ticket insert: ${tErr.message}`);

    const decision = await processTicket(ticketId);
    return NextResponse.json({ ok: true, decision });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
