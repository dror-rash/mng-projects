import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppFrame } from "@/features/layout/app-frame";
import { recordWorkspace } from "@/features/layout/record-workspace";
import { deletePartnerAction } from "@/features/partners/actions";
import { AssignCustomerForm, UnassignCustomerForm } from "@/features/partners/assign-customer-form";
import { getPartnerForUser } from "@/features/partners/queries";
import { requireWorkspace } from "@/features/workspaces/require-workspace";

export const dynamic = "force-dynamic";

/** A partner company: its customers (admins assign them) and its users. Admins and auditors only. */
export default async function PartnerPage({ params }: { params: Promise<{ partnerId: string }> }) {
  const { partnerId } = await params;
  const { session, workspace } = await requireWorkspace(`/partners/${partnerId}`);
  const partner = await getPartnerForUser(session.user.id, partnerId);
  if (!partner) {
    notFound();
  }

  return (
    <AppFrame email={session.user.email} name={session.user.name} role={workspace.role} {...await recordWorkspace(session.user.id, workspace, partner.workspaceId)} className="max-w-3xl space-y-6 p-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/partners" className="hover:underline">Partners</Link>
      </nav>
      <h1 className="text-2xl font-bold tracking-tight">{partner.name}</h1>

      <section aria-labelledby="customers-heading">
        <Card>
          <CardHeader>
            <CardTitle id="customers-heading" className="text-base">Customers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {partner.customers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No customers assigned yet.</p>
            ) : (
              <ul className="divide-y">
                {partner.customers.map((customer) => (
                  <li key={customer.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0">
                    <Link href={`/customers/${customer.id}`} className="font-medium hover:underline">
                      {customer.label}
                    </Link>
                    {partner.canChange && <UnassignCustomerForm partnerId={partner.id} customer={customer} />}
                  </li>
                ))}
              </ul>
            )}
            {partner.canChange &&
              (partner.assignable.length > 0 ? (
                <AssignCustomerForm partnerId={partner.id} customers={partner.assignable} />
              ) : (
                <p className="text-sm text-muted-foreground">No more customers to assign.</p>
              ))}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="users-heading">
        <Card>
          <CardHeader>
            <CardTitle id="users-heading" className="text-base">Users</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {partner.users.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users yet.</p>
            ) : (
              <ul className="divide-y">
                {partner.users.map((user) => (
                  <li key={user.userId} className="py-2 text-sm first:pt-0">
                    <div className="font-medium">{user.name}</div>
                    <div className="text-muted-foreground">{user.email}</div>
                  </li>
                ))}
              </ul>
            )}
            {partner.canChange && (
              <p className="text-sm text-muted-foreground">
                Invite people as users of {partner.name} from the{" "}
                <Link href="/workspace" className="underline">members page</Link>.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {partner.canChange && (
        <section aria-labelledby="delete-heading" className="space-y-2">
          <h2 id="delete-heading" className="text-base font-semibold">Delete partner</h2>
          <p className="text-sm text-muted-foreground">
            Its users lose access to this workspace and its invite links stop working. Its projects are kept for
            admins and auditors. You can restore it from Deleted.
          </p>
          <form action={deletePartnerAction}>
            <input type="hidden" name="partnerId" value={partner.id} />
            <Button type="submit" variant="destructive">Delete partner</Button>
          </form>
        </section>
      )}
    </AppFrame>
  );
}
