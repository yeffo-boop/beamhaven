"use client";

import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  ExternalLink,
  GripVertical,
  Package,
  Star,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import { ConfirmAction } from "@/components/records/confirm-action";
import { LocalTime } from "@/components/records/local-time";
import { EmptyState } from "@/components/records/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  deleteBoardItemAction,
  markBoardItemAction,
  moveBoardItemAction,
  reorderBoardItemsAction,
} from "@/server/actions/boards";
import type { BoardItemRecord } from "@/server/data/boards";
import { boardItemKindLabel } from "@/server/services/board-inputs";

import { EditBoardItemForm } from "./board-forms";

type Choice = { value: string; label: string };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The picture, the color, or a placeholder. Colors are checked as #rrggbb on the server. */
export function ItemVisual({
  item,
  className,
}: {
  item: Pick<BoardItemRecord, "fileId" | "colorHex" | "title" | "kind">;
  className?: string;
}) {
  if (item.fileId) {
    return (
      // Private, per-household files: not next/image.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/files/${item.fileId}`}
        alt={item.title}
        loading="lazy"
        className={cn("size-full object-cover", className)}
      />
    );
  }
  if (item.colorHex) {
    return (
      <div
        role="img"
        aria-label={`${item.title}, ${item.colorHex}`}
        className={cn("size-full", className)}
        style={{ backgroundColor: item.colorHex }}
      />
    );
  }
  return (
    <div
      className={cn("flex size-full items-center justify-center text-muted-foreground", className)}
    >
      <Package className="size-8" aria-hidden="true" />
    </div>
  );
}

function FlagButton({
  boardId,
  item,
  flag,
}: {
  boardId: string;
  item: BoardItemRecord;
  flag: "preferred" | "approved";
}) {
  const on = flag === "preferred" ? item.isPreferred : item.approvedAt !== null;
  const Icon = flag === "preferred" ? Star : BadgeCheck;
  const label =
    flag === "preferred"
      ? on
        ? "Not preferred"
        : "Prefer"
      : on
        ? "Take back approval"
        : "Approve";
  return (
    <form action={markBoardItemAction}>
      <input type="hidden" name="boardId" value={boardId} />
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="flag" value={flag} />
      <input type="hidden" name="on" value={on ? "0" : "1"} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        aria-pressed={on}
        aria-label={`${label}: ${item.title}`}
      >
        <Icon
          aria-hidden="true"
          className={cn(on && "text-primary", on && flag === "preferred" && "fill-current")}
        />
        {label}
      </Button>
    </form>
  );
}

function MoveButton({
  boardId,
  item,
  direction,
  disabled,
}: {
  boardId: string;
  item: BoardItemRecord;
  direction: "up" | "down";
  disabled: boolean;
}) {
  const Icon = direction === "up" ? ArrowUp : ArrowDown;
  return (
    <form action={moveBoardItemAction}>
      <input type="hidden" name="boardId" value={boardId} />
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="direction" value={direction} />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        disabled={disabled}
        aria-label={`Move ${item.title} ${direction === "up" ? "earlier" : "later"}`}
      >
        <Icon aria-hidden="true" />
      </Button>
    </form>
  );
}

/**
 * A board's items in their order. People who can edit drag an item by its
 * handle (mouse, pen or finger) or use the earlier and later buttons, which
 * also work from a keyboard and without JavaScript.
 */
