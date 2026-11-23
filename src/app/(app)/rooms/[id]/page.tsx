import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProblemNotice } from "@/components/budget/problem-notice";
import { TaskForm, WarrantyForm } from "@/components/contractors/forms";
import { TaskList, WarrantyList } from "@/components/contractors/lists";
import { PageHeader } from "@/components/page-header";
import { ActivityList } from "@/components/records/activity-list";
import { ConfirmAction } from "@/components/records/confirm-action";
import { OpeningForm } from "@/components/records/opening-form";
import { orNotFound } from "@/components/records/or-not-found";
import { Detail, EmptyState, Panel } from "@/components/records/panel";
import { PhotoGallery } from "@/components/records/photo-gallery";
import { openingKindLabel, roomTypeLabel } from "@/components/records/room-labels";
import { StatusBadge } from "@/components/records/status-badge";
import { Button } from "@/components/ui/button";
import { estimateRoomAreas, formatArea, formatLength } from "@/lib/units";
import { deleteRoomAction, removeOpeningAction } from "@/server/actions/records";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getActivity } from "@/server/services/activity";
import { getPhotos } from "@/server/services/attachments";
import { getRecordChoices, NO_CHOICES } from "@/server/services/choices";
import { getMeasurementPreference } from "@/server/services/preferences";
import { getRoom } from "@/server/services/rooms";
import { getTasks, getWarranties } from "@/server/services/tasks";

export const metadata = { title: "Room" };

