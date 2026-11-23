import { getWorkspaceContext } from "@/server/auth/workspace";
import { getWorkspace, listMembers } from "@/server/data/workspaces";

const roleLabels: Record<string, string> = { owner: "Owner", member: "Member", viewer: "Viewer" };

/** The current household's name and the people in it. Read-only for now. */
export async function HouseholdMembers() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const [household, members] = await Promise.all([getWorkspace(ctx), listMembers(ctx)]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="font-medium">{household.name}</div>
        <div className="text-sm text-muted-foreground">Your role: {roleLabels[ctx.role]}</div>
      </div>
      <ul aria-label="People in this household" className="divide-y divide-border">
        {members.map((member) => (
          <li key={member.userId} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{member.name}</div>
              <div className="truncate text-xs text-muted-foreground">{member.email}</div>
            </div>
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
              {roleLabels[member.role] ?? member.role}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
