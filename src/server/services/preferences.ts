import "server-only";

import type { MeasurementSystem } from "@/lib/units";
import type { WorkspaceContext } from "@/server/data/context";
import { getMeasurementSystem } from "@/server/data/workspaces";

/** Feet and inches, or metric: how this household sees and types measurements. */
export async function getMeasurementPreference(ctx: WorkspaceContext): Promise<MeasurementSystem> {
  return getMeasurementSystem(ctx);
}
