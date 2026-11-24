"use client";

import { useRouter } from "next/navigation";
import { useId, useRef } from "react";

import { useForm } from "@/components/budget/use-form";
import { TextField } from "@/components/forms/field";
import { FormFooter } from "@/components/records/form-footer";
import { UploadFooter, useUpload } from "@/components/forms/use-upload";
import { saveDocumentAction } from "@/server/actions/documents";

import { type DocumentChoices, DocumentFields, type DocumentValues } from "./document-fields";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,application/pdf";

function FileField({ error }: { error: string | undefined }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        File (a PDF or a photo)
      </label>
      <input
        id={id}
        name="file"
        type="file"
        accept={ACCEPT}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="text-sm file:mr-3 file:rounded-[var(--radius-control)] file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm"
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Adds a document to the library. On a project page, it stays there. */
export function AddDocumentForm({
  choices,
  fixedProjectId,
}: {
  choices: DocumentChoices;
  fixedProjectId?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const { state, submit } = useUpload("/api/documents", "documentId", (id) => {
    if (fixedProjectId) {
      formRef.current?.reset();
      router.refresh();
    } else {
      router.push(`/files/${id}`);
    }
  });
  return (
    <form
      ref={formRef}
      key={state.attempt}
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget);
      }}
    >
      <DocumentFields
        idPrefix="new-document"
        values={state.values}
        errors={state.fields}
        choices={choices}
        {...(fixedProjectId ? { fixedProjectId } : {})}
      />
      <FileField error={state.fields["file"]} />
      <UploadFooter state={state} label="Add document" />
    </form>
  );
}

/** Uploads a new version of a document; the earlier ones are kept. */
export function NewVersionForm({ documentId }: { documentId: string }) {
  const router = useRouter();
  const { state, submit } = useUpload("/api/documents", "documentId", () => router.refresh());
  return (
    <form
      key={state.attempt}
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget);
      }}
    >
      <input type="hidden" name="documentId" value={documentId} />
      <FileField error={state.fields["file"]} />
      <TextField
        id="version-note"
        name="note"
        label="What changed (optional)"
        placeholder="Revised after the inspector's comments"
        defaultValue={state.values["note"] ?? ""}
        error={state.fields["note"]}
      />
      <UploadFooter state={state} label="Upload new version" />
    </form>
  );
}

/** Changes a document's name, category, links and notes. */
export function EditDocumentForm({
  id,
  values,
  choices,
}: {
  id: string;
  values: DocumentValues;
  choices: DocumentChoices;
}) {
  const f = useForm(saveDocumentAction);
  const typed = (name: keyof DocumentValues) => f.typed(name) ?? values[name];
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={id} />
      <DocumentFields
        idPrefix="edit-document"
        values={{
          title: typed("title"),
          category: typed("category"),
          projectId: typed("projectId"),
          roomId: typed("roomId"),
          contractorId: typed("contractorId"),
          notes: typed("notes"),
        }}
        errors={{
          title: f.error("title"),
          category: f.error("category"),
          projectId: f.error("projectId"),
          roomId: f.error("roomId"),
          contractorId: f.error("contractorId"),
          notes: f.error("notes"),
        }}
        choices={choices}
      />
      <FormFooter pending={f.pending} state={f.state} saveLabel="Save changes" />
    </form>
  );
}
