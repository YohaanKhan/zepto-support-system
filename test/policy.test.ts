import { beforeAll, describe, expect, it } from "vitest";
import { makeDecision } from "@/lib/policy";
import { triage } from "@/lib/triage";
import type { Decision } from "@/lib/types";
import { loadOrders, loadTickets, mkCandidate, mkOrder, retriever } from "./fixtures";

// Integration: triage → policy over the real 30-ticket queue. This is the board.

const orders = loadOrders();
const tickets = loadTickets();
const byId = new Map(tickets.map((t) => [t.ticketId, t]));

async function decide(ticketId: string): Promise<Decision> {
  const t = byId.get(ticketId);
  if (!t) throw new Error(`no fixture ticket ${ticketId}`);
  const order = orders.get(t.orderId);
  if (!order) throw new Error(`no order ${t.orderId}`);
  const candidate = await triage(t.ticketId, t.description, retriever);
  return makeDecision(candidate, order);
}

describe("Scenario 1 — strong precedents auto-resolve (N-015)", () => {
  it("bread on ORD-9915 → auto, partial_refund, ₹82, capped ≤ order value", async () => {
    const d = await decide("N-015");
    expect(d.lane).toBe("auto");
    expect(d.action).toBe("partial_refund");
    expect(d.amountInr).toBe(82); // floor(412 / 5)
    expect(d.amountInr!).toBeLessThanOrEqual(412); // G2 holds
    expect(d.vetoedBy).toBeNull();
    expect(d.confidence).toBeGreaterThan(0);
  });
});

describe("Scenario 4 — cancelled order blocks redelivery (N-001)", () => {
  it("wrong rice on a cancelled order → human, vetoedBy G1, high confidence", async () => {
    const d = await decide("N-001");
    expect(d.lane).toBe("human");
    expect(d.action).toBe("redelivery"); // proposal preserved; the veto blocks it
    expect(d.vetoedBy).toBe("G1");
    expect(d.amountInr).toBeNull();
    // Would auto-resolve on similarity alone — proves the guardrail does real work.
    expect(d.confidence).toBeGreaterThan(0.45);
  });
});

describe("Scenario 3 — precedents disagree, queue don't guess (N-011)", () => {
  it("curd (7–7 tie) → human via the gate, no guardrail veto, margin ~0", async () => {
    const d = await decide("N-011");
    expect(d.lane).toBe("human");
    expect(d.vetoedBy).toBeNull(); // gate failure, not a guardrail veto
    expect(d.voteMargin).toBeLessThan(0.01);
  });
});

describe("Scenario 3 — structural guarantee", () => {
  it("a candidate with similarity 1.0 and voteShare 0.50 can never auto-resolve", () => {
    const d = makeDecision(
      mkCandidate({ topSimilarity: 1.0, voteShare: 0.5, voteMargin: 0.0 }),
      mkOrder(),
    );
    expect(d.lane).toBe("human");
  });
});

describe("Board split — the calibrated 11 auto / 19 human", () => {
  let decisions: Decision[];
  beforeAll(async () => {
    decisions = await Promise.all(tickets.map((t) => decide(t.ticketId)));
  });

  it("produces exactly 11 auto and 19 needs-human across the 30 seeded tickets", () => {
    const auto = decisions.filter((d) => d.lane === "auto");
    const human = decisions.filter((d) => d.lane === "human");
    if (auto.length !== 11) {
      // Surface the split on failure to make recalibration obvious.
      console.error(
        "auto:",
        auto.map((d) => d.ticketId).join(", "),
      );
    }
    expect(auto.length).toBe(11);
    expect(human.length).toBe(19);
  });

  it("G1 fires on exactly the four cancelled-order redeliveries (N-001, N-003, N-017, N-023)", () => {
    const g1 = decisions.filter((d) => d.vetoedBy === "G1").map((d) => d.ticketId);
    expect(g1.sort()).toEqual(["N-001", "N-003", "N-017", "N-023"]);
  });

  it("never writes a refund larger than the order value", () => {
    const orderValue = (id: string) => orders.get(byId.get(id)!.orderId)!.value_inr;
    for (const d of decisions) {
      if (d.amountInr !== null) {
        expect(d.amountInr).toBeLessThanOrEqual(orderValue(d.ticketId));
      }
    }
  });
});
