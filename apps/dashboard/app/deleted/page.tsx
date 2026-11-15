import { Card } from "@repo/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { notFound } from "next/navigation";

import { canRestore, canSeeDeleted } from "@/features/access/scope";
import { deletedKindLabel } from "@/features/deleted/deleted-kind";
import { listDeleted } from "@/features/deleted/queries";
import { RestoreForm } from "@/features/deleted/restore-form";
import { AppFrame } from "@/features/layout/app-frame";
import { requireWorkspace } from "@/features/workspaces/require-workspace";

export const dynamic = "force-dynamic";

const STAMP = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

/**
 * The current workspace's deleted items (design rule 8): admins and auditors see them, admins restore them;
 * partners get a not-found page.
 */
export default async function DeletedPage() {
  const { session, workspace } = await requireWorkspace("/deleted");
  if (!canSeeDeleted(workspace.role)) {
    notFound();
  }
  const items = await listDeleted(session.user.id, workspace.id);
  const restore = canRestore(workspace.role);

  return (
    <AppFrame email={session.user.email} name={session.user.name} role={workspace.role} workspaceName={workspace.name} className="max-w-5xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Deleted items</h1>
        <p className="text-sm text-muted-foreground">
          Deleted items are hidden everywhere else. A deleted project hides its tasks, a deleted customer its contacts, notes and sites, and a deleted site its contacts, until it is restored.
        </p>
      </div>

      {items.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-muted-foreground">Nothing has been deleted.</Card>
      ) : (
        <Table>
          <TableCaption className="sr-only">Deleted items</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>In</TableHead>
              <TableHead>Deleted</TableHead>
              {restore && <TableHead><span className="sr-only">Restore</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={`${item.kind}:${item.id}`}>
                <TableHead scope="row" className="font-medium">{item.name}</TableHead>
                <TableCell>{deletedKindLabel(item.kind)}</TableCell>
                <TableCell className="text-muted-foreground">{item.where ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  <time dateTime={item.deletedAt.toISOString()}>{STAMP.format(item.deletedAt)} UTC</time>
                  {item.deletedByName && <span> · by {item.deletedByName}</span>}
                </TableCell>
                {restore && (
                  <TableCell className="text-right">
                    <RestoreForm kind={item.kind} id={item.id} name={item.name} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </AppFrame>
  );
}
