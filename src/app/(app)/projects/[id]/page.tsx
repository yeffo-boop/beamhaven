import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ContractList, QuoteList } from "@/components/agreements/lists";
import { Available, Money } from "@/components/budget/money";
import { ProblemNotice } from "@/components/budget/problem-notice";
import { AddContractorToProjectForm, TaskForm, WarrantyForm } from "@/components/contractors/forms";
import { ProjectContractorList, TaskList, WarrantyList } from "@/components/contractors/lists";
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
import { getContracts, getQuotes } from "@/server/services/agreements";
import { getPhotos } from "@/server/services/attachments";
import { getProjectBudget } from "@/server/services/budget";
import { getRecordChoices, NO_CHOICES } from "@/server/services/choices";
import { getProjectContractors } from "@/server/services/contractors";
import { getProject } from "@/server/services/projects";
import { getRooms } from "@/server/services/rooms";
import { getTasks, getWarranties } from "@/server/services/tasks";

export const metadata = { title: "Project" };

export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const { problem } = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const project = await orNotFound(getProject(ctx, id));
  const canEdit = can(ctx, "records:edit");
  const [
    photos,
    activity,
    allRooms,
    budget,
    contractors,
    tasks,
    warranties,
    choices,
    quotes,
    contracts,
  ] = await Promise.all([
    getPhotos(ctx, { kind: "project", id }),
    getActivity(ctx, "project", id),
    canEdit ? getRooms(ctx) : Promise.resolve([]),
    getProjectBudget(ctx, id),
    getProjectContractors(ctx, id),
    getTasks(ctx, { projectId: id }),
    getWarranties(ctx, { projectId: id }),
    canEdit ? getRecordChoices(ctx) : Promise.resolve(NO_CHOICES),
    getQuotes(ctx, { projectId: id }),
    getContracts(ctx, { projectId: id }),
  ]);
  const today = new Date();
  const onProject = new Set(contractors.map((c) => c.contractorId));
  const projectRoomChoices = project.rooms.map((r) => ({ value: r.roomId, label: r.roomName }));
  const needsLockIn =
    project.status === "in_progress" && budget.lock.lockedAt === null && budget.lines.length > 0;
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

      <ProblemNotice code={problem} />

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

      <Panel
        title="Budget"
        id="budget"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${id}/budget`}>Open budget</Link>
          </Button>
        }
      >
        {budget.lines.length === 0 ? (
          <EmptyState>No budget yet.</EmptyState>
        ) : (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Detail label="Budget">
              <Money cents={budget.totals.current} />
            </Detail>
            <Detail label="Forecast">
              <Money cents={budget.totals.forecast} />
            </Detail>
            <Detail label="Spent">
              <Money cents={budget.totals.expenses} />
            </Detail>
            <Detail label="Available">
              <Available cents={budget.totals.available} />
            </Detail>
          </dl>
        )}
        {needsLockIn ? (
          <p role="status" className="text-sm">
            Work has started but the budget isn’t locked in yet.{" "}
            <Link href={`/projects/${id}/budget`} className="text-primary hover:underline">
              Lock it in
            </Link>{" "}
            to track how far things drift from the plan.
          </p>
        ) : null}
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

      <Panel
        title="Contractors"
        id="contractors"
        actions={
          canEdit ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/contractors/new">New contractor</Link>
            </Button>
          ) : null
        }
      >
        <ProjectContractorList contractors={contractors} projectId={id} canEdit={canEdit} />
        {canEdit && choices.contractors.some((c) => !onProject.has(c.value)) ? (
          <details className="rounded-[var(--radius-control)] border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Add a contractor</summary>
            <div className="mt-3">
              <AddContractorToProjectForm
                projectId={id}
                contractors={choices.contractors.filter((c) => !onProject.has(c.value))}
              />
            </div>
          </details>
        ) : null}
      </Panel>

      <Panel
        title="Quotes and contracts"
        id="agreements"
        actions={
          canEdit && choices.contractors.length > 0 ? (
            <>
              <Button asChild size="sm">
                <Link href={`/quotes/new?project=${id}`}>Add a quote</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/contracts/new?project=${id}`}>Add a contract</Link>
              </Button>
            </>
          ) : null
        }
      >
        <h3 className="text-sm font-semibold">Quotes</h3>
        <QuoteList quotes={quotes} show="contractor" />
        <h3 className="text-sm font-semibold">Contracts</h3>
        <ContractList contracts={contracts} show="contractor" />
      </Panel>

      <Panel title="Tasks" id="tasks">
        {canEdit ? (
          <details className="rounded-[var(--radius-control)] border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Add a task</summary>
            <div className="mt-3">
              <TaskForm
                fixed={{ projectId: id }}
                assignees={choices.assignees}
                projects={choices.projects}
                rooms={projectRoomChoices}
              />
            </div>
          </details>
        ) : null}
        <TaskList tasks={tasks} canEdit={canEdit} today={today} show={["room"]} />
      </Panel>

      <Panel title="Warranties" id="warranties">
        <WarrantyList warranties={warranties} today={today} show={["contractor", "room"]} />
        {canEdit ? (
          <details className="rounded-[var(--radius-control)] border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Add a warranty</summary>
            <div className="mt-3">
              <WarrantyForm
                fixed={{ projectId: id }}
                contractors={choices.contractors}
                projects={choices.projects}
                rooms={projectRoomChoices}
              />
            </div>
          </details>
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
