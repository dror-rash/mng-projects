import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { notFound } from "next/navigation";

import { canChangeCustomers } from "@/features/access/scope";
import { AppFrame } from "@/features/layout/app-frame";
import { PartnerForm } from "@/features/partners/partner-form";
import { requireWorkspace } from "@/features/workspaces/require-workspace";

export const dynamic = "force-dynamic";

export default async function NewPartnerPage() {
  const { session, workspace } = await requireWorkspace("/partners/new");
  // Admins only, like customers.
  if (!canChangeCustomers(workspace.role)) {
    notFound();
  }

  return (
    <AppFrame email={session.user.email} name={session.user.name} role={workspace.role} workspaceName={workspace.name} className="max-w-3xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>New partner</CardTitle>
        </CardHeader>
        <CardContent>
          <PartnerForm workspaceId={workspace.id} />
        </CardContent>
      </Card>
    </AppFrame>
  );
}
