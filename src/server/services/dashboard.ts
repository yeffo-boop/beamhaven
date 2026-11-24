import "server-only";

import { addDays } from "@/lib/calendar";
import { assertCan } from "@/server/auth/permissions";
import type { CalendarEntry } from "@/server/data/calendar";
import type { WorkspaceContext } from "@/server/data/context";
import { listMilestones } from "@/server/data/milestones";

import { type FeedEntry, getHouseholdActivity } from "./activity";
import { getQuotes } from "./agreements";
import { getCalendar } from "./appointments";
import { getHouseholdBudget } from "./budget";
import type { Totals } from "./budget-math";
import { type AttentionItem, ATTENTION_DAYS_AHEAD, needsAttention } from "./dashboard-rules";
import { getHouseholdToday } from "./preferences";
import { getProjects } from "./projects";

/** The Home page (Milestone 9, part 1, ADR-037). */

/** How far back to look for overdue tasks and late bills. */
const LOOK_BACK_DAYS = 365;
const WEEK_DAYS = 7;
const ACTIVE = new Set(["planning", "in_progress", "on_hold"]);

export type ActiveProject = {
  id: string;
  name: string;
  status: string;
  start: Date | null;
  end: Date | null;
  /** Null when the project has no budget lines yet. */
  budget: { current: bigint; forecast: bigint; available: bigint } | null;
  nextMilestone: { name: string; targetDate: Date } | null;
};

export type Dashboard = {
  today: Date;
  /** Null until some project has budget lines. */
  budget: Totals | null;
  projects: ActiveProject[];
  attention: AttentionItem[];
  week: CalendarEntry[];
  activity: FeedEntry[];
};

export async function getDashboard(ctx: WorkspaceContext): Promise<Dashboard> {
  assertCan(ctx, "records:view");
  const today = await getHouseholdToday(ctx);
  const [budget, entries, quotes, milestones, activity, allProjects] = await Promise.all([
    getHouseholdBudget(ctx),
    getCalendar(ctx, {
      from: addDays(today, -LOOK_BACK_DAYS),
      to: addDays(today, Math.max(ATTENTION_DAYS_AHEAD, WEEK_DAYS - 1)),
    }),
    getQuotes(ctx, {}),
    listMilestones(ctx),
    getHouseholdActivity(ctx, { limit: 10 }),
    getProjects(ctx),
  ]);

  const projectById = new Map(budget.projects.map((p) => [p.id, p]));
  const projects = allProjects
    .filter((p) => ACTIVE.has(p.status))
    .map((p): ActiveProject => {
      const money = projectById.get(p.id);
      const next = milestones
        .filter((m) => m.projectId === p.id && m.targetDate && m.targetDate >= today)
        .sort((a, b) => (a.targetDate?.getTime() ?? 0) - (b.targetDate?.getTime() ?? 0))[0];
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        start: p.actualStart ?? p.plannedStart,
        end: p.actualEnd ?? p.plannedEnd,
        budget:
          money && money.lineCount > 0
            ? {
                current: money.totals.current,
                forecast: money.totals.forecast,
                available: money.totals.available,
              }
            : null,
        nextMilestone: next?.targetDate ? { name: next.name, targetDate: next.targetDate } : null,
      };
    });

  const weekEnd = addDays(today, WEEK_DAYS - 1);
  return {
    today,
    budget: budget.projects.some((p) => p.lineCount > 0) ? budget.totals : null,
    projects,
    attention: needsAttention(entries, quotes, today),
    week: entries.filter((e) => e.day >= today && e.day <= weekEnd),
    activity,
  };
}
