import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ContractList, QuoteList } from "@/components/agreements/lists";
import { CommitmentList, ExpenseList } from "@/components/budget/history";
import { ProblemNotice } from "@/components/budget/problem-notice";
import { CommunicationForm, LinkProjectForm, WarrantyForm } from "@/components/contractors/forms";
import {
  CommunicationList,
  ContractorStatusBadge,
  ExpiryNote,
  TaskList,
  WarrantyList,
} from "@/components/contractors/lists";
import { PageHeader } from "@/components/page-header";
import { ActivityList } from "@/components/records/activity-list";
import { ConfirmAction } from "@/components/records/confirm-action";
import { FileList } from "@/components/records/file-list";
import { orNotFound } from "@/components/records/or-not-found";
import { Detail, EmptyState, Panel } from "@/components/records/panel";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/dates";
import { deleteContractorAction, unlinkProjectAction } from "@/server/actions/contractors";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getActivity } from "@/server/services/activity";
import { getContracts, getQuotes } from "@/server/services/agreements";
import { getDocuments } from "@/server/services/attachments";
import { getRecordChoices, NO_CHOICES } from "@/server/services/choices";
import { getCommunications, getContractor } from "@/server/services/contractors";
import { getVendorMoney } from "@/server/services/expenses";
import { getTasks, getWarranties } from "@/server/services/tasks";

export const metadata = { title: "Contractor" };

