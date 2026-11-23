import "server-only";

import { lineTitle } from "@/server/data/budget";
import type { WorkspaceContext } from "@/server/data/context";
import { formatMoney } from "@/lib/money";
import { getLineChoices } from "@/server/services/budget";
import { getAllCommitments, getVendors } from "@/server/services/expenses";

/** Everything the expense form offers to pick from. */
export async function expenseFormChoices(ctx: WorkspaceContext) {
  const [lines, commitments, vendors] = await Promise.all([
    getLineChoices(ctx),
    getAllCommitments(ctx),
    getVendors(ctx),
  ]);
  return {
    lines: lines.map((l) => ({ value: l.id, label: lineTitle(l), projectId: l.projectId })),
    commitments: commitments.map((c) => ({
      value: c.id,
      label: `${c.description} (${formatMoney(c.amountCents)}, ${lineTitle(c.line)})`,
    })),
    vendors: vendors.map((v) => v.name),
  };
}
