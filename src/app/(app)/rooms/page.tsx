import { Plus } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { FirstProperty } from "@/components/records/first-property";
import { EmptyState } from "@/components/records/panel";
import { roomTypeLabel } from "@/components/records/room-labels";
import { Button } from "@/components/ui/button";
import { estimateRoomAreas, formatArea, formatLength } from "@/lib/units";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getMeasurementPreference } from "@/server/services/preferences";
import { getProperties } from "@/server/services/properties";
import { getRooms } from "@/server/services/rooms";

export const metadata = { title: "Rooms" };

export default async function RoomsPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const canEdit = can(ctx, "records:edit");
  const [properties, rooms, system] = await Promise.all([
    getProperties(ctx),
    getRooms(ctx),
    getMeasurementPreference(ctx),
  ]);
  const showProperty = properties.length > 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Rooms"
        description="Rooms and areas, with their sizes, photos and the projects that touch them."
        actions={
          canEdit && properties.length > 0 ? (
            <Button asChild>
              <Link href="/rooms/new">
                <Plus aria-hidden="true" />
                Add room
              </Link>
            </Button>
          ) : null
        }
      />
      {properties.length === 0 ? (
        <FirstProperty canEdit={canEdit} returnTo="/rooms" />
      ) : rooms.length === 0 ? (
        <EmptyState>No rooms yet. {canEdit ? "Add the first one." : null}</EmptyState>
      ) : (
        <ul aria-label="Rooms" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => {
            const { floorMm2 } = estimateRoomAreas(room, room.openings);
            const size =
              room.lengthMm && room.widthMm
                ? `${formatLength(room.lengthMm, system)} × ${formatLength(room.widthMm, system)}`
                : null;
            return (
              <li key={room.id}>
                <Link
                  href={`/rooms/${room.id}`}
                  className="flex h-full flex-col gap-1.5 rounded-[var(--radius-card)] border border-border bg-surface p-4 transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="font-medium">{room.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {[
                      roomTypeLabel(room.type),
                      room.floorLevel,
                      showProperty ? room.propertyName : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {size ? (
                    <span className="font-mono text-sm tabular-nums">
                      {size}
                      {floorMm2 ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · ≈ {formatArea(floorMm2, system)}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
