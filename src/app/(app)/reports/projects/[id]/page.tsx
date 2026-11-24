import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Available, Money } from "@/components/budget/money";
import { PrintButton } from "@/components/reports/print-button";
import { formatDay, formatDayRange } from "@/lib/dates";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/server/services/contractor-inputs";
import { NotFoundError } from "@/server/services/errors";
import { getHouseholdToday } from "@/server/services/preferences";
import { getProjectReport, type ProjectReport } from "@/server/services/reports";

export const metadata = { title: "Project report" };

const PAID = { unpaid: "Unpaid", partly_paid: "Partly paid", paid: "Paid" } as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex break-inside-avoid-page flex-col gap-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const th = "border-b border-border py-1.5 pr-3 text-left font-medium text-muted-foreground";
const td = "border-b border-border py-1.5 pr-3 align-top";
const num = "text-right tabular-nums";

/**
 * A project on one printable page (ADR-039). The browser's print dialog
 * saves it as a PDF, so no PDF library or server-side browser is needed.
 */
export default async function ProjectReportPage({ params }: PageProps<"/reports/projects/[id]">) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  let report: ProjectReport;
  try {
    report = await getProjectReport(ctx, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const today = await getHouseholdToday(ctx);
  const { project, budget } = report;
  const t = budget.totals;
  const locked = budget.lock.lockedAt !== null;
  const dates = formatDayRange(
    project.actualStart ?? project.plannedStart,
    project.actualEnd ?? project.plannedEnd,
  );

  return (
    <article className="flex flex-col gap-6 text-sm print:text-[11pt]">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/reports?project=${project.id}`} className="text-primary hover:underline">
          ← Reports
        </Link>
        <PrintButton />
      </div>

      <header className="flex flex-col gap-1 border-b border-border pb-4">
        <p className="text-xs tracking-[0.08em] text-muted-foreground uppercase">Project report</p>
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        <p className="text-muted-foreground">
          {[project.propertyName, report.statusLabel, dates].filter(Boolean).join(" · ")}
        </p>
        <p className="text-xs text-muted-foreground">As of {formatDay(today)}</p>
        {project.description ? (
          <p className="mt-2 whitespace-pre-line">{project.description}</p>
        ) : null}
      </header>

      <Section title="Budget">
        {budget.lines.length === 0 ? (
          <p className="text-muted-foreground">No budget lines yet.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            {[
              ...(locked && t.original !== null
                ? [["Original budget", <Money key="o" cents={t.original} />] as const]
                : []),
              ["Current budget", <Money key="c" cents={t.current} />] as const,
              ["Committed", <Money key="m" cents={t.committed} />] as const,
              ["Spent", <Money key="s" cents={t.expenses} />] as const,
              ["Paid", <Money key="p" cents={t.paid} />] as const,
              ["Still to pay", <Money key="u" cents={t.unpaid} />] as const,
              ["Forecast", <Money key="f" cents={t.forecast} />] as const,
              ["Available", <Available key="a" cents={t.available} />] as const,
              ...(locked && t.variance !== null
                ? [["Variance", <Money key="v" cents={t.variance} showPlus />] as const]
                : []),
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Section>

      {budget.byCategory.length > 0 ? (
        <Section title="Budget by category">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse">
              <thead>
                <tr>
                  <th className={th}>Category</th>
                  <th className={`${th} ${num}`}>Current</th>
                  <th className={`${th} ${num}`}>Spent</th>
                  <th className={`${th} ${num}`}>Forecast</th>
                  <th className={`${th} ${num}`}>Available</th>
                </tr>
              </thead>
              <tbody>
                {budget.byCategory.map((g) => (
                  <tr key={g.key}>
                    <td className={td}>{g.label}</td>
                    <td className={`${td} ${num}`}>
                      <Money cents={g.totals.current} />
                    </td>
                    <td className={`${td} ${num}`}>
                      <Money cents={g.totals.expenses} />
                    </td>
                    <td className={`${td} ${num}`}>
                      <Money cents={g.totals.forecast} />
                    </td>
                    <td className={`${td} ${num}`}>
                      <Available cents={g.totals.available} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      <Section title="Milestones">
        {report.milestones.length === 0 ? (
          <p className="text-muted-foreground">No milestones.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {report.milestones.map((m) => (
              <li key={m.id} className="flex flex-wrap justify-between gap-x-3">
                <span className="font-medium">{m.name}</span>
                <span className="text-muted-foreground">
                  {[
                    m.targetDate ? `Target ${formatDay(m.targetDate)}` : null,
                    `${m.doneCount} of ${m.taskCount} tasks done`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Open tasks (${report.doneTaskCount} done)`}>
        {report.openTasks.length === 0 ? (
          <p className="text-muted-foreground">No open tasks.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse">
              <thead>
                <tr>
                  <th className={th}>Task</th>
                  <th className={th}>Status</th>
                  <th className={th}>Priority</th>
                  <th className={th}>Due</th>
                  <th className={th}>Assigned to</th>
                </tr>
              </thead>
              <tbody>
                {report.openTasks.map((task) => (
                  <tr key={task.id}>
                    <td className={`${td} break-words`}>
                      {task.title}
                      {task.milestoneName ? (
                        <span className="block text-xs text-muted-foreground">
                          {task.milestoneName}
                        </span>
                      ) : null}
                    </td>
                    <td className={td}>
                      {TASK_STATUS_LABELS[task.status as keyof typeof TASK_STATUS_LABELS] ??
                        task.status}
                    </td>
                    <td className={td}>
                      {PRIORITY_LABELS[task.priority as keyof typeof PRIORITY_LABELS] ??
                        task.priority}
                    </td>
                    <td className={td}>{formatDay(task.dueDate) ?? ""}</td>
                    <td className={td}>{task.assigneeName ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Expenses">
        {budget.expenses.length === 0 ? (
          <p className="text-muted-foreground">No expenses yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse">
              <thead>
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Description</th>
                  <th className={th}>Vendor</th>
                  <th className={th}>Status</th>
                  <th className={`${th} ${num}`}>On this project</th>
                </tr>
              </thead>
              <tbody>
                {budget.expenses.map((e) => (
                  <tr key={e.id}>
                    <td className={`${td} whitespace-nowrap`}>{formatDay(e.expenseDate)}</td>
                    <td className={`${td} break-words`}>{e.description}</td>
                    <td className={td}>{e.vendorName ?? ""}</td>
                    <td className={td}>{PAID[e.state]}</td>
                    <td className={`${td} ${num}`}>
                      <Money cents={e.shareCents} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </article>
  );
}
