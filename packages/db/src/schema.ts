/**
 * Tables required by Better Auth (email + password). Add your own domain tables below,
 * then run `pnpm db:generate` and commit the new migration.
 * If you enable Better Auth plugins that need tables, regenerate with `npx @better-auth/cli generate`.
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Better Auth's rate-limit counts (task 089), shared by every server instance: one row per client address and
 * path (`key`), replaced when its window passes; Better Auth deletes rows older than its longest window then.
 * Like the tables above it has no row-level security (ADR-0006), and the app never reads it.
 */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  // Milliseconds since the epoch (Date.now()), as Better Auth writes it.
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
}, (table) => [
  // Better Auth's cleanup deletes rows older than its longest window by this column.
  index("rate_limit_last_request_idx").on(table.lastRequest),
]);

/** Workspaces own projects, tasks and customers (ADR-0005). */
export const workspace = pgTable("workspace", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workspaceMember = pgTable(
  "workspace_member",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** `admin`, `auditor`, `worker` (task 056, ADR-0008) or `partner` (features/access/roles.ts, ADR-0006). */
    role: text("role").notNull().default("admin"),
    /** The partner company of a `partner` membership; set exactly then. A partner of the same workspace. */
    partnerId: text("partner_id"),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index("workspace_member_user_idx").on(table.userId),
    index("workspace_member_partner_idx").on(table.partnerId),
    foreignKey({
      name: "workspace_member_partner_fk",
      columns: [table.partnerId, table.workspaceId],
      foreignColumns: [partner.id, partner.workspaceId],
    }),
    check("workspace_member_role_check", sql`${table.role} in ('admin', 'auditor', 'worker', 'partner')`),
    check("workspace_member_partner_check", sql`(${table.role} = 'partner') = (${table.partnerId} is not null)`),
  ],
);

/** Partner companies (ADR-0006): outside companies working on their own projects for customers assigned to them. */
export const partner = pgTable(
  "partner",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
    deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),
  },
  // (id, workspace_id) is unique so memberships, invites, projects and assignments can require a partner of their own workspace.
  (table) => [unique("partner_id_workspace_unique").on(table.id, table.workspaceId), index("partner_workspace_idx").on(table.workspaceId)],
);

/** Which customers each partner works for (ADR-0006); many to many, both in the same workspace. */
export const customerPartner = pgTable(
  "customer_partner",
  {
    organizationId: text("organization_id").notNull(),
    partnerId: text("partner_id").notNull(),
    /** Shared by the customer and the partner (both foreign keys include it). */
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.partnerId] }),
    index("customer_partner_partner_idx").on(table.partnerId),
    foreignKey({
      name: "customer_partner_organization_fk",
      columns: [table.organizationId, table.workspaceId],
      foreignColumns: [organization.id, organization.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "customer_partner_partner_fk",
      columns: [table.partnerId, table.workspaceId],
      foreignColumns: [partner.id, partner.workspaceId],
    }).onDelete("cascade"),
  ],
);

/** Invite links (task 023). Only a SHA-256 hash of the token is stored; links expire and can be revoked. */
export const workspaceInvite = pgTable(
  "workspace_invite",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    /** The role joining gives (ADR-0006); `partner` links name their partner company. */
    role: text("role").notNull().default("auditor"),
    partnerId: text("partner_id"),
  },
  (table) => [
    index("workspace_invite_workspace_idx").on(table.workspaceId),
    // The SET NULL when the inviting user is deleted (task 033).
    index("workspace_invite_created_by_idx").on(table.createdBy),
    foreignKey({
      name: "workspace_invite_partner_fk",
      columns: [table.partnerId, table.workspaceId],
      foreignColumns: [partner.id, partner.workspaceId],
    }),
    check("workspace_invite_role_check", sql`${table.role} in ('admin', 'auditor', 'worker', 'partner')`),
    check("workspace_invite_partner_check", sql`(${table.role} = 'partner') = (${table.partnerId} is not null)`),
  ],
);

