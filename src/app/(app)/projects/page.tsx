import { DoorOpen, Plus } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { FirstProperty } from "@/components/records/first-property";
import { EmptyState } from "@/components/records/panel";
import { StatusBadge } from "@/components/records/status-badge";
import { Button } from "@/components/ui/button";
import { formatDayRange } from "@/lib/dates";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getProjects } from "@/server/services/projects";
import { getProperties } from "@/server/services/properties";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const canEdit = can(ctx, "records:edit");
  const [properties, projects] = await Promise.all([getProperties(ctx), getProjects(ctx)]);
  const showProperty = properties.length > 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Projects"
        description="Every renovation, from first idea to done."
        actions={
          canEdit && properties.length > 0 ? (
            <Button asChild>
              <Link href="/projects/new">
                <Plus aria-hidden="true" />
                New project
              </Link>
            </Button>
          ) : null
        }
      />
      {properties.length === 0 ? (
        <FirstProperty canEdit={canEdit} returnTo="/projects" />
      ) : projects.length === 0 ? (
        <EmptyState>No projects yet. {canEdit ? "Create your first one." : null}</EmptyState>
      ) : (
        <ul aria-label="Projects" className="grid gap-3 md:grid-cols-2">
          {projects.map((project) => {
            const dates =
              formatDayRange(project.actualStart, project.actualEnd) ??
              formatDayRange(project.plannedStart, project.plannedEnd);
            return (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="flex h-full flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-4 transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-medium">{project.name}</span>
                    <StatusBadge status={project.status} />
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {showProperty ? <span>{project.propertyName}</span> : null}
                    {dates ? <span>{dates}</span> : null}
                    <span className="inline-flex items-center gap-1">
                      <DoorOpen className="size-3.5" aria-hidden="true" />
                      {project.roomCount === 1 ? "1 room" : `${project.roomCount} rooms`}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
