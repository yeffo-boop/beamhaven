import Link from "next/link";
import { notFound } from "next/navigation";

import { ContractorForm } from "@/components/contractors/forms";
import { PageHeader } from "@/components/page-header";
import { orNotFound } from "@/components/records/or-not-found";
import { dayInputValue } from "@/lib/dates";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getContractor } from "@/server/services/contractors";

export const metadata = { title: "Edit contractor" };

export default async function EditContractorPage({ params }: PageProps<"/contractors/[id]/edit">) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  if (!ctx || !can(ctx, "records:edit")) notFound();
  const c = await orNotFound(getContractor(ctx, id));
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/contractors/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {c.name}
        </Link>
        <PageHeader title={`Edit ${c.name}`} />
      </div>
      <ContractorForm
        cancelHref={`/contractors/${id}`}
        contractor={{
          id,
          name: c.name,
          contactName: c.contactName ?? "",
          trade: c.trade ?? "",
          phone: c.phone ?? "",
          email: c.email ?? "",
          website: c.website ?? "",
          address: c.address ?? "",
          licenseNumber: c.licenseNumber ?? "",
          licenseState: c.licenseState ?? "",
          licenseExpiresOn: dayInputValue(c.licenseExpiresOn),
          insuranceProvider: c.insuranceProvider ?? "",
          insuranceExpiresOn: dayInputValue(c.insuranceExpiresOn),
          status: c.status,
          notes: c.notes ?? "",
        }}
      />
    </div>
  );
}
