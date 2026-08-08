import { readFileSync } from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { supabaseAdmin } from "@/lib/supabase";
import {
  isResolutionAction,
  isTicketCategory,
  type Precedent,
} from "@/lib/types";

// Loads the precedent corpus for the retriever. Two sources, same shape:
//   • Supabase — the runtime source of truth (used by the pipeline).
//   • CSV      — deterministic, offline, used by unit tests so the DATA.md
//               §1.3 vote-share assertions never depend on a live DB.
//
// We deliberately select only the five fields Triage may see. No order context
// (Invariant #1), no resolution_note (label leak, DATA.md §4.3).

function coerceCategory(raw: string, id: string): Precedent["category"] {
  if (!isTicketCategory(raw)) {
    throw new Error(`corpus: row ${id} has unknown category "${raw}"`);
  }
  return raw;
}

function coerceAction(raw: string, id: string): Precedent["action"] {
  if (!isResolutionAction(raw)) {
    throw new Error(`corpus: row ${id} has invalid resolution_action "${raw}"`);
  }
  return raw;
}

/** Read resolved_tickets.csv from disk into Precedent[]. Offline + deterministic. */
export function loadPrecedentsFromCsv(filePath?: string): Precedent[] {
  const abs = filePath ?? path.join(process.cwd(), "data", "resolved_tickets.csv");
  const raw = readFileSync(abs, "utf8").trim();
  const parsed = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length) {
    throw new Error(`corpus CSV parse error — ${parsed.errors[0].message}`);
  }
  return parsed.data.map((r) => ({
    ticketId: r.ticket_id,
    category: coerceCategory(r.category, r.ticket_id),
    description: r.description,
    action: coerceAction(r.resolution_action, r.ticket_id),
    csat: Number(r.csat),
  }));
}

/** Load the corpus from Supabase (runtime). Includes human_approved rows too. */
export async function loadPrecedentsFromSupabase(): Promise<Precedent[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("resolved_tickets")
    .select("ticket_id, category, description, resolution_action, csat");
  if (error) throw new Error(`corpus load: ${error.message}`);
  return (data ?? []).map((r) => ({
    ticketId: r.ticket_id as string,
    category: coerceCategory(r.category as string, r.ticket_id as string),
    description: r.description as string,
    action: coerceAction(r.resolution_action as string, r.ticket_id as string),
    csat: Number(r.csat),
  }));
}
