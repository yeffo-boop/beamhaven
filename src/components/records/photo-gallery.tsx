import { deletePhotoAction } from "@/server/actions/records";
import type { AttachmentSummary } from "@/server/data/files";

import { ConfirmAction } from "./confirm-action";
import { EmptyState } from "./panel";
import { PhotoUploader } from "./photo-uploader";

/**
 * A record's photos. Each image is served by /api/files/<id>, which checks
 * the viewer belongs to this household before sending a single byte.
 */
export function PhotoGallery({
  photos,
  targetKind,
  targetId,
  canEdit,
}: {
  photos: AttachmentSummary[];
  targetKind: "property" | "project" | "room";
  targetId: string;
  canEdit: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {photos.length === 0 ? (
        <EmptyState>No photos yet.</EmptyState>
      ) : (
        <ul aria-label="Photos" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => (
            <li key={photo.id} className="flex flex-col gap-1.5">
              <a
                href={`/api/files/${photo.fileId}`}
                target="_blank"
                rel="noopener"
                className="block aspect-[4/3] overflow-hidden rounded-[var(--radius-control)] border border-border bg-muted"
              >
                {/* Not next/image: these are private, per-household files, not public assets. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/files/${photo.fileId}`}
                  alt={photo.caption ?? photo.originalName}
                  loading="lazy"
                  className="size-full object-cover"
                />
              </a>
              {canEdit ? (
                <ConfirmAction
                  action={deletePhotoAction}
                  label="Remove"
                  srLabel={`photo ${photo.originalName}`}
                  question="Remove this photo? This can't be undone."
                  confirmLabel="Yes, remove it"
                  size="xs"
                >
                  <input type="hidden" name="targetKind" value={targetKind} />
                  <input type="hidden" name="targetId" value={targetId} />
                  <input type="hidden" name="attachmentId" value={photo.id} />
                </ConfirmAction>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? <PhotoUploader targetKind={targetKind} targetId={targetId} /> : null}
    </div>
  );
}
