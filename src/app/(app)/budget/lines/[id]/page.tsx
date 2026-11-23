import { Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BudgetSummary } from "@/components/budget/budget-summary";
import {
  AdjustmentForm,
  CommitmentForm,
  EditLineForm,
  TransferForm,
} from "@/components/budget/forms";
import {
  AdjustmentList,
  CommitmentList,
  ExpenseList,
  TransferList,
} from "@/components/budget/history";
import { ProblemNotice } from "@/components/budget/problem-notice";
import { PageHeader } from "@/components/page-header";
import { ConfirmAction } from "@/components/records/confirm-action";
import { orNotFound } from "@/components/records/or-not-found";
import { Panel } from "@/components/records/panel";
import { Button } from "@/components/ui/button";
import { moneyInputValue } from "@/lib/money";
import { deleteLineAction } from "@/server/actions/budget";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { lineTitle } from "@/server/data/budget";
import { getLine, getLineChoices } from "@/server/services/budget";
import { totals } from "@/server/services/budget-math";
import { getVendors } from "@/server/services/expenses";

export const metadata = { title: "Budget line" };

export default async function BudgetLinePage({
  params,
  searchParams,
}: PageProps<"/budget/lines/[id]">) {
  const { id } = await params;
  const { problem } = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const detail = await orNotFound(getLine(ctx, id));
  const { line } = detail;
  const canEdit = can(ctx, "records:edit");
  const canApprove = can(ctx, "budget:approve");
  const [choices, vendors] = await Promise.all([
    canEdit ? getLineChoices(ctx) : Promise.resolve([]),
    canEdit ? getVendors(ctx) : Promise.resolve([]),
  ]);
  const otherLocked = choices
    .filter((l) => l.projectLocked && l.id !== id)
    .map((l) => ({ value: l.id, label: lineTitle(l) }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/projects/${line.projectId}/budget`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {line.projectName} budget
        </Link>
        <PageHeader
          title={lineTitle(line, { withProject: false })}
          description={line.projectName}
          actions={
            canEdit ? (
              <>
                <Button asChild>
                  <Link href={`/budget/expenses/new?line=${id}`}>
                    <Plus aria-hidden="true" />
                    Add expense
                  </Link>
                </Button>
                <ConfirmAction
                  action={deleteLineAction}
                  label="Delete"
                  srLabel={`budget line ${lineTitle(line)}`}
                  question="Delete this budget line? Only possible while nothing is recorded on it."
                  confirmLabel="Yes, delete it"
                >
                  <input type="hidden" name="id" value={id} />
                </ConfirmAction>
              </>
            ) : null
          }
        />
      </div>
      <ProblemNotice code={problem} />

      <BudgetSummary
        totals={totals([line.facts])}
        label="Line totals"
        showContingency={line.facts.isContingency}
      />

      {canEdit ? (
        <Panel title="Plan and estimate" id="plan">
          {line.projectLocked ? (
            <p className="text-sm text-muted-foreground">
              The project budget is locked in, so the planned amount is fixed. Change the budget
              with an adjustment or a transfer below.
            </p>
          ) : null}
          <EditLineForm
            line={{
              id,
              name: line.name,
              planned: moneyInputValue(line.facts.plannedCents),
              estimate: moneyInputValue(line.facts.estimateCents),
              notes: line.notes ?? "",
              locked: line.projectLocked,
            }}
          />
        </Panel>
      ) : null}

      <Panel title="Commitments" id="commitments">
        <CommitmentList commitments={detail.commitments} />
        {canEdit ? (
          <details className="rounded-[var(--radius-control)] border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Add an approved quote, contract or order
            </summary>
            <div className="mt-3">
              <CommitmentForm lines={[]} vendors={vendors.map((v) => v.name)} fixedLineId={id} />
            </div>
          </details>
        ) : null}
      </Panel>

      <Panel title="Expenses" id="expenses">
        <ExpenseList expenses={detail.expenses} label="Expenses on this line" />
      </Panel>

      <Panel title="Transfers and adjustments" id="changes">
        {canApprove && line.projectLocked ? (
          <div className="flex flex-col gap-3">
            {otherLocked.length > 0 ? (
              <details className="rounded-[var(--radius-control)] border border-border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Move money to or from this line
                </summary>
                <div className="mt-3">
                  <TransferForm
                    lines={[{ value: id, label: lineTitle(line) }, ...otherLocked]}
                    defaultTo={id}
                  />
                </div>
              </details>
            ) : null}
            <details className="rounded-[var(--radius-control)] border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Raise or lower this line’s budget
              </summary>
              <div className="mt-3">
                <AdjustmentForm lineId={id} />
              </div>
            </details>
          </div>
        ) : null}
        <TransferList transfers={detail.transfers} canApprove={canApprove} />
        {detail.adjustments.length > 0 ? <AdjustmentList adjustments={detail.adjustments} /> : null}
      </Panel>
    </div>
  );
}