export default async function RoomPage({ params, searchParams }: PageProps<"/rooms/[id]">) {
  const { id } = await params;
  const { problem } = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const room = await orNotFound(getRoom(ctx, id));
  const canEdit = can(ctx, "records:edit");
  const [photos, activity, system, tasks, warranties, choices] = await Promise.all([
    getPhotos(ctx, { kind: "room", id }),
    getActivity(ctx, "room", id),
    getMeasurementPreference(ctx),
    getTasks(ctx, { roomId: id }),
    getWarranties(ctx, { roomId: id }),
    canEdit ? getRecordChoices(ctx) : Promise.resolve(NO_CHOICES),
  ]);
  const today = new Date();
  const roomProjects = room.projects.map((p) => ({ value: p.projectId, label: p.projectName }));
  const { floorMm2, wallMm2 } = estimateRoomAreas(room, room.openings);
  const length = (mm: number | null) =>
    mm ? (
      <span className="font-mono tabular-nums">{formatLength(mm, system)}</span>
    ) : (
      <span className="text-muted-foreground">Not measured</span>
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/rooms" className="text-sm text-muted-foreground hover:text-foreground">
          ← Rooms
        </Link>
        <PageHeader
          title={room.name}
          description={[roomTypeLabel(room.type), room.floorLevel, room.propertyName]
            .filter(Boolean)
            .join(" · ")}
          actions={
            canEdit ? (
              <>
                <Button asChild variant="outline">
                  <Link href={`/rooms/${id}/edit`}>
                    <Pencil aria-hidden="true" />
                    Edit
                  </Link>
                </Button>
                <ConfirmAction
                  action={deleteRoomAction}
                  label="Delete"
                  srLabel={`room ${room.name}`}
                  question={`Delete “${room.name}”, its photos and measurements? This can't be undone.`}
                  confirmLabel="Yes, delete it"
                >
                  <input type="hidden" name="id" value={id} />
                </ConfirmAction>
              </>
            ) : null
          }
        />
      </div>

      <ProblemNotice code={problem} />

      <Panel title="Size" id="size">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Detail label="Length">{length(room.lengthMm)}</Detail>
          <Detail label="Width">{length(room.widthMm)}</Detail>
          <Detail label="Ceiling height">{length(room.ceilingHeightMm)}</Detail>
        </dl>
        {floorMm2 ? (
          <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3">
            <Detail label="Floor area (estimate)">
              <span className="font-mono tabular-nums">≈ {formatArea(floorMm2, system)}</span>
            </Detail>
            {wallMm2 !== null ? (
              <Detail label="Wall area, less windows and doors (estimate)">
                <span className="font-mono tabular-nums">≈ {formatArea(wallMm2, system)}</span>
              </Detail>
            ) : null}
          </dl>
        ) : null}
        {floorMm2 ? (
          <p className="text-xs text-muted-foreground">
            Estimates assume a rectangular room. Measure again before ordering materials.
          </p>
        ) : null}
        {room.description ? (
          <p className="text-sm whitespace-pre-line">{room.description}</p>
        ) : null}
        {room.notes ? (
          <p className="text-sm whitespace-pre-line text-muted-foreground">{room.notes}</p>
        ) : null}
      </Panel>

      <Panel title="Windows and doors" id="openings">
        {room.openings.length > 0 ? (
          <ul aria-label="Windows and doors" className="divide-y divide-border">
            {room.openings.map((opening) => (
              <li key={opening.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">
                    {openingKindLabel(opening.kind)}
                    {opening.label ? `: ${opening.label}` : ""}
                  </span>{" "}
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {formatLength(opening.widthMm, system)} wide ×{" "}
                    {formatLength(opening.heightMm, system)} high
                    {opening.sillHeightMm
                      ? `, sill ${formatLength(opening.sillHeightMm, system)}`
                      : ""}
                  </span>
                </div>
                {canEdit ? (
                  <form action={removeOpeningAction}>
                    <input type="hidden" name="roomId" value={id} />
                    <input type="hidden" name="openingId" value={opening.id} />
                    <Button type="submit" variant="destructive" size="sm">
                      Remove
                      <span className="sr-only">
                        {" "}
                        {openingKindLabel(opening.kind)} {opening.label ?? ""}
                      </span>
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>No windows or doors recorded.</EmptyState>
        )}
        {canEdit ? (
          <details className="rounded-[var(--radius-control)] border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Add a window or door</summary>
            <div className="mt-3">
              <OpeningForm roomId={id} system={system} />
            </div>
          </details>
        ) : null}
      </Panel>

      <Panel title="Projects" id="projects">
        {room.projects.length > 0 ? (
          <ul aria-label="Projects in this room" className="divide-y divide-border">
            {room.projects.map((project) => (
              <li key={project.projectId} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/projects/${project.projectId}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {project.projectName}
                  </Link>
                  {project.plannedImprovements ? (
                    <p className="text-sm text-muted-foreground">{project.plannedImprovements}</p>
                  ) : null}
                </div>
                <StatusBadge status={project.status} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>
            Not part of any project yet. Link rooms from a project&rsquo;s page.
          </EmptyState>
        )}
      </Panel>

      <Panel title="Tasks" id="tasks">
        {canEdit ? (
          <details className="rounded-[var(--radius-control)] border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Add a task</summary>
            <div className="mt-3">
              <TaskForm
                fixed={{ roomId: id }}
                assignees={choices.assignees}
                projects={roomProjects}
                rooms={choices.rooms}
              />
            </div>
          </details>
        ) : null}
        <TaskList tasks={tasks} canEdit={canEdit} today={today} show={["project"]} />
      </Panel>

      <Panel title="Warranties" id="warranties">
        <WarrantyList warranties={warranties} today={today} show={["contractor", "project"]} />
        {canEdit ? (
          <details className="rounded-[var(--radius-control)] border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Add a warranty</summary>
            <div className="mt-3">
              <WarrantyForm
                fixed={{ roomId: id }}
                contractors={choices.contractors}
                projects={roomProjects}
                rooms={choices.rooms}
              />
            </div>
          </details>
        ) : null}
      </Panel>

      <Panel title="Photos" id="photos">
        <PhotoGallery photos={photos} targetKind="room" targetId={id} canEdit={canEdit} />
      </Panel>

      <Panel title="Activity" id="activity">
        <ActivityList items={activity} />
      </Panel>
    </div>
  );
}