export const project = pgTable("project", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  /** Who created it; cleared if they're deleted, so shared work stays. Access is by workspace membership (ADR-0005). */
  ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  /**
   * The customer this project is for (task 016), required (task 071). A customer in use can't be hard-deleted
   * (`no action`): only a whole workspace's cascade removes it, together with its projects.
   */
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "no action" }),
  /** The fixed owner (ADR-0006): `internal`, or `partner` with `partnerId` set (and a customer). */
  visibility: text("visibility").notNull().default("internal"),
  partnerId: text("partner_id"),
  /**
   * `active` or `canceled`, set by hand (ADR-0006). Named `lifecycle` here so it never collides with the
   * status derived from the project's tasks (features/projects/project-status.ts).
   */
  lifecycle: text("status").notNull().default("active"),
  /** The project this one was copied from, if any (ADR-0006). */
  copiedFromId: text("copied_from_id").references((): AnyPgColumn => project.id, { onDelete: "set null" }),
  /**
   * The site the work is at (task 055, ADR-0008): one of the customer's sites or its sub-companies', required
   * (task 071). A site in use can't be hard-deleted (`no action`), except by its workspace's cascade.
   */
  siteId: text("site_id")
    .notNull()
    .references((): AnyPgColumn => site.id, { onDelete: "no action" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),
}, (table) => [
  // A workspace's projects, a customer's projects, and the check that a customer is not in use when deleted.
  index("project_workspace_organization_idx").on(table.workspaceId, table.organizationId),
  index("project_partner_idx").on(table.partnerId),
  index("project_site_idx").on(table.siteId),
  foreignKey({
    name: "project_partner_fk",
    columns: [table.partnerId, table.workspaceId],
    foreignColumns: [partner.id, partner.workspaceId],
  }),
  check("project_visibility_check", sql`${table.visibility} in ('internal', 'partner')`),
  check("project_partner_check", sql`(${table.visibility} = 'partner') = (${table.partnerId} is not null)`),
  check("project_partner_customer_check", sql`${table.visibility} <> 'partner' or ${table.organizationId} is not null`),
  check("project_status_check", sql`${table.lifecycle} in ('active', 'canceled')`),
]);

/**
 * A project's crew (task 056, ADR-0008): the workers who see the project and work on its tasks. The member
 * key ties each row to a membership of the project's workspace, so leaving the workspace leaves the crews;
 * a trigger keeps the member a worker of the project's own workspace (migration 0029).
 */
export const projectWorker = pgTable(
  "project_worker",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    addedBy: text("added_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    index("project_worker_member_idx").on(table.workspaceId, table.userId),
    foreignKey({
      name: "project_worker_member_fk",
      columns: [table.workspaceId, table.userId],
      foreignColumns: [workspaceMember.workspaceId, workspaceMember.userId],
    }).onDelete("cascade"),
  ],
);

/**
 * A visit to a project's site (task 058, ADR-0008): when, who was there, what was found. The id comes from
 * the browser (a UUID), so sending the same visit twice records it once; offline sync (task 063) reuses it.
 * The site is the project's. Soft-deleted; restored by admins.
 */
export const siteVisit = pgTable(
  "site_visit",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    /** A calendar day (like task due dates): `date`, read as "YYYY-MM-DD". */
    visitedOn: date("visited_on", { mode: "string" }).notNull(),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    /** When it was recorded on the device; the server's time for visits recorded online. */
    recordedAt: timestamp("recorded_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
    deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [index("site_visit_project_idx").on(table.projectId, table.visitedOn)],
);

/** The people who were at a visit (task 058): users who could work on the project. */
export const siteVisitMember = pgTable(
  "site_visit_member",
  {
    visitId: text("visit_id")
      .notNull()
      .references(() => siteVisit.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.visitId, table.userId] }), index("site_visit_member_user_idx").on(table.userId)],
);

/**
 * A photo or file on a project, or on one of its visits (task 059, ADR-0008). The bytes live in object
 * storage (`@repo/storage`) under `storage_key`; this row is the metadata. The id comes from the browser.
 * Unconfirmed (`confirmed_at` null) until the server has checked the stored object's size and type.
 */
export const attachment = pgTable(
  "attachment",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    visitId: text("visit_id").references(() => siteVisit.id, { onDelete: "cascade" }),
    /** `photo` or `file` (features/attachments/attachment-kind.ts); `report` with task 064. */
    kind: text("kind").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at"),
    /** When it was taken or added on the device; the server's time for uploads made online. */
    recordedAt: timestamp("recorded_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
    deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    index("attachment_project_idx").on(table.projectId, table.createdAt),
    index("attachment_visit_idx").on(table.visitId),
    check("attachment_kind_check", sql`${table.kind} in ('photo', 'file', 'report')`),
    check("attachment_size_check", sql`${table.sizeBytes} >= 0`),
  ],
);

