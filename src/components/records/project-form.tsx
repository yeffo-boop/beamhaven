"use client";

import { useActionState } from "react";

import { SelectField, TextAreaField, TextField } from "@/components/forms/field";
import { dayInputValue } from "@/lib/dates";
import { saveProjectAction } from "@/server/actions/records";
import type { ProjectSummary } from "@/server/data/projects";

import { FormFooter } from "./form-footer";
import { statusOptions } from "./status-badge";

/** Creates a project, or edits one when `project` is given. */
export function ProjectForm({
  project,
  properties,
}: {
  project?: ProjectSummary;
  properties: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(saveProjectAction, { status: "idle" });
  const error = (name: string) => state.fields?.[name];
  const typed = (name: string) => state.values?.[name];
  const onlyProperty = properties.length === 1 ? properties[0] : undefined;
  return (
    <form key={state.attempt} action={action} className="flex flex-col gap-4" noValidate>
      {project ? <input type="hidden" name="id" value={project.id} /> : null}
      {project ? (
        <input type="hidden" name="propertyId" value={project.propertyId} />
      ) : onlyProperty ? (
        <input type="hidden" name="propertyId" value={onlyProperty.id} />
      ) : (
        <SelectField
          id="project-property"
          name="propertyId"
          defaultValue={typed("propertyId")}
          label="Property"
          options={properties.map((p) => ({ value: p.id, label: p.name }))}
          error={error("propertyId")}
          className="sm:max-w-md"
        />
      )}
      <TextField
        id="project-name"
        name="name"
        label="Project name"
        hint="For example “Kitchen remodel” or “New deck”."
        defaultValue={typed("name") ?? project?.name ?? ""}
        required
        error={error("name")}
        className="sm:max-w-md"
      />
      <SelectField
        id="project-status"
        name="status"
        label="Status"
        options={statusOptions}
        defaultValue={typed("status") ?? project?.status ?? "planning"}
        error={error("status")}
        className="sm:max-w-xs"
      />
      <TextAreaField
        id="project-description"
        name="description"
        label="Description (optional)"
        hint="What you want to do and why."
        defaultValue={typed("description") ?? project?.description ?? ""}
        error={error("description")}
      />
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Dates (optional)</legend>
        <TextField
          id="project-planned-start"
          name="plannedStart"
          type="date"
          label="Planned start"
          defaultValue={typed("plannedStart") ?? dayInputValue(project?.plannedStart ?? null)}
          error={error("plannedStart")}
        />
        <TextField
          id="project-planned-end"
          name="plannedEnd"
          type="date"
          label="Planned finish"
          defaultValue={typed("plannedEnd") ?? dayInputValue(project?.plannedEnd ?? null)}
          error={error("plannedEnd")}
        />
        <TextField
          id="project-actual-start"
          name="actualStart"
          type="date"
          label="Actually started"
          defaultValue={typed("actualStart") ?? dayInputValue(project?.actualStart ?? null)}
          error={error("actualStart")}
        />
        <TextField
          id="project-actual-end"
          name="actualEnd"
          type="date"
          label="Actually finished"
          defaultValue={typed("actualEnd") ?? dayInputValue(project?.actualEnd ?? null)}
          error={error("actualEnd")}
        />
      </fieldset>
      <FormFooter
        pending={pending}
        state={state}
        saveLabel={project ? "Save changes" : "Create project"}
        cancelHref={project ? `/projects/${project.id}` : "/projects"}
      />
    </form>
  );
}
