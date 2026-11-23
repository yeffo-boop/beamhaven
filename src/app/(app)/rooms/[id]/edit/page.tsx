import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { orNotFound } from "@/components/records/or-not-found";
import { RoomForm } from "@/components/records/room-form";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getMeasurementPreference } from "@/server/services/preferences";
import { getRoom } from "@/server/services/rooms";

export const metadata = { title: "Edit room" };

export default async function EditRoomPage({ params }: PageProps<"/rooms/[id]/edit">) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const [room, system] = await Promise.all([
    orNotFound(getRoom(ctx, id)),
    getMeasurementPreference(ctx),
  ]);
  if (!can(ctx, "records:edit")) redirect(`/rooms/${id}`);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Edit ${room.name}`} />
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 md:p-6">
        <RoomForm room={room} properties={[]} system={system} />
      </div>
    </div>
  );
}