/**
 * A reading form (task 060, ADR-0008): fields technicians fill in on site, built by a workspace's admins.
 * `draft`, `published` or `archived` (features/reading-forms/form-status.ts), only ever forward; never deleted.
 * Admins and auditors see every form, workers and partner users published and archived ones
 * (`can_see_form_template` / `can_change_form_template`, migration 0037).
 */
export const formTemplate = pgTable(
  "form_template",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("draft"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("form_template_workspace_idx").on(table.workspaceId, table.createdAt),
    check("form_template_status_check", sql`${table.status} in ('draft', 'published', 'archived')`),
  ],
);

/**
 * A version of a reading form (ADR-0008): immutable once published, fields included, so readings (task 061)
 * always match the fields they were filled against. Task 060 makes version 1 only.
 */
export const formTemplateVersion = pgTable(
  "form_template_version",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id")
      .notNull()
      .references(() => formTemplate.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    /** Null while it is a draft. */
    publishedAt: timestamp("published_at"),
  },
  (table) => [unique("form_template_version_template_version_key").on(table.templateId, table.version)],
);

/**
 * A field of a reading form's version, in `position` order. `type` is one of features/reading-forms/field-type.ts;
 * a unit only on number fields, options (two or more) exactly on choice fields.
 */
export const formField = pgTable(
  "form_field",
  {
    id: text("id").primaryKey(),
    versionId: text("version_id")
      .notNull()
      .references(() => formTemplateVersion.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    type: text("type").notNull(),
    required: boolean("required").notNull().default(false),
    unit: text("unit"),
    options: text("options").array(),
    position: integer("position").notNull(),
  },
  (table) => [
    index("form_field_version_idx").on(table.versionId, table.position),
    check("form_field_type_check", sql`${table.type} in ('number', 'text', 'yes_no', 'choice', 'date')`),
    check("form_field_unit_check", sql`${table.unit} is null or ${table.type} = 'number'`),
    check(
      "form_field_options_check",
      sql`(${table.type} = 'choice') = (${table.options} is not null) and (${table.options} is null or cardinality(${table.options}) >= 2)`,
    ),
  ],
);

/**
 * A reading (task 061, ADR-0008): one filled reading form on one visit, against the form version it was filled
 * in, so it keeps its fields after the form is archived. `values` is keyed by field id and checked in code
 * (features/readings/reading-values.ts). The id comes from the browser, so a form sent twice records one
 * reading. Append-only for now: the delete columns are for later tasks. Access follows the visit (migration 0038).
 */
export const formSubmission = pgTable(
  "form_submission",
  {
    id: text("id").primaryKey(),
    visitId: text("visit_id")
      .notNull()
      .references(() => siteVisit.id, { onDelete: "cascade" }),
    versionId: text("version_id")
      .notNull()
      .references(() => formTemplateVersion.id, { onDelete: "cascade" }),
    values: jsonb("values").$type<Record<string, unknown>>().notNull().default({}),
    submittedBy: text("submitted_by").references(() => user.id, { onDelete: "set null" }),
    /** When it was filled in on the device; the server's time for readings saved online. */
    recordedAt: timestamp("recorded_at").notNull().defaultNow(),
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
    deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    index("form_submission_visit_idx").on(table.visitId, table.submittedAt),
    index("form_submission_version_idx").on(table.versionId),
    check("form_submission_values_check", sql`jsonb_typeof(${table.values}) = 'object'`),
  ],
);

export const task = pgTable("task", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  /** The customer this task is about (task 017); may differ from the project's. Cleared if it is deleted. */
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("medium"),
  /** Set when the task moves to Done, cleared when it moves out. Null for tasks completed before this column existed. */
  completedAt: timestamp("completed_at"),
  /** A calendar day (task 019); `date` so no time zone can shift it. Read as "YYYY-MM-DD". */
  dueDate: date("due_date", { mode: "string" }),
  /** One member of the task's workspace (task 025); cleared if they leave or are removed. */
  assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),
}, (table) => [
  // A project's board, and the cascade when a project is deleted (task 033).
  index("task_project_idx").on(table.projectId),
  // A customer's open tasks, and the SET NULL when a customer is deleted.
  index("task_organization_idx").on(table.organizationId),
  // "My tasks", and clearing assignments when a member leaves.
  index("task_assignee_idx").on(table.assigneeId),
]);

