import { and, asc, desc, eq, inArray, isNotNull, schema, sql } from "@repo/db";
import type { getMaintenanceDb } from "@repo/db/maintenance";

import { decideDeploySeed, planCounts, seedSummary } from "@/features/demo/deploy-seed";
import { buildDemoPlan, DEMO_FORM, DEMO_TAG, type DemoCustomer, demoReadingValues, type DemoVisit } from "@/features/demo/seed-plan";
import type { ReadingField } from "@/features/readings/reading-values";
import { currentWorkspaceId } from "@/features/workspaces/current-workspace";

// The demo seed (`scripts/seed-demo.ts`, tasks 052–055 and 076): where it seeds, and what. Everything runs in
// one transaction on one connection (the deploy gives it DB_POOL_MAX=1): a failure, a skip or a refusal
// leaves nothing written.

type MaintenanceDb = ReturnType<typeof getMaintenanceDb>;
type Tx = Parameters<Parameters<MaintenanceDb["transaction"]>[0]>[0];

export type SeedOptions = { email: string; workspace?: string; deploy: boolean };

/** What the run did: exit code 0 (seeded or skipped) or 1 (refused), and the one line to print. */
export type SeedResult = { code: 0 | 1; message: string };

/** The workspace to seed and the user who seeds it, or why not. */
type Target = { userId: string; workspaceId: string; workspaceName: string } | { result: SeedResult };

/** The version of the demo form that readings are filled against, with its fields. */
type DemoFormVersion = { versionId: string; fields: ReadingField[] };

/** Demo customers and sub-companies: they carry the demo tag. */
const isDemo = sql`${schema.organization.tags} @> array[${DEMO_TAG}]::text[]`;

/**
 * Seeds `options.email`'s workspace with `buildDemoPlan(now)`. Locally it replaces earlier demo data in the
 * current workspace (or `--workspace`); `--deploy` seeds only a fresh demo account's own workspace and never
 * replaces anything (`decideDeploySeed`).
 */
export async function runSeedDemo(db: MaintenanceDb, options: SeedOptions, now = new Date()): Promise<SeedResult> {
  if (options.deploy && options.workspace !== undefined) {
    const decision = decideDeploySeed({ workspaceFlag: true, userFound: false, memberships: [], members: 0, demoCustomers: 0 });
    return { code: 1, message: "reason" in decision ? decision.reason : "" };
  }
  return db.transaction(async (tx) => {
    const target = options.deploy ? await deployTarget(tx, options.email) : await localTarget(tx, options);
    if ("result" in target) return target.result;
    const plan = buildDemoPlan(now);
    const replaced = await removeDemoData(tx, target.workspaceId);
    await seedPlan(tx, plan, target.userId, target.workspaceId);
    return { code: 0, message: seedSummary(planCounts(plan), options.deploy ? undefined : { workspaceName: target.workspaceName, replaced }) };
  });
}

/** Locally: the user's current workspace (their oldest), or the one named by `--workspace`. */
async function localTarget(tx: Tx, options: SeedOptions): Promise<Target> {
  const [user] = await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, options.email));
  if (!user) return { result: { code: 1, message: `No user with email ${options.email}. Sign up first.` } };

  const memberships = await tx
    .select({ workspaceId: schema.workspaceMember.workspaceId, joinedAt: schema.workspaceMember.joinedAt, name: schema.workspace.name })
    .from(schema.workspaceMember)
    .innerJoin(schema.workspace, eq(schema.workspaceMember.workspaceId, schema.workspace.id))
    .where(eq(schema.workspaceMember.userId, user.id))
    .orderBy(asc(schema.workspaceMember.joinedAt), asc(schema.workspaceMember.workspaceId));
  const workspaceId = options.workspace
    ? memberships.find((m) => m.name === options.workspace)?.workspaceId
    : currentWorkspaceId(memberships, undefined);
  if (!workspaceId) {
    return {
      result: {
        code: 1,
        message: options.workspace ? `${options.email} isn't in a workspace named "${options.workspace}".` : "Open the dashboard once first, so the user has a workspace.",
      },
    };
  }
  return { userId: user.id, workspaceId, workspaceName: memberships.find((m) => m.workspaceId === workspaceId)!.name };
}

/**
 * `--deploy`: the demo account's only workspace, if it is its admin and only member and it has no demo data
 * yet. The workspace row is locked first, as membership changes do, so the facts hold until the seed commits.
 */
