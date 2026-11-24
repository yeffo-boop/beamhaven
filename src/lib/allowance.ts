import type { Cents } from "./money";
import { lineTotal } from "./quantity";

/**
 * Allowances (Milestone 12, ADR-046): a budget line can stand for a
 * selection, like "tile, $3,000". Materials chosen against it are added up
 * and compared with the line's current budget. Pure, so it's unit tested.
 *
 * - Selected, ordered, delivered and installed materials count as chosen.
 * - Ones still being considered are shown separately, as "if you pick these".
 * - Returned and canceled ones don't count.
 * - A material with no price or quantity can't be counted, so it's flagged.
 * - Amounts are before sales tax, the way stores quote them.
 */

export type AllowanceMaterial = {
  status: string;
  quantityMilli: number | null;
  unitPriceCents: Cents | null;
};

export type AllowanceCheck = {
  allowance: Cents;
  chosen: Cents;
  considering: Cents;
  /** allowance − chosen: positive is left over, negative is over the allowance. */
  remaining: Cents;
  over: boolean;
  /** Chosen or considered materials with no price or quantity yet. */
  unpriced: number;
};

const CHOSEN = new Set(["selected", "ordered", "delivered", "installed"]);

/** What a material is expected to cost, or null if it has no price or quantity. */
export function materialCost(m: AllowanceMaterial): Cents | null {
  if (m.unitPriceCents === null || m.quantityMilli === null) return null;
  return lineTotal(m.unitPriceCents, m.quantityMilli);
}

export function checkAllowance(
  allowance: Cents,
  materials: readonly AllowanceMaterial[],
): AllowanceCheck {
  let chosen = 0n;
  let considering = 0n;
  let unpriced = 0;
  for (const m of materials) {
    const isChosen = CHOSEN.has(m.status);
    if (!isChosen && m.status !== "considering") continue;
    const cost = materialCost(m);
    if (cost === null) {
      unpriced += 1;
      continue;
    }
    if (isChosen) chosen += cost;
    else considering += cost;
  }
  const remaining = allowance - chosen;
  return { allowance, chosen, considering, remaining, over: remaining < 0n, unpriced };
}
