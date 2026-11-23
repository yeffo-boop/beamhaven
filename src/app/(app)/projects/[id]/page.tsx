import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { ActivityList } from "@/components/records/activity-list";
import { ConfirmAction } from "@/components/records/confirm-action";
import { orNotFound } from "@/components/records/or-not-found";
import { Detail, EmptyState, Panel } from "@/components/records/panel";
import { PhotoGallery } from "@/components/records/photo-gallery";
import { ProjectRoomsForm } from "@/components/records/project-rooms-form";
import { StatusBadge } from "@/components/records/status-badge";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/dates";
import { deleteProjectAction } from "@/server/actions/records";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getActivity } from "@/server/services/activity";
import { getPhotos } from "@/server/services/attachments";
import { getProject } from "@/server/services/projects";
import { getRooms } from "@/server/services/rooms";

export const metadata = { title: "Project" };

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const project = await orNotFound(getProject(ctx, id));
  const canEdit = can(ctx, "records:edit");
  const [photos, activity, allRooms] = await Promise.all([
    getPhotos(ctx, { kind: "project", id }),
    getActivity(ctx, "project", id),
    canEdit ? getRooms(ctx) : Promise.resolve([]),
  ]);
  const propertyRooms = allRooms.filter((room) => room.propertyId === project.propertyId);
  const dash = <span className="text-muted-foreground">Not set</span>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">
          ← Projects
        </Link>
        <PageHeader
          title={project.name}
          actions={
            canEdit ? (
              <>
                <Button asChild variant="outline">
                  <Link href={`/projects/${id}/edit`}>
                    <Pencil aria-hidden="true" />
                    Edit
                  </Link>
                </Button>
                <ConfirmAction
                  action={deleteProjectAction}
                  label="Delete"
                  srLabel={`project ${project.name}`}
                  question={`Delete “${project.name}” and its photos? This can't be undone.`}
                  confirmLabel="Yes, delete it"
                >
                  <input type="hidden" name="id" value={id} />
                </ConfirmAction>
              </>
            ) : null
          }
        />
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <StatusBadge status={project.status} />
          <span>{project.propertyName}</span>
        </div>
      </div>

      <Panel title="Details" id="details">
        {project.description ? (
          <p className="text-sm whitespace-pre-line">{project.description}</p>
        ) : null}
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Detail label="Planned start">{formatDay(project.plannedStart) ?? dash}</Detail>
          <Detail label="Planned finish">{formatDay(project.plannedEnd) ?? dash}</Detail>
          <Detail label="Actually started">{formatDay(project.actualStart) ?? dash}</Detail>
          <Detail label="Actually finished">{formatDay(project.actualEnd) ?? dash}</Detail>
        </dl>
      </Panel>

      <Panel title="Rooms" id="rooms">
        {project.rooms.length > 0 ? (
          <ul aria-label="Rooms in this project" className="divide-y divide-border">
            {project.rooms.map((room) => (
              <li key={room.roomId} className="flex flex-col gap-0.5 py-2.5">
                <Link
                  href={`/rooms/${room.roomId}`}
                  className="text-sm font-medium hover:underline"
                >
                  {room.roomName}
                </Link>
                {room.plannedImprovements ? (
                  <span className="text-sm text-muted-foreground">{room.plannedImprovements}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>No rooms linked yet.</EmptyState>
        )}
        {canEdit ? (
          propertyRooms.length > 0 ? (
            <details className="rounded-[var(--radius-control)] border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">Choose rooms</summary>
              <div className="mt-3">
                <ProjectRoomsForm projectId={id} rooms={propertyRooms} linked={project.rooms} />
              </div>
            </details>
          ) : (
            <p className="text-sm text-muted-foreground">
              <Link href="/rooms/new" className="text-primary underline-offset-2 hover:underline">
                Add a room
              </Link>{" "}
              to link it to this project.
            </p>
          )
        ) : null}
      </Panel>

      <Panel title="Photos" id="photos">
        <PhotoGallery photos={photos} targetKind="project" targetId={id} canEdit={canEdit} />
      </Panel>

      <Panel title="Activity" id="activity">
        <ActivityList items={activity} />
      </Panel>
    </div>
  );
}
