import { BeforeAfter, type ComparePhoto } from "@/components/photos/before-after";
import { PhotoDetailsForm } from "@/components/photos/photo-details-form";
import { dayInputValue, formatDay } from "@/lib/dates";
import { deletePhotoAction } from "@/server/actions/records";
import type { AttachmentSummary } from "@/server/data/files";
import { PHOTO_PHASE_LABELS, PHOTO_PHASES } from "@/server/services/photo-inputs";

import { ConfirmAction } from "./confirm-action";
import { EmptyState } from "./panel";
import { PhotoUploader } from "./photo-uploader";

type TargetKind = "property" | "project" | "room";

/** Oldest first, by the day taken when it's known, else when it was uploaded. */
function byWhenTaken(a: AttachmentSummary, b: AttachmentSummary): number {
  return (a.takenOn ?? a.createdAt).getTime() - (b.takenOn ?? b.createdAt).getTime();
}

function describe(photo: AttachmentSummary): string {
  const day = formatDay(photo.takenOn);
  if (photo.caption && day) return `${photo.caption} (${day})`;
  return photo.caption ?? day ?? photo.originalName;
}

function PhotoGrid({
  photos,
  label,
  targetKind,
  targetId,
  canEdit,
  progress,
}: {
  photos: AttachmentSummary[];
  label: string;
  targetKind: TargetKind;
  targetId: string;
  canEdit: boolean;
  progress: boolean;
}) {
  return (
    <ul aria-label={label} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((photo) => {
        const day = formatDay(photo.takenOn);
        return (
          <li key={photo.id} className="flex min-w-0 flex-col gap-1.5">
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
            {progress && (photo.caption || day) ? (
              <p className="text-xs break-words text-muted-foreground">
                {[photo.caption, day].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            {canEdit && progress ? (
              <details>
                <summary className="cursor-pointer text-xs font-medium">
                  Details<span className="sr-only"> of {describe(photo)}</span>
                </summary>
                <div className="mt-2">
                  <PhotoDetailsForm
                    targetKind={targetKind}
                    targetId={targetId}
                    photo={{
                      id: photo.id,
                      caption: photo.caption ?? "",
                      phase: photo.phase ?? "",
                      takenOn: dayInputValue(photo.takenOn),
                    }}
                  />
                </div>
              </details>
            ) : null}
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
        );
      })}
    </ul>
  );
}

/**
 * A record's photos. Each image is served by /api/files/<id>, which checks
 * the viewer belongs to this household before sending a single byte.
 *
 * With `progress` (projects and rooms), photos are grouped into before,
 * during and after the work, and a before and after comparison is shown
 * once there's one of each (Milestone 8, part 3).
 */
export function PhotoGallery({
  photos,
  targetKind,
  targetId,
  canEdit,
  progress = false,
}: {
  photos: AttachmentSummary[];
  targetKind: TargetKind;
  targetId: string;
  canEdit: boolean;
  progress?: boolean;
}) {
  const grid = (list: AttachmentSummary[], label: string) => (
    <PhotoGrid
      photos={list}
      label={label}
      targetKind={targetKind}
      targetId={targetId}
      canEdit={canEdit}
      progress={progress}
    />
  );
  const sorted = [...photos].sort(byWhenTaken);
  const groups = [
    ...PHOTO_PHASES.map((phase) => ({
      label: PHOTO_PHASE_LABELS[phase],
      photos: sorted.filter((p) => p.phase === phase),
    })),
    { label: "Not sorted", photos: sorted.filter((p) => p.phase === null) },
  ].filter((g) => g.photos.length > 0);
  const compare = (phase: string): ComparePhoto[] =>
    sorted
      .filter((p) => p.phase === phase)
      .map((p) => ({ id: p.id, fileId: p.fileId, label: describe(p) }));
  const before = compare("before");
  const after = compare("after");

  return (
    <div className="flex flex-col gap-5">
      {photos.length === 0 ? (
        <EmptyState>
          {progress
            ? "No photos yet. Take some before the work starts, so you can compare later."
            : "No photos yet."}
        </EmptyState>
      ) : !progress ? (
        grid(photos, "Photos")
      ) : (
        <>
          {before.length > 0 && after.length > 0 ? (
            <section aria-labelledby={`${targetId}-compare`} className="flex flex-col gap-3">
              <h3 id={`${targetId}-compare`} className="text-sm font-semibold">
                Before and after
              </h3>
              <BeforeAfter before={before} after={after} />
            </section>
          ) : null}
          {groups.map((g) => (
            <section key={g.label} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">
                {g.label}{" "}
                <span className="font-normal text-muted-foreground">({g.photos.length})</span>
              </h3>
              {grid(g.photos, `${g.label} photos`)}
            </section>
          ))}
        </>
      )}
      {canEdit ? (
        <PhotoUploader targetKind={targetKind} targetId={targetId} phases={progress} />
      ) : null}
    </div>
  );
}
