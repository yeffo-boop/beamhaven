"use client";

import { useForm } from "@/components/budget/use-form";
import { SelectField, TextField } from "@/components/forms/field";
import { FormFooter } from "@/components/records/form-footer";
import { savePhotoDetailsAction } from "@/server/actions/records";

import { PHASE_OPTIONS } from "./phases";

/** Sets a photo's caption, phase and the day it was taken. */
export function PhotoDetailsForm({
  targetKind,
  targetId,
  photo,
}: {
  targetKind: string;
  targetId: string;
  photo: { id: string; caption: string; phase: string; takenOn: string };
}) {
  const f = useForm(savePhotoDetailsAction);
  const value = (name: "caption" | "phase" | "takenOn") => f.typed(name) ?? photo[name];
  const prefix = `photo-${photo.id}`;
  return (
    <form key={f.key} action={f.action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="targetKind" value={targetKind} />
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="attachmentId" value={photo.id} />
      <TextField
        id={`${prefix}-caption`}
        name="caption"
        label="Caption (optional)"
        defaultValue={value("caption")}
        error={f.error("caption")}
      />
      <SelectField
        id={`${prefix}-phase`}
        name="phase"
        label="Stage"
        options={PHASE_OPTIONS}
        defaultValue={value("phase")}
        error={f.error("phase")}
      />
      <TextField
        id={`${prefix}-taken`}
        name="takenOn"
        type="date"
        label="Taken on (optional)"
        defaultValue={value("takenOn")}
        error={f.error("takenOn")}
      />
      <FormFooter pending={f.pending} state={f.state} saveLabel="Save" />
    </form>
  );
}
