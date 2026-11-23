import "server-only";

import { isTimeZone, todayIn } from "@/lib/calendar";
import type { MeasurementSystem } from "@/lib/units";
import type { WorkspaceContext } from "@/server/data/context";
import { getMeasurementSystem, getTimeZone } from "@/server/data/workspaces";

/** Feet and inches, or metric: how this household sees and types measurements. */
export async function getMeasurementPreference(ctx: WorkspaceContext): Promise<MeasurementSystem> {
  return getMeasurementSystem(ctx);
}

/** Where the household is, for "today" and (later) reminder times. */
export async function getTimeZonePreference(ctx: WorkspaceContext): Promise<string> {
  const zone = await getTimeZone(ctx);
  return isTimeZone(zone) ? zone : "UTC";
}

/** Today's date where the household is. */
export async function getHouseholdToday(ctx: WorkspaceContext, now = new Date()): Promise<Date> {
  return todayIn(await getTimeZonePreference(ctx), now);
}

/** Every time zone the server knows, for the setting's list. */
export function timeZoneChoices(): string[] {
  const zones = Intl.supportedValuesOf("timeZone");
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}
