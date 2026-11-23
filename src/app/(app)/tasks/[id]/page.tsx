import Link from "next/link";
import { notFound } from "next/navigation";

import { TaskForm } from "@/components/contractors/forms";
import { labelFor } from "@/components/contractors/labels";
import { PageHeader } from "@/components/page-header";
import { ConfirmAction } from "@/components/records/confirm-action";
import { orNotFound } from "@/components/records/or-not-found";
import { Detail, Panel } from "@/components/records/panel";
import { dayInputValue, formatDay } from "@/lib/dates";
import { deleteTaskAction } from "@/server/actions/contractors";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getRecordChoices } from "@/server/services/choices";
import { PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/server/services/contractor-inputs";
import { getTask } from "@/server/services/tasks";

export const metadata = { title: "Task" };

export default async function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const t = await orNotFound(getTask(ctx, id));
  const canEdit = can(ctx, "records:edit");
  const back = t.projectId
    ? { href: `/projects/${t.projectId}`, label: t.projectName }
    : { href: `/rooms/${t.roomId}`, label: t.roomName };
  const dash = <span className="text-muted-foreground">Not set</span>;
  const assignee = t.assigneeUserId
    ? `user:${t.assigneeUserId}`
    : t.assigneeContractorId
      ? `contractor:${t.assigneeContractorId}`
      : "";

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={back.href} className="text-sm text-muted-foreground hover:text-foreground">
          ← {back.label}
        </Link>
        <PageHeader
          title={t.title}
          description="Task"
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
      </div>
      {canEdit ? (
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
          }}
          {...await getRecordChoices(ctx)}
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
          </dl>
          {t.description ? <p className="text-sm whitespace-pre-line">{t.description}</p> : null}
        </Panel>
      )}
    </div>
  );
}
