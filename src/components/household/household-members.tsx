import { CopyLink } from "@/components/forms/copy-link";
import { InlineNameForm } from "@/components/forms/inline-name-form";
import { Button } from "@/components/ui/button";
import { renameHouseholdAction } from "@/server/actions/account";
import {
  cancelInvitationAction,
  changeRoleAction,
  removeMemberAction,
} from "@/server/actions/household";
import { invitationLink } from "@/server/auth/invitations";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { listPendingInvitations } from "@/server/data/invitations";
import { getWorkspace, listMembers } from "@/server/data/workspaces";

import { InviteForm } from "./invite-form";
import { ResetLinkButton } from "./reset-link-button";

const roleLabels: Record<string, string> = { owner: "Owner", member: "Member", viewer: "Viewer" };

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/**
 * The current household: its people, and for owners, invitations and
 * password-reset links. Owner-only parts are hidden here AND refused by the
 * server actions, because hiding a button isn't security.
 */
export async function HouseholdMembers() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const isOwner = can(ctx, "members:manage");
  const [household, members, invitations] = await Promise.all([
    getWorkspace(ctx),
    listMembers(ctx),
    isOwner ? listPendingInvitations(ctx) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="font-medium">{household.name}</div>
        <div className="text-sm text-muted-foreground">Your role: {roleLabels[ctx.role]}</div>
      </div>
      {can(ctx, "workspace:manage") ? (
        <InlineNameForm
          id="household-name"
          label="Household name"
          defaultValue={household.name}
          action={renameHouseholdAction}
        />
      ) : null}

      <ul aria-label="People in this household" className="divide-y divide-border">
        {members.map((member) => (
          <li key={member.userId} className="flex flex-wrap items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{member.name}</div>
              <div className="truncate text-xs text-muted-foreground">{member.email}</div>
            </div>
            {isOwner && member.userId !== ctx.userId ? (
              <div className="flex flex-wrap items-center gap-1">
                <form action={changeRoleAction} className="flex items-center gap-1">
                  <input type="hidden" name="userId" value={member.userId} />
                  <label className="sr-only" htmlFor={`role-${member.userId}`}>
                    Role for {member.name}
                  </label>
                  <select
                    id={`role-${member.userId}`}
                    name="role"
                    defaultValue={member.role}
                    className="h-9 rounded-[var(--radius-control)] border border-input bg-surface px-2 text-sm"
                  >
                    <option value="owner">Owner</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <Button type="submit" variant="ghost" size="sm">
                    Update<span className="sr-only"> role for {member.name}</span>
                  </Button>
                </form>
                <ResetLinkButton userId={member.userId} name={member.name} />
                {/* A second click confirms, so nobody is removed by accident. */}
                <details className="group relative">
                  <summary className="flex h-9 cursor-pointer list-none items-center rounded-[var(--radius-control)] px-3 text-sm font-medium text-destructive hover:bg-destructive/10">
                    Remove<span className="sr-only"> {member.name}</span>
                  </summary>
                  <form
                    action={removeMemberAction}
                    className="absolute right-0 z-10 mt-1 w-56 rounded-[var(--radius-control)] border border-border bg-surface p-3 shadow-md"
                  >
                    <input type="hidden" name="userId" value={member.userId} />
                    <p className="mb-2 text-sm">
                      Remove {member.name} from this household? They can be invited again later.
                    </p>
                    <Button type="submit" variant="destructive" size="sm">
                      Yes, remove {member.name}
                    </Button>
                  </form>
                </details>
              </div>
            ) : (
              <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                {roleLabels[member.role] ?? member.role}
              </span>
            )}
          </li>
        ))}
      </ul>

      {isOwner ? (
        <>
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">Invite someone</h3>
            <InviteForm />
          </div>

          {invitations.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Waiting to join</h3>
              <ul aria-label="Pending invitations" className="divide-y divide-border">
                {invitations.map((invitation) => (
                  <li key={invitation.id} className="flex flex-col gap-2 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{invitation.email}</div>
                        <div className="text-xs text-muted-foreground">
                          {roleLabels[invitation.role] ?? invitation.role} · link expires{" "}
                          {dateFormat.format(invitation.expiresAt)}
                        </div>
                      </div>
                      <form action={cancelInvitationAction}>
                        <input type="hidden" name="invitationId" value={invitation.id} />
                        <Button type="submit" variant="destructive" size="sm">
                          Cancel
                          <span className="sr-only"> invitation for {invitation.email}</span>
                        </Button>
                      </form>
                    </div>
                    <CopyLink link={invitationLink(invitation.id)} label="Invitation link" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
