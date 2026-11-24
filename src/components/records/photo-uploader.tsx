"use client";

import { ImagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { inputClass } from "@/components/forms/field";
import { PHASE_OPTIONS } from "@/components/photos/phases";
import { Button } from "@/components/ui/button";
import type { AttachmentTarget } from "@/server/data/files";

/**
 * Picks one or more photos and uploads them to the record. On an iPad or
 * phone this offers the camera as well as the photo library.
 */
export function PhotoUploader({
  targetKind,
  targetId,
  noun = "photo",
  phases = false,
}: {
  targetKind: AttachmentTarget["kind"];
  targetId: string;
  /** Receipts and documents also accept PDFs. */
  noun?: "photo" | "receipt" | "document";
  /** Progress photos: ask whether they're before, during or after the work. */
  phases?: boolean;
}) {
  const acceptsPdf = noun !== "photo";
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState("");
  const [status, setStatus] = useState<{ busy: boolean; message?: string; error?: boolean }>({
    busy: false,
  });

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setStatus({
      busy: true,
      message: `Uploading ${files.length === 1 ? noun : `${files.length} ${noun}s`}…`,
    });
    const form = new FormData();
    form.set("targetKind", targetKind);
    form.set("targetId", targetId);
    if (phases && phase) form.set("phase", phase);
    for (const file of Array.from(files).slice(0, 10)) form.append("file", file);
    try {
      const response = await fetch("/api/uploads", { method: "POST", body: form });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setStatus({ busy: false, error: true, message: body.error ?? "The upload didn't work." });
      } else {
        setStatus({ busy: false, message: "Uploaded." });
      }
    } catch {
      setStatus({
        busy: false,
        error: true,
        message: "The upload didn't work. Check your connection.",
      });
    }
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {phases ? (
        <div className="flex items-center gap-2">
          <label htmlFor={`${inputId}-phase`} className="text-sm font-medium">
            Stage for new photos
          </label>
          <select
            id={`${inputId}-phase`}
            value={phase}
            onChange={(event) => setPhase(event.target.value)}
            className={`${inputClass} h-9 w-auto`}
          >
            {PHASE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <input
        ref={input}
        id={inputId}
        type="file"
        accept={`image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif${acceptsPdf ? ",application/pdf" : ""}`}
        multiple
        className="sr-only"
        onChange={(event) => void upload(event.target.files)}
        disabled={status.busy}
      />
      <Button asChild variant="outline" size="sm">
        <label
          htmlFor={inputId}
          className={status.busy ? "pointer-events-none opacity-50" : "cursor-pointer"}
        >
          <ImagePlus aria-hidden="true" />
          {noun === "receipt" ? "Add receipt" : noun === "document" ? "Add document" : "Add photos"}
        </label>
      </Button>
      <p
        role="status"
        className={status.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
      >
        {status.message}
      </p>
    </div>
  );
}
