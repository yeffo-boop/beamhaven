import Link from "next/link";
import { notFound } from "next/navigation";

import { ContractForm } from "@/components/agreements/forms";
import { PageHeader } from "@/components/page-header";
import { orNotFound } from "@/components/records/or-not-found";
import { EmptyState } from "@/components/records/panel";
import { moneyInputValue } from "@/lib/money";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { lineTitle } from "@/server/data/budget";
import { getQuote } from "@/server/services/agreements";
import { getLineChoices } from "@/server/services/budget";
import { getRecordChoices } from "@/server/services/choices";

export const metadata = { title: "New contract" };

export default async function NewContractPage({ searchParams }: PageProps<"/contracts/new">) {
  const { quote: quoteId, contractor, project } = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx || !can(ctx, "records:edit")) notFound();

  if (typeof quoteId === "string") {
    const q = await orNotFound(getQuote(ctx, quoteId));
    const back = `/quotes/${q.id}`;
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Link href={back} className="text-sm text-muted-foreground hover:text-foreground">
            ← {q.title}
          </Link>
          <PageHeader
            title="New contract"
            description={`With ${q.contractorName}, for ${q.projectName}. It takes over the approved quote's place in the budget.`}
          />
        </div>
        {q.status !== "approved" ? (
          <EmptyState>Approve the quote first.</EmptyState>
        ) : q.contractId ? (
          <EmptyState>
            There&apos;s already{" "}
            <Link href={`/contracts/${q.contractId}`} className="text-primary underline">
              a contract for this quote
            </Link>
            .
          </EmptyState>
        ) : (
          <ContractForm
            fromQuote={{ quoteId: q.id, title: q.title, value: moneyInputValue(q.amountCents) }}
            cancelHref={back}
          />
        )}
      </div>
    );
  }

  // From scratch: no quote, so choose the contractor and the budget line.
  const [choices, allLines] = await Promise.all([getRecordChoices(ctx), getLineChoices(ctx)]);
  const contractorId =
    typeof contractor === "string" && choices.contractors.some((c) => c.value === contractor)
      ? contractor
      : undefined;
  const projectId = typeof project === "string" ? project : undefined;
  const lines = allLines
    .filter((l) => !projectId || l.projectId === projectId)
    .map((l) => ({ value: l.id, label: lineTitle(l, { withProject: !projectId }) }));
  const back = contractorId
    ? `/contractors/${contractorId}`
    : projectId
      ? `/projects/${projectId}`
      : "/contractors";
  const contractorName = choices.contractors.find((c) => c.value === contractorId)?.label;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={back} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
        <PageHeader
          title="New contract"
          description={
            contractorName
              ? `With ${contractorName}. For work agreed without a quote in BeamHaven.`
              : "For work agreed without a quote in BeamHaven."
          }
        />
      </div>
      {choices.contractors.length === 0 ? (
        <EmptyState>Add the contractor first.</EmptyState>
      ) : lines.length === 0 ? (
        <EmptyState>
          Add a budget line to the project first, so the contract has somewhere to go.
        </EmptyState>
      ) : (
        <ContractForm
          {...(contractorId ? { contractorId } : {})}
          contractors={choices.contractors}
          lines={lines}
          cancelHref={back}
        />
      )}
    </div>
  );
}
