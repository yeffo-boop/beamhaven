import { Lock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProblemNotice } from "@/components/budget/problem-notice";
import { TaskForm } from "@/components/contractors/forms";
import { labelFor } from "@/components/contractors/labels";
import { PageHeader } from "@/components/page-header";
import { ConfirmAction } from "@/components/records/confirm-action";
import { orNotFound } from "@/components/records/or-not-found";
import { Detail, Panel } from "@/components/records/panel";
import { DependencyForm } from "@/components/schedule/forms";
import { dayInputValue, formatDay } from "@/lib/dates";
import { deleteTaskAction } from "@/server/actions/contractors";
import { removeDependencyAction } from "@/server/actions/schedule";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import type { TaskLink } from "@/server/data/tasks";
import { getRecordChoices } from "@/server/services/choices";
import { PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/server/services/contractor-inputs";
import { getTask, getTaskChoices } from "@/server/services/tasks";

export const metadata = { title: "Task" };

function TaskLinks({
  tasks,
  label,
  empty,
  remove,
}: {
  tasks: TaskLink[];
  label: string;
  empty: string;
  remove?: { taskId: string } | undefined;
}) {
  if (tasks.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul aria-label={label} className="divide-y divide-border">
      {tasks.map((t) => (
        <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
          <span className="flex min-w-0 flex-col">
            <Link href={`/tasks/${t.id}`} className="font-medium hover:underline">
              {t.title}
            </Link>
            <span className="text-xs text-muted-foreground">
              {labelFor(TASK_STATUS_LABELS, t.status)}
            </span>
          </span>
          {remove ? (
            <ConfirmAction
              action={removeDependencyAction}
              label="Remove"
              srLabel={`the wait on ${t.title}`}
              question="Stop waiting on this task?"
              confirmLabel="Yes, remove it"
              size="xs"
            >
              <input type="hidden" name="taskId" value={remove.taskId} />
              <input type="hidden" name="dependsOnId" value={t.id} />
            </ConfirmAction>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default async function TaskPage({ params, searchParams }: PageProps<"/tasks/[id]">) {
  const { id } = await params;
  const { problem } = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const t = await orNotFound(getTask(ctx, id));
  const canEdit = can(ctx, "records:edit");
  const [choices, others] = canEdit
    ? await Promise.all([getRecordChoices(ctx), getTaskChoices(ctx)])
    : [null, []];
  const back = t.projectId
    ? { href: `/projects/${t.projectId}`, label: t.projectName }
    : { href: `/rooms/${t.roomId}`, label: t.roomName };
  const dash = <span className="text-muted-foreground">Not set</span>;
  const assignee = t.assigneeUserId
    ? `user:${t.assigneeUserId}`
    : t.assigneeContractorId
      ? `contractor:${t.assigneeContractorId}`
      : "";
  const taken = new Set([id, ...t.waitsOn.map((w) => w.id)]);
  const canWaitOn = others
    .filter((o) => !taken.has(o.id))
    .map((o) => ({
      value: o.id,
      label: `${o.projectName ? `${o.projectName}: ` : ""}${o.title}${o.status === "done" ? " (done)" : ""}`,
    }));
  const blocked = t.status !== "done" && t.blockedBy.length > 0;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={back.href} className="text-sm text-muted-foreground hover:text-foreground">
          ← {back.label}
        </Link>
        <PageHeader
          title={t.title}
          description={t.milestoneName ? `Task · ${t.milestoneName}` : "Task"}
          actions={
            canEdit ? (
              <ConfirmAction
                action={deleteTaskAction}
                label="Delete"
                srLabel={`task ${t.title}`}
                question="Delete this task?"
                confirmLabel="Yes, delete it"
              >
                <input type="hidden" name="id" value={id} />
              </ConfirmAction>
            ) : null
          }
        />
        {blocked ? (
          <p className="flex items-center gap-2 rounded-[var(--radius-control)] bg-warning/12 px-3 py-2 text-sm text-warning">
            <Lock aria-hidden="true" className="size-4 shrink-0" />
            Blocked: waits on {t.blockedBy.map((b) => `“${b.title}”`).join(", ")}. It can be
            finished once {t.blockedBy.length === 1 ? "that is" : "those are"} done.
          </p>
        ) : null}
      </div>
      <ProblemNotice code={problem} />
      {canEdit && choices ? (
        <TaskForm
          task={{
            id,
            title: t.title,
            description: t.description ?? "",
            projectId: t.projectId ?? "",
            roomId: t.roomId ?? "",
            status: t.status,
            priority: t.priority,
            assignee,
            dueDate: dayInputValue(t.dueDate),
            milestoneId: t.milestoneId ?? "",
          }}
          assignees={choices.assignees}
          projects={choices.projects}
          rooms={choices.rooms}
          milestones={choices.milestones}
          cancelHref={back.href}
        />
      ) : (
        <Panel title="Details" id="details">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Detail label="Status">{labelFor(TASK_STATUS_LABELS, t.status)}</Detail>
            <Detail label="Priority">{labelFor(PRIORITY_LABELS, t.priority)}</Detail>
            <Detail label="Assigned to">{t.assigneeName ?? dash}</Detail>
            <Detail label="Due">{formatDay(t.dueDate) ?? dash}</Detail>
            <Detail label="Project">{t.projectName ?? dash}</Detail>
            <Detail label="Room">{t.roomName ?? dash}</Detail>
            <Detail label="Milestone">{t.milestoneName ?? dash}</Detail>
          </dl>
          {t.description ? <p className="text-sm whitespace-pre-line">{t.description}</p> : null}
        </Panel>
      )}

      <Panel title="Waits on" id="waits-on">
        <TaskLinks
          tasks={t.waitsOn}
          label="Tasks this waits on"
          empty="This task doesn't wait on any other."
          remove={canEdit ? { taskId: id } : undefined}
        />
        {canEdit && canWaitOn.length > 0 ? (
          <details className="rounded-[var(--radius-control)] border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Make it wait on another task
            </summary>
            <div className="mt-3">
              <DependencyForm key={t.waitsOn.length} taskId={id} choices={canWaitOn} />
            </div>
          </details>
        ) : null}
        <h3 className="text-sm font-semibold">Waiting on this task</h3>
        <TaskLinks tasks={t.neededFor} label="Tasks waiting on this" empty="Nothing waits on it." />
      </Panel>
    </div>
  );
}
