import Link from "next/link";
import { notFound } from "next/navigation";

import { ProblemNotice } from "@/components/budget/problem-notice";
import { PriceItemForm, TaxForm } from "@/components/estimates/forms";
import {
  describePrice,
  measureLabel,
  priceItemValues,
  taxRateText,
} from "@/components/estimates/labels";
import { PageHeader } from "@/components/page-header";
import { ConfirmAction } from "@/components/records/confirm-action";
import { EmptyState, Panel } from "@/components/records/panel";
import { deletePriceItemAction } from "@/server/actions/estimates";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getMaterialsTax, getPriceItems } from "@/server/services/estimates";
import { getMeasurementPreference } from "@/server/services/preferences";

export const metadata = { title: "Price list" };

export default async function PriceListPage({ searchParams }: PageProps<"/budget/prices">) {
  const { problem } = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const canEdit = can(ctx, "records:edit");
  const [items, taxBp, system] = await Promise.all([
    getPriceItems(ctx),
    getMaterialsTax(ctx),
    getMeasurementPreference(ctx),
  ]);
  const metric = system === "metric";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/budget" className="text-sm text-muted-foreground hover:text-foreground">
          ← Budget
        </Link>
        <PageHeader
          title="Price list"
          description="Prices you use again and again: flooring per sq ft, paint per gallon, trim per foot. Room estimates on each project use them."
        />
      </div>
      <ProblemNotice code={problem} />

      <Panel title="Items" id="items">
        {items.length === 0 ? (
          <EmptyState>Nothing on the price list yet.</EmptyState>
        ) : (
          <ul aria-label="Price list" className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium">{item.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {measureLabel(item)} · {describePrice(item)}
                    </span>
                    {item.notes ? (
                      <span className="text-sm whitespace-pre-line text-muted-foreground">
                        {item.notes}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {item.estimateCount === 0
                      ? "Not used yet"
                      : `Used in ${item.estimateCount} ${item.estimateCount === 1 ? "estimate" : "estimates"}`}
                  </span>
                </div>
                {canEdit ? (
                  <div className="flex flex-wrap items-start gap-3">
                    <details className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-border p-3">
                      <summary className="cursor-pointer text-sm font-medium">
                        Edit<span className="sr-only"> {item.name}</span>
                      </summary>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Saving updates every estimate that uses it, and their budget lines.
                      </p>
                      <div className="mt-3">
                        <PriceItemForm item={priceItemValues(item)} metric={metric} />
                      </div>
                    </details>
                    {item.estimateCount === 0 ? (
                      <ConfirmAction
                        action={deletePriceItemAction}
                        label="Delete"
                        srLabel={item.name}
                        question={`Take ${item.name} off the price list?`}
                        confirmLabel="Yes, delete"
                      >
                        <input type="hidden" name="id" value={item.id} />
                      </ConfirmAction>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canEdit ? (
          <details
            className="rounded-[var(--radius-control)] border border-border p-3"
            open={items.length === 0}
          >
            <summary className="cursor-pointer text-sm font-medium">Add to the price list</summary>
            <div className="mt-3">
              <PriceItemForm metric={metric} />
            </div>
          </details>
        ) : null}
      </Panel>

      <Panel title="Sales tax" id="tax">
        {canEdit ? (
          <TaxForm rate={taxRateText(taxBp)} />
        ) : (
          <p className="text-sm">
            {taxBp === 0
              ? "No sales tax is added."
              : `${taxRateText(taxBp)}% is added to materials.`}
          </p>
        )}
      </Panel>
    </div>
  );
}
