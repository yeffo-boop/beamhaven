"use client";

import { useActionState } from "react";

import { SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import type { MeasurementSystem } from "@/lib/units";
import { setMeasurementSystemAction } from "@/server/actions/records";

/** Owners choose how the household sees and types measurements. */
export function MeasurementForm({ system }: { system: MeasurementSystem }) {
  const [state, action, pending] = useActionState(setMeasurementSystemAction, { status: "idle" });
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <SelectField
        id="measurement-system"
        name="measurementSystem"
        label="Show and type measurements in"
        options={[
          { value: "imperial", label: "Feet and inches" },
          { value: "metric", label: "Metric (m, cm, mm)" },
        ]}
        defaultValue={system}
        className="sm:max-w-xs sm:flex-1"
      />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <p role="status" className="text-sm text-muted-foreground sm:pb-2.5">
        {state.status === "saved" ? "Saved. Existing measurements are kept exactly." : null}
        {state.status === "error" ? (
          <span className="text-destructive">{state.message}</span>
        ) : null}
      </p>
    </form>
  );
}
