import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import Link from "next/link";
import { notFound } from "next/navigation";

import { canChangeCustomers, canSeePartners } from "@/features/access/scope";
import { AppFrame } from "@/features/layout/app-frame";
import { listPartners } from "@/features/partners/queries";
import { requireWorkspace } from "@/features/workspaces/require-workspace";

export const dynamic = "force-dynamic";

function count(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** The current workspace's partner companies (admins and auditors; partners get a not-found page). */
export default async function PartnersPage() {
  const { session, workspace } = await requireWorkspace("/partners");
  if (!canSeePartners(workspace.role)) {
    notFound();
  }
  const partners = await listPartners(session.user.id, workspace.id);

  return (
    <AppFrame email={session.user.email} name={session.user.name} role={workspace.role} workspaceName={workspace.name} className="max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Partners</h1>
        {/* Partners are changed by whoever changes customers: admins. */}
        {canChangeCustomers(workspace.role) && (
          <Button asChild>
            <Link href="/partners/new">New partner</Link>
          </Button>
        )}
      </div>

      {partners.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-muted-foreground">
          No partners yet. Partner companies work on their own projects for the customers you assign them.
        </Card>
      ) : (
        <Table>
          <TableCaption className="sr-only">Partners</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Partner</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Customers</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {partners.map((partner) => (
              <TableRow key={partner.id}>
                <TableHead scope="row">
                  <Link href={`/partners/${partner.id}`} className="hover:underline">
                    {partner.name}
                  </Link>
                </TableHead>
                <TableCell>{count(partner.userCount, "user", "users")}</TableCell>
                <TableCell>{count(partner.customerCount, "customer", "customers")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </AppFrame>
  );
}
