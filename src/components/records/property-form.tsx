"use client";

import { useActionState } from "react";

import { TextAreaField, TextField } from "@/components/forms/field";
import { savePropertyAction } from "@/server/actions/records";
import type { PropertySummary } from "@/server/data/properties";

import { FormFooter } from "./form-footer";

/** Adds a property, or edits one when `property` is given. */
export function PropertyForm({
  property,
  returnTo,
  saveLabel,
}: {
  property?: PropertySummary;
  returnTo?: string;
  saveLabel?: string;
}) {
  const [state, action, pending] = useActionState(savePropertyAction, { status: "idle" });
  const error = (name: string) => state.fields?.[name];
  const typed = (name: string) => state.values?.[name];
  const value = (name: keyof PropertySummary) => property?.[name] ?? "";
  return (
    <form key={state.attempt} action={action} className="flex flex-col gap-4" noValidate>
      {property ? <input type="hidden" name="id" value={property.id} /> : null}
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <TextField
        id="property-name"
        name="name"
        label="Name"
        hint="What you call it, like “Our house” or “Lake cabin”."
        defaultValue={typed("name") ?? value("name")}
        required
        error={error("name")}
        className="sm:max-w-md"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="property-address1"
          name="addressLine1"
          label="Street address"
          autoComplete="address-line1"
          defaultValue={typed("addressLine1") ?? value("addressLine1")}
          error={error("addressLine1")}
        />
        <TextField
          id="property-address2"
          name="addressLine2"
          label="Apartment, unit (optional)"
          autoComplete="address-line2"
          defaultValue={typed("addressLine2") ?? value("addressLine2")}
          error={error("addressLine2")}
        />
        <TextField
          id="property-city"
          name="city"
          label="City"
          autoComplete="address-level2"
          defaultValue={typed("city") ?? value("city")}
          error={error("city")}
        />
        <div className="grid grid-cols-2 gap-4">
          <TextField
            id="property-region"
            name="region"
            label="State"
            autoComplete="address-level1"
            defaultValue={typed("region") ?? value("region")}
            error={error("region")}
          />
          <TextField
            id="property-postal"
            name="postalCode"
            label="ZIP code"
            autoComplete="postal-code"
            defaultValue={typed("postalCode") ?? value("postalCode")}
            error={error("postalCode")}
          />
        </div>
      </div>
      <input type="hidden" name="country" value={property?.country ?? ""} />
      <TextAreaField
        id="property-notes"
        name="notes"
        label="Notes (optional)"
        defaultValue={typed("notes") ?? value("notes")}
        error={error("notes")}
      />
      <FormFooter pending={pending} state={state} saveLabel={saveLabel ?? "Save"} />
    </form>
  );
}
