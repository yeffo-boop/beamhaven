import "server-only";

import { z } from "zod";

import { type AllowanceCheck, checkAllowance } from "@/lib/allowance";
import { assertCan } from "@/server/auth/permissions";
import { recordActivity } from "@/server/data/activity";
import { type LineLabel, lineTitle, listLineLabels } from "@/server/data/budget";
import type { WorkspaceContext } from "@/server/data/context";
import {
  listMaterials,
  type MaterialRecord,
  setMaterialAllowanceRow,
} from "@/server/data/materials";

import { getLine } from "./budget";
import { NotFoundError } from "./errors";

/**
 * Allowances (Milestone 12, ADR-046). Any budget line can be an allowance:
 * choose materials against it, and BeamHaven compares what they cost with
 * the line's current budget. This is a check beside the budget, not part of
 * its math: nothing here changes a forecast or what's available.
 */

export type Allowance = { check: AllowanceCheck; materials: MaterialRecord[] };

export async function getAllowance(ctx: WorkspaceContext, lineId: string): Promise<Allowance> {
  assertCan(ctx, "records:view");
  const { line } = await getLine(ctx, lineId);
  const materials = await listMaterials(ctx, { budgetLineId: lineId });
  return { check: checkAllowance(line.numbers.current, materials), materials };
}

/** The lines a material can be chosen against: its project's, or any when it has none. */
export async function getAllowanceChoices(
  ctx: WorkspaceContext,
  projectId: string | null,
): Promise<{ value: string; label: string }[]> {
  assertCan(ctx, "records:view");
  const lines: LineLabel[] = await listLineLabels(ctx);
  return lines
    .filter((l) => !projectId || l.projectId === projectId)
    .map((l) => ({ value: l.id, label: lineTitle(l, { withProject: !projectId }) }));
}

const lineIdInput = z
  .string()
  .trim()
  .max(64)
  .transform((v) => (v === "" ? null : v));

/** Chooses a material against an allowance, or clears it with "". */
export async function setMaterialAllowance(
  ctx: WorkspaceContext,
  materialId: string,
  budgetLineId: string,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const lineId = lineIdInput.parse(budgetLineId);
  if (!(await setMaterialAllowanceRow(ctx, materialId, lineId))) {
    throw new NotFoundError("material or budget line");
  }
  await recordActivity(ctx, {
    action: "material.allowance",
    entityType: "material",
    entityId: materialId,
    summary: lineId ? "Chose it against an allowance" : "Took it off its allowance",
  });
}