/** Customers and other outside organizations, in one directory with a `kind` (ADR-0004). */
export const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey(),
    /** Who created it; cleared if they're deleted, so shared work stays. Access is by workspace membership (ADR-0005). */
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("customer"),
    /**
     * The company this one is a sub-company (sub-brand) of (task 053, ADR-0008): one level only, same
     * workspace and kind; a trigger (migration 0026) keeps it that way. Null for a top-level organization.
     */
    parentId: text("parent_id").references((): AnyPgColumn => organization.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    website: text("website"),
    companyId: text("company_id"),
    /** "General information": one editable text. Dated notes live in their own table (task 015). */
    about: text("about"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    /** Who to reach first (task 038). A pointer keeps "only one primary" true; cleared when that contact is removed. */
    primaryContactId: text("primary_contact_id").references((): AnyPgColumn => organizationContact.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
    deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    index("organization_workspace_kind_idx").on(table.workspaceId, table.kind),
    index("organization_parent_idx").on(table.parentId),
    // Lets customer_partner require a customer of its own workspace.
    unique("organization_id_workspace_unique").on(table.id, table.workspaceId),
  ],
);

/** People at an organization (task 014). Deleted with the organization. */
export const organizationContact = pgTable(
  "organization_contact",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role"),
    phone: text("phone"),
    email: text("email"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
    deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [index("organization_contact_organization_idx").on(table.organizationId)],
);

/** Dated notes about an organization, newest first in the UI (task 015). Deleted with the organization. */
export const organizationNote = pgTable(
  "organization_note",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    /** Who wrote it (task 025); null for notes from before authors were recorded. */
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
    deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    index("organization_note_organization_idx").on(table.organizationId, table.createdAt),
    // The SET NULL when the author is deleted (task 033).
    index("organization_note_author_idx").on(table.authorId),
  ],
);

/**
 * A physical site of a customer or sub-company (task 054, ADR-0008): where the work happens. Its customer is
 * fixed once created; the composite key keeps it in the customer's workspace. Coordinates are both set or
 * both empty. Admins change sites, auditors read them (`can_see_site` / `can_change_site`, migration 0027).
 */
export const site = pgTable(
  "site",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    /** Gate codes, opening hours, who to report to, safety notes. */
    accessNotes: text("access_notes"),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
    deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    index("site_organization_idx").on(table.organizationId),
    index("site_workspace_idx").on(table.workspaceId),
    foreignKey({
      name: "site_organization_fk",
      columns: [table.organizationId, table.workspaceId],
      foreignColumns: [organization.id, organization.workspaceId],
    }).onDelete("cascade"),
    check("site_coordinates_both_or_neither", sql`(${table.latitude} is null) = (${table.longitude} is null)`),
    check("site_latitude_range", sql`${table.latitude} between -90 and 90`),
    check("site_longitude_range", sql`${table.longitude} between -180 and 180`),
  ],
);

/** People to meet at a site (task 054): separate from the customer's contacts. */
export const siteContact = pgTable(
  "site_contact",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role"),
    phone: text("phone"),
    email: text("email"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
    deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [index("site_contact_site_idx").on(table.siteId, table.createdAt)],
);

/**
 * Customer names a user may see (`can_see_customer_name`, ADR-0006): partners read the names of their
 * assigned customers here, never `organization` itself. Customers only, not deleted ones. Created in
 * migration 0020 (task 047), narrowed in 0023 (task 049).
 */
export const customerName = pgView("customer_name", {
  id: text("id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  /** The parent company's name for a sub-company (task 053); shown even when only the sub-company is assigned. */
  parentName: text("parent_name"),
  /** How the app shows the customer: "Parent › Sub-company", or the name. Sorts sub-companies under their parent. */
  label: text("label").notNull(),
}).existing();

/**
 * Sites a user may choose for a project (task 055): not deleted, of a customer whose name they may see.
 * Partners pick sites of their assigned customers here without seeing the sites' details. Migration 0028.
 */
export const siteChoice = pgView("site_choice", {
  id: text("id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  organizationId: text("organization_id").notNull(),
  /** The site's customer's parent, for a sub-company's site: its sites show on the parent's list too. */
  customerParentId: text("customer_parent_id"),
  customerName: text("customer_name").notNull(),
  name: text("name").notNull(),
}).existing();
