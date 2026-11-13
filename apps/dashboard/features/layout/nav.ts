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