async function deployTarget(tx: Tx, email: string): Promise<Target> {
  const [user] = await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email));
  const memberships = user
    ? await tx
        .select({ workspaceId: schema.workspaceMember.workspaceId, role: schema.workspaceMember.role })
        .from(schema.workspaceMember)
        .where(eq(schema.workspaceMember.userId, user.id))
    : [];
  const workspaceId = memberships.length === 1 ? memberships[0]!.workspaceId : null;
  let members = 0;
  let demoCustomers = 0;
  if (workspaceId) {
    await tx.select({ id: schema.workspace.id }).from(schema.workspace).where(eq(schema.workspace.id, workspaceId)).for("update");
    [{ members }] = (await tx
      .select({ members: sql<number>`count(*)::int` })
      .from(schema.workspaceMember)
      .where(eq(schema.workspaceMember.workspaceId, workspaceId))) as [{ members: number }];
    // Deleted ones too: what the owner removed by hand stays removed.
    [{ demoCustomers }] = (await tx
      .select({ demoCustomers: sql<number>`count(*)::int` })
      .from(schema.organization)
      .where(and(eq(schema.organization.workspaceId, workspaceId), isDemo))) as [{ demoCustomers: number }];
  }
  const decision = decideDeploySeed({ workspaceFlag: false, userFound: Boolean(user), memberships, members, demoCustomers });
  if (decision.action === "skip") return { result: { code: 0, message: decision.reason } };
  if (decision.action === "refuse") return { result: { code: 1, message: decision.reason } };
  return { userId: user!.id, workspaceId: workspaceId!, workspaceName: "" };
}

/**
 * Removes the workspace's demo customers and sub-companies with their projects (and so their tasks, visits and
 * readings); returns how many there were. Nothing else in the workspace changes; the demo form stays.
 */
async function removeDemoData(tx: Tx, workspaceId: string): Promise<number> {
  const previous = await tx
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(and(eq(schema.organization.workspaceId, workspaceId), isDemo));
  const previousIds = previous.map((o) => o.id);
  if (previousIds.length > 0) {
    // A customer or site in use can't be deleted (task 071), so remove the demo projects (and their tasks) first.
    // Sub-companies' projects too: previousIds has the sub-companies (they carry the demo tag).
    await tx.delete(schema.project).where(inArray(schema.project.organizationId, previousIds));
    await tx.delete(schema.organization).where(inArray(schema.organization.id, previousIds));
  }
  return previousIds.length;
}

/**
 * The published version of the workspace's demo form, with its fields: a published form of that name if there
 * is one (used as it is, never changed), otherwise a new one, made and published the way the app does.
 */
async function demoFormVersion(tx: Tx, workspaceId: string, userId: string): Promise<DemoFormVersion> {
  const [existing] = await tx
    .select({ versionId: schema.formTemplateVersion.id })
    .from(schema.formTemplate)
    .innerJoin(schema.formTemplateVersion, eq(schema.formTemplateVersion.templateId, schema.formTemplate.id))
    .where(
      and(
        eq(schema.formTemplate.workspaceId, workspaceId),
        eq(schema.formTemplate.name, DEMO_FORM.name),
        eq(schema.formTemplate.status, "published"),
        isNotNull(schema.formTemplateVersion.publishedAt),
      ),
    )
    .orderBy(asc(schema.formTemplate.createdAt), asc(schema.formTemplate.id), desc(schema.formTemplateVersion.version))
    .limit(1);
  if (existing) {
    const fields = await tx
      .select({
        id: schema.formField.id,
        label: schema.formField.label,
        type: schema.formField.type,
        required: schema.formField.required,
        unit: schema.formField.unit,
        options: schema.formField.options,
      })
      .from(schema.formField)
      .where(eq(schema.formField.versionId, existing.versionId))
      .orderBy(asc(schema.formField.position), asc(schema.formField.id));
    return { versionId: existing.versionId, fields };
  }

  // A draft with version 1 and its fields, then published: the database publishes the version with it (task 060).
  const formId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const fields = DEMO_FORM.fields.map((f) => ({ id: crypto.randomUUID(), ...f }));
  await tx.insert(schema.formTemplate).values({ id: formId, workspaceId, name: DEMO_FORM.name, description: DEMO_FORM.description, createdBy: userId });
  await tx.insert(schema.formTemplateVersion).values({ id: versionId, templateId: formId, version: 1 });
  await tx.insert(schema.formField).values(fields.map((f, i) => ({ versionId, position: i + 1, ...f })));
  await tx.update(schema.formTemplate).set({ status: "published", updatedAt: new Date() }).where(eq(schema.formTemplate.id, formId));
  return { versionId, fields };
}

