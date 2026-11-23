import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import {
  getMeasurementPreference,
  getTimeZonePreference,
  timeZoneChoices,
} from "@/server/services/preferences";
import { getProperties } from "@/server/services/properties";

import { MeasurementForm } from "./measurement-form";
import { PropertyForm } from "./property-form";
import { TimeZoneForm } from "./time-zone-form";

/** Settings → Properties and measurements. Must sit inside <Suspense>. */
export async function PropertiesSettings() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const [properties, system, zone] = await Promise.all([
    getProperties(ctx),
    getMeasurementPreference(ctx),
    getTimeZonePreference(ctx),
  ]);
  const canEdit = can(ctx, "records:edit");
  return (
    <div className="flex flex-col gap-5">
      {properties.length > 0 ? (
        <ul aria-label="Properties" className="divide-y divide-border">
          {properties.map((property) => (
            <li key={property.id}>
              <Link
                href={`/properties/${property.id}`}
                className="flex items-center gap-3 py-2.5 hover:text-primary"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{property.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[property.addressLine1, property.city].filter(Boolean).join(", ") ||
                      "No address yet"}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No properties yet.</p>
      )}
      {canEdit ? (
        <details className="rounded-[var(--radius-control)] border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">Add a property</summary>
          <div className="mt-3">
            <PropertyForm returnTo="/settings" saveLabel="Add property" />
          </div>
        </details>
      ) : null}
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Measurements</h3>
        {can(ctx, "workspace:manage") ? (
          <MeasurementForm system={system} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Shown in {system === "metric" ? "metric" : "feet and inches"}. Owners can change this.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Time zone</h3>
        {can(ctx, "workspace:manage") ? (
          <TimeZoneForm zone={zone} zones={timeZoneChoices()} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {zone.replaceAll("_", " ")}, for “today” on the calendar. Owners can change this.
          </p>
        )}
      </div>
    </div>
  );
}
