import { Badge } from "@repo/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";

import { roleChoiceLabel } from "@/features/access/roles";
import { AppFrame } from "@/features/layout/app-frame";
import { listPartners } from "@/features/partners/queries";
import { InviteForm } from "@/features/workspaces/invite-form";
import { inviteState } from "@/features/workspaces/invite-token";
import { LeaveForm } from "@/features/workspaces/leave-form";
import { ChangeRoleForm, RemoveMemberForm, RevokeInviteForm } from "@/features/workspaces/member-forms";
import { listMembers, listOpenInvites } from "@/features/workspaces/members";
import { requireWorkspace } from "@/features/workspaces/require-workspace";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export default async function WorkspacePage() {
  const { session, workspace } = await requireWorkspace("/workspace");
  const isAdmin = workspace.role === "admin";
  const [members, invites, partnerRows] = await Promise.all([
    listMembers(session.user.id, workspace.id),
    isAdmin ? listOpenInvites(session.user.id, workspace.id) : Promise.resolve([]),
    isAdmin ? listPartners(session.user.id, workspace.id) : Promise.resolve([]),
  ]);
  // Only what the role selects need (the role choices are "partner:<id>").
  const partners = partnerRows.map((p) => ({ id: p.id, name: p.name }));
  const now = new Date();

  return (
    <AppFrame email={session.user.email} name={session.user.name} role={workspace.role} workspaceName={workspace.name} className="max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold tracking-tight">{workspace.name}</h1>

      <section aria-labelledby="members-heading">
        <Card>
          <CardHeader>
            <CardTitle id="members-heading" className="text-base">Members</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {members.map((m) => {
                const isMe = m.userId === session.user.id;
                // Client forms get no email: it stays in this server-rendered list.
                const member = { userId: m.userId, name: m.name, role: m.role, partnerId: m.partnerId, partnerName: m.partnerName };
                return (
                  <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
                    <div className="text-sm">
                      <div className="font-medium">
                        {m.name}
                        {isMe && <span className="text-muted-foreground"> (you)</span>}
                      </div>
                      <div className="text-muted-foreground">{m.email}</div>
                    </div>
                    <div className="flex flex-wrap items-start gap-2">
                      <Badge>{roleChoiceLabel(m.role, m.partnerName)}</Badge>
                      {isAdmin && !isMe && (
                        <>
                          <ChangeRoleForm workspaceId={workspace.id} member={member} partners={partners} />
                          <RemoveMemberForm workspaceId={workspace.id} member={member} hasOpenInvites={invites.length > 0} />
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </section>

      {isAdmin && (
        <section aria-labelledby="invites-heading">
          <Card>
            <CardHeader>
              <CardTitle id="invites-heading" className="text-base">Invite links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <InviteForm workspaceId={workspace.id} partners={partners} />
              {invites.length > 0 && (
                <ul className="divide-y border-t">
                  {invites.map((invite) => {
                    const expired = inviteState({ ...invite, revokedAt: null }, now) === "expired";
                    return (
                      <li key={invite.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                        <span className="text-muted-foreground">
                          Created {DATE.format(invite.createdAt)} ·{" "}
                          {expired ? "expired" : `expires ${DATE.format(invite.expiresAt)}`} ·{" "}
                          {roleChoiceLabel(invite.role, invite.partnerName)}
                        </span>
                        <RevokeInviteForm workspaceId={workspace.id} inviteId={invite.id} created={DATE.format(invite.createdAt)} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      <LeaveForm workspaceId={workspace.id} />
    </AppFrame>
  );
}
