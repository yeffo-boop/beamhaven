import { Download, FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProblemNotice } from "@/components/budget/problem-notice";
import { EditDocumentForm, NewVersionForm } from "@/components/documents/document-forms";
import { formatFileSize } from "@/components/documents/document-list";
import { PageHeader } from "@/components/page-header";
import { ConfirmAction } from "@/components/records/confirm-action";
import { LocalTime } from "@/components/records/local-time";
import { orNotFound } from "@/components/records/or-not-found";
import { Detail, Panel } from "@/components/records/panel";
import { Button } from "@/components/ui/button";
import { deleteDocumentAction, deleteVersionAction } from "@/server/actions/documents";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getRecordChoices, NO_CHOICES } from "@/server/services/choices";
import { categoryLabel } from "@/server/services/document-inputs";
import { getLibraryDocument } from "@/server/services/documents";

export const metadata = { title: "Document" };

function Linked({ href, name, none }: { href: string; name: string | null; none: string }) {
  return name ? (
    <Link href={href} className="text-primary hover:underline">
      {name}
    </Link>
  ) : (
    <span className="text-muted-foreground">{none}</span>
  );
}

export default async function DocumentPage({ params, searchParams }: PageProps<"/files/[id]">) {
  const { id } = await params;
  const { problem } = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const d = await orNotFound(getLibraryDocument(ctx, id));
  const canEdit = can(ctx, "records:edit");
  const choices = canEdit ? await getRecordChoices(ctx) : NO_CHOICES;
  const current = d.current;
  const isImage = current?.mimeType.startsWith("image/") ?? false;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/files" className="text-sm text-muted-foreground hover:text-foreground">
          ← Files
        </Link>
        <PageHeader
          title={d.title}
          description={`${categoryLabel(d.category)} · ${
            d.versionCount === 1 ? "1 version" : `${d.versionCount} versions`
          }`}
          actions={
            canEdit ? (
              <ConfirmAction
                action={deleteDocumentAction}
                label="Delete"
                srLabel={d.title}
                question="Delete this document and every version of it? This can't be undone."
                confirmLabel="Yes, delete it"
              >
                <input type="hidden" name="id" value={id} />
              </ConfirmAction>
            ) : null
          }
        />
      </div>

      <ProblemNotice code={problem} />

      {current ? (
        <Panel title={`Current version (${current.number})`} id="current">
          {isImage ? (
            <a href={`/api/files/${current.fileId}`} target="_blank" rel="noopener">
              {/* Private, per-household files: not next/image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/files/${current.fileId}`}
                alt={d.title}
                className="max-h-[32rem] w-full rounded-[var(--radius-control)] border border-border bg-muted object-contain"
              />
            </a>
          ) : (
            <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-border bg-muted px-4 py-6">
              <FileText className="size-8 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="flex min-w-0 flex-col">
                <span className="font-medium break-words">{current.originalName}</span>
                <span className="text-xs text-muted-foreground">
                  PDF · {formatFileSize(current.sizeBytes)}
                </span>
              </div>
            </div>
          )}
          <div>
            <Button asChild variant="outline">
              <a href={`/api/files/${current.fileId}`} download={current.originalName}>
                <Download aria-hidden="true" />
                Download
              </a>
            </Button>
          </div>
        </Panel>
      ) : null}

      <Panel title="Details" id="details">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Detail label="Project">
            <Linked href={`/projects/${d.projectId}`} name={d.projectName} none="No project" />
          </Detail>
          <Detail label="Room">
            <Linked href={`/rooms/${d.roomId}`} name={d.roomName} none="No particular room" />
          </Detail>
          <Detail label="Contractor">
            <Linked
              href={`/contractors/${d.contractorId}`}
              name={d.contractorName}
              none="No contractor"
            />
          </Detail>
        </dl>
        {d.notes ? <p className="text-sm whitespace-pre-line">{d.notes}</p> : null}
      </Panel>

      <Panel title="Versions" id="versions">
        <ol aria-label="Versions" className="divide-y divide-border">
          {d.versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">
                  Version {v.number}
                  {v.id === current?.id ? (
                    <span className="ml-2 rounded-full bg-primary/12 px-2 py-0.5 text-xs text-primary">
                      Current
                    </span>
                  ) : null}
                </span>
                {v.note ? <span className="text-sm break-words">{v.note}</span> : null}
                <span className="text-xs text-muted-foreground">
                  <LocalTime iso={v.createdAt.toISOString()} />
                  {v.createdByName ? ` · ${v.createdByName}` : ""} · {v.originalName} ·{" "}
                  {formatFileSize(v.sizeBytes)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <a
                    href={`/api/files/${v.fileId}`}
                    download={v.originalName}
                    aria-label={`Download version ${v.number}`}
                  >
                    Download
                  </a>
                </Button>
                {canEdit && d.versions.length > 1 ? (
                  <ConfirmAction
                    action={deleteVersionAction}
                    label="Remove"
                    srLabel={`version ${v.number}`}
                    question="Remove this version? This can't be undone."
                    confirmLabel="Yes, remove it"
                    size="xs"
                  >
                    <input type="hidden" name="documentId" value={id} />
                    <input type="hidden" name="id" value={v.id} />
                  </ConfirmAction>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        {canEdit ? (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Upload a new version</h3>
            <NewVersionForm documentId={id} />
          </div>
        ) : null}
      </Panel>

      {canEdit ? (
        <Panel title="Edit" id="edit">
          <EditDocumentForm
            id={id}
            values={{
              title: d.title,
              category: d.category,
              projectId: d.projectId ?? "",
              roomId: d.roomId ?? "",
              contractorId: d.contractorId ?? "",
              notes: d.notes ?? "",
            }}
            choices={choices}
          />
        </Panel>
      ) : null}
    </div>
  );
}
