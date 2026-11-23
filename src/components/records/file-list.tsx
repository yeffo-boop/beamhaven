import { FileText } from "lucide-react";

import { ConfirmAction } from "./confirm-action";
import { EmptyState } from "./panel";
import { PhotoUploader } from "./photo-uploader";
import { deletePhotoAction } from "@/server/actions/records";
import type { AttachmentSummary, AttachmentTarget } from "@/server/data/files";

/**
 * Receipts or documents on a record. Photos show as pictures; PDFs are
 * download links (the server always sends them as downloads, never inside
 * the page).
 */
export function FileList({
  files,
  target,
  noun,
  canEdit,
}: {
  files: AttachmentSummary[];
  target: AttachmentTarget;
  noun: "receipt" | "document";
  canEdit: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {files.length === 0 ? (
        <EmptyState>{noun === "receipt" ? "No receipt yet." : "No documents yet."}</EmptyState>
      ) : (
        <ul
          aria-label={noun === "receipt" ? "Receipts" : "Documents"}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {files.map((r) => (
            <li key={r.id} className="flex flex-col gap-1.5">
              <a
                href={`/api/files/${r.fileId}`}
                target={r.mimeType.startsWith("image/") ? "_blank" : undefined}
                rel="noopener"
                className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[var(--radius-control)] border border-border bg-muted"
              >
                {r.mimeType.startsWith("image/") ? (
                  // Private, per-household files: not next/image.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/files/${r.fileId}`}
                    alt={r.originalName}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="flex flex-col items-center gap-1 p-2 text-center text-xs">
                    <FileText className="size-6" aria-hidden="true" />
                    {r.originalName}
                  </span>
                )}
              </a>
              {canEdit ? (
                <ConfirmAction
                  action={deletePhotoAction}
                  label="Remove"
                  srLabel={`${noun} ${r.originalName}`}
                  question={`Remove this ${noun}? This can't be undone.`}
                  confirmLabel="Yes, remove it"
                  size="xs"
                >
                  <input type="hidden" name="targetKind" value={target.kind} />
                  <input type="hidden" name="targetId" value={target.id} />
                  <input type="hidden" name="attachmentId" value={r.id} />
                </ConfirmAction>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? <PhotoUploader targetKind={target.kind} targetId={target.id} noun={noun} /> : null}
    </div>
  );
}
