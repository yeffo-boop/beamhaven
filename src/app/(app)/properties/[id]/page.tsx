import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { ActivityList } from "@/components/records/activity-list";
import { orNotFound } from "@/components/records/or-not-found";
import { Panel } from "@/components/records/panel";
import { PhotoGallery } from "@/components/records/photo-gallery";
import { PropertyForm } from "@/components/records/property-form";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getActivity } from "@/server/services/activity";
import { getPhotos } from "@/server/services/attachments";
import { getProperty } from "@/server/services/properties";

export const metadata = { title: "Property" };

export default async function PropertyPage({ params }: PageProps<"/properties/[id]">) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const property = await orNotFound(getProperty(ctx, id));
  const canEdit = can(ctx, "records:edit");
  const [photos, activity] = await Promise.all([
    getPhotos(ctx, { kind: "property", id }),
    getActivity(ctx, "property", id),
  ]);
  const address = [
    property.addressLine1,
    property.addressLine2,
    [property.city, [property.region, property.postalCode].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", "),
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground">
          ← Settings
        </Link>
        <PageHeader title={property.name} description={address.join(" · ") || undefined} />
      </div>
      {canEdit ? (
        <Panel title="Details" id="details">
          <PropertyForm property={property} />
        </Panel>
      ) : property.notes ? (
        <Panel title="Notes" id="details">
          <p className="text-sm whitespace-pre-line">{property.notes}</p>
        </Panel>
      ) : null}
      <Panel title="Photos" id="photos">
        <PhotoGallery photos={photos} targetKind="property" targetId={id} canEdit={canEdit} />
      </Panel>
      <Panel title="Activity" id="activity">
        <ActivityList items={activity} />
      </Panel>
    </div>
  );
}
