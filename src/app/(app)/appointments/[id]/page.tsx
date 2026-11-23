import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { ConfirmAction } from "@/components/records/confirm-action";
import { orNotFound } from "@/components/records/or-not-found";
import { Detail, Panel } from "@/components/records/panel";
import { AppointmentForm } from "@/components/schedule/appointment-form";
import { dayKey, formatTime, formatWeekday } from "@/lib/calendar";
import { dayInputValue } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { deleteAppointmentAction } from "@/server/actions/appointments";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import {
  APPOINTMENT_KIND_LABELS,
  type AppointmentKind,
} from "@/server/services/appointment-inputs";
import { getAppointment } from "@/server/services/appointments";
import { getRecordChoices, NO_CHOICES } from "@/server/services/choices";

export const metadata = { title: "Appointment" };

function kindLabel(kind: string): string {
  return APPOINTMENT_KIND_LABELS[kind as AppointmentKind] ?? "Appointment";
}

export default async function AppointmentPage({ params }: PageProps<"/appointments/[id]">) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const a = await orNotFound(getAppointment(ctx, id));
  const canEdit = can(ctx, "records:edit");
  const choices = canEdit ? await getRecordChoices(ctx) : NO_CHOICES;
  const time = a.startTime
    ? a.endTime
      ? `${formatTime(a.startTime)} to ${formatTime(a.endTime)}`
      : formatTime(a.startTime)
    : "Any time";

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/schedule?view=week&date=${dayKey(a.day)}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Schedule
        </Link>
        <PageHeader
          title={a.title}
          description={`${kindLabel(a.kind)} on ${formatWeekday(a.day)}`}
          actions={
            canEdit ? (
              <ConfirmAction
                action={deleteAppointmentAction}
                label="Delete"
                srLabel={a.title}
                question="Take this off the calendar?"
                confirmLabel="Yes, delete it"
              >
                <input type="hidden" name="id" value={id} />
              </ConfirmAction>
            ) : null
          }
        />
        {a.outcome ? (
          <div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                a.outcome === "passed"
                  ? "bg-positive/12 text-positive"
                  : "bg-destructive/12 text-destructive",
              )}
            >
              {a.outcome === "passed" ? "Passed" : "Failed"}
            </span>
          </div>
        ) : null}
      </div>

      <Panel title="Details" id="details">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Detail label="When">
            {formatWeekday(a.day)}, {time}
          </Detail>
          <Detail label="Where">
            {a.location ?? <span className="text-muted-foreground">Not set</span>}
          </Detail>
          <Detail label="With">
            {a.contractorId && a.contractorName ? (
              <Link href={`/contractors/${a.contractorId}`} className="hover:underline">
                {a.contractorName}
              </Link>
            ) : (
              <span className="text-muted-foreground">No contractor</span>
            )}
          </Detail>
          <Detail label="Project">
            {a.projectId && a.projectName ? (
              <Link href={`/projects/${a.projectId}`} className="hover:underline">
                {a.projectName}
              </Link>
            ) : (
              <span className="text-muted-foreground">No project</span>
            )}
          </Detail>
          <Detail label="Room">
            {a.roomId && a.roomName ? (
              <Link href={`/rooms/${a.roomId}`} className="hover:underline">
                {a.roomName}
              </Link>
            ) : (
              <span className="text-muted-foreground">No particular room</span>
            )}
          </Detail>
        </dl>
        {a.notes ? <p className="text-sm whitespace-pre-line">{a.notes}</p> : null}
      </Panel>

      {canEdit ? (
        <Panel title="Edit" id="edit">
          <AppointmentForm
            appointment={{
              id,
              title: a.title,
              kind: a.kind,
              day: dayInputValue(a.day),
              startTime: a.startTime ?? "",
              endTime: a.endTime ?? "",
              location: a.location ?? "",
              projectId: a.projectId ?? "",
              roomId: a.roomId ?? "",
              contractorId: a.contractorId ?? "",
              outcome: a.outcome ?? "",
              notes: a.notes ?? "",
            }}
            projects={choices.projects}
            rooms={choices.rooms}
            contractors={choices.contractors}
          />
        </Panel>
      ) : null}
    </div>
  );
}
