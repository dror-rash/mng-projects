import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import Link from "next/link";

import { AppFrame } from "@/features/layout/app-frame";
import { switchWorkspaceAction } from "@/features/workspaces/actions";
import { NewWorkspaceForm } from "@/features/workspaces/new-workspace-form";
import { memberCounts } from "@/features/workspaces/member-counts";
import { listMemberships } from "@/features/workspaces/queries";
import { requireWorkspace } from "@/features/workspaces/require-workspace";
import { workspaceDetails } from "@/features/workspaces/workspace-label";

export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  const { session, workspace } = await requireWorkspace("/workspaces");
  const memberships = await listMemberships(session.user.id);
  const counts = await memberCounts(session.user.id, memberships.map((m) => m.workspaceId));

  return (
    <AppFrame email={session.user.email} name={session.user.name} role={workspace.role} workspaceName={workspace.name} className="max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold tracking-tight">Workspaces</h1>

      <section aria-labelledby="your-workspaces-heading">
        <Card>
          <CardHeader>
            <CardTitle id="your-workspaces-heading" className="text-base">Your workspaces</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {memberships.map((m) => {
                const isCurrent = m.workspaceId === workspace.id;
                const detailsId = `workspace-details-${m.workspaceId}`;
                return (
                  <li key={m.workspaceId} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{m.name}</span>
                      <span id={detailsId} className="text-muted-foreground">
                        {workspaceDetails({ role: m.role, memberCount: counts.get(m.workspaceId) ?? 1 })}
                      </span>
                      {isCurrent && <Badge>Current</Badge>}
                    </div>
                    {isCurrent ? (
                      <div className="flex flex-wrap gap-1">
                        <Button asChild variant="ghost" size="sm">
                          <Link href="/workspace">Members and invites</Link>
                        </Button>
                        {m.role === "admin" && (
                          <Button asChild variant="ghost" size="sm">
                            <Link href="/workspace/settings">Settings</Link>
                          </Button>
                        )}
                      </div>
                    ) : (
                      <form action={switchWorkspaceAction}>
                        <input type="hidden" name="workspaceId" value={m.workspaceId} />
                        <Button type="submit" variant="outline" size="sm" aria-describedby={detailsId}>
                          Switch<span className="sr-only"> to {m.name}</span>
                        </Button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="new-workspace-heading">
        <Card>
          <CardHeader>
            <CardTitle id="new-workspace-heading" className="text-base">New workspace</CardTitle>
          </CardHeader>
          <CardContent>
            <NewWorkspaceForm />
          </CardContent>
        </Card>
      </section>
    </AppFrame>
  );
}
