import Link from "next/link";
import { notFound } from "next/navigation";

import { TaskList } from "@/components/contractors/lists";
import { PageHeader } from "@/components/page-header";
import { ConfirmAction } from "@/components/records/confirm-action";
import { orNotFound } from "@/components/records/or-not-found";
import { Detail, Panel } from "@/components/records/panel";
import { MilestoneForm } from "@/components/schedule/forms";
import { MilestoneBadge, milestoneState } from "@/components/schedule/milestones";
import { dayInputValue, formatDay } from "@/lib/dates";
import { deleteMilestoneAction } from "@/server/actions/schedule";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getMilestone } from "@/server/services/milestones";
import { getTasks } from "@/server/services/tasks";

export const metadata = { title: "Milestone" };

export default async function MilestonePage({ params }: PageProps<"/milestones/[id]">) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const m = await orNotFound(getMilestone(ctx, id));
  const tasks = await getTasks(ctx, { milestoneId: id });
  const canEdit = can(ctx, "records:edit");
  const today = new Date();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/projects/${m.projectId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {m.projectName}
        </Link>
        <PageHeader
          title={m.name}
          description="Milestone"
          actions={
            canEdit ? (
              <ConfirmAction
                action={deleteMilestoneAction}
                label="Delete"
                srLabel={`milestone ${m.name}`}
                question="Delete this milestone? Its tasks stay on the project."
                confirmLabel="Yes, delete it"
              >
                <input type="hidden" name="id" value={id} />
              </ConfirmAction>
            ) : null
          }
        />
        <div>
          <MilestoneBadge state={milestoneState(m, today)} />
        </div>
      </div>

      <Panel title="Details" id="details">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Detail label="Target date">
            {formatDay(m.targetDate) ?? <span className="text-muted-foreground">Not set</span>}
          </Detail>
          <Detail label="Tasks done">
            {m.doneCount} of {m.taskCount}
          </Detail>
        </dl>
        {m.notes ? <p className="text-sm whitespace-pre-line">{m.notes}</p> : null}
      </Panel>

      <Panel title="Tasks" id="tasks">
        <p className="text-sm text-muted-foreground">
          Put a task in this milestone from the task&apos;s page, or when adding it on the project.
        </p>
        <TaskList tasks={tasks} canEdit={canEdit} today={today} show={["room"]} />
      </Panel>

      {canEdit ? (
        <Panel title="Edit" id="edit">
          <MilestoneForm
            milestone={{
              id,
              name: m.name,
              targetDate: dayInputValue(m.targetDate),
              notes: m.notes ?? "",
            }}
          />
        </Panel>
      ) : null}
    </div>
  );
}
