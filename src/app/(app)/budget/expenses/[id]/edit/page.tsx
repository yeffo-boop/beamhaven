import Link from "next/link";
import { notFound } from "next/navigation";

import { expenseFormChoices } from "@/components/budget/choices";
import { ExpenseForm } from "@/components/budget/expense-form";
import { PageHeader } from "@/components/page-header";
import { orNotFound } from "@/components/records/or-not-found";
import { dayInputValue } from "@/lib/dates";
import { moneyInputValue } from "@/lib/money";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getExpense } from "@/server/services/expenses";

export const metadata = { title: "Edit expense" };

export default async function EditExpensePage({ params }: PageProps<"/budget/expenses/[id]/edit">) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  if (!ctx || !can(ctx, "records:edit")) notFound();
  const expense = await orNotFound(getExpense(ctx, id));
  // Refunds are recorded from the original, not edited.
  if (expense.refundOfExpenseId) notFound();
  const choices = await expenseFormChoices(ctx);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/budget/expenses/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {expense.description}
        </Link>
        <PageHeader title={`Edit ${expense.description}`} />
      </div>
      <ExpenseForm
        lines={choices.lines}
        vendors={choices.vendors}
        commitments={choices.commitments}
        cancelHref={`/budget/expenses/${id}`}
        expense={{
          id,
          vendorName: expense.vendorName ?? "",
          commitmentId: expense.commitmentId ?? "",
          description: expense.description,
          expenseDate: dayInputValue(expense.expenseDate),
          dueDate: dayInputValue(expense.dueDate),
          total: moneyInputValue(expense.totalCents),
          notes: expense.notes ?? "",
          stage: expense.stage ?? "",
          rows: expense.allocations.map((a) => ({
            lineId: a.line.id,
            amount: moneyInputValue(a.amountCents),
            kind: a.kind,
          })),
        }}
      />
    </div>
  );
}
