import { Plus } from "lucide-react";
import Link from "next/link";

import { MaterialList } from "@/components/materials/list";
import { materialStatusOptions } from "@/components/materials/labels";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/forms/field";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { MATERIAL_STATUSES } from "@/server/services/material-inputs";
import { getMaterials } from "@/server/services/materials";
import { getProjects } from "@/server/services/projects";

export const metadata = { title: "Materials" };

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export default async function MaterialsPage({ searchParams }: PageProps<"/materials">) {
  const params = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const canEdit = can(ctx, "records:edit");
  const status = (MATERIAL_STATUSES as readonly string[]).includes(one(params.status))
    ? one(params.status)
    : "";
  const projectId = one(params.project);
  const [materials, projects] = await Promise.all([
    getMaterials(ctx, {
      ...(status ? { status } : {}),
      ...(projectId ? { projectId } : {}),
    }),
    getProjects(ctx),
  ]);
  const filtered = Boolean(status || projectId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Materials"
        description="Products you're considering or have bought: tile, fixtures, paint, appliances."
        actions={
          canEdit ? (
            <Button asChild>
              <Link href="/materials/new">
                <Plus aria-hidden="true" />
                Add material
              </Link>
            </Button>
          ) : null
        }
      />
      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filter materials">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Project
          <select name="project" defaultValue={projectId} className={`${inputClass} min-w-48`}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Status
          <select name="status" defaultValue={status} className={`${inputClass} min-w-40`}>
            <option value="">Any status</option>
            {materialStatusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Show
        </Button>
        {filtered ? (
          <Button asChild variant="ghost">
            <Link href="/materials">Clear</Link>
          </Button>
        ) : null}
      </form>
      <section className="rounded-[var(--radius-card)] border border-border bg-surface px-5 md:px-6">
        <MaterialList
          materials={materials}
          empty={
            filtered
              ? "No materials match."
              : `No materials yet.${canEdit ? " Add the first one." : ""}`
          }
        />
      </section>
    </div>
  );
}
