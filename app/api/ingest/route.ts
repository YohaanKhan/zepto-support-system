import { readFile } from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  isDeliveryStatus,
  isResolutionAction,
  type NewTicketRow,
  type OrderRow,
  type ResolvedTicketRow,
} from "@/lib/types";

// fs access → must run on Node, not Edge. Never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Canonical headers (DATA.md §5). Copied from the doc, not from memory.
const HEADERS = {
  resolved_tickets:
    "ticket_id,category,description,resolution_action,resolution_note,time_to_resolve_min,csat",
  new_tickets: "ticket_id,created_at,order_id,description",
  orders_context: "order_id,items,value_inr,delivery_time_min,delivery_status",
} as const;

const DATA_DIR = path.join(process.cwd(), "data");

/** Read + parse a CSV, asserting its header matches the canonical line exactly. */
function parseCsv(
  file: string,
  raw: string,
  expectedHeader: string,
): Record<string, string>[] {
  const parsed = Papa.parse<Record<string, string>>(raw.trim(), {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length) {
    throw new Error(`${file}: CSV parse error — ${parsed.errors[0].message}`);
  }
  const actual = (parsed.meta.fields ?? []).join(",");
  if (actual !== expectedHeader) {
    throw new Error(
      `${file}: header mismatch.\n  expected: ${expectedHeader}\n  actual:   ${actual}`,
    );
  }
  return parsed.data;
}

function toInt(file: string, id: string, col: string, v: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${file}: row ${id} has non-integer ${col}="${v}"`);
  }
  return n;
}

function mapResolvedTickets(rows: Record<string, string>[]): ResolvedTicketRow[] {
  return rows.map((r) => {
    const action = r.resolution_action;
    if (!isResolutionAction(action)) {
      throw new Error(
        `resolved_tickets.csv: row ${r.ticket_id} has invalid resolution_action="${action}" (must be one of the 7 values)`,
      );
    }
    return {
      ticket_id: r.ticket_id,
      category: r.category,
      description: r.description,
      resolution_action: action,
      resolution_note: r.resolution_note,
      time_to_resolve_min: toInt(
        "resolved_tickets.csv",
        r.ticket_id,
        "time_to_resolve_min",
        r.time_to_resolve_min,
      ),
      csat: toInt("resolved_tickets.csv", r.ticket_id, "csat", r.csat),
    };
  });
}

function mapOrders(rows: Record<string, string>[]): OrderRow[] {
  return rows.map((r) => {
    const status = r.delivery_status;
    if (!isDeliveryStatus(status)) {
      throw new Error(
        `orders_context.csv: row ${r.order_id} has invalid delivery_status="${status}" (must be 'delivered' or 'cancelled')`,
      );
    }
    return {
      order_id: r.order_id,
      items: toInt("orders_context.csv", r.order_id, "items", r.items),
      value_inr: toInt("orders_context.csv", r.order_id, "value_inr", r.value_inr),
      delivery_time_min: toInt(
        "orders_context.csv",
        r.order_id,
        "delivery_time_min",
        r.delivery_time_min,
      ),
      delivery_status: status,
    };
  });
}

function mapNewTickets(rows: Record<string, string>[]): NewTicketRow[] {
  return rows.map((r) => ({
    ticket_id: r.ticket_id,
    created_at: r.created_at,
    order_id: r.order_id,
    description: r.description,
  }));
}

export async function POST() {
  try {
    const [resolvedRaw, ordersRaw, newRaw] = await Promise.all([
      readFile(path.join(DATA_DIR, "resolved_tickets.csv"), "utf8"),
      readFile(path.join(DATA_DIR, "orders_context.csv"), "utf8"),
      readFile(path.join(DATA_DIR, "new_tickets.csv"), "utf8"),
    ]);

    const resolvedTickets = mapResolvedTickets(
      parseCsv("resolved_tickets.csv", resolvedRaw, HEADERS.resolved_tickets),
    );
    const orders = mapOrders(
      parseCsv("orders_context.csv", ordersRaw, HEADERS.orders_context),
    );
    const newTickets = mapNewTickets(
      parseCsv("new_tickets.csv", newRaw, HEADERS.new_tickets),
    );

    const db = supabaseAdmin();

    // Order matters: tickets FK → orders, so orders load first. Upsert on PK so
    // re-running the ingest is idempotent (stays 360 rows, never errors).
    const ordersRes = await db
      .from("orders")
      .upsert(orders, { onConflict: "order_id" });
    if (ordersRes.error) throw new Error(`orders insert: ${ordersRes.error.message}`);

    const ticketsRes = await db
      .from("tickets")
      .upsert(newTickets, { onConflict: "ticket_id" });
    if (ticketsRes.error) throw new Error(`tickets insert: ${ticketsRes.error.message}`);

    // source='seed' on every corpus row; embedding stays NULL until Sprint 13.
    const resolvedRes = await db
      .from("resolved_tickets")
      .upsert(
        resolvedTickets.map((r) => ({ ...r, source: "seed" as const })),
        { onConflict: "ticket_id" },
      );
    if (resolvedRes.error)
      throw new Error(`resolved_tickets insert: ${resolvedRes.error.message}`);

    const counts = {
      resolved_tickets: resolvedTickets.length,
      orders: orders.length,
      tickets: newTickets.length,
    };
    const total = counts.resolved_tickets + counts.orders + counts.tickets;

    return NextResponse.json({ ok: true, counts, total });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
