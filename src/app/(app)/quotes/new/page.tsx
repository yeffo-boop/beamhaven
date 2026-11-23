import Link from "next/link";
import { notFound } from "next/navigation";

import { QuoteForm } from "@/components/agreements/forms";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/records/panel";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getRecordChoices } from "@/server/services/choices";

export const metadata = { title: "New quote" };

export default async function NewQuotePage({ searchParams }: PageProps<"/quotes/new">) {
  const { contractor, project } = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx || !can(ctx, "records:edit")) notFound();
  const choices = await getRecordChoices(ctx);
  // Only ids this household has; anything else is ignored.
  const contractorId =
    typeof contractor === "string" && choices.contractors.some((c) => c.value === contractor)
      ? contractor
      : undefined;
  const projectId =
    typeof project === "string" && choices.projects.some((p) => p.value === project)
      ? project
      : undefined;
  const back = contractorId
    ? `/contractors/${contractorId}`
    : projectId
      ? `/projects/${projectId}`
      : "/contractors";
  const fixed = {
    ...(contractorId ? { contractorId } : {}),
    ...(projectId ? { projectId } : {}),
  };
  const nameOf = (list: { value: string; label: string }[], id?: string) =>
    id ? list.find((c) => c.value === id)?.label : undefined;
  const about = [nameOf(choices.contractors, contractorId), nameOf(choices.projects, projectId)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={back} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
        <PageHeader
          title="New quote"
          description={
            about || "A price a contractor gave you. It goes into the budget once you approve it."
          }
        />
      </div>
      {choices.contractors.length === 0 ? (
        <EmptyState>Add the contractor first, then their quote.</EmptyState>
      ) : choices.projects.length === 0 ? (
        <EmptyState>Add a project first, so the quote has somewhere to go.</EmptyState>
      ) : (
        <QuoteForm
          fixed={fixed}
          contractors={choices.contractors}
          projects={choices.projects}
          cancelHref={back}
        />
      )}
    </div>
  );
}