export default async function ContractorPage({
  params,
  searchParams,
}: PageProps<"/contractors/[id]">) {
  const { id } = await params;
  const { problem } = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const c = await orNotFound(getContractor(ctx, id));
  const canEdit = can(ctx, "records:edit");
  const [quotes, contracts, log, warranties, tasks, documents, money, activity, choices] =
    await Promise.all([
      getQuotes(ctx, { contractorId: id }),
      getContracts(ctx, { contractorId: id }),
      getCommunications(ctx, { contractorId: id }),
      getWarranties(ctx, { contractorId: id }),
      getTasks(ctx, { assigneeContractorId: id }),
      getDocuments(ctx, { kind: "contractor", id }),
      getVendorMoney(ctx, c.vendorId),
      getActivity(ctx, "contractor", id),
      canEdit ? getRecordChoices(ctx) : Promise.resolve(NO_CHOICES),
    ]);
  const today = new Date();
  const linked = new Set(c.projects.map((p) => p.projectId));
  const unlinkedProjects = choices.projects.filter((p) => !linked.has(p.value));
  const dash = <span className="text-muted-foreground">Not set</span>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/contractors" className="text-sm text-muted-foreground hover:text-foreground">
          ← Contractors
        </Link>
        <PageHeader
          title={c.name}
          description={c.trade ?? undefined}
          actions={
            canEdit ? (
              <>
                <Button asChild variant="outline">
                  <Link href={`/contractors/${id}/edit`}>
                    <Pencil aria-hidden="true" />
                    Edit
                  </Link>
                </Button>
                <ConfirmAction
                  action={deleteContractorAction}
                  label="Delete"
                  srLabel={`contractor ${c.name}`}
                  question={`Delete ${c.name}, their log and documents? Bills in the budget stay. This can't be undone.`}
                  confirmLabel="Yes, delete"
                >
                  <input type="hidden" name="id" value={id} />
                </ConfirmAction>
              </>
            ) : null
          }
        />
        <div className="flex flex-wrap items-center gap-3">
          <ContractorStatusBadge status={c.status} />
          <ExpiryNote what="License" date={c.licenseExpiresOn} today={today} />
          <ExpiryNote what="Insurance" date={c.insuranceExpiresOn} today={today} />
        </div>
      </div>
      <ProblemNotice code={problem} />

      <Panel title="Details" id="details">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Contact">{c.contactName ?? dash}</Detail>
          <Detail label="Phone">
            {c.phone ? (
              <a href={`tel:${c.phone}`} className="text-primary hover:underline">
                {c.phone}
              </a>
            ) : (
              dash
            )}
          </Detail>
          <Detail label="Email">
            {c.email ? (
              <a href={`mailto:${c.email}`} className="break-all text-primary hover:underline">
                {c.email}
              </a>
            ) : (
              dash
            )}
          </Detail>
          <Detail label="Website">
            {c.website ? (
              <a
                href={c.website}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-primary hover:underline"
              >
                {c.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            ) : (
              dash
            )}
          </Detail>
          <Detail label="Address">{c.address ?? dash}</Detail>
          <Detail label="License">
            {c.licenseNumber ? [c.licenseNumber, c.licenseState].filter(Boolean).join(", ") : dash}
            {c.licenseExpiresOn ? (
              <span className="block text-xs text-muted-foreground">
                Expires {formatDay(c.licenseExpiresOn)}
              </span>
            ) : null}
          </Detail>
          <Detail label="Insurance">
            {c.insuranceProvider ?? (c.insuranceExpiresOn ? "Insured" : dash)}
            {c.insuranceExpiresOn ? (
              <span className="block text-xs text-muted-foreground">
                Expires {formatDay(c.insuranceExpiresOn)}
              </span>
            ) : null}
          </Detail>
        </dl>
        {c.notes ? <p className="text-sm whitespace-pre-line">{c.notes}</p> : null}
      </Panel>

      <Panel title="Projects" id="projects">
        {c.projects.length === 0 ? (
          <EmptyState>Not on any project yet.</EmptyState>
        ) : (
          <ul aria-label="Projects" className="divide-y divide-border">
            {c.projects.map((p) => (
              <li
                key={p.projectId}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm"
              >
                <span>
                  <Link href={`/projects/${p.projectId}`} className="font-medium hover:underline">
                    {p.projectName}
                  </Link>
                  {p.role ? <span className="text-muted-foreground"> · {p.role}</span> : null}
                </span>
                {canEdit ? (
                  <ConfirmAction
                    action={unlinkProjectAction}
                    label="Remove"
                    srLabel={`${c.name} from ${p.projectName}`}
                    question={`Take ${c.name} off ${p.projectName}?`}
                    confirmLabel="Yes, take them off"
                    size="xs"
                  >
                    <input type="hidden" name="contractorId" value={id} />
                    <input type="hidden" name="projectId" value={p.projectId} />
                  </ConfirmAction>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canEdit && unlinkedProjects.length > 0 ? (
          <details className="rounded-[var(--radius-control)] border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Add to a project</summary>
            <div className="mt-3">
              <LinkProjectForm contractorId={id} projects={unlinkedProjects} />
            </div>
          </details>
        ) : null}
      </Panel>

      <Panel
        title="Quotes and contracts"
        id="agreements"
        actions={
          canEdit ? (
            <>
              <Button asChild size="sm">
                <Link href={`/quotes/new?contractor=${id}`}>Add a quote</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/contracts/new?contractor=${id}`}>Add a contract</Link>
              </Button>
            </>
          ) : null
        }
      >
        <h3 className="text-sm font-semibold">Quotes</h3>
        <QuoteList quotes={quotes} show="project" />
        <h3 className="text-sm font-semibold">Contracts</h3>
        <ContractList contracts={contracts} show="project" />
      </Panel>

      <Panel title="Communication log" id="log">
        {canEdit ? (
          <details className="rounded-[var(--radius-control)] border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Log a call, email or visit
            </summary>
            <div className="mt-3">
              <CommunicationForm
                contractorId={id}
                projects={choices.projects.filter((p) => linked.has(p.value))}
              />
            </div>
          </details>
        ) : null}
        <CommunicationList entries={log} canEdit={canEdit} />
      </Panel>

      <Panel title="Agreed and billed" id="money">
        <p className="text-sm text-muted-foreground">
          Everything in the budget that names {c.name}: approved quotes, contracts, change orders,
          other commitments and bills.
        </p>
        <CommitmentList commitments={money.commitments} showLine />
        <ExpenseList expenses={money.expenses} label={`Bills from ${c.name}`} />
      </Panel>

      <Panel title="Tasks" id="tasks">
        <TaskList tasks={tasks} canEdit={canEdit} today={today} show={["project", "room"]} />
      </Panel>

      <Panel title="Warranties" id="warranties">
        <WarrantyList warranties={warranties} today={today} show={["project", "room"]} />
        {canEdit ? (
          <details className="rounded-[var(--radius-control)] border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Add a warranty</summary>
            <div className="mt-3">
              <WarrantyForm
                fixed={{ contractorId: id }}
                contractors={choices.contractors}
                projects={choices.projects}
                rooms={choices.rooms}
              />
            </div>
          </details>
        ) : null}
      </Panel>

      <Panel title="Documents" id="documents">
        <p className="text-sm text-muted-foreground">
          License, insurance certificate, W-9 and the like: photos or PDFs.
        </p>
        <FileList
          files={documents}
          target={{ kind: "contractor", id }}
          noun="document"
          canEdit={canEdit}
        />
      </Panel>

      <Panel title="Activity" id="activity">
        <ActivityList items={activity} />
      </Panel>
    </div>
  );
}
