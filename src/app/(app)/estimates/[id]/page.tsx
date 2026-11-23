import Link from "next/link";
import { notFound } from "next/navigation";

import { Money } from "@/components/budget/money";
import { EstimateForm, TypedAreaForm } from "@/components/estimates/forms";
import { describePrice } from "@/components/estimates/labels";
import { PageHeader } from "@/components/page-header";
import { ConfirmAction } from "@/components/records/confirm-action";
import { orNotFound } from "@/components/records/or-not-found";
import { Detail, Panel } from "@/components/records/panel";
import { Button } from "@/components/ui/button";
import { baseToUnit, laborUnit, MEASURE_LABELS, UNIT_LABELS } from "@/lib/room-estimate";
import { deleteEstimateAction, removeTypedAreaAction } from "@/server/actions/estimates";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getCategories } from "@/server/services/budget";
import { getEstimate, getPriceItems } from "@/server/services/estimates";
import { getProject } from "@/server/services/projects";

export const metadata = { title: "Room estimate" };

export default async function EstimatePage({ params }: PageProps<"/estimates/[id]">) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const e = await orNotFound(getEstimate(ctx, id));
  const canEdit = can(ctx, "records:edit");
  const [project, items, categories] = await Promise.all([
    getProject(ctx, e.projectId),
    canEdit ? getPriceItems(ctx) : Promise.resolve([]),
    canEdit ? getCategories(ctx) : Promise.resolve([]),
  ]);
  const p = e.priceItem;
  const unit = laborUnit(p.measure, p.unit);
  const size = (amount: number) =>
    `${baseToUnit(amount, unit).toLocaleString("en-US")} ${UNIT_LABELS[unit]}`;
  const { result } = e;
  const roomsInEstimate = e.areas
    .filter((a) => a.roomId)
    .map((a) => ({ value: a.roomId ?? "", label: a.roomName ?? "" }));
  const back = `/projects/${e.projectId}/budget`;
  const needs = p.measure === "walls" ? "length, width and ceiling height" : "length and width";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={back} className="text-sm text-muted-foreground hover:text-foreground">
          ← {e.projectName} budget
        </Link>
        <PageHeader
          title={e.name}
          description={`Room estimate: ${p.name}, by ${MEASURE_LABELS[p.measure].toLowerCase()}`}
          actions={
            canEdit ? (
              <ConfirmAction
                action={deleteEstimateAction}
                label="Delete"
                srLabel={`estimate ${e.name}`}
                question="Delete this estimate? Its budget lines lose the estimate (empty ones go)."
                confirmLabel="Yes, delete"
              >
                <input type="hidden" name="id" value={id} />
              </ConfirmAction>
            ) : null
          }
        />
      </div>

      <Panel title="Estimate" id="estimate">
        <p className="text-sm text-muted-foreground">
          An estimate, worked out from room sizes assuming rectangular rooms. Check it against the
          real quote. {describePrice(p)}.
        </p>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Detail label={isLengthLabel(p.measure)}>{size(result.amount)}</Detail>
          <Detail label="Material">
            <Money cents={result.materialCents} />
            {result.cans !== null ? (
              <span className="block text-xs text-muted-foreground">
                {result.cans} {p.unit === "gallon" ? "gallon" : "litre"}
                {result.cans === 1 ? "" : "s"} to buy
              </span>
            ) : null}
          </Detail>
          <Detail label={`Tax (${(e.taxBp / 100).toString()}%)`}>
            <Money cents={result.taxCents} />
          </Detail>
          <Detail label="Install">
            <Money cents={result.laborCents} />
          </Detail>
          <Detail label="Total estimate">
            <Money cents={result.totalCents} className="text-base font-semibold" />
          </Detail>
        </dl>
        <div className="-mx-5 overflow-x-auto md:mx-0">
          <table aria-label="Rooms in this estimate" className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 pl-5 font-medium md:pl-0">Room or area</th>
                <th className="px-3 py-2 text-right font-medium">Size</th>
                <th className="px-3 py-2 text-right font-medium">Material</th>
                <th className="px-3 py-2 text-right font-medium">Tax</th>
                <th className="px-3 py-2 text-right font-medium">Install</th>
                <th className="py-2 pr-5 pl-3 text-right font-medium md:pr-0">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.rows.map((row, i) => {
                const area = e.areas[i];
                if (!area) return null;
                return (
                  <tr key={row.key}>
                    <td className="py-2 pr-3 pl-5 md:pl-0">
                      <span className="font-medium">{area.roomName ?? area.label}</span>
                      {area.roomName && area.label ? (
                        <span className="text-muted-foreground"> · {area.label}</span>
                      ) : null}
                      {area.typedAmount !== null ? (
                        <span className="block text-xs text-muted-foreground">
                          Size typed in
                          {canEdit ? (
                            <form action={removeTypedAreaAction} className="inline">
                              <input type="hidden" name="id" value={area.id} />
                              <button
                                type="submit"
                                className="ml-2 text-primary underline-offset-2 hover:underline"
                              >
                                {area.roomId ? "Measure the room instead" : "Remove"}
                              </button>
                            </form>
                          ) : null}
                        </span>
                      ) : row.amount === null ? (
                        <span className="block text-xs text-warning">
                          Needs the room&apos;s {needs}.{" "}
                          {area.roomId ? (
                            <Link
                              href={`/rooms/${area.roomId}/edit`}
                              className="text-primary underline"
                            >
                              Add them
                            </Link>
                          ) : null}{" "}
                          or type the size below.
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.amount === null ? "—" : size(row.amount)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Money cents={row.materialCents} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Money cents={row.taxCents} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Money cents={row.laborCents} />
                    </td>
                    <td className="py-2 pr-5 pl-3 text-right font-medium md:pr-0">
                      <Money cents={row.totalCents} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {canEdit ? (
          <details className="rounded-[var(--radius-control)] border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Type a size in by hand</summary>
            <p className="mt-2 text-sm text-muted-foreground">
              For a room that isn&apos;t a rectangle, or an area of its own like shower walls or a
              backsplash.
            </p>
            <div className="mt-3">
              <TypedAreaForm
                estimateId={id}
                rooms={roomsInEstimate}
                unitLabel={UNIT_LABELS[unit]}
              />
            </div>
          </details>
        ) : null}
      </Panel>

      <Panel title="In the budget" id="lines">
        <p className="text-sm text-muted-foreground">
          These lines carry the estimate and update by themselves when a price, a room&apos;s size
          or the tax rate changes. Material and tax go on the {e.materialCategoryName} line
          {e.laborCategoryName ? `, install on ${e.laborCategoryName}` : ", with the install"}.
        </p>
        <ul aria-label="Budget lines" className="divide-y divide-border">
          {e.lines.map((l) => (
            <li
              key={l.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 py-2 text-sm"
            >
              <Link href={`/budget/lines/${l.id}`} className="font-medium hover:underline">
                {[l.categoryName, l.roomName ?? "Whole project"].join(" · ")}
              </Link>
              {l.estimateCents !== null ? <Money cents={l.estimateCents} /> : null}
            </li>
          ))}
        </ul>
        <Button asChild variant="outline" size="sm" className="self-start">
          <Link href={back}>Open the project budget</Link>
        </Button>
      </Panel>

      {canEdit ? (
        <Panel title="Settings" id="settings">
          <EstimateForm
            projectId={e.projectId}
            estimate={{
              id,
              name: e.name,
              priceItemId: e.priceItemId,
              materialCategoryId: e.materialCategoryId,
              laborCategoryId: e.laborCategoryId ?? "",
              lineMode: e.lineMode,
              notes: e.notes ?? "",
              roomIds: e.areas.flatMap((a) => (a.roomId ? [a.roomId] : [])),
            }}
            items={items.map((i) => ({ value: i.id, label: i.name }))}
            categories={categories.map((c) => ({ value: c.id, label: c.name }))}
            rooms={project.rooms.map((r) => ({ value: r.roomId, label: r.roomName }))}
            defaults={{ materialCategoryId: e.materialCategoryId, laborCategoryId: "" }}
          />
        </Panel>
      ) : e.notes ? (
        <Panel title="Notes" id="notes">
          <p className="text-sm whitespace-pre-line">{e.notes}</p>
        </Panel>
      ) : null}
    </div>
  );
}

function isLengthLabel(measure: string): string {
  return measure === "perimeter" ? "Total length" : "Total area";
}
