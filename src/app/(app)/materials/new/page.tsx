import Link from "next/link";
import { notFound } from "next/navigation";

import { MaterialForm } from "@/components/materials/forms";
import { PageHeader } from "@/components/page-header";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getMaterialFormChoices } from "@/server/services/materials";

export const metadata = { title: "New material" };

export default async function NewMaterialPage({ searchParams }: PageProps<"/materials/new">) {
  const { projectId, roomId } = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx || !can(ctx, "records:edit")) notFound();
  const choices = await getMaterialFormChoices(ctx);
  // Only start from a project or room that's really in this household.
  const project = choices.projects.find((p) => p.value === projectId);
  const room = choices.rooms.find((r) => r.value === roomId);
  const back = project
    ? { href: `/projects/${project.value}`, label: project.label }
    : room
      ? { href: `/rooms/${room.value}`, label: room.label }
      : { href: "/materials", label: "Materials" };
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={back.href} className="text-sm text-muted-foreground hover:text-foreground">
          ← {back.label}
        </Link>
        <PageHeader
          title="New material"
          description="A product you're thinking about or buying. Photos, manuals and spec sheets can be added once it's saved."
        />
      </div>
      <MaterialForm
        start={{
          ...(project ? { projectId: project.value } : {}),
          ...(room ? { roomId: room.value } : {}),
        }}
        {...choices}
        cancelHref={back.href}
      />
    </div>
  );
}
