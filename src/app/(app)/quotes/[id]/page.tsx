import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ApproveForm,
  QuoteDetailsForm,
  RejectForm,
  RevisionForm,
} from "@/components/agreements/forms";
import { BillList, QuoteStatusBadge } from "@/components/agreements/lists";
import { EstimateComparison } from "@/components/estimates/compare";
import { Money } from "@/components/budget/money";
import { ProblemNotice } from "@/components/budget/problem-notice";
import { PageHeader } from "@/components/page-header";
import { ConfirmAction } from "@/components/records/confirm-action";
import { FileList } from "@/components/records/file-list";
import { orNotFound } from "@/components/records/or-not-found";
import { Detail, EmptyState, Panel } from "@/components/records/panel";
import { Button } from "@/components/ui/button";
import { dayInputValue, formatDay } from "@/lib/dates";
import {
  deleteQuoteAction,
  setQuoteReviewAction,
  withdrawApprovalAction,
} from "@/server/actions/agreements";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { lineTitle } from "@/server/data/budget";
import { getQuote } from "@/server/services/agreements";
import { getDocuments } from "@/server/services/attachments";
import { getLineChoices } from "@/server/services/budget";
import { getEstimates } from "@/server/services/estimates";
import { getBillsFor } from "@/server/services/expenses";

export const metadata = { title: "Quote" };

