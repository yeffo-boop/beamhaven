"use client";

import { useForm } from "@/components/budget/use-form";
import { SelectField, TextAreaField, TextField } from "@/components/forms/field";
import { FormFooter } from "@/components/records/form-footer";
import { savePunchItemAction } from "@/server/actions/punch-list";

type Choice = { value: string; label: string };

export type PunchValues = {
  id: string;
  title: string;
  notes: string;
  roomId: string;
  contractorId: string;
};

/** Adds a punch list item to a project, or edits one (ADR-047). */
export function PunchItemForm({
  projectId,
  item,
  rooms,
  contractors,
}: {
  projectId: string;
  item?: PunchValues;
  rooms: Choice[];
  contractors: Choice[];
}) {
  const f = useForm(savePunchItemAction);
  const value = (name: keyof PunchValues) => f.typed(name) ?? item?.[name] ?? "";
  const prefix = item ? `punch-${item.id}` : "punch-new";
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-4" noValidate>
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <input type="hidden" name="projectId" value={projectId} />
      <TextField
        id={`${prefix}-title`}
        name="title"
        label="What needs fixing"
        placeholder="Paint touch-up above the window"
        defaultValue={value("title")}
        error={f.error("title")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id={`${prefix}-room`}
          name="roomId"
          label="Room (optional)"
          options={[{ value: "", label: "No room" }, ...rooms]}
          defaultValue={value("roomId")}
          error={f.error("roomId")}
        />
        <SelectField
          id={`${prefix}-contractor`}
          name="contractorId"
          label="Who fixes it (optional)"
          options={[{ value: "", label: "Nobody yet" }, ...contractors]}
          defaultValue={value("contractorId")}
          error={f.error("contractorId")}
        />
      </div>
      <TextAreaField
        id={`${prefix}-notes`}
        name="notes"
        label="Notes (optional)"
        defaultValue={value("notes")}
        error={f.error("notes")}
      />
      <FormFooter
        pending={f.pending}
        state={f.state}
        saveLabel={item ? "Save changes" : "Add to punch list"}
      />
    </form>
  );
}
