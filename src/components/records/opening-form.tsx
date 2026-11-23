"use client";

import { useActionState, useRef } from "react";

import { SelectField, TextField } from "@/components/forms/field";
import type { MeasurementSystem } from "@/lib/units";
import { addOpeningAction } from "@/server/actions/records";

import { FormFooter } from "./form-footer";

/** Adds a window, door or other opening to a room. */
export function OpeningForm({ roomId, system }: { roomId: string; system: MeasurementSystem }) {
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    async (previous: Parameters<typeof addOpeningAction>[0], formData: FormData) => {
      const result = await addOpeningAction(previous, formData);
      if (result.status === "saved") form.current?.reset();
      return result;
    },
    { status: "idle" },
  );
  const error = (name: string) => state.fields?.[name];
  const typed = (name: string) => state.values?.[name];
  const sample = system === "metric" ? "0.91 m" : `36"`;
  return (
    <form key={state.attempt} ref={form} action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="roomId" value={roomId} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SelectField
          id="opening-kind"
          name="kind"
          defaultValue={typed("kind")}
          label="Kind"
          options={[
            { value: "window", label: "Window" },
            { value: "door", label: "Door" },
            { value: "other", label: "Other" },
          ]}
          error={error("kind")}
        />
        <TextField
          id="opening-label"
          name="label"
          defaultValue={typed("label")}
          label="Label (optional)"
          placeholder="Over the sink"
          error={error("label")}
        />
        <TextField
          id="opening-width"
          name="width"
          defaultValue={typed("width")}
          label="Width"
          placeholder={sample}
          error={error("width")}
        />
        <TextField
          id="opening-height"
          name="height"
          defaultValue={typed("height")}
          label="Height"
          placeholder={system === "metric" ? "1.22 m" : `48"`}
          error={error("height")}
        />
        <TextField
          id="opening-sill"
          name="sillHeight"
          defaultValue={typed("sillHeight")}
          label="Sill height (optional)"
          placeholder={system === "metric" ? "0.9 m" : `36"`}
          error={error("sillHeight")}
        />
      </div>
      <FormFooter pending={pending} state={state} saveLabel="Add" />
    </form>
  );
}
