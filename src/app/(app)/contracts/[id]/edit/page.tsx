import Link from "next/link";
import { notFound } from "next/navigation";

import { ContractForm } from "@/components/agreements/forms";
import { PageHeader } from "@/components/page-header";
import { orNotFound } from "@/components/records/or-not-found";
import { dayInputValue } from "@/lib/dates";
import { moneyInputValue } from "@/lib/money";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getContract } from "@/server/services/agreements";

export const metadata = { title: "Edit contract" };

export default async function EditContractPage({ params }: PageProps<"/contracts/[id]/edit">) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  if (!ctx || !can(ctx, "records:edit")) notFound();
  const c = await orNotFound(getContract(ctx, id));
  const back = `/contracts/${id}`;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={back} className="text-sm text-muted-foreground hover:text-foreground">
          ← {c.title}
        </Link>
        <PageHeader title="Edit contract" description={`With ${c.contractorName}`} />
      </div>
      <ContractForm
        contract={{
          id,
          title: c.title,
          value: moneyInputValue(c.valueCents),
          signedOn: dayInputValue(c.signedOn),
          startDate: dayInputValue(c.startDate),
          endDate: dayInputValue(c.endDate),
          notes: c.notes ?? "",
        }}
        cancelHref={back}
      />
    </div>
  );
}
