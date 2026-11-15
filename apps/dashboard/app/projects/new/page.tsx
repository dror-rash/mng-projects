import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { notFound } from "next/navigation";

import { canChange, canSeeCustomers } from "@/features/access/scope";
import { AppFrame } from "@/features/layout/app-frame";
import { firstParam, withParams } from "@/features/navigation/search-params";
import { listCustomerNames } from "@/features/organizations/customer-names";
import { listPartners } from "@/features/partners/queries";
import { initialCustomerAndSite, newProjectCancelHref } from "@/features/projects/initial-customer-site";
import { ProjectForm } from "@/features/projects/project-form";
import { INTERNAL_OWNER } from "@/features/projects/project-owner";
import { stageLabels } from "@/features/projects/stage-labels";
import { canSeeSiteById } from "@/features/sites/queries";
import { listSiteChoices } from "@/features/sites/site-choices";
import { requireWorkspace } from "@/features/workspaces/require-workspace";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewProjectPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const requested = { customer: firstParam(params.customer), site: firstParam(params.site) };
  const { session, workspace } = await requireWorkspace(withParams("/projects/new", requested));
  if (!canChange(workspace.role)) {
    notFound();
  }
  // A partner's users create their own partner's projects, for its customers; admins choose the owner.
  const partnerId = workspace.role === "partner" ? workspace.partnerId : null;
  const [customers, sites, partners, stages] = await Promise.all([
    listCustomerNames(session.user.id, workspace.id, partnerId),
    listSiteChoices(session.user.id, workspace.id, partnerId),
    workspace.role === "admin" ? listPartners(session.user.id, workspace.id) : null,
    stageLabels(),
  ]);
  // No Owner select before the workspace has partners: the project is internal.
  const owners = partners?.length
    ? [{ value: INTERNAL_OWNER, label: "Internal" }, ...partners.map((p) => ({ value: p.id, label: p.name }))]
    : undefined;
  // Started from a site's page (task 072) or a customer's: choose them and go back there on Cancel. Ids
  // that aren't among my choices are ignored.
  const start = initialCustomerAndSite(requested, customers, sites);
  const cancelHref = newProjectCancelHref(start, {
    // A partner may start a project at a site of theirs without a project there yet, so can't open it.
    canSeeSite: start.siteId ? await canSeeSiteById(session.user.id, start.siteId) : false,
    canSeeCustomers: canSeeCustomers(workspace.role),
  });

  return (
    <AppFrame email={session.user.email} name={session.user.name} role={workspace.role} workspaceName={workspace.name} className="max-w-3xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>New project</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectForm
            workspaceId={workspace.id}
            customers={customers}
            sites={sites}
            defaultCustomerId={start.customerId}
            defaultSiteId={start.siteId}
            cancelHref={cancelHref}
            owners={owners}
            customerRequired={partnerId !== null}
            canAddSite={workspace.role === "admin"}
            stages={stages.options}
          />
        </CardContent>
      </Card>
    </AppFrame>
  );
}
