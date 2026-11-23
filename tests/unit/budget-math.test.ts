import { describe, expect, it } from "vitest";

import {
  type LineFacts,
  lineNumbers,
  paidShares,
  paymentState,
  totals,
  transferShortfall,
} from "@/server/services/budget-math";

function line(overrides: Partial<LineFacts> = {}): LineFacts {
  return {
    id: "line",
    isContingency: false,
    plannedCents: 0n,
    originalCents: null,
    adjustmentsCents: 0n,
    transfersInCents: 0n,
    transfersOutCents: 0n,
    estimateCents: null,
    commitments: [],
    allocations: [],
    ...overrides,
  };
}

const $ = (dollars: number) => BigInt(Math.round(dollars * 100));

/** The worked example in docs/BUDGET_DEFINITIONS.md, one step at a time. */
describe("the worked example: kitchen Labor, original budget $20,000", () => {
  const base = line({ plannedCents: $(20000), originalCents: $(20000) });

  it("1. a quote that isn't approved is only an estimate", () => {
    const n = lineNumbers({ ...base, estimateCents: $(18500) });
    expect(n.estimate).toBe($(18500));
    expect(n.forecast).toBe($(18500));
    expect(n.available).toBe($(1500));
    expect(n.committed).toBe(0n);
  });

  const approved = { ...base, estimateCents: $(18500) };
  const contract = { id: "contract", amountCents: $(18500), invoicedCents: 0n };

  it("2. approving it creates a commitment", () => {
    const n = lineNumbers({ ...approved, commitments: [contract] });
    expect(n.committed).toBe($(18500));
    expect(n.forecast).toBe($(18500));
    expect(n.notYetInvoiced).toBe($(18500));
  });

  const deposit = { amountCents: $(5000), paidCents: 0n, commitmentId: "contract" };
  const invoiced = {
    ...approved,
    commitments: [{ ...contract, invoicedCents: $(5000) }],
    allocations: [deposit],
  };

  it("3. a deposit invoice uses up the commitment rather than adding to it", () => {
    const n = lineNumbers(invoiced);
    expect(n.expenses).toBe($(5000));
    expect(n.committed).toBe($(18500));
    expect(n.notYetInvoiced).toBe($(13500));
    expect(n.unpaid).toBe($(5000));
    expect(n.forecast).toBe($(18500));
  });

  const paid = { ...invoiced, allocations: [{ ...deposit, paidCents: $(5000) }] };

  it("4. paying it changes what's unpaid, not the forecast", () => {
    const n = lineNumbers(paid);
    expect(n.unpaid).toBe(0n);
    expect(n.paid).toBe($(5000));
    expect(n.forecast).toBe($(18500));
  });

  const changeOrder = { id: "change", amountCents: $(2000), invoicedCents: 0n };
  const changed = { ...paid, commitments: [...paid.commitments, changeOrder] };

  it("5. a change order raises the commitment and puts the line over plan", () => {
    const n = lineNumbers(changed);
    expect(n.committed).toBe($(20500));
    expect(n.forecast).toBe($(20500));
    expect(n.available).toBe($(-500));
    expect(n.variance).toBe($(500));
  });

  it("6. a $1,000 transfer in fixes what's available but not the variance", () => {
    const n = lineNumbers({ ...changed, transfersInCents: $(1000) });
    expect(n.current).toBe($(21000));
    expect(n.available).toBe($(500));
    expect(n.variance).toBe($(500));
    expect(n.original).toBe($(20000));
  });

  it("and the transfer leaves the household total unchanged", () => {
    const bathroom = line({ id: "bath", plannedCents: $(8000), originalCents: $(8000) });
    const before = totals([changed, bathroom]);
    const after = totals([
      { ...changed, transfersInCents: $(1000) },
      { ...bathroom, transfersOutCents: $(1000) },
    ]);
    expect(after.current).toBe(before.current);
    expect(after.original).toBe(before.original);
    expect(after.available).toBe(before.available);
  });
});

