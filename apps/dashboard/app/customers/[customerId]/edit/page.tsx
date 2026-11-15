import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { notFound } from "next/navigation";

import { AppFrame } from "@/features/layout/app-frame";
import { recordWorkspace } from "@/features/layout/record-workspace";
import { CustomerForm } from "@/features/organizations/customer-form";
import { getOrganizationForUser, listParentChoices } from "@/features/organizations/queries";
import { requireWorkspace } from "@/features/workspaces/require-workspace";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const { session, workspace } = await requireWorkspace(`/customers/${customerId}/edit`);
  const customer = await getOrganizationForUser(session.user.id, customerId, "customer");
  // Someone who can't change it gets the same page as for a missing customer.
  if (!customer?.canChange) {
    notFound();
  }

  return (
    <AppFrame email={session.user.email} name={session.user.name} role={workspace.role} {...await recordWorkspace(session.user.id, workspace, customer.workspaceId)} className="max-w-3xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Edit customer</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerForm
            customer={customer}
            parentChoices={await listParentChoices(session.user.id, customer.workspaceId, customer.id)}
          />
        </CardContent>
      </Card>
    </AppFrame>
  );
}
