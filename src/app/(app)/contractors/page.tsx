import { Plus } from "lucide-react";
import Link from "next/link";

import { ContractorStatusBadge, ExpiryNote } from "@/components/contractors/lists";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/records/panel";
import { Button } from "@/components/ui/button";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getContractors } from "@/server/services/contractors";

export const metadata = { title: "Contractors" };

export default async function ContractorsPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const canEdit = can(ctx, "records:edit");
  const contractors = await getContractors(ctx);
  const today = new Date();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Contractors"
        description="Who you work with, their license and insurance, and what was said."
        actions={
          canEdit ? (
            <Button asChild>
              <Link href="/contractors/new">
                <Plus aria-hidden="true" />
                Add contractor
              </Link>
            </Button>
          ) : null
        }
      />
      {contractors.length === 0 ? (
        <EmptyState>No contractors yet. {canEdit ? "Add the first one." : null}</EmptyState>
      ) : (
        <ul aria-label="Contractors" className="grid gap-3 md:grid-cols-2">
          {contractors.map((c) => (
            <li key={c.id}>
              <Link
                href={`/contractors/${c.id}`}
                className="flex h-full flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-4 transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 font-medium break-words">{c.name}</span>
                  <ContractorStatusBadge status={c.status} />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {c.trade ? <span>{c.trade}</span> : null}
                  {c.contactName ? <span>{c.contactName}</span> : null}
                  {c.phone ? <span>{c.phone}</span> : null}
                  <span>{c.projectCount === 1 ? "1 project" : `${c.projectCount} projects`}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <ExpiryNote what="License" date={c.licenseExpiresOn} today={today} />
                  <ExpiryNote what="Insurance" date={c.insuranceExpiresOn} today={today} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
