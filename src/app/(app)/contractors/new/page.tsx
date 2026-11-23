import Link from "next/link";
import { notFound } from "next/navigation";

import { ContractorForm } from "@/components/contractors/forms";
import { PageHeader } from "@/components/page-header";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";

export const metadata = { title: "New contractor" };

export default async function NewContractorPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx || !can(ctx, "records:edit")) notFound();
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/contractors" className="text-sm text-muted-foreground hover:text-foreground">
          ← Contractors
        </Link>
        <PageHeader title="New contractor" />
      </div>
      <ContractorForm cancelHref="/contractors" />
    </div>
  );
}
