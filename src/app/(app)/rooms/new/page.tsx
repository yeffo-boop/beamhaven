import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { RoomForm } from "@/components/records/room-form";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getMeasurementPreference } from "@/server/services/preferences";
import { getProperties } from "@/server/services/properties";

export const metadata = { title: "Add room" };

export default async function NewRoomPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const [properties, system] = await Promise.all([
    getProperties(ctx),
    getMeasurementPreference(ctx),
  ]);
  if (!can(ctx, "records:edit") || properties.length === 0) redirect("/rooms");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Add room" />
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 md:p-6">
        <RoomForm properties={properties} system={system} />
      </div>
    </div>
  );
}
