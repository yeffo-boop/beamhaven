/**
 * The budget calculations from docs/BUDGET_DEFINITIONS.md, as plain
 * functions with no database, so every number can be unit-tested.
 * The data layer gathers the facts for each budget line; these functions
 * turn them into the numbers people see. Nothing calculated here is stored.
 */
import { type Cents, maxCents, splitByWeights, sumCents } from "@/lib/money";

/** What's recorded against one budget line. */
export type LineFacts = {
  id: string;
  /** A Contingency line (its "available" is the contingency remaining). */
  isContingency: boolean;
  /** The planned amount, editable until the project budget is locked in. */
  plannedCents: Cents;
  /** Set when the project budget is locked in (baselined); null before. */
  originalCents: Cents | null;
  adjustmentsCents: Cents;
  transfersInCents: Cents;
  transfersOutCents: Cents;
  estimateCents: Cents | null;
  /** `invoicedCents`: the total of every expense linked to this commitment. */
  commitments: { id: string; amountCents: Cents; invoicedCents: Cents }[];
  /** This line's share of each expense, and of what's been paid on it. */
  allocations: { amountCents: Cents; paidCents: Cents; commitmentId: string | null }[];
};

export type LineNumbers = {
  original: Cents | null;
  current: Cents;
  estimate: Cents | null;
  commitments: Cents;
  committed: Cents;
  notYetInvoiced: Cents;
  expenses: Cents;
  paid: Cents;
  unpaid: Cents;
  forecast: Cents;
  available: Cents;
  /** forecast − original; positive means over plan. Null before lock-in. */
  variance: Cents | null;
};

export function lineNumbers(line: LineFacts): LineNumbers {
  const commitments = sumCents(line.commitments.map((c) => c.amountCents));
  const expenses = sumCents(line.allocations.map((a) => a.amountCents));
  const paid = sumCents(line.allocations.map((a) => a.paidCents));
  // Rule 1 and 2: linked expenses use up their commitment; unlinked ones
  // count as committed on their own.
  const unlinked = sumCents(
    line.allocations.filter((a) => a.commitmentId === null).map((a) => a.amountCents),
  );
  const committed = commitments + unlinked;
  const notYetInvoiced = sumCents(
    line.commitments.map((c) => maxCents(c.amountCents - c.invoicedCents, 0n)),
  );
  // Rule 4: once a line has a commitment, its estimate no longer counts.
  const hasCommitments = line.commitments.length > 0;
  const forecast = hasCommitments
    ? maxCents(committed, expenses)
    : maxCents(line.estimateCents ?? 0n, expenses);
  const current =
    (line.originalCents ?? line.plannedCents) +
    line.adjustmentsCents +
    line.transfersInCents -
    line.transfersOutCents;
  return {
    original: line.originalCents,
    current,
    estimate: line.estimateCents,
    commitments,
    committed,
    notYetInvoiced,
    expenses,
    paid,
    unpaid: expenses - paid,
    forecast,
    available: current - forecast,
    variance: line.originalCents === null ? null : forecast - line.originalCents,
  };
}

export type Totals = Omit<LineNumbers, "estimate"> & {
  estimate: Cents;
  contingencyRemaining: Cents;
};

/**
 * Adds up lines into a room, category, project or household total. Totals
 * are always the sum of their lines; nothing is stored at a higher level.
 * `original` and `variance` are null if none of the lines is locked in.
 */
export function totals(lines: readonly LineFacts[]): Totals {
  const numbers = lines.map((line) => ({ line, n: lineNumbers(line) }));
  const sum = (pick: (n: LineNumbers) => Cents) => sumCents(numbers.map(({ n }) => pick(n)));
  const locked = numbers.filter(({ n }) => n.original !== null);
  return {
    original: locked.length ? sumCents(locked.map(({ n }) => n.original ?? 0n)) : null,
    current: sum((n) => n.current),
    estimate: sum((n) => n.estimate ?? 0n),
    commitments: sum((n) => n.commitments),
    committed: sum((n) => n.committed),
    notYetInvoiced: sum((n) => n.notYetInvoiced),
    expenses: sum((n) => n.expenses),
    paid: sum((n) => n.paid),
    unpaid: sum((n) => n.unpaid),
    forecast: sum((n) => n.forecast),
    available: sum((n) => n.available),
    variance: locked.length ? sumCents(locked.map(({ n }) => n.variance ?? 0n)) : null,
    contingencyRemaining: sumCents(
      numbers.filter(({ line }) => line.isContingency).map(({ n }) => n.available),
    ),
  };
}

/**
 * Spreads what's been paid on an expense over its allocations, in
 * proportion to their size, so each budget line knows its paid share.
 */
export function paidShares(allocationCents: readonly Cents[], paidCents: Cents): Cents[] {
  const weights = allocationCents.map((a) => (a < 0n ? -a : a));
  if (paidCents === 0n || sumCents(weights) === 0n) return allocationCents.map(() => 0n);
  return splitByWeights(paidCents, weights);
}

export type PaymentState = "unpaid" | "partly_paid" | "paid";

/** Works for refunds too, where both amounts are negative. */
export function paymentState(totalCents: Cents, paidCents: Cents): PaymentState {
  const total = totalCents < 0n ? -totalCents : totalCents;
  const paid = totalCents < 0n ? -paidCents : paidCents;
  if (paid <= 0n) return total === 0n ? "paid" : "unpaid";
  return paid >= total ? "paid" : "partly_paid";
}

/**
 * Rule 7: a transfer may not leave the source line with less than nothing
 * available, unless the person says so and gives a reason. Returns how far
 * below zero the source would go (0n when it's fine).
 */
export function transferShortfall(sourceAvailable: Cents, amount: Cents): Cents {
  const after = sourceAvailable - amount;
  return after < 0n ? -after : 0n;
}
