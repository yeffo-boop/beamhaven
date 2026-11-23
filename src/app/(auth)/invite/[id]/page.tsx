import Link from "next/link";
import { Suspense } from "react";

import { ExistingMemberForm, NewMemberForm } from "@/components/auth/join-forms";
import { getInvitationState } from "@/server/auth/invitations";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "Join a household" };

const roleLabels: Record<string, string> = {
  owner: "an owner",
  member: "a member",
  viewer: "a viewer",
};

export default function InvitePage({ params }: PageProps<"/invite/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Checking your invitation…</p>}>
      <Invitation params={params} />
    </Suspense>
  );
}

async function Invitation({ params }: Pick<PageProps<"/invite/[id]">, "params">) {
  const { id } = await params;
  const state = await getInvitationState(id);

  if (state.kind === "unusable") {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold tracking-tight">This link doesn&rsquo;t work</h1>
        <p className="text-sm text-muted-foreground">
          It may have been used already, cancelled, or expired. Ask the person who invited you for a
          new link.
        </p>
      </div>
    );
  }

  const { invitation, hasAccount } = state;
  const intro = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Join {invitation.workspaceName}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {invitation.inviterName} invited {invitation.email} to join as{" "}
        {roleLabels[invitation.role] ?? "a member"}.
      </p>
    </div>
  );

  if (!hasAccount) {
    return (
      <div className="flex flex-col gap-6">
        {intro}
        <NewMemberForm invitationId={invitation.id} email={invitation.email} />
      </div>
    );
  }

  const user = await getCurrentUser();
  return (
    <div className="flex flex-col gap-6">
      {intro}
      {user?.email === invitation.email ? (
        <ExistingMemberForm invitationId={invitation.id} />
      ) : (
        <p className="text-sm">
          {invitation.email} already has an account.{" "}
          <Link
            href={`/sign-in?next=${encodeURIComponent(`/invite/${invitation.id}`)}`}
            className="font-medium text-primary underline"
          >
            Sign in as {invitation.email}
          </Link>{" "}
          to accept.
        </p>
      )}
    </div>
  );
}
