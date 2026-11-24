import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { PunchItemForm } from "@/components/punch-list/punch-form";
import { PunchStatusButton, punchStatusLabel } from "@/components/punch-list/punch-list";
import { ConfirmAction } from "@/components/records/confirm-action";
import { FileList } from "@/components/records/file-list";
import { orNotFound } from "@/components/records/or-not-found";
import { Detail, Panel } from "@/components/records/panel";
import { formatDay } from "@/lib/dates";
import { deletePunchItemAction, setPunchStatusAction } from "@/server/actions/punch-list";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getDocuments } from "@/server/services/attachments";
import { getRecordChoices, NO_CHOICES } from "@/server/services/choices";
import { getPunchItem } from "@/server/services/punch-list";

export const metadata = { title: "Punch list item" };

/** One punch list item: its details, photos, status and edit form (ADR-047). */
export default async function PunchItemPage({ params }: PageProps<"/punch/[id]">) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const item = await orNotFound(getPunchItem(ctx, id));
  const canEdit = can(ctx, "records:edit");
  const [files, choices] = await Promise.all([
    getDocuments(ctx, { kind: "punch_item", id }),
    canEdit ? getRecordChoices(ctx) : Promise.resolve(NO_CHOICES),
  ]);
  const dash = <span className="text-muted-foreground">Not set</span>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/projects/${item.projectId}#punch-list`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {item.projectName}
        </Link>
        <PageHeader
          title={item.title}
          description={`Punch list · ${punchStatusLabel(item.status)}`}
          actions={
            canEdit ? (
              <>
                <PunchStatusButton id={id} status={item.status} title={item.title} />
                {item.status !== "open" ? (
                  <form action={setPunchStatusAction}>
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="status" value="open" />
                    <button
                      type="submit"
                      className="rounded-[var(--radius-control)] border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent"
                    >
                      Reopen
                    </button>
                  </form>
                ) : null}
                <ConfirmAction
                  action={deletePunchItemAction}
                  label="Delete"
                  srLabel={`punch list item ${item.title}`}
                  question="Delete this item and its photos? This can't be undone."
                  confirmLabel="Yes, delete it"
                >
                  <input type="hidden" name="id" value={id} />
                </ConfirmAction>
              </>
            ) : null
          }
        />
      </div>

      <Panel title="Details" id="details">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Detail label="Status">{punchStatusLabel(item.status)}</Detail>
          <Detail label="Room">
            {item.roomId ? (
              <Link href={`/rooms/${item.roomId}`} className="text-primary hover:underline">
                {item.roomName}
              </Link>
            ) : (
              dash
            )}
          </Detail>
          <Detail label="Who fixes it">
            {item.contractorId ? (
              <Link
                href={`/contractors/${item.contractorId}`}
                className="text-primary hover:underline"
              >
                {item.contractorName}
              </Link>
            ) : (
              dash
            )}
          </Detail>
          <Detail label="Added">{formatDay(item.createdAt)}</Detail>
          <Detail label="Fixed">{formatDay(item.fixedAt) ?? dash}</Detail>
          <Detail label="Signed off">
            {item.signedOffAt
              ? `${formatDay(item.signedOffAt)}${item.signedOffByName ? ` by ${item.signedOffByName}` : ""}`
              : dash}
          </Detail>
        </dl>
        {item.notes ? <p className="text-sm whitespace-pre-line">{item.notes}</p> : null}
      </Panel>

      <Panel title="Photos and files" id="files">
        <FileList
          files={files}
          target={{ kind: "punch_item", id }}
          noun="document"
          canEdit={canEdit}
        />
      </Panel>

      {canEdit ? (
        <Panel title="Edit" id="edit">
          <PunchItemForm
            projectId={item.projectId}
            item={{
              id,
              title: item.title,
              notes: item.notes ?? "",
              roomId: item.roomId ?? "",
              contractorId: item.contractorId ?? "",
            }}
            rooms={choices.rooms}
            contractors={choices.contractors}
          />
        </Panel>
      ) : null}
    </div>
  );
}