export function BoardItems({
  boardId,
  items,
  canEdit,
  materials,
}: {
  boardId: string;
  items: BoardItemRecord[];
  canEdit: boolean;
  materials: Choice[];
}) {
  const serverOrder = items.map((i) => i.id).join(",");
  const [order, setOrder] = useState(() => items.map((i) => i.id));
  const [dragging, setDragging] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const startOrder = useRef<string[]>([]);

  // The server's order wins whenever it changes (an add, a remove, a save).
  // Adjusted while rendering, as React recommends, rather than in an effect.
  const [synced, setSynced] = useState(serverOrder);
  if (synced !== serverOrder) {
    setSynced(serverOrder);
    setOrder(serverOrder ? serverOrder.split(",") : []);
  }

  if (items.length === 0) {
    return (
      <EmptyState>
        Nothing on this board yet.{canEdit ? " Add a picture, product, color or finish below." : ""}
      </EmptyState>
    );
  }

  const byId = new Map(items.map((i) => [i.id, i]));
  const shown = order.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });

  function moveOver(clientX: number, clientY: number) {
    if (!dragging) return;
    const target = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-board-item]")?.dataset["boardItem"];
    if (!target || target === dragging) return;
    setOrder((current) => {
      const from = current.indexOf(dragging);
      const to = current.indexOf(target);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, dragging);
      return next;
    });
  }

  function drop() {
    const finalOrder = order;
    setDragging(null);
    if (finalOrder.join(",") === startOrder.current.join(",")) return;
    setMessage(null);
    startTransition(async () => {
      const result = await reorderBoardItemsAction(boardId, finalOrder);
      if (!result.ok) {
        setOrder(startOrder.current);
        setMessage(result.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="text-sm text-muted-foreground empty:hidden">
        {pending ? "Saving the new order…" : (message ?? "")}
      </p>
      <ol aria-label="Board items" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((item, index) => {
          const details = [item.brand, item.code].filter(Boolean).join(" · ");
          return (
            <li
              key={item.id}
              data-board-item={item.id}
              className={cn(
                "flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface",
                item.approvedAt && "border-primary ring-1 ring-primary",
                dragging === item.id && "opacity-60 shadow-lg",
              )}
            >
              <div className="relative aspect-[4/3] bg-muted">
                <ItemVisual item={item} />
                {canEdit ? (
                  <button
                    type="button"
                    aria-label={`Drag ${item.title} to reorder`}
                    title="Drag to reorder"
                    className="absolute top-2 left-2 flex size-9 cursor-grab touch-none items-center justify-center rounded-[var(--radius-control)] border border-border bg-surface/90 active:cursor-grabbing"
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      startOrder.current = order;
                      setDragging(item.id);
                    }}
                    onPointerMove={(event) => moveOver(event.clientX, event.clientY)}
                    onPointerUp={drop}
                    onPointerCancel={() => {
                      setDragging(null);
                      setOrder(startOrder.current);
                    }}
                  >
                    <GripVertical className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="rounded-full bg-muted px-2 py-0.5">
                    {boardItemKindLabel(item.kind)}
                  </span>
                  {item.isPreferred ? (
                    <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5">
                      <Star className="size-3 fill-current" aria-hidden="true" />
                      Preferred
                    </span>
                  ) : null}
                  {item.approvedAt ? (
                    <span className="flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-primary">
                      <BadgeCheck className="size-3" aria-hidden="true" />
                      Approved
                    </span>
                  ) : null}
                </div>
                <h3 className="font-medium break-words">{item.title}</h3>
                {details ? <p className="text-sm text-muted-foreground">{details}</p> : null}
                {item.colorHex && item.fileId ? (
                  <p className="flex items-center gap-2 text-sm">
                    <span
                      className="size-4 rounded-full border border-border"
                      style={{ backgroundColor: item.colorHex }}
                      aria-hidden="true"
                    />
                    {item.colorHex}
                  </p>
                ) : item.colorHex ? (
                  <p className="text-sm text-muted-foreground">{item.colorHex}</p>
                ) : null}
                {item.productUrl ? (
                  <a
                    href={item.productUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    {hostOf(item.productUrl)}
                    <ExternalLink className="size-3" aria-hidden="true" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                ) : null}
                {item.materialId && item.materialName ? (
                  <p className="text-sm">
                    Material:{" "}
                    <Link
                      href={`/materials/${item.materialId}`}
                      className="text-primary hover:underline"
                    >
                      {item.materialName}
                    </Link>
                  </p>
                ) : null}
                {item.notes ? (
                  <p className="text-sm break-words whitespace-pre-line">{item.notes}</p>
                ) : null}
                {item.approvedAt ? (
                  <p className="text-xs text-muted-foreground">
                    Approved{item.approvedByName ? ` by ${item.approvedByName}` : ""},{" "}
                    <LocalTime iso={item.approvedAt.toISOString()} />
                  </p>
                ) : null}
                {canEdit ? (
                  <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <FlagButton boardId={boardId} item={item} flag="preferred" />
                      <FlagButton boardId={boardId} item={item} flag="approved" />
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <MoveButton
                        boardId={boardId}
                        item={item}
                        direction="up"
                        disabled={index === 0}
                      />
                      <MoveButton
                        boardId={boardId}
                        item={item}
                        direction="down"
                        disabled={index === shown.length - 1}
                      />
                      <ConfirmAction
                        action={deleteBoardItemAction}
                        label="Remove"
                        srLabel={item.title}
                        question="Take this off the board?"
                        confirmLabel="Yes, remove it"
                        size="xs"
                      >
                        <input type="hidden" name="boardId" value={boardId} />
                        <input type="hidden" name="id" value={item.id} />
                      </ConfirmAction>
                    </div>
                    <details>
                      <summary className="cursor-pointer text-sm font-medium">
                        Edit<span className="sr-only"> {item.title}</span>
                      </summary>
                      <div className="mt-3">
                        <EditBoardItemForm
                          boardId={boardId}
                          item={{
                            id: item.id,
                            kind: item.kind,
                            title: item.title,
                            notes: item.notes ?? "",
                            colorHex: item.colorHex ?? "",
                            brand: item.brand ?? "",
                            code: item.code ?? "",
                            productUrl: item.productUrl ?? "",
                            materialId: item.materialId ?? "",
                          }}
                          materials={materials}
                        />
                      </div>
                    </details>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
