"use server";

import { resolvePublicOrigin } from "@repo/auth/redirect";
import { getSession } from "@repo/auth/server";
import { and, type Db, eq, getDb, isNull, schema, sql, withAccess } from "@repo/db";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";

import { isAdmin } from "@/features/access/require-change";
import { keepsAnAdmin, parseRoleChoice, type RoleChoice, roleChoiceLabel, roleChoiceValue } from "@/features/access/roles";
import { type FormState, invalid } from "@/features/forms/form-state";
import { redirectFromAction } from "@/features/navigation/redirect-from-action";

import { WORKSPACE_COOKIE } from "./current-workspace";
import {
  clearInviteToken,
  hashInviteToken,
  inviteExpiresAt,
  inviteState,
  newInviteToken,
  readInviteToken,
} from "./invite-token";
import { findInvite } from "./members";
import { ADMINS_ONLY, membershipError, type MembershipResult } from "./membership-errors";
import { createWorkspace, ensurePersonalWorkspace, isMember, listMemberships } from "./queries";
import { requireWorkspaceForAction } from "./require-workspace";
import { parseWorkspaceName } from "./workspace-name";

async function useWorkspace(workspaceId: string) {
  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

/** The form's workspace, or null when I'm not its admin. Every admin action starts here (ADR-0005, ADR-0006). */
async function adminContext(formData: FormData) {
  const context = await requireWorkspaceForAction(formData);
  return (await isAdmin(context.session.user.id, context.workspace.id)) ? context : null;
}

/**
 * Leaving a workspace drops your assignments in it (ADR-0005), all of them: the database function runs as
 * the owner, since the leaver (an auditor, say) may not be allowed to change those tasks. Run it while
 * they are still a member, as themself or an admin.
 */
async function clearAssignments(tx: Db, workspaceId: string, userId: string) {
  await tx.execute(sql`select clear_assignments(${workspaceId}, ${userId})`);
}

function memberOf(workspaceId: string, userId: string) {
  return and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, userId));
}

/** The workspace's partner (not deleted) named in `partnerId`, or null. */
async function workspacePartner(tx: Db, workspaceId: string, partnerId: string) {
  const [partner] = await tx
    .select({ id: schema.partner.id, name: schema.partner.name })
    .from(schema.partner)
    .where(
      and(eq(schema.partner.id, partnerId), eq(schema.partner.workspaceId, workspaceId), isNull(schema.partner.deletedAt)),
    );
  return partner ?? null;
}

/** Revokes every open invite link of a workspace (ADR-0005: optional when removing a member). */
async function revokeOpenInvites(tx: Db, workspaceId: string) {
  await tx
    .update(schema.workspaceInvite)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.workspaceInvite.workspaceId, workspaceId), isNull(schema.workspaceInvite.revokedAt)));
}

/**
 * Gives `userId` a new role (with its partner company for a partner's user), or removes them
 * (`role: null`) and clears their assignments, keeping at least one admin (ADR-0005). The workspace row is
 * locked first, so two admins changing each other at once can't both pass the check; `adminId` (who is
 * acting) must still be an admin under that lock. A changed role or partner clears, in the same
 * transaction, the assignments on tasks they can no longer see (design rule 8d). `revokeInvites` also
 * revokes the workspace's open invite links when someone is removed. Runs as `adminId`, or as the member
 * themself when they leave.
 */
