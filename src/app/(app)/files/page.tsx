import Link from "next/link";

import { AddDocumentForm } from "@/components/documents/document-forms";
import { DocumentList, OtherFileList } from "@/components/documents/document-list";
import { inputClass } from "@/components/forms/field";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/records/panel";
import { Button } from "@/components/ui/button";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getRecordChoices, NO_CHOICES } from "@/server/services/choices";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS } from "@/server/services/document-inputs";
import { getDocumentLibrary, searchOtherFiles } from "@/server/services/documents";
import { getProjects } from "@/server/services/projects";

export const metadata = { title: "Files" };

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.slice(0, 200) : "";
}

export default async function FilesPage({ searchParams }: PageProps<"/files">) {
  const params = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const canEdit = can(ctx, "records:edit");
  const q = one(params.q).trim();
  const category = (DOCUMENT_CATEGORIES as readonly string[]).includes(one(params.category))
    ? one(params.category)
    : "";
  const projectId = one(params.project);
  const [documents, others, projects, choices] = await Promise.all([
    getDocumentLibrary(ctx, {
      ...(q ? { q } : {}),
      ...(category ? { category } : {}),
      ...(projectId ? { projectId } : {}),
    }),
    searchOtherFiles(ctx, q),
    getProjects(ctx),
    canEdit ? getRecordChoices(ctx) : NO_CHOICES,
  ]);
  const filtered = Boolean(q || category || projectId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Files"
        description="Plans, permits, contracts, manuals and other papers for the house, with every version kept."
      />
      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Search files">
        <label className="flex min-w-56 flex-1 flex-col gap-1.5 text-sm font-medium">
          Search
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Name, note or file name"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Category
          <select name="category" defaultValue={category} className={`${inputClass} min-w-40`}>
            <option value="">All categories</option>
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {DOCUMENT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Project
          <select name="project" defaultValue={projectId} className={`${inputClass} min-w-48`}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Show
        </Button>
        {filtered ? (
          <Button asChild variant="ghost">
            <Link href="/files">Clear</Link>
          </Button>
        ) : null}
      </form>

      <section
        aria-label="Library"
        className="rounded-[var(--radius-card)] border border-border bg-surface px-5 md:px-6"
      >
        <DocumentList
          documents={documents}
          empty={
            filtered
              ? "No documents match."
              : `No documents yet.${canEdit ? " Add the first one below." : ""}`
          }
        />
      </section>

      {q ? (
        <Panel title="On other records" id="other-files">
          <p className="text-sm text-muted-foreground">
            Receipts and documents attached to expenses, contractors, quotes and other records.
          </p>
          <OtherFileList files={others} />
        </Panel>
      ) : null}

      {canEdit ? (
        <Panel title="Add a document" id="add">
          <AddDocumentForm choices={choices} />
        </Panel>
      ) : null}
    </div>
  );
}
