import Link from "next/link";
import { notFound } from "next/navigation";

import { expenseFormChoices } from "@/components/budget/choices";
import { ExpenseForm } from "@/components/budget/expense-form";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/records/panel";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";

export const metadata = { title: "New expense" };

export default async function NewExpensePage({ searchParams }: PageProps<"/budget/expenses/new">) {
  const { line, project } = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx || !can(ctx, "records:edit")) notFound();
  const choices = await expenseFormChoices(ctx);
  const lineId = typeof line === "string" ? line : undefined;
  const projectId = typeof project === "string" ? project : undefined;
  // From a project's page, offer that project's lines first.
  const lines = projectId
    ? [
        ...choices.lines.filter((l) => l.projectId === projectId),
        ...choices.lines.filter((l) => l.projectId !== projectId),
      ]
    : choices.lines;
  const defaultLineId =
    lineId && lines.some((l) => l.value === lineId)
      ? lineId
      : projectId
        ? lines.find((l) => l.projectId === projectId)?.value
        : undefined;
  const back = lineId
    ? `/budget/lines/${lineId}`
    : projectId
      ? `/projects/${projectId}/budget`
      : "/budget";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={back} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
        <PageHeader
          title="New expense"
          description="A bill, an invoice or a purchase. You can add the receipt next."
        />
      </div>
      {lines.length === 0 ? (
        <EmptyState>
          Add a budget line to a project first, so the expense has somewhere to go.
        </EmptyState>
      ) : (
        <ExpenseForm
          lines={lines}
          vendors={choices.vendors}
          commitments={choices.commitments}
          {...(defaultLineId ? { defaultLineId } : {})}
          cancelHref={back}
        />
      )}
    </div>
  );
}
