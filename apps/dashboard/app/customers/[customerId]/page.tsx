import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppFrame } from "@/features/layout/app-frame";
import { recordWorkspace } from "@/features/layout/record-workspace";
import { ContactsSection } from "@/features/organizations/contacts/contacts-section";
import { listContacts } from "@/features/organizations/contacts/queries";
import { NotesSection } from "@/features/organizations/notes/notes-section";
import { listNotes } from "@/features/organizations/notes/queries";
import { organizationStatusLabel } from "@/features/organizations/organization-kinds";
import { getOrganizationForUser, listSubCompanies } from "@/features/organizations/queries";
import { SubCompaniesSection } from "@/features/organizations/sub-companies-section";
import { listCustomerSites } from "@/features/sites/queries";
import { SitesSection } from "@/features/sites/sites-section";
import { ProjectList } from "@/features/projects/project-list";
import { listCustomerProjects } from "@/features/projects/queries";
import { summarizeProjectStatusCounts } from "@/features/tasks/progress";
import { countTasksByProjectAndStatus, listCustomerOpenTasks } from "@/features/tasks/queries";
import { TASK_STATUSES } from "@/features/tasks/task-status";
import { requireWorkspace } from "@/features/workspaces/require-workspace";

export const dynamic = "force-dynamic";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

const missing = <span className="text-muted-foreground">—</span>;

export default async function CustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const { session, workspace } = await requireWorkspace(`/customers/${customerId}`);
  const customer = await getOrganizationForUser(session.user.id, customerId, "customer");
  if (!customer) {
    notFound();
  }
  // Starting a project for this customer: admins, like changing it (partners start their own with task 049).
  const canStartProjects = customer.canChange;
  const isTopLevel = customer.parentId === null;
  const [contacts, notes, projects, projectCounts, openTasks, subCompanies, sites] = await Promise.all([
    listContacts(session.user.id, customer.id),
    listNotes(session.user.id, customer.id),
    listCustomerProjects(session.user.id, customer.workspaceId, customer.id),
    countTasksByProjectAndStatus(session.user.id, customer.workspaceId),
    listCustomerOpenTasks(session.user.id, customer.workspaceId, customer.id),
    isTopLevel ? listSubCompanies(session.user.id, customer.workspaceId, customer.id) : Promise.resolve([]),
    listCustomerSites(session.user.id, customer.id),
  ]);

  return (
    <AppFrame email={session.user.email} name={session.user.name} role={workspace.role} {...await recordWorkspace(session.user.id, workspace, customer.workspaceId)} className="max-w-4xl space-y-6 p-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/customers" className="hover:underline">Customers</Link>
      </nav>

      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">{customer.name}</h1>
          {customer.parentId && customer.parentName && (
            <p className="text-sm text-muted-foreground">
              Part of{" "}
              <Link href={`/customers/${customer.parentId}`} className="font-medium text-foreground hover:underline">
                {customer.parentName}
              </Link>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{organizationStatusLabel(customer.status)}</Badge>
            {customer.tags.map((t) => (
              <Badge key={t} variant="outline">{t}</Badge>
            ))}
          </div>
        </div>
        {customer.canChange && (
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/customers/${customer.id}/edit`}>Edit customer</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/customers/${customer.id}/delete`}>Delete customer</Link>
            </Button>
          </div>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Email">
              {customer.email ? <a href={`mailto:${customer.email}`} className="hover:underline">{customer.email}</a> : missing}
            </Detail>
            <Detail label="Phone">
              {customer.phone ? <a href={`tel:${customer.phone.replace(/[^\d+]/g, "")}`} className="hover:underline">{customer.phone}</a> : missing}
            </Detail>
            <Detail label="Website">
              {customer.website ? (
                <a href={customer.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {customer.website}
                </a>
              ) : missing}
            </Detail>
            <Detail label="Company / tax ID">{customer.companyId ?? missing}</Detail>
            <Detail label="Address">
              {customer.address ? <span className="whitespace-pre-wrap">{customer.address}</span> : missing}
            </Detail>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">General information</CardTitle>
        </CardHeader>
        <CardContent>
          {customer.about ? (
            <p className="whitespace-pre-wrap text-sm">{customer.about}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {customer.canChange ? <>Nothing yet. Use &ldquo;Edit customer&rdquo; to add it.</> : "Nothing yet."}
            </p>
          )}
        </CardContent>
      </Card>

      {isTopLevel && <SubCompaniesSection parentId={customer.id} subCompanies={subCompanies} canAdd={customer.canChange} />}

      <SitesSection customerId={customer.id} sites={sites} canAdd={customer.canChange} />

      <section aria-labelledby="projects-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 id="projects-heading" className="text-base font-semibold">Projects</h2>
          {canStartProjects && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/projects/new?customer=${customer.id}`}>New project</Link>
            </Button>
          )}
        </div>
        {projects.length === 0 ? (
          <Card className="border-dashed p-6 text-center text-sm text-muted-foreground">
            {canStartProjects ? (
              <>No projects for this customer yet. Use &ldquo;New project&rdquo; to start one.</>
            ) : (
              "No projects for this customer yet."
            )}
          </Card>
        ) : (
          <ProjectList projects={projects} progress={summarizeProjectStatusCounts(projectCounts)} showCustomer={subCompanies.length > 0} />
        )}
      </section>

      <section aria-labelledby="open-tasks-heading">
        <Card>
          <CardHeader>
            <CardTitle id="open-tasks-heading" className="text-base">Open tasks</CardTitle>
          </CardHeader>
          <CardContent>
            {openTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open tasks for this customer.</p>
            ) : (
              <ul className="divide-y">
                {openTasks.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                    <Link href={`/projects/${t.projectId}/tasks/${t.id}`} className="text-sm font-medium hover:underline">
                      {t.title}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {t.projectName}
                      <Badge variant="outline">
                        {TASK_STATUSES.find((s) => s.status === t.status)?.label ?? "To do"}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <ContactsSection
        customerId={customer.id}
        contacts={contacts}
        primaryContactId={customer.primaryContactId}
        readOnly={!customer.canChange}
      />
      <NotesSection customerId={customer.id} notes={notes} readOnly={!customer.canChange} />
    </AppFrame>
  );
}
