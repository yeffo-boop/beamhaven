import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { orNotFound } from "@/components/records/or-not-found";
import { ProjectForm } from "@/components/records/project-form";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getProject } from "@/server/services/projects";

export const metadata = { title: "Edit project" };

export default async function EditProjectPage({ params }: PageProps<"/projects/[id]/edit">) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const project = await orNotFound(getProject(ctx, id));
  if (!can(ctx, "records:edit")) redirect(`/projects/${id}`);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Edit ${project.name}`} />
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 md:p-6">
        <ProjectForm project={project} properties={[]} />
      </div>
    </div>
  );
}