async function changeMembership(
  workspaceId: string,
  change: { userId: string; role: null } | ({ userId: string } & RoleChoice),
  adminId?: string,
  { revokeInvites = false }: { revokeInvites?: boolean } = {},
): Promise<MembershipResult> {
  return withAccess(adminId ?? change.userId, async () => {
    const tx = getDb();
    // Row-level security returns (and locks) the row only for admins; a non-admin leaving can't remove the last admin anyway.
    await tx.select({ id: schema.workspace.id }).from(schema.workspace).where(eq(schema.workspace.id, workspaceId)).for("update");
    const members = await tx
      .select({
        userId: schema.workspaceMember.userId,
        role: schema.workspaceMember.role,
        partnerId: schema.workspaceMember.partnerId,
      })
      .from(schema.workspaceMember)
      .where(eq(schema.workspaceMember.workspaceId, workspaceId));
    if (adminId && members.find((m) => m.userId === adminId)?.role !== "admin") {
      return "not-an-admin";
    }
    const current = members.find((m) => m.userId === change.userId);
    if (!current) {
      return "not-a-member";
    }
    if (!keepsAnAdmin(members, change)) {
      return "last-admin";
    }
    if (change.role) {
      if (change.partnerId && !(await workspacePartner(tx, workspaceId, change.partnerId))) {
        return "unknown-partner";
      }
      if (current.role === change.role && current.partnerId === change.partnerId) {
        return "done";
      }
      // A check constraint ties partner_id to the role: set for a partner's user, null otherwise.
      await tx
        .update(schema.workspaceMember)
        .set({ role: change.role, partnerId: change.partnerId })
        .where(memberOf(workspaceId, change.userId));
      // Only admins change roles (adminId is set), so this runs as an admin of the workspace.
      await tx.execute(sql`select clear_unseen_assignments(${workspaceId}, ${change.userId})`);
    } else {
      await clearAssignments(tx, workspaceId, change.userId);
      await tx.delete(schema.workspaceMember).where(memberOf(workspaceId, change.userId));
      if (revokeInvites) {
        await revokeOpenInvites(tx, workspaceId);
      }
    }
    return "done";
  });
}

async function publicOrigin() {
  const h = await headers();
  return resolvePublicOrigin({
    configured: process.env.BETTER_AUTH_URL,
    forwardedHost: h.get("x-forwarded-host"),
    forwardedProto: h.get("x-forwarded-proto"),
    fallbackOrigin: `http://${h.get("host") ?? "localhost"}`,
  });
}

/** A created link comes back once, with the role choice it gives (its select value) and that role's label. */
export type InviteState = FormState & { link?: string; role?: string; roleLabel?: string };

/** Creates a link for the chosen role (or partner company) and returns it once; only its hash is stored. */
export async function createInviteAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const context = await adminContext(formData);
  if (!context) {
    return { error: ADMINS_ONLY };
  }
  const { session, workspace } = context;
  const choice = parseRoleChoice(formData.get("role"));
  if (!choice) {
    return invalid("Choose a role", formData, "role");
  }
  const token = newInviteToken();
  const roleLabel = await withAccess(session.user.id, async () => {
    const tx = getDb();
    const partner = choice.partnerId ? await workspacePartner(tx, workspace.id, choice.partnerId) : null;
    if (choice.partnerId && !partner) {
      return null;
    }
    await tx.insert(schema.workspaceInvite).values({
      id: crypto.randomUUID(),
      workspaceId: workspace.id,
      tokenHash: hashInviteToken(token),
      createdBy: session.user.id,
      expiresAt: inviteExpiresAt(new Date()),
      role: choice.role,
      partnerId: choice.partnerId,
    });
    return roleChoiceLabel(choice.role, partner?.name ?? null);
  });
  if (!roleLabel) {
    return invalid("Choose a partner of this workspace", formData, "role");
  }
  revalidatePath("/workspace");
  return {
    link: new URL(`/dashboard/invite/${token}`, await publicOrigin()).toString(),
    role: roleChoiceValue(choice.role, choice.partnerId),
    roleLabel,
  };
}

export async function revokeInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const context = await adminContext(formData);
  if (!context) {
    return { error: ADMINS_ONLY };
  }
  const revoked = await withAccess(context.session.user.id, () =>
    getDb()
      .update(schema.workspaceInvite)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.workspaceInvite.id, String(formData.get("inviteId") ?? "")),
          eq(schema.workspaceInvite.workspaceId, context.workspace.id),
          isNull(schema.workspaceInvite.revokedAt),
        ),
      )
      .returning({ id: schema.workspaceInvite.id }),
  );
  if (revoked.length === 0) {
    return { error: "This invite link was already revoked" };
  }
  revalidatePath("/workspace");
  return {};
}

