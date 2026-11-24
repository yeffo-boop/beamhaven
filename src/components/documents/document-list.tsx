import { FileText, ImageIcon } from "lucide-react";
import Link from "next/link";

import { LocalTime } from "@/components/records/local-time";
import { EmptyState } from "@/components/records/panel";
import type { DocumentSummary, OtherFile } from "@/server/data/documents";
import { categoryLabel } from "@/server/services/document-inputs";

/** "2.4 MB", "830 KB": file sizes as people say them. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function KindIcon({ mimeType }: { mimeType: string }) {
  const Icon = mimeType.startsWith("image/") ? ImageIcon : FileText;
  return <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

/** Library documents as links, used on the Files and project pages. */
export function DocumentList({
  documents,
  empty,
  showProject = true,
}: {
  documents: DocumentSummary[];
  empty: string;
  showProject?: boolean;
}) {
  if (documents.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <ul aria-label="Documents" className="divide-y divide-border">
      {documents.map((d) => {
        const where = [showProject ? d.projectName : null, d.roomName, d.contractorName].filter(
          Boolean,
        );
        return (
          <li key={d.id} className="flex items-start gap-3 py-3">
            <KindIcon mimeType={d.current?.mimeType ?? ""} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={`/files/${d.id}`}
                  className="min-w-0 font-medium break-words hover:underline"
                >
                  {d.title}
                </Link>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs">
                  {categoryLabel(d.category)}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {d.versionCount > 1 ? <span>Version {d.current?.number}</span> : null}
                <span>
                  Updated <LocalTime iso={d.updatedAt.toISOString()} />
                </span>
                {where.length > 0 ? <span>{where.join(" · ")}</span> : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Search matches among receipts and documents kept on other records. */
export function OtherFileList({ files }: { files: OtherFile[] }) {
  if (files.length === 0) return <EmptyState>No matching files on other records.</EmptyState>;
  return (
    <ul aria-label="Files on other records" className="divide-y divide-border">
      {files.map((f) => (
        <li key={`${f.fileId}-${f.href}`} className="flex items-start gap-3 py-3">
          <KindIcon mimeType={f.mimeType} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <a
              href={`/api/files/${f.fileId}`}
              target={f.mimeType.startsWith("image/") ? "_blank" : undefined}
              rel="noopener"
              className="min-w-0 font-medium break-words hover:underline"
            >
              {f.caption ?? f.originalName}
            </a>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span>
                {f.place}:{" "}
                <Link href={f.href} className="hover:underline">
                  {f.placeName}
                </Link>
              </span>
              {f.caption ? <span className="break-words">{f.originalName}</span> : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