describe("lineNumbers rules", () => {
  it("counts an expense with no commitment as both committed and actual (rule 2)", () => {
    const n = lineNumbers(
      line({
        plannedCents: $(500),
        allocations: [{ amountCents: $(120), paidCents: $(120), commitmentId: null }],
      }),
    );
    expect(n.committed).toBe($(120));
    expect(n.expenses).toBe($(120));
    expect(n.forecast).toBe($(120));
    expect(n.available).toBe($(380));
  });

  it("ignores the estimate once there's a commitment (rule 4)", () => {
    const n = lineNumbers(
      line({
        estimateCents: $(9000),
        commitments: [{ id: "c", amountCents: $(7000), invoicedCents: 0n }],
      }),
    );
    expect(n.forecast).toBe($(7000));
  });

  it("forecasts the bills when they run past the estimate or commitment", () => {
    expect(
      lineNumbers(
        line({
          estimateCents: $(100),
          allocations: [{ amountCents: $(150), paidCents: 0n, commitmentId: null }],
        }),
      ).forecast,
    ).toBe($(150));
    const over = lineNumbers(
      line({
        commitments: [{ id: "c", amountCents: $(1000), invoicedCents: $(1200) }],
        allocations: [{ amountCents: $(1200), paidCents: 0n, commitmentId: "c" }],
      }),
    );
    expect(over.forecast).toBe($(1200));
    expect(over.notYetInvoiced).toBe(0n);
  });

  it("lowers the actual cost with a refund, a negative expense (rule 8)", () => {
    const n = lineNumbers(
      line({
        allocations: [
          { amountCents: $(300), paidCents: $(300), commitmentId: null },
          { amountCents: $(-80), paidCents: $(-80), commitmentId: null },
        ],
      }),
    );
    expect(n.expenses).toBe($(220));
    expect(n.unpaid).toBe(0n);
  });

  it("uses the plan before lock-in, and has no variance yet", () => {
    const n = lineNumbers(line({ plannedCents: $(1000), estimateCents: $(800) }));
    expect(n.current).toBe($(1000));
    expect(n.original).toBeNull();
    expect(n.variance).toBeNull();
  });

  it("includes adjustments in the current budget", () => {
    const n = lineNumbers(
      line({ plannedCents: $(1000), originalCents: $(1000), adjustmentsCents: $(-250) }),
    );
    expect(n.current).toBe($(750));
  });
});

describe("totals", () => {
  it("adds up lines, and reports contingency remaining", () => {
    const t = totals([
      line({ id: "a", plannedCents: $(1000), originalCents: $(1000), estimateCents: $(900) }),
      line({ id: "c", isContingency: true, plannedCents: $(300), originalCents: $(300) }),
    ]);
    expect(t.current).toBe($(1300));
    expect(t.forecast).toBe($(900));
    expect(t.available).toBe($(400));
    expect(t.variance).toBe($(-400));
    expect(t.contingencyRemaining).toBe($(300));
  });

  it("has no original or variance when nothing is locked in", () => {
    const t = totals([line({ plannedCents: $(10) })]);
    expect(t.original).toBeNull();
    expect(t.variance).toBeNull();
    expect(totals([]).current).toBe(0n);
  });
});

describe("payments", () => {
  it("spreads a payment over the expense's lines, to the cent", () => {
    expect(paidShares([$(60), $(30), $(10)], $(50))).toEqual([$(30), $(15), $(5)]);
    expect(paidShares([1n, 1n, 1n], 100n)).toEqual([34n, 33n, 33n]);
    expect(paidShares([$(10)], 0n)).toEqual([0n]);
    expect(paidShares([$(-10), $(-5)], $(-15))).toEqual([$(-10), $(-5)]);
  });

  it("says whether an expense is paid", () => {
    expect(paymentState($(100), 0n)).toBe("unpaid");
    expect(paymentState($(100), $(40))).toBe("partly_paid");
    expect(paymentState($(100), $(100))).toBe("paid");
    expect(paymentState($(-20), $(-20))).toBe("paid");
    expect(paymentState($(-20), 0n)).toBe("unpaid");
  });
});

describe("transferShortfall (rule 7)", () => {
  it("is zero when the source can afford it, otherwise how far below zero it goes", () => {
    expect(transferShortfall($(1000), $(1000))).toBe(0n);
    expect(transferShortfall($(1000), $(400))).toBe(0n);
    expect(transferShortfall($(300), $(500))).toBe($(200));
    expect(transferShortfall($(-100), $(50))).toBe($(150));
  });
});