export async function changeRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const context = await adminContext(formData);
  if (!context) {
    return { error: ADMINS_ONLY };
  }
  const choice = parseRoleChoice(formData.get("role"));
  if (!choice) {
    return { error: "Unknown role" };
  }
  const userId = String(formData.get("userId") ?? "");
  const error = membershipError(await changeMembership(context.workspace.id, { userId, ...choice }, context.session.user.id));
  if (error) {
    return { error };
  }
  revalidatePath("/workspace");
  return {};
}

export async function removeMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const context = await adminContext(formData);
  if (!context) {
    return { error: ADMINS_ONLY };
  }
  const userId = String(formData.get("userId") ?? "");
  const revokeInvites = formData.get("revokeInvites") === "on";
  const error = membershipError(
    await changeMembership(context.workspace.id, { userId, role: null }, context.session.user.id, { revokeInvites }),
  );
  if (error) {
    return { error };
  }
  revalidatePath("/workspace");
  return {};
}

export async function leaveWorkspaceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session, workspace } = await requireWorkspaceForAction(formData);
  const error = membershipError(await changeMembership(workspace.id, { userId: session.user.id, role: null }));
  if (error) {
    return { error };
  }
  (await cookies()).delete(WORKSPACE_COOKIE);
  return redirectFromAction("/");
}

const INVALID_INVITE = "This invite link is invalid or has expired";
/** A link of a deleted partner company (design rule 8c). */
const NO_LONGER_VALID_INVITE = "This invite link is no longer valid";
const ALREADY_A_MEMBER = "You're already a member of this workspace";

/**
 * Joins the invite's workspace and switches to it. The token comes from the invite cookie (not the form),
 * and the link is checked again here, not just on the page: it may have been revoked since.
 */
export async function joinWorkspaceAction(_prev: FormState, _formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  const jar = await cookies();
  const token = readInviteToken(jar);
  const invite = token ? await findInvite(token) : null;
  const state = invite ? inviteState(invite, new Date()) : null;
  if (!token || !invite || state !== "valid") {
    // The cookie is left to expire: changing it here would re-render the page and drop this message.
    return { error: state === "partner-deleted" ? NO_LONGER_VALID_INVITE : INVALID_INVITE };
  }
  // Someone joining before ever opening the dashboard gets their own workspace too, to switch back to.
  if ((await listMemberships(session.user.id)).length === 0) {
    await ensurePersonalWorkspace(session.user);
  }
  // Checked again in the database, which adds the membership (row-level security lets only admins).
  const { rows } = await withAccess(session.user.id, () =>
    getDb().execute<{ result: string }>(sql`select join_workspace(${session.user.id}, ${hashInviteToken(token)}) as result`),
  );
  if (rows[0]?.result === "invalid") {
    // Revoked, expired or its partner deleted since the check above.
    return { error: INVALID_INVITE };
  }
  // Nothing changes for someone already in the workspace: a link never changes a role (design rule 8d).
  if (rows[0]?.result === "member") {
    return { error: ALREADY_A_MEMBER };
  }
  clearInviteToken(jar);
  await useWorkspace(invite.workspaceId);
  return redirectFromAction("/");
}

/** Makes another of my workspaces the current one. Membership is checked here, not trusted from the form. */
export async function switchWorkspaceAction(formData: FormData) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  const workspaceId = String(formData.get("workspaceId") ?? "");
  if (!(await withAccess(session.user.id, () => isMember(session.user.id, workspaceId)))) {
    throw new Error("Not a member of that workspace");
  }
  await useWorkspace(workspaceId);
  return redirectFromAction("/");
}

/** Creates a workspace with me as its admin and switches to it. */
export async function createWorkspaceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  const name = parseWorkspaceName(formData.get("name"));
  if (!name.ok) {
    return invalid(name.error, formData, "name");
  }
  const id = await createWorkspace(session.user.id, name.value);
  await useWorkspace(id);
  return redirectFromAction("/");
}
