import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { ProjectForm } from "@/components/records/project-form";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getProperties } from "@/server/services/properties";

export const metadata = { title: "New project" };

export default async function NewProjectPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const properties = await getProperties(ctx);
  if (!can(ctx, "records:edit") || properties.length === 0) redirect("/projects");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New project" />
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 md:p-6">
        <ProjectForm properties={properties} />
      </div>
    </div>
  );
}
