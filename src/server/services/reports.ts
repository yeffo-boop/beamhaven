import "server-only";

import { z } from "zod";

import { type CsvCell, csvFileName } from "@/lib/csv";
import { dayKey } from "@/lib/calendar";
import { assertCan } from "@/server/auth/permissions";
import type { WorkspaceContext } from "@/server/data/context";
import { listExpenses } from "@/server/data/expenses";
import { listLinesWithFacts } from "@/server/data/budget";

import { getProjectBudget, type ProjectBudget } from "./budget";
import { lineNumbers } from "./budget-math";
import { PRIORITY_LABELS, TASK_STATUS_LABELS } from "./contractor-inputs";
import { STATUS_LABELS } from "./inputs";
import { getMilestones } from "./milestones";
import { getProject } from "./projects";
import { getTasks } from "./tasks";
import type { MilestoneRecord } from "@/server/data/milestones";
import type { ProjectDetail } from "@/server/data/projects";
import type { TaskRecord } from "@/server/data/tasks";

/** Reports and exports (Milestone 9, part 3, ADR-039). */

export const CSV_REPORTS = ["budget", "expenses", "tasks"] as const;
export type CsvReport = (typeof CSV_REPORTS)[number];

export const CSV_REPORT_INFO: Record<CsvReport, { label: string; description: string }> = {
  budget: {
    label: "Budget lines",
    description:
      "Every budget line with its original, current, committed, spent, paid, forecast and available amounts.",
  },
  expenses: {
    label: "Expenses",
    description: "Every expense with its vendor, dates, total, what's paid and what's still owed.",
  },
  tasks: {
    label: "Tasks",
    description:
      "Every task with its project, milestone, status, priority, due date and who it's for.",
  },
};

const reportInput = z.enum(CSV_REPORTS);
const projectInput = z.string().trim().max(64);

export type CsvTable = { fileName: string; header: string[]; rows: CsvCell[][] };

const money = (cents: bigint | null): CsvCell => (cents === null ? null : { cents });
const day = (date: Date | null): CsvCell => (date ? dayKey(date) : null);
const PAID = { unpaid: "Unpaid", partly_paid: "Partly paid", paid: "Paid" } as const;

/**
 * Builds one CSV export, for the whole household or one project. Unknown
 * report names and other households' projects are "not found".
 */
export async function buildCsvReport(
  ctx: WorkspaceContext,
  rawReport: unknown,
  rawProjectId: unknown,
): Promise<CsvTable> {
  assertCan(ctx, "records:view");
  const report = reportInput.parse(rawReport);
  const projectId = projectInput.parse(rawProjectId ?? "") || undefined;
  // Checks the project is this household's (throws NotFoundError otherwise).
  const project = projectId ? await getProject(ctx, projectId) : null;
  const scope = project ? project.name : "all-projects";
  const fileName = csvFileName(CSV_REPORT_INFO[report].label, scope);
  const where = projectId ? { projectId } : {};

  if (report === "budget") {
    const lines = await listLinesWithFacts(ctx, where);
    return {
      fileName,
      header: [
        "Project",
        "Category",
        "Room",
        "Line",
        "Original",
        "Current",
        "Committed",
        "Spent",
        "Paid",
        "Still to pay",
        "Forecast",
        "Available",
        "Variance",
      ],
      rows: lines.map((l) => {
        const n = lineNumbers(l.facts);
        return [
          l.projectName,
          l.categoryName,
          l.roomName ?? "Whole project",
          l.name,
          money(n.original),
          money(n.current),
          money(n.committed),
          money(n.expenses),
          money(n.paid),
          money(n.unpaid),
          money(n.forecast),
          money(n.available),
          money(n.variance),
        ];
      }),
    };
  }

  if (report === "expenses") {
    const expenses = await listExpenses(ctx, where);
    const header = [
      "Date",
      "Description",
      "Vendor",
      "Due",
      "Total",
      "Paid",
      "Still to pay",
      "Status",
      "Refund",
    ];
    return {
      fileName,
      // For one project, the share that falls on it, since an expense can be split.
      header: project ? [...header, `Share on ${project.name}`] : header,
      rows: expenses.map((e) => {
        const row: CsvCell[] = [
          day(e.expenseDate),
          e.description,
          e.vendorName,
          day(e.dueDate),
          money(e.totalCents),
          money(e.paidCents),
          money(e.totalCents - e.paidCents),
          PAID[e.state],
          e.isRefund ? "Yes" : "No",
        ];
        return project ? [...row, money(e.shareCents)] : row;
      }),
    };
  }

  const tasks = await getTasks(ctx, where);
  return {
    fileName,
    header: [
      "Project",
      "Milestone",
      "Task",
      "Status",
      "Priority",
      "Due",
      "Assigned to",
      "Room",
      "Done on",
    ],
    rows: tasks.map((t) => [
      t.projectName,
      t.milestoneName,
      t.title,
      TASK_STATUS_LABELS[t.status as keyof typeof TASK_STATUS_LABELS] ?? t.status,
      PRIORITY_LABELS[t.priority as keyof typeof PRIORITY_LABELS] ?? t.priority,
      day(t.dueDate),
      t.assigneeName,
      t.roomName,
      day(t.completedAt),
    ]),
  };
}

export type ProjectReport = {
  project: ProjectDetail;
  statusLabel: string;
  budget: ProjectBudget;
  milestones: MilestoneRecord[];
  openTasks: TaskRecord[];
  doneTaskCount: number;
};

/** Everything the printable project report shows. */
export async function getProjectReport(
  ctx: WorkspaceContext,
  projectId: string,
): Promise<ProjectReport> {
  assertCan(ctx, "records:view");
  const project = await getProject(ctx, projectId);
  const [budget, milestones, tasks] = await Promise.all([
    getProjectBudget(ctx, projectId),
    getMilestones(ctx, { projectId }),
    getTasks(ctx, { projectId }),
  ]);
  return {
    project,
    statusLabel: STATUS_LABELS[project.status as keyof typeof STATUS_LABELS] ?? project.status,
    budget,
    milestones,
    openTasks: tasks.filter((t) => t.status !== "done"),
    doneTaskCount: tasks.filter((t) => t.status === "done").length,
  };
}
