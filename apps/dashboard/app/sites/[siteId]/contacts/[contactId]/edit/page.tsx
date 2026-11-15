import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { notFound } from "next/navigation";

import { AppFrame } from "@/features/layout/app-frame";
import { recordWorkspace } from "@/features/layout/record-workspace";
import { ContactForm } from "@/features/organizations/contacts/contact-form";
import { getSiteContact, getSiteForUser } from "@/features/sites/queries";
import { requireWorkspace } from "@/features/workspaces/require-workspace";

export const dynamic = "force-dynamic";

export default async function EditSiteContactPage({ params }: { params: Promise<{ siteId: string; contactId: string }> }) {
  const { siteId, contactId } = await params;
  const { session, workspace } = await requireWorkspace(`/sites/${siteId}/contacts/${contactId}/edit`);
  const site = await getSiteForUser(session.user.id, siteId);
  const contact = site?.canChange ? await getSiteContact(session.user.id, site.id, contactId) : null;
  // Someone who can't change the site gets the same page as for a missing contact.
  if (!site || !contact) {
    notFound();
  }

  return (
    <AppFrame email={session.user.email} name={session.user.name} role={workspace.role} {...await recordWorkspace(session.user.id, workspace, site.workspaceId)} className="max-w-2xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Edit contact at {site.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <ContactForm owner={{ kind: "site", id: site.id }} contact={contact} />
        </CardContent>
      </Card>
    </AppFrame>
  );
}
