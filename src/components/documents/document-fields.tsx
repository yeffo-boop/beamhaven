"use client";

import { SelectField, TextAreaField, TextField } from "@/components/forms/field";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS } from "@/server/services/document-inputs";

type Choice = { value: string; label: string };

export type DocumentValues = {
  title: string;
  category: string;
  projectId: string;
  roomId: string;
  contractorId: string;
  notes: string;
};

export type DocumentChoices = { projects: Choice[]; rooms: Choice[]; contractors: Choice[] };

const CATEGORY_OPTIONS = DOCUMENT_CATEGORIES.map((c) => ({
  value: c,
  label: DOCUMENT_CATEGORY_LABELS[c],
}));

/** The fields a document has, shared by the add and edit forms. */
export function DocumentFields({
  idPrefix,
  values,
  errors,
  choices,
  fixedProjectId,
}: {
  idPrefix: string;
  values: Partial<DocumentValues>;
  errors: Record<string, string | undefined>;
  choices: DocumentChoices;
  fixedProjectId?: string;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${idPrefix}-title`}
          name="title"
          label="Name"
          placeholder="Kitchen floor plan"
          defaultValue={values.title ?? ""}
          error={errors["title"]}
        />
        <SelectField
          id={`${idPrefix}-category`}
          name="category"
          label="Category"
          options={CATEGORY_OPTIONS}
          defaultValue={values.category || "other"}
          error={errors["category"]}
        />
        {fixedProjectId ? (
          <input type="hidden" name="projectId" value={fixedProjectId} />
        ) : (
          <SelectField
            id={`${idPrefix}-project`}
            name="projectId"
            label="Project (optional)"
            options={[{ value: "", label: "No project" }, ...choices.projects]}
            defaultValue={values.projectId ?? ""}
            error={errors["projectId"]}
          />
        )}
        <SelectField
          id={`${idPrefix}-room`}
          name="roomId"
          label="Room (optional)"
          options={[{ value: "", label: "No particular room" }, ...choices.rooms]}
          defaultValue={values.roomId ?? ""}
          error={errors["roomId"]}
        />
        <SelectField
          id={`${idPrefix}-contractor`}
          name="contractorId"
          label="From (optional)"
          options={[{ value: "", label: "No contractor" }, ...choices.contractors]}
          defaultValue={values.contractorId ?? ""}
          error={errors["contractorId"]}
        />
      </div>
      <TextAreaField
        id={`${idPrefix}-notes`}
        name="notes"
        label="Notes (optional)"
        defaultValue={values.notes ?? ""}
        error={errors["notes"]}
      />
    </>
  );
}