export default async function QuotePage({ params, searchParams }: PageProps<"/quotes/[id]">) {
  const { id } = await params;
  const { problem } = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const q = await orNotFound(getQuote(ctx, id));
  const canEdit = can(ctx, "records:edit");
  const canApprove = can(ctx, "budget:approve");
  const open = q.status === "received" || q.status === "under_review";
  const [documents, lines, bills, estimates] = await Promise.all([
    getDocuments(ctx, { kind: "quote", id }),
    canApprove && open ? getLineChoices(ctx) : Promise.resolve([]),
    // Before a contract takes it over, bills can be linked to the quote itself.
    q.commitmentId && !q.contractId ? getBillsFor(ctx, [q.commitmentId]) : Promise.resolve([]),
    getEstimates(ctx, q.projectId),
  ]);
  const projectLines = lines
    .filter((l) => l.projectId === q.projectId)
    .map((l) => ({ value: l.id, label: lineTitle(l, { withProject: false }) }));
  const dash = <span className="text-muted-foreground">Not set</span>;
  const reviewButton = (status: "received" | "under_review", label: string) => (
    <form action={setQuoteReviewAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" variant="outline" size="sm">
        {label}
      </Button>
    </form>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/contractors/${q.contractorId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {q.contractorName}
        </Link>
        <PageHeader
          title={q.title}
          description={`Quote from ${q.contractorName} for ${q.projectName}`}
          actions={
            canEdit && q.status !== "approved" ? (
              <ConfirmAction
                action={deleteQuoteAction}
                label="Delete"
                srLabel={`quote ${q.title}`}
                question="Delete this quote, its versions and documents? This can't be undone."
                confirmLabel="Yes, delete"
              >
                <input type="hidden" name="id" value={id} />
              </ConfirmAction>
            ) : null
          }
        />
        <div className="flex flex-wrap items-center gap-3">
          <QuoteStatusBadge status={q.status} />
          <Link href={`/projects/${q.projectId}`} className="text-sm text-primary hover:underline">
            {q.projectName}
          </Link>
        </div>
      </div>
      <ProblemNotice code={problem} />

      <Panel title="Price and decision" id="decision">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Detail label="Latest price">
            <Money cents={q.amountCents} className="text-base font-semibold" />
          </Detail>
          <Detail label="Received">{formatDay(q.receivedOn)}</Detail>
          <Detail label="Good until">{formatDay(q.validUntil) ?? dash}</Detail>
          <Detail label="Budget line">
            {q.line ? (
              <Link href={`/budget/lines/${q.line.id}`} className="text-primary hover:underline">
                {lineTitle(q.line, { withProject: false })}
              </Link>
            ) : (
              <span className="text-muted-foreground">Not in the budget yet</span>
            )}
          </Detail>
        </dl>
        {q.decidedAt ? (
          <p className="text-sm text-muted-foreground">
            {q.status === "approved" ? "Approved" : "Turned down"}
            {q.decidedByName ? ` by ${q.decidedByName}` : ""} on {formatDay(q.decidedAt)}
            {q.decisionNote ? `: ${q.decisionNote}` : "."}
          </p>
        ) : null}

        {open && canEdit ? (
          <div className="flex flex-wrap gap-2">
            {q.status === "received"
              ? reviewButton("under_review", "Mark as under review")
              : reviewButton("received", "Back to received")}
          </div>
        ) : null}
        {open && canApprove ? (
          projectLines.length === 0 ? (
            <EmptyState>
              To approve it, first{" "}
              <Link href={`/projects/${q.projectId}/budget`} className="text-primary underline">
                add a budget line to {q.projectName}
              </Link>
              .
            </EmptyState>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              <details className="rounded-[var(--radius-control)] border border-border p-3">
                <summary className="cursor-pointer text-sm font-medium">Approve</summary>
                <p className="mt-2 text-sm text-muted-foreground">
                  The latest price, <Money cents={q.amountCents} />, becomes a commitment on the
                  line you choose.
                </p>
                <div className="mt-3">
                  <ApproveForm quoteId={id} lines={projectLines} />
                </div>
              </details>
              <details className="rounded-[var(--radius-control)] border border-border p-3">
                <summary className="cursor-pointer text-sm font-medium">Turn down</summary>
                <div className="mt-3">
                  <RejectForm quoteId={id} />
                </div>
              </details>
            </div>
          )
        ) : null}
        {q.status === "rejected" && canApprove ? (
          <div className="flex flex-wrap gap-2">{reviewButton("received", "Reopen")}</div>
        ) : null}
        {q.status === "approved" ? (
          <div className="flex flex-wrap items-center gap-2">
            {q.contractId ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/contracts/${q.contractId}`}>Open the contract</Link>
              </Button>
            ) : canEdit ? (
              <Button asChild size="sm">
                <Link href={`/contracts/new?quote=${id}`}>Make a contract from it</Link>
              </Button>
            ) : null}
            {canEdit && !q.contractId && q.commitmentId ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/budget/expenses/new?commitment=${q.commitmentId}&back=/quotes/${id}`}>
                  Add a bill
                </Link>
              </Button>
            ) : null}
            {canApprove && !q.contractId ? (
              <ConfirmAction
                action={withdrawApprovalAction}
                label="Take back approval"
                question="Take the approval back? The commitment comes out of the budget, and the quote is open again."
                confirmLabel="Yes, take it back"
              >
                <input type="hidden" name="id" value={id} />
              </ConfirmAction>
            ) : null}
          </div>
        ) : null}
      </Panel>

      {estimates.length > 0 || q.estimateId ? (
        <Panel title="Compared with your estimate" id="compare">
          <EstimateComparison
            quoteId={id}
            quoteCents={q.amountCents}
            estimates={estimates}
            chosenId={q.estimateId}
            canEdit={canEdit}
          />
        </Panel>
      ) : null}

      {q.status === "approved" && !q.contractId ? (
        <Panel title="Bills" id="bills">
          <BillList bills={bills} />
        </Panel>
      ) : null}

      <Panel title="Versions" id="versions">
        <ol aria-label="Versions" className="divide-y divide-border">
          {q.revisions.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
            >
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">
                  {r.revisionNumber === 1 ? "First quote" : `Revision ${r.revisionNumber - 1}`}
                </span>
                <span className="text-xs text-muted-foreground">
                  {[`Received ${formatDay(r.receivedOn)}`, r.createdByName]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {r.summary ? (
                  <span className="text-sm whitespace-pre-line text-muted-foreground">
                    {r.summary}
                  </span>
                ) : null}
              </div>
              <Money cents={r.amountCents} className="text-sm" />
            </li>
          ))}
        </ol>
        {open && canEdit ? (
          <details className="rounded-[var(--radius-control)] border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">They sent a new price</summary>
            <div className="mt-3">
              <RevisionForm quoteId={id} />
            </div>
          </details>
        ) : null}
      </Panel>

      <Panel title="Details" id="details">
        {q.notes ? <p className="text-sm whitespace-pre-line">{q.notes}</p> : null}
        {canEdit ? (
          <details className="rounded-[var(--radius-control)] border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Edit details</summary>
            <div className="mt-3">
              <QuoteDetailsForm
                quote={{
                  id,
                  title: q.title,
                  validUntil: dayInputValue(q.validUntil),
                  notes: q.notes ?? "",
                }}
              />
            </div>
          </details>
        ) : q.notes ? null : (
          <EmptyState>No notes.</EmptyState>
        )}
      </Panel>

      <Panel title="Documents" id="documents">
        <p className="text-sm text-muted-foreground">
          The quote itself and any drawings: photos or PDFs.
        </p>
        <FileList
          files={documents}
          target={{ kind: "quote", id }}
          noun="document"
          canEdit={canEdit}
        />
      </Panel>
    </div>
  );
}
