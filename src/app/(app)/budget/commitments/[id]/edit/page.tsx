import Link from "next/link";
import { notFound } from "next/navigation";

import { CommitmentForm } from "@/components/budget/forms";
import { ProblemNotice } from "@/components/budget/problem-notice";
import { PageHeader } from "@/components/page-header";
import { ConfirmAction } from "@/components/records/confirm-action";
import { orNotFound } from "@/components/records/or-not-found";
import { dayInputValue } from "@/lib/dates";
import { moneyInputValue } from "@/lib/money";
import { deleteCommitmentAction } from "@/server/actions/budget";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { lineTitle } from "@/server/data/budget";
import { getLineChoices } from "@/server/services/budget";
import { getCommitment, getVendors } from "@/server/services/expenses";

export const metadata = { title: "Commitment" };

export default async function EditCommitmentPage({
  params,
  searchParams,
}: PageProps<"/budget/commitments/[id]/edit">) {
  const { id } = await params;
  const { problem } = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const commitment = await orNotFound(getCommitment(ctx, id));
  const canEdit = can(ctx, "records:edit");
  const [lines, vendors] = await Promise.all([
    canEdit ? getLineChoices(ctx) : Promise.resolve([]),
    canEdit ? getVendors(ctx) : Promise.resolve([]),
  ]);
  const back = `/budget/lines/${commitment.line.id}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={back} className="text-sm text-muted-foreground hover:text-foreground">
          ← {lineTitle(commitment.line)}
        </Link>
        <PageHeader
          title={commitment.description}
          actions={
            canEdit ? (
              <ConfirmAction
                action={deleteCommitmentAction}
                label="Delete"
                srLabel={`commitment ${commitment.description}`}
                question="Delete this commitment? Only possible while no expenses are linked to it."
                confirmLabel="Yes, delete it"
              >
                <input type="hidden" name="id" value={id} />
              </ConfirmAction>
            ) : null
          }
        />
      </div>
      <ProblemNotice code={problem} />
      {canEdit ? (
        <CommitmentForm
          lines={lines.map((l) => ({ value: l.id, label: lineTitle(l) }))}
          vendors={vendors.map((v) => v.name)}
          cancelHref={back}
          commitment={{
            id,
            lineId: commitment.line.id,
            vendorName: commitment.vendorName ?? "",
            source: commitment.source,
            description: commitment.description,
            amount: moneyInputValue(commitment.amountCents),
            committedOn: dayInputValue(commitment.committedOn),
            notes: commitment.notes ?? "",
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Viewers can see commitments but not change them.
        </p>
      )}
    </div>
  );
}
