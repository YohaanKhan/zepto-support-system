import { describe, expect, it } from "vitest";
import { computeAmount, computePartialRefund } from "@/lib/policy/amounts";
import { computeConfidence } from "@/lib/policy/confidence";
import { applyGuardrails, clampRefund } from "@/lib/policy/guardrails";
import { mkCandidate, mkOrder } from "./fixtures";

describe("amounts", () => {
  it("G3 partial refund = floor(value / items)", () => {
    expect(computePartialRefund({ value_inr: 412, items: 5 })).toBe(82);
  });

  it("computeAmount maps each action correctly", () => {
    expect(computeAmount("full_refund", mkOrder({ value_inr: 640 }))).toBe(640);
    expect(computeAmount("partial_refund", mkOrder({ value_inr: 412, items: 5 }))).toBe(82);
    expect(computeAmount("coupon", mkOrder())).toBe(50);
    expect(computeAmount("redelivery", mkOrder())).toBeNull();
    expect(computeAmount("escalation", mkOrder())).toBeNull();
  });
});

describe("G2 — refund cap (clampRefund)", () => {
  it("clamps a runaway refund to the order value", () => {
    expect(clampRefund(99999, { value_inr: 189 })).toBe(189);
  });
  it("leaves an in-bounds refund untouched", () => {
    expect(clampRefund(82, { value_inr: 412 })).toBe(82);
  });
});

describe("confidence", () => {
  it("is topSimilarity × voteShare", () => {
    expect(computeConfidence({ topSimilarity: 0.9, voteShare: 0.5 })).toBeCloseTo(0.45, 10);
  });
});

describe("applyGuardrails", () => {
  it("G1 vetoes redelivery on a cancelled order", () => {
    const out = applyGuardrails(
      mkCandidate({ proposedAction: "redelivery" }),
      mkOrder({ delivery_status: "cancelled" }),
    );
    expect(out.vetoedBy).toBe("G1");
    expect(out.results.find((g) => g.id === "G1")?.status).toBe("veto");
    expect(out.amountInr).toBeNull();
  });

  it("G1 passes redelivery on a delivered order", () => {
    const out = applyGuardrails(
      mkCandidate({ proposedAction: "redelivery" }),
      mkOrder({ delivery_status: "delivered" }),
    );
    expect(out.vetoedBy).toBeNull();
    expect(out.results.find((g) => g.id === "G1")?.status).toBe("pass");
  });

  it("G3 sets the partial-refund amount and G2 passes it", () => {
    const out = applyGuardrails(
      mkCandidate({ proposedAction: "partial_refund" }),
      mkOrder({ value_inr: 412, items: 5 }),
    );
    expect(out.amountInr).toBe(82);
    expect(out.results.find((g) => g.id === "G3")?.status).toBe("mutate");
    expect(out.results.find((g) => g.id === "G2")?.status).toBe("pass");
  });

  it("G4 vetoes escalation", () => {
    const out = applyGuardrails(
      mkCandidate({ proposedAction: "escalation" }),
      mkOrder(),
    );
    expect(out.vetoedBy).toBe("G4");
  });

  it("G5 vetoes weak evidence — tests topSimilarity, not confidence", () => {
    // High share but low similarity → weak evidence, must veto on similarity.
    const out = applyGuardrails(
      mkCandidate({ topSimilarity: 0.3, voteShare: 0.9, voteMargin: 0.8 }),
      mkOrder(),
    );
    expect(out.vetoedBy).toBe("G5");
  });

  it("records all five guardrails every time", () => {
    const out = applyGuardrails(mkCandidate(), mkOrder());
    expect(out.results.map((g) => g.id)).toEqual(["G1", "G2", "G3", "G4", "G5"]);
  });
});
