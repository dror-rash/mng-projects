import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { notFound } from "next/navigation";

import { canChangeCustomers } from "@/features/access/scope";
import { AppFrame } from "@/features/layout/app-frame";
import { firstParam } from "@/features/navigation/search-params";
import { CustomerForm } from "@/features/organizations/customer-form";
import { listParentChoices } from "@/features/organizations/queries";
import { requireWorkspace } from "@/features/workspaces/require-workspace";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewCustomerPage({ searchParams }: { searchParams: SearchParams }) {
  const parent = firstParam((await searchParams).parent);
  const { session, workspace } = await requireWorkspace(parent ? `/customers/new?parent=${encodeURIComponent(parent)}` : "/customers/new");
  if (!canChangeCustomers(workspace.role)) {
    notFound();
  }
  const parentChoices = await listParentChoices(session.user.id, workspace.id);
  // Only a parent the select offers is preselected; anything else starts as None.
  const defaultParentId = parentChoices.some((c) => c.id === parent) ? parent : undefined;

  return (
    <AppFrame email={session.user.email} name={session.user.name} role={workspace.role} workspaceName={workspace.name} className="max-w-3xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>{defaultParentId ? "New sub-company" : "New customer"}</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerForm workspaceId={workspace.id} parentChoices={parentChoices} defaultParentId={defaultParentId} />
        </CardContent>
      </Card>
    </AppFrame>
  );
}
