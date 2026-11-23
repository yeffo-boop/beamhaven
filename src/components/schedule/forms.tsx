"use client";

import { DateField } from "@/components/budget/today-input";
import { useForm } from "@/components/budget/use-form";
import { SelectField, TextAreaField, TextField } from "@/components/forms/field";
import { FormFooter } from "@/components/records/form-footer";
import { addDependencyAction, saveMilestoneAction } from "@/server/actions/schedule";

export type MilestoneValues = { id: string; name: string; targetDate: string; notes: string };

/** Adds a milestone to a project, or changes one. */
export function MilestoneForm({
  projectId,
  milestone,
}: {
  projectId?: string;
  milestone?: MilestoneValues;
}) {
  const f = useForm(saveMilestoneAction);
  const value = (name: keyof MilestoneValues) => f.typed(name) ?? milestone?.[name] ?? "";
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      {milestone ? <input type="hidden" name="id" value={milestone.id} /> : null}
      {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="milestone-name"
          name="name"
          label="Milestone"
          placeholder="Cabinets in"
          defaultValue={value("name")}
          error={f.error("name")}
        />
        <DateField
          id="milestone-target"
          name="targetDate"
          label="Target date (optional)"
          defaultValue={value("targetDate")}
          error={f.error("targetDate")}
        />
      </div>
      <TextAreaField
        id="milestone-notes"
        name="notes"
        label="Notes (optional)"
        defaultValue={value("notes")}
        error={f.error("notes")}
      />
      <FormFooter
        pending={f.pending}
        state={f.state}
        saveLabel={milestone ? "Save changes" : "Add milestone"}
      />
    </form>
  );
}

/** Makes a task wait on another one. */
export function DependencyForm({
  taskId,
  choices,
}: {
  taskId: string;
  choices: { value: string; label: string }[];
}) {
  const f = useForm(addDependencyAction);
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="taskId" value={taskId} />
      <SelectField
        id="dependency-task"
        name="dependsOnId"
        label="Waits on"
        options={[{ value: "", label: "Choose a task" }, ...choices]}
        defaultValue={f.typed("dependsOnId") ?? ""}
        error={f.error("dependsOnId")}
      />
      <FormFooter pending={f.pending} state={f.state} saveLabel="Add" />
    </form>
  );
}
