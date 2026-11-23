"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { setTimeZoneAction } from "@/server/actions/records";

/**
 * Owners say where the household is, so "today" on the calendar is right.
 * While it's still the starting "UTC", this device's own zone is offered.
 */
export function TimeZoneForm({ zone, zones }: { zone: string; zones: string[] }) {
  const [state, action, pending] = useActionState(setTimeZoneAction, { status: "idle" });
  const [detected, setDetected] = useState<string | null>(null);
  const select = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (zone !== "UTC") return;
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (local && local !== "UTC" && zones.includes(local) && select.current) {
      select.current.value = local;
      // Shown only after the page has loaded, from this device's settings.
      setDetected(local);
    }
  }, [zone, zones]);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <SelectField
        ref={select}
        id="time-zone"
        name="timeZone"
        label="Time zone"
        hint={detected ? "Not saved yet: this is your device's time zone." : undefined}
        options={zones.map((z) => ({ value: z, label: z.replaceAll("_", " ") }))}
        defaultValue={zone}
        className="sm:max-w-xs sm:flex-1"
      />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <p role="status" className="text-sm text-muted-foreground sm:pb-2.5">
        {state.status === "saved" ? "Saved." : null}
        {state.status === "error" ? (
          <span className="text-destructive">{state.message}</span>
        ) : null}
      </p>
    </form>
  );
}
