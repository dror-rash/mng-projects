import type { WorkspaceRole } from "@/features/access/roles";
import { canSeeCustomers } from "@/features/access/scope";

/** `labelKey` is a key in the `nav` messages (ADR-0011): the header translates it. */
export type NavItem = { href: string; labelKey: "overview" | "allProjects" | "customers" };

const NAV: readonly NavItem[] = [
  { href: "/", labelKey: "overview" },
  { href: "/projects", labelKey: "allProjects" },
  { href: "/customers", labelKey: "customers" },
];

/**
 * The dashboard menu for my role (task 070): Overview and All projects, plus Customers for admins and
 * auditors (`canSeeCustomers`). Partners, My tasks and Deleted are out of the menu but open by address.
 */
export function navFor(role: WorkspaceRole): NavItem[] {
  return canSeeCustomers(role) ? [...NAV] : NAV.filter((item) => item.href !== "/customers");
}

/**
 * The menu item for the page at `pathname` (inside the zone, without `/dashboard`), task 119: Overview on
 * the overview only; any other item on its own address and everything under it (a project, its tasks and
 * visits). Pages outside the menu (sites, My tasks, Forms, Partners, Deleted, workspaces) get none.
 */
export function currentNavItem(pathname: string, items: readonly NavItem[]): NavItem | undefined {
  return items.find((item) =>
    item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
