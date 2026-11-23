import Link from "next/link";
import { notFound } from "next/navigation";

import { WarrantyForm } from "@/components/contractors/forms";
import { ExpiryNote } from "@/components/contractors/lists";
import { PageHeader } from "@/components/page-header";
import { ConfirmAction } from "@/components/records/confirm-action";
import { FileList } from "@/components/records/file-list";
import { orNotFound } from "@/components/records/or-not-found";
import { Detail, Panel } from "@/components/records/panel";
import { dayInputValue, formatDay } from "@/lib/dates";
import { deleteWarrantyAction } from "@/server/actions/contractors";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getDocuments } from "@/server/services/attachments";
import { getRecordChoices, NO_CHOICES } from "@/server/services/choices";
import { getWarranty } from "@/server/services/tasks";

export const metadata = { title: "Warranty" };

export default async function WarrantyPage({ params }: PageProps<"/warranties/[id]">) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const w = await orNotFound(getWarranty(ctx, id));
  const canEdit = can(ctx, "records:edit");
  const [documents, choices] = await Promise.all([
    getDocuments(ctx, { kind: "warranty", id }),
    canEdit ? getRecordChoices(ctx) : Promise.resolve(NO_CHOICES),
  ]);
  const back = w.materialId
    ? { href: `/materials/${w.materialId}`, label: w.materialName }
    : w.projectId
      ? { href: `/projects/${w.projectId}`, label: w.projectName }
      : w.roomId
        ? { href: `/rooms/${w.roomId}`, label: w.roomName }
        : { href: `/contractors/${w.contractorId}`, label: w.contractorName };
  const dash = <span className="text-muted-foreground">Not set</span>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={back.href} className="text-sm text-muted-foreground hover:text-foreground">
          ← {back.label}
        </Link>
        <PageHeader
          title={w.coverage}
          description="Warranty"
          actions={
            canEdit ? (
              <ConfirmAction
                action={deleteWarrantyAction}
                label="Delete"
                srLabel={`warranty ${w.coverage}`}
                question="Delete this warranty and its documents? This can't be undone."
                confirmLabel="Yes, delete it"
              >
                <input type="hidden" name="id" value={id} />
              </ConfirmAction>
            ) : null
          }
        />
        <ExpiryNote what="Warranty" date={w.expiresOn} today={new Date()} always />
      </div>

      <Panel title="Details" id="details">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Detail label="Provided by">{w.provider ?? w.contractorName ?? dash}</Detail>
          <Detail label="Contractor">
            {w.contractorId ? (
              <Link
                href={`/contractors/${w.contractorId}`}
                className="text-primary hover:underline"
              >
                {w.contractorName}
              </Link>
            ) : (
              dash
            )}
          </Detail>
          <Detail label="Project">
            {w.projectId ? (
              <Link href={`/projects/${w.projectId}`} className="text-primary hover:underline">
                {w.projectName}
              </Link>
            ) : (
              dash
            )}
          </Detail>
          <Detail label="Room">
            {w.roomId ? (
              <Link href={`/rooms/${w.roomId}`} className="text-primary hover:underline">
                {w.roomName}
              </Link>
            ) : (
              dash
            )}
          </Detail>
          <Detail label="Material">
            {w.materialId ? (
              <Link href={`/materials/${w.materialId}`} className="text-primary hover:underline">
                {w.materialName}
              </Link>
            ) : (
              dash
            )}
          </Detail>
          <Detail label="Starts">{formatDay(w.startsOn) ?? dash}</Detail>
          <Detail label="Expires">{formatDay(w.expiresOn) ?? "No end date"}</Detail>
        </dl>
        {w.notes ? <p className="text-sm whitespace-pre-line">{w.notes}</p> : null}
      </Panel>

      <Panel title="Documents" id="documents">
        <FileList
          files={documents}
          target={{ kind: "warranty", id }}
          noun="document"
          canEdit={canEdit}
        />
      </Panel>

      {canEdit ? (
        <Panel title="Edit" id="edit">
          <WarrantyForm
            warranty={{
              id,
              coverage: w.coverage,
              provider: w.provider ?? "",
              contractorId: w.contractorId ?? "",
              projectId: w.projectId ?? "",
              roomId: w.roomId ?? "",
              materialId: w.materialId ?? "",
              startsOn: dayInputValue(w.startsOn),
              expiresOn: dayInputValue(w.expiresOn),
              notes: w.notes ?? "",
            }}
            contractors={choices.contractors}
            projects={choices.projects}
            rooms={choices.rooms}
            materials={choices.materials}
          />
        </Panel>
      ) : null}
    </div>
  );
}
