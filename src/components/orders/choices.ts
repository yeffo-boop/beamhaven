import "server-only";

import { moneyInputValue } from "@/lib/money";
import { quantityInputValue } from "@/lib/quantity";
import { lineTitle } from "@/server/data/budget";
import type { WorkspaceContext } from "@/server/data/context";
import { getLineChoices } from "@/server/services/budget";
import { getVendors } from "@/server/services/expenses";
import { getMaterials } from "@/server/services/materials";

/** What the order form offers: the project's budget lines, materials and suppliers. */
export async function orderFormChoices(ctx: WorkspaceContext, projectId: string) {
  const [lines, materials, vendors] = await Promise.all([
    getLineChoices(ctx),
    getMaterials(ctx),
    getVendors(ctx),
  ]);
  return {
    lines: lines
      .filter((l) => l.projectId === projectId)
      .map((l) => ({ value: l.id, label: lineTitle(l, { withProject: false }) })),
    // This project's materials first, then the household's others.
    materials: [
      ...materials.filter((m) => m.projectId === projectId),
      ...materials.filter((m) => m.projectId !== projectId),
    ]
      .filter((m) => m.status !== "canceled")
      .map((m) => ({
        value: m.id,
        label:
          m.projectId === projectId || !m.projectName ? m.name : `${m.name} (${m.projectName})`,
        // Strings, ready for the form's boxes when a material is picked.
        unitPrice: moneyInputValue(m.unitPriceCents),
        quantity: quantityInputValue(m.quantityMilli),
      })),
    suppliers: vendors.map((v) => v.name),
  };
}

export type OrderFormChoices = Awaited<ReturnType<typeof orderFormChoices>>;
