import { FileText } from "lucide-react";

import { ConfirmAction } from "@/components/records/confirm-action";
import { EmptyState } from "@/components/records/panel";
import { PhotoUploader } from "@/components/records/photo-uploader";
import { deletePhotoAction } from "@/server/actions/records";
import type { AttachmentSummary } from "@/server/data/files";

/**
 * An expense's receipts. Photos show as pictures; PDFs are download links
 * (the server always sends them as downloads, never inside the page).
 */
export function ReceiptList({
  receipts,
  expenseId,
  canEdit,
}: {
  receipts: AttachmentSummary[];
  expenseId: string;
  canEdit: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {receipts.length === 0 ? (
        <EmptyState>No receipt yet.</EmptyState>
      ) : (
        <ul aria-label="Receipts" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {receipts.map((r) => (
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
                  srLabel={`receipt ${r.originalName}`}
                  question="Remove this receipt? This can't be undone."
                  confirmLabel="Yes, remove it"
                  size="xs"
                >
                  <input type="hidden" name="targetKind" value="expense" />
                  <input type="hidden" name="targetId" value={expenseId} />
                  <input type="hidden" name="attachmentId" value={r.id} />
                </ConfirmAction>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? <PhotoUploader targetKind="expense" targetId={expenseId} receipts /> : null}
    </div>
  );
}