/** Inserts `plan` into `workspaceId` as `userId`: customers with everything under them, down to readings. */
async function seedPlan(tx: Tx, plan: DemoCustomer[], userId: string, workspaceId: string) {
  const id = () => crypto.randomUUID();
  const form = await demoFormVersion(tx, workspaceId, userId);

  for (const customer of plan) {
    const organizationId = id();
    await tx.insert(schema.organization).values({
      id: organizationId,
      ownerId: userId,
      workspaceId,
      kind: "customer",
      name: customer.name,
      status: customer.status,
      email: customer.email,
      phone: customer.phone,
      website: customer.website,
      about: customer.about,
      tags: customer.tags,
    });
    const contacts = customer.contacts.map((c) => ({ id: id(), organizationId, name: c.name, role: c.role, email: c.email, phone: c.phone, primary: c.primary }));
    await tx.insert(schema.organizationContact).values(contacts.map(({ primary: _, ...c }) => c));
    await tx
      .update(schema.organization)
      .set({ primaryContactId: contacts.find((c) => c.primary)!.id })
      .where(eq(schema.organization.id, organizationId));
    await tx.insert(schema.organizationNote).values(customer.notes.map((n) => ({ id: id(), organizationId, authorId: userId, ...n })));

    /** Sites with their on-site contacts (task 054); deleted with their customer on a rerun. */
    // Site ids by organization and name, for the projects at them (task 055).
    const siteIds = new Map<string, string>();
    async function insertSites(siteOrganizationId: string, sites: typeof customer.sites) {
      for (const site of sites) {
        const siteId = id();
        siteIds.set(`${siteOrganizationId}:${site.name}`, siteId);
        const { contacts: siteContacts, ...fields } = site;
        await tx.insert(schema.site).values({ id: siteId, workspaceId, organizationId: siteOrganizationId, createdBy: userId, ...fields });
        await tx.insert(schema.siteContact).values(siteContacts.map((c) => ({ id: id(), siteId, ...c })));
      }
    }
    await insertSites(organizationId, customer.sites);

    // Sub-companies (task 053) carry the demo tag too, so a rerun replaces them with their parent.
    const subCompanyIds = new Map<string, string>();
    for (const sub of customer.subCompanies) {
      const subId = id();
      subCompanyIds.set(sub.name, subId);
      await tx.insert(schema.organization).values({
        id: subId,
        ownerId: userId,
        workspaceId,
        kind: "customer",
        parentId: organizationId,
        name: sub.name,
        status: customer.status,
        phone: sub.phone,
        about: sub.about,
        tags: [DEMO_TAG],
      });
      await insertSites(subId, sub.sites);
    }

    for (const project of customer.projects) {
      const projectOrganizationId = (project.subCompany && subCompanyIds.get(project.subCompany)) || organizationId;
      const projectId = id();
      await tx.insert(schema.project).values({
        id: projectId,
        name: project.name,
        description: project.description,
        ownerId: userId,
        workspaceId,
        organizationId: projectOrganizationId,
        siteId: siteIds.get(`${projectOrganizationId}:${project.site}`)!,
        createdAt: project.createdAt,
        updatedAt: project.createdAt,
      });
      if (project.tasks.length > 0) {
        await tx.insert(schema.task).values(
          project.tasks.map((t) => ({
            id: id(),
            projectId,
            title: t.title,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate,
            completedAt: t.completedAt,
            assigneeId: t.assignedToMe ? userId : null,
            organizationId: t.linkCustomer ? projectOrganizationId : null,
            createdAt: t.createdAt,
            updatedAt: t.completedAt ?? t.createdAt,
          })),
        );
      }
      await insertVisits(tx, projectId, project.visits, userId, form);
    }
  }
}

/**
 * A project's visits (task 058) by `userId`, who was there, each recorded on its day; and the readings some carry
 * (task 061), filled in half an hour into the visit.
 */
async function insertVisits(tx: Tx, projectId: string, visits: DemoVisit[], userId: string, form: DemoFormVersion) {
  if (visits.length === 0) return;
  const rows = visits.map((visit) => ({ visit, id: crypto.randomUUID() }));
  await tx.insert(schema.siteVisit).values(
    rows.map(({ visit, id }) => ({
      id,
      projectId,
      visitedOn: visit.visitedOn,
      notes: visit.notes,
      createdBy: userId,
      createdAt: visit.recordedAt,
      updatedAt: visit.recordedAt,
      recordedAt: visit.recordedAt,
    })),
  );
  await tx.insert(schema.siteVisitMember).values(rows.map(({ id }) => ({ visitId: id, userId })));
  const readings = rows.filter(({ visit }) => visit.reading !== null);
  if (readings.length === 0) return;
  await tx.insert(schema.formSubmission).values(
    readings.map(({ visit, id }) => {
      const filledIn = new Date(visit.recordedAt.getTime() + 30 * 60_000);
      return {
        id: crypto.randomUUID(),
        visitId: id,
        versionId: form.versionId,
        values: demoReadingValues(form.fields, visit.reading!, visit.visitedOn),
        submittedBy: userId,
        recordedAt: filledIn,
        submittedAt: filledIn,
      };
    }),
  );
}
