import { Lock, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BudgetSummary } from "@/components/budget/budget-summary";
import { CategoryForm, NewLineForm, TransferForm } from "@/components/budget/forms";
import {
  AdjustmentList,
  CommitmentList,
  ExpenseList,
  TransferList,
} from "@/components/budget/history";
import { LinesTable } from "@/components/budget/lines-table";
import { Money } from "@/components/budget/money";
import { PageHeader } from "@/components/page-header";
import { ConfirmAction } from "@/components/records/confirm-action";
import { orNotFound } from "@/components/records/or-not-found";
import { EmptyState, Panel } from "@/components/records/panel";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { lockBudgetAction } from "@/server/actions/budget";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { lineTitle } from "@/server/data/budget";
import {
  getCategories,
  getLineChoices,
  getProjectBudget,
  type GroupTotal,
} from "@/server/services/budget";
import { getEstimates } from "@/server/services/estimates";
import { getProject } from "@/server/services/projects";
import { getRooms } from "@/server/services/rooms";

export const metadata = { title: "Project budget" };

export default async function ProjectBudgetPage({ params }: PageProps<"/projects/[id]/budget">) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const project = await orNotFound(getProject(ctx, id));
  const canEdit = can(ctx, "records:edit");
  const canApprove = can(ctx, "budget:approve");
  const [budget, categories, rooms, choices, estimates] = await Promise.all([
    getProjectBudget(ctx, id),
    getCategories(ctx),
    canEdit ? getRooms(ctx) : Promise.resolve([]),
    canApprove ? getLineChoices(ctx) : Promise.resolve([]),
    getEstimates(ctx, id),
  ]);
  const locked = budget.lock.lockedAt !== null;
  const transferChoices = choices
    .filter((l) => l.projectLocked)
    .map((l) => ({ value: l.id, label: lineTitle(l) }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/projects/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {project.name}
        </Link>
        <PageHeader
          title={`${project.name} budget`}
          actions={
            canEdit && budget.lines.length > 0 ? (
              <Button asChild>
                <Link href={`/budget/expenses/new?project=${id}`}>
                  <Plus aria-hidden="true" />
                  Add expense
                </Link>
              </Button>
            ) : null
          }
        />
        <LockStatus
          projectId={id}
          lockedAt={budget.lock.lockedAt}
          lockedBy={budget.lock.lockedByName}
          canApprove={canApprove}
          hasLines={budget.lines.length > 0}
          planned={budget.totals.current}
          inProgress={project.status === "in_progress"}
        />
      </div>

      <BudgetSummary totals={budget.totals} label="Project budget totals" />

      <Panel title="Budget lines" id="lines">
        {budget.lines.length === 0 ? (
          <EmptyState>
            No budget lines yet. Add one for each kind of cost, like Labor for the kitchen or
            Permits for the whole project.
          </EmptyState>
        ) : (
          <LinesTable lines={budget.lines} />
        )}
        {canEdit ? (
          <details
            className="rounded-[var(--radius-control)] border border-border p-3"
            open={budget.lines.length === 0}
          >
            <summary className="cursor-pointer text-sm font-medium">Add a budget line</summary>
            <div className="mt-3 flex flex-col gap-6">
              <NewLineForm
                projectId={id}
                locked={locked}
                categories={categories.map((c) => ({ value: c.id, label: c.name }))}
                rooms={rooms
                  .filter((r) => r.propertyId === project.propertyId)
                  .map((r) => ({ value: r.id, label: r.name }))}
              />
              <details>
                <summary className="cursor-pointer text-sm text-primary">
                  Need a category that isn’t listed?
                </summary>
                <div className="mt-3">
                  <CategoryForm />
                </div>
              </details>
            </div>
          </details>
        ) : null}
      </Panel>

      <Panel
        title="Room estimates"
        id="estimates"
        actions={
          canEdit ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/projects/${id}/estimates/new`}>Add a room estimate</Link>
            </Button>
          ) : null
        }
      >
        <p className="text-sm text-muted-foreground">
          Flooring, paint, trim and the like, priced from the{" "}
          <Link href="/budget/prices" className="text-primary hover:underline">
            price list
          </Link>{" "}
          and each room&apos;s size. They fill in the estimate on their budget lines.
        </p>
        {estimates.length === 0 ? (
          <EmptyState>No room estimates yet.</EmptyState>
        ) : (
          <ul aria-label="Room estimates" className="divide-y divide-border">
            {estimates.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
              >
                <div className="flex min-w-0 flex-col">
                  <Link href={`/estimates/${e.id}`} className="font-medium hover:underline">
                    {e.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {[
                      e.priceItem.name,
                      `${e.areas.length} ${e.areas.length === 1 ? "room or area" : "rooms and areas"}`,
                      e.result.unmeasured > 0 ? `${e.result.unmeasured} still to measure` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <Money cents={e.result.totalCents} className="text-sm" />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {budget.byRoom.length > 1 ? (
        <Panel title="By room" id="by-room">
          <GroupList groups={budget.byRoom} label="Budget by room" />
        </Panel>
      ) : null}

      <Panel title="Commitments" id="commitments">
        <p className="text-sm text-muted-foreground">
          Approved quotes, contracts, change orders and orders. Add one from its budget line.
        </p>
        <CommitmentList commitments={budget.commitments} showLine />
      </Panel>

      <Panel title="Expenses" id="expenses">
        <ExpenseList expenses={budget.expenses} label="Expenses in this project" />
      </Panel>

      <Panel title="Transfers" id="transfers">
        {canApprove && locked && transferChoices.length > 1 ? (
          <details className="rounded-[var(--radius-control)] border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Move money between lines
            </summary>
            <div className="mt-3">
              <TransferForm lines={transferChoices} />
            </div>
          </details>
        ) : !locked ? (
          <p className="text-sm text-muted-foreground">
            Until the budget is locked in, change the planned amounts directly. Once it is,
            transfers keep a record of every move.
          </p>
        ) : null}
        <TransferList transfers={budget.transfers} canApprove={canApprove} />
      </Panel>

      {budget.adjustments.length > 0 ? (
        <Panel title="Adjustments" id="adjustments">
          <AdjustmentList adjustments={budget.adjustments} />
        </Panel>
      ) : null}
    </div>
  );
}

function LockStatus({
  projectId,
  lockedAt,
  lockedBy,
  canApprove,
  hasLines,
  planned,
  inProgress,
}: {
  projectId: string;
  lockedAt: Date | null;
  lockedBy: string | null;
  canApprove: boolean;
  hasLines: boolean;
  planned: bigint;
  inProgress: boolean;
}) {
  if (lockedAt) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Lock className="size-4" aria-hidden="true" />
        Original budget locked in on {formatDay(lockedAt)}
        {lockedBy ? ` by ${lockedBy}` : ""}.
      </p>
    );
  }
  return (
    <div
      role={inProgress ? "status" : undefined}
      className={
        inProgress
          ? "flex flex-col gap-3 rounded-[var(--radius-card)] border border-primary/40 bg-primary/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
          : "flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
      }
    >
      <p>
        {inProgress
          ? "Work has started, but the original budget isn't locked in yet. Lock it in so you can see how far things drift from the plan."
          : "This is still the plan. When it's final, lock it in: it becomes the original budget you measure against."}
      </p>
      {canApprove && hasLines ? (
        <ConfirmAction
          action={lockBudgetAction}
          label="Lock in budget"
          question={`Lock in ${formatMoney(planned)} as the original budget? You can still move money with transfers and adjustments, but the original won't change.`}
          confirmLabel="Yes, lock it in"
          tone="primary"
        >
          <input type="hidden" name="projectId" value={projectId} />
        </ConfirmAction>
      ) : null}
    </div>
  );
}

function GroupList({ groups, label }: { groups: GroupTotal[]; label: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-border">
      {groups.map((g) => (
        <li
          key={g.key}
          className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5 text-sm"
        >
          <span className="font-medium">{g.label}</span>
          <span className="text-muted-foreground">
            <Money cents={g.totals.expenses} /> spent · <Money cents={g.totals.forecast} /> forecast
            of <Money cents={g.totals.current} />
          </span>
        </li>
      ))}
    </ul>
  );
}
