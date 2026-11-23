import { ExternalLink, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { WarrantyForm } from "@/components/contractors/forms";
import { WarrantyList } from "@/components/contractors/lists";
import { ProblemNotice } from "@/components/budget/problem-notice";
import { MaterialStatusForm } from "@/components/materials/forms";
import { OrderList } from "@/components/orders/list";
import { describeQuantity, MaterialStatusBadge } from "@/components/materials/labels";
import { PageHeader } from "@/components/page-header";
import { ActivityList } from "@/components/records/activity-list";
import { ConfirmAction } from "@/components/records/confirm-action";
import { FileList } from "@/components/records/file-list";
import { LocalTime } from "@/components/records/local-time";
import { orNotFound } from "@/components/records/or-not-found";
import { Detail, Panel } from "@/components/records/panel";
import { Button } from "@/components/ui/button";
import { deleteMaterialAction } from "@/server/actions/materials";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getActivity } from "@/server/services/activity";
import { getDocuments } from "@/server/services/attachments";
import { getRecordChoices, NO_CHOICES } from "@/server/services/choices";
import { getMaterial } from "@/server/services/materials";
import { getOrders } from "@/server/services/orders";
import { getWarranties } from "@/server/services/tasks";

export const metadata = { title: "Material" };

export default async function MaterialPage({ params, searchParams }: PageProps<"/materials/[id]">) {
  const { id } = await params;
  const { problem } = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const m = await orNotFound(getMaterial(ctx, id));
  const canEdit = can(ctx, "records:edit");
  const [files, warranties, activity, choices, orders] = await Promise.all([
    getDocuments(ctx, { kind: "material", id }),
    getWarranties(ctx, { materialId: id }),
    getActivity(ctx, "material", id),
    canEdit ? getRecordChoices(ctx) : Promise.resolve(NO_CHOICES),
    getOrders(ctx, { materialId: id }),
  ]);
  const back = m.projectId
    ? { href: `/projects/${m.projectId}`, label: m.projectName }
    : m.roomId
      ? { href: `/rooms/${m.roomId}`, label: m.roomName }
      : { href: "/materials", label: "Materials" };
  const dash = <span className="text-muted-foreground">Not set</span>;
  const amount = describeQuantity(m);
  const today = new Date();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={back.href} className="text-sm text-muted-foreground hover:text-foreground">
          ← {back.label}
        </Link>
        <PageHeader
          title={m.name}
          description={m.category ?? "Material"}
          actions={
            canEdit ? (
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link href={`/materials/${id}/edit`}>
                    <Pencil aria-hidden="true" />
                    Edit
                  </Link>
                </Button>
                <ConfirmAction
                  action={deleteMaterialAction}
                  label="Delete"
                  srLabel={`material ${m.name}`}
                  question="Delete this material, with its photos and documents? This can't be undone."
                  confirmLabel="Yes, delete it"
                >
                  <input type="hidden" name="id" value={id} />
                </ConfirmAction>
              </div>
            ) : null
          }
        />
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <MaterialStatusBadge status={m.status} />
          <span>
            since <LocalTime iso={m.statusChangedAt.toISOString()} />
          </span>
        </div>
      </div>

      <ProblemNotice code={problem} />

      <Panel title="Details" id="details">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Detail label="Project">
            {m.projectId ? (
              <Link href={`/projects/${m.projectId}`} className="text-primary hover:underline">
                {m.projectName}
              </Link>
            ) : (
              dash
            )}
          </Detail>
          <Detail label="Room">
            {m.roomId ? (
              <Link href={`/rooms/${m.roomId}`} className="text-primary hover:underline">
                {m.roomName}
              </Link>
            ) : (
              dash
            )}
          </Detail>
          <Detail label="Supplier">{m.supplierName ?? dash}</Detail>
          <Detail label="Brand">{m.brand ?? dash}</Detail>
          <Detail label="Model number">{m.modelNumber ?? dash}</Detail>
          <Detail label="SKU or item number">{m.sku ?? dash}</Detail>
          <Detail label="Color or finish">{m.colorFinish ?? dash}</Detail>
          <Detail label="How much">{amount ?? dash}</Detail>
          <Detail label="Product link">
            {m.productUrl ? (
              <a
                href={m.productUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 break-all text-primary hover:underline"
              >
                {new URL(m.productUrl).hostname}
                <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              dash
            )}
          </Detail>
        </dl>
        {m.specs ? (
          <div className="flex flex-col gap-1">
            <h3 className="text-xs text-muted-foreground">Specifications</h3>
            <p className="text-sm whitespace-pre-line">{m.specs}</p>
          </div>
        ) : null}
        {m.notes ? (
          <div className="flex flex-col gap-1">
            <h3 className="text-xs text-muted-foreground">Notes</h3>
            <p className="text-sm whitespace-pre-line">{m.notes}</p>
          </div>
        ) : null}
        {canEdit ? <MaterialStatusForm id={id} status={m.status} /> : null}
      </Panel>

      <Panel
        title="Orders"
        id="orders"
        actions={
          canEdit && m.projectId ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/projects/${m.projectId}/orders/new?materialId=${id}`}>Order it</Link>
            </Button>
          ) : null
        }
      >
        <OrderList
          orders={orders}
          showProject
          empty={
            m.projectId || !canEdit
              ? "Not on an order yet."
              : "Not on an order yet. Choose its project (Edit) to order it from there."
          }
        />
      </Panel>

      <Panel title="Photos, manuals and spec sheets" id="files">
        <FileList
          files={files}
          target={{ kind: "material", id }}
          noun="document"
          canEdit={canEdit}
        />
      </Panel>

      <Panel title="Warranties" id="warranties">
        <WarrantyList warranties={warranties} today={today} show={["contractor"]} />
        {canEdit ? (
          <details className="rounded-[var(--radius-control)] border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Add a warranty</summary>
            <div className="mt-3">
              <WarrantyForm
                fixed={{ materialId: id }}
                contractors={choices.contractors}
                projects={choices.projects}
                rooms={choices.rooms}
              />
            </div>
          </details>
        ) : null}
      </Panel>

      <Panel title="Activity" id="activity">
        <ActivityList items={activity} />
      </Panel>
    </div>
  );
}
