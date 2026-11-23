import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChangeOrderForm } from "@/components/agreements/forms";
import { BillList, ChangeOrderList } from "@/components/agreements/lists";
import { Money } from "@/components/budget/money";
import { ProblemNotice } from "@/components/budget/problem-notice";
import { PageHeader } from "@/components/page-header";
import { ConfirmAction } from "@/components/records/confirm-action";
import { FileList } from "@/components/records/file-list";
import { orNotFound } from "@/components/records/or-not-found";
import { Detail, Panel } from "@/components/records/panel";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/dates";
import { deleteContractAction } from "@/server/actions/agreements";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { lineTitle } from "@/server/data/budget";
import { getContract } from "@/server/services/agreements";
import { getDocuments } from "@/server/services/attachments";
import { getLineChoices } from "@/server/services/budget";
import { getBillsFor } from "@/server/services/expenses";

export const metadata = { title: "Contract" };

export default async function ContractPage({ params, searchParams }: PageProps<"/contracts/[id]">) {
  const { id } = await params;
  const { problem } = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const c = await orNotFound(getContract(ctx, id));
  const canEdit = can(ctx, "records:edit");
  const [bills, documents, lines] = await Promise.all([
    getBillsFor(ctx, c.commitmentIds),
    getDocuments(ctx, { kind: "contract", id }),
    canEdit ? getLineChoices(ctx) : Promise.resolve([]),
  ]);
  const projectLines = lines
    .filter((l) => l.projectId === c.projectId)
    .map((l) => ({ value: l.id, label: lineTitle(l, { withProject: false }) }));
  const left = c.totalCents - c.paidCents;
  const dash = <span className="text-muted-foreground">Not set</span>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/contractors/${c.contractorId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {c.contractorName}
        </Link>
        <PageHeader
          title={c.title}
          description={`Contract with ${c.contractorName} for ${c.projectName}`}
          actions={
            canEdit ? (
              <>
                <Button asChild variant="outline">
                  <Link href={`/contracts/${id}/edit`}>
                    <Pencil aria-hidden="true" />
                    Edit
                  </Link>
                </Button>
                <ConfirmAction
                  action={deleteContractAction}
                  label="Delete"
                  srLabel={`contract ${c.title}`}
                  question={
                    c.quoteId
                      ? "Delete this contract? The approved quote goes back into the budget at its own price."
                      : "Delete this contract, its change orders and documents? Only possible while no bills are linked."
                  }
                  confirmLabel="Yes, delete"
                >
                  <input type="hidden" name="id" value={id} />
                </ConfirmAction>
              </>
            ) : null
          }
        />
      </div>
      <ProblemNotice code={problem} />

      <Panel title="Money" id="money">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Detail label="Contract">
            <Money cents={c.valueCents} />
          </Detail>
          <Detail label="Change orders">
            <Money cents={c.changeOrdersCents} showPlus={c.changeOrdersCents !== 0n} />
          </Detail>
          <Detail label="Total agreed">
            <Money cents={c.totalCents} className="font-semibold" />
          </Detail>
          <Detail label="Billed">
            <Money cents={c.billedCents} />
          </Detail>
          <Detail label="Paid">
            <Money cents={c.paidCents} />
            <span className="block text-xs text-muted-foreground">
              {left > 0n ? (
                <>
                  <Money cents={left} /> still to pay
                </>
              ) : left < 0n ? (
                <>
                  <Money cents={-left} /> more than agreed
                </>
              ) : (
                "All paid"
              )}
            </span>
          </Detail>
        </dl>
        <p className="text-sm text-muted-foreground">
          In the budget on{" "}
          <Link href={`/budget/lines/${c.line.id}`} className="text-primary hover:underline">
            {lineTitle(c.line)}
          </Link>
          . Change the amount here, not in the budget, so the two always agree.
        </p>
      </Panel>

      <Panel title="Details" id="details">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Detail label="Signed">{formatDay(c.signedOn) ?? dash}</Detail>
          <Detail label="Work starts">{formatDay(c.startDate) ?? dash}</Detail>
          <Detail label="Work ends">{formatDay(c.endDate) ?? dash}</Detail>
          <Detail label="From quote">
            {c.quoteId ? (
              <Link href={`/quotes/${c.quoteId}`} className="text-primary hover:underline">
                {c.quoteTitle}
              </Link>
            ) : (
              <span className="text-muted-foreground">None</span>
            )}
          </Detail>
        </dl>
        {c.notes ? <p className="text-sm whitespace-pre-line">{c.notes}</p> : null}
      </Panel>

      <Panel title="Change orders" id="change-orders">
        <ChangeOrderList
          changeOrders={c.changeOrders}
          contractId={id}
          contractLineId={c.line.id}
          canEdit={canEdit}
        />
        {canEdit && projectLines.length > 0 ? (
          <details className="rounded-[var(--radius-control)] border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Add a change order</summary>
            <div className="mt-3">
              <ChangeOrderForm contractId={id} lines={projectLines} defaultLineId={c.line.id} />
            </div>
          </details>
        ) : null}
      </Panel>

      <Panel
        title="Bills and payments"
        id="bills"
        actions={
          canEdit ? (
            <Button asChild size="sm">
              <Link
                href={`/budget/expenses/new?commitment=${c.commitmentId}&back=/contracts/${id}`}
              >
                Add a bill
              </Link>
            </Button>
          ) : null
        }
      >
        <p className="text-sm text-muted-foreground">
          Each bill from {c.contractorName} for this work: the deposit, progress payments and the
          final payment. Record what you paid on the bill itself.
        </p>
        <BillList bills={bills} />
      </Panel>

      <Panel title="Documents" id="documents">
        <p className="text-sm text-muted-foreground">
          The signed contract, lien waivers, permits: photos or PDFs.
        </p>
        <FileList
          files={documents}
          target={{ kind: "contract", id }}
          noun="document"
          canEdit={canEdit}
        />
      </Panel>
    </div>
  );
}
