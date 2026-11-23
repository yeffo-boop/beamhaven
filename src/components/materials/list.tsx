import Link from "next/link";

import { EmptyState } from "@/components/records/panel";
import type { MaterialRecord } from "@/server/data/materials";

import { describeQuantity, MaterialStatusBadge, productLine } from "./labels";

/** Materials as a list of links, used on the materials, project and room pages. */
export function MaterialList({
  materials,
  empty,
  show = "both",
}: {
  materials: MaterialRecord[];
  empty: string;
  /** What to name besides the product: the project and room, or just one. */
  show?: "both" | "project" | "room" | "none";
}) {
  if (materials.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <ul aria-label="Materials" className="divide-y divide-border">
      {materials.map((m) => {
        const where = [
          show === "both" || show === "project" ? m.projectName : null,
          show === "both" || show === "room" ? m.roomName : null,
        ].filter(Boolean);
        const product = productLine(m);
        const amount = describeQuantity(m);
        return (
          <li key={m.id} className="flex flex-col gap-1 py-3">
            <div className="flex items-start justify-between gap-3">
              <Link
                href={`/materials/${m.id}`}
                className="min-w-0 font-medium break-words hover:underline"
              >
                {m.name}
              </Link>
              <MaterialStatusBadge status={m.status} />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {m.category ? <span>{m.category}</span> : null}
              {product ? <span className="break-words">{product}</span> : null}
              {m.supplierName ? <span>From {m.supplierName}</span> : null}
              {where.length > 0 ? <span>{where.join(" · ")}</span> : null}
            </div>
            {amount ? <span className="text-sm tabular-nums">{amount}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
