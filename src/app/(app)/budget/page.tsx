import { Plus } from "lucide-react";
import Link from "next/link";

import { BudgetSummary } from "@/components/budget/budget-summary";
import { CategoryForm } from "@/components/budget/forms";
import { ExpenseList } from "@/components/budget/history";
import { Available, Money } from "@/components/budget/money";
import { PageHeader } from "@/components/page-header";
import { EmptyState, Panel } from "@/components/records/panel";
import { StatusBadge } from "@/components/records/status-badge";
import { Button } from "@/components/ui/button";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getCategories, getHouseholdBudget } from "@/server/services/budget";

export const metadata = { title: "Budget" };

export default async function BudgetPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const canEdit = can(ctx, "records:edit");
  const [budget, categories] = await Promise.all([getHouseholdBudget(ctx), getCategories(ctx)]);
  const withLines = budget.projects.filter((p) => p.lineCount > 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Budget"
        description="Every project's budget, what's agreed, spent and paid."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/budget/prices">Price list</Link>
            </Button>
            {canEdit && withLines.length > 0 ? (
              <Button asChild>
                <Link href="/budget/expenses/new">
                  <Plus aria-hidden="true" />
                  Add expense
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {budget.projects.length === 0 ? (
        <EmptyState>
          Budgets belong to projects.{" "}
          <Link href="/projects" className="text-primary hover:underline">
            Create a project
          </Link>{" "}
          first.
        </EmptyState>
      ) : (
        <>
          <BudgetSummary totals={budget.totals} label="Household budget totals" />

          <Panel title="Projects" id="projects">
            <div className="-mx-5 overflow-x-auto md:mx-0">
              <table aria-label="Project budgets" className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th scope="col" className="px-5 py-2 font-medium md:pl-0">
                      Project
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Budget
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Forecast
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Spent
                    </th>
                    <th scope="col" className="px-5 py-2 text-right font-medium md:pr-0">
                      Available
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {budget.projects.map((p) => (
                    <tr key={p.id}>
                      <th scope="row" className="px-5 py-2.5 text-left font-normal md:pl-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/projects/${p.id}/budget`}
                            className="font-medium hover:underline"
                          >
                            {p.name}
                          </Link>
                          <StatusBadge status={p.status} />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {p.lineCount === 0
                            ? "No budget yet"
                            : p.locked
                              ? "Locked in"
                              : "Still planning"}
                        </span>
                      </th>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <Money cents={p.totals.current} />
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <Money cents={p.totals.forecast} />
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <Money cents={p.totals.expenses} />
                      </td>
                      <td className="px-5 py-2.5 text-right whitespace-nowrap md:pr-0">
                        <Available cents={p.totals.available} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Recent expenses" id="recent">
            <ExpenseList expenses={budget.recentExpenses} label="Recent expenses" />
          </Panel>
        </>
      )}

      <Panel title="Categories" id="categories">
        <ul aria-label="Budget categories" className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <li key={c.id} className="rounded-full border border-border px-3 py-1 text-sm">
              {c.name}
              {c.kind === "contingency" ? (
                <span className="text-muted-foreground"> (safety buffer)</span>
              ) : null}
            </li>
          ))}
        </ul>
        {canEdit ? <CategoryForm /> : null}
      </Panel>
    </div>
  );
}
