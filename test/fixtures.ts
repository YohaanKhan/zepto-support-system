import { readFileSync } from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { loadPrecedentsFromCsv } from "@/lib/retrieval/corpus";
import { TfIdfRetriever } from "@/lib/retrieval/tfidf";
import type { Candidate, Decision, DeliveryStatus, OrderRow } from "@/lib/types";

// Shared test fixtures. Everything loads from the CSVs so the whole policy
// suite is deterministic and needs no database.

const dataFile = (f: string) => path.join(process.cwd(), "data", f);

function parse(f: string): Record<string, string>[] {
  return Papa.parse<Record<string, string>>(readFileSync(dataFile(f), "utf8").trim(), {
    header: true,
    skipEmptyLines: true,
  }).data;
}

export function loadOrders(): Map<string, OrderRow> {
  const m = new Map<string, OrderRow>();
  for (const r of parse("orders_context.csv")) {
    m.set(r.order_id, {
      order_id: r.order_id,
      items: Number(r.items),
      value_inr: Number(r.value_inr),
      delivery_time_min: Number(r.delivery_time_min),
      delivery_status: r.delivery_status as DeliveryStatus,
    });
  }
  return m;
}

export interface TicketFixture {
  ticketId: string;
  orderId: string;
  description: string;
}

export function loadTickets(): TicketFixture[] {
  return parse("new_tickets.csv").map((r) => ({
    ticketId: r.ticket_id,
    orderId: r.order_id,
    description: r.description,
  }));
}

/** One shared retriever built from the real corpus. */
export const retriever = new TfIdfRetriever(loadPrecedentsFromCsv());

/** Build a Candidate with sensible defaults, overriding only what a test needs. */
export function mkCandidate(over: Partial<Candidate> = {}): Candidate {
  return {
    ticketId: "T-TEST",
    precedents: [],
    proposedAction: "partial_refund",
    topSimilarity: 1.0,
    voteShare: 0.7,
    voteMargin: 0.3,
    inferredCategory: "missing_item",
    runnerUpAction: null,
    ...over,
  };
}

export function mkOrder(over: Partial<OrderRow> = {}): OrderRow {
  return {
    order_id: "ORD-TEST",
    items: 2,
    value_inr: 500,
    delivery_time_min: 20,
    delivery_status: "delivered",
    ...over,
  };
}

export function mkDecision(over: Partial<Decision> = {}): Decision {
  return {
    ticketId: "T-TEST",
    lane: "auto",
    action: "partial_refund",
    amountInr: 82,
    confidence: 0.68,
    voteShare: 0.68,
    voteMargin: 0.35,
    topSimilarity: 1.0,
    precedentIds: [],
    guardrails: [],
    vetoedBy: null,
    reasoning: "",
    ...over,
  };
}
