import { SignOutButton } from "@repo/auth/components";
import type { Locale } from "@repo/i18n";
import { ChevronsUpDownIcon } from "@repo/ui/icons";
import { LanguageSwitch } from "@repo/ui/language-switch";
import { Sidebar, SidebarPanel, SidebarTopBar } from "@repo/ui/sidebar";
import { SidebarDrawer } from "@repo/ui/sidebar-drawer";
import type { Theme } from "@repo/ui/theme";
import { ThemeToggle } from "@repo/ui/theme-toggle";
import Link from "next/link";

import { type WorkspaceRole, workspaceRoleLabel } from "@/features/access/roles";

import { initials } from "./initials";
import type { NavItem } from "./nav";
import { SidebarNav } from "./sidebar-nav";

export type AppSidebarProps = {
  email: string;
  /** My name, for the avatar's initials (the email's first letter without one). */
  name?: string | null;
  /** Mine in the current workspace: the nav links go there (`navFor`) and the badge shows it. */
  role: WorkspaceRole;
  /** The workspace of what the page shows: a record's own workspace on record pages. */
  workspaceName: string;
  /** The record isn't in the current workspace: the switcher says so under the name, without my role. */
  otherWorkspace?: boolean;
};

/** The "W" (Waypoint) mark on the accent. */
function Mark() {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent font-bold text-sidebar-accent-foreground"
    >
      W
    </span>
  );
}

export type SidebarMenuProps = AppSidebarProps & {
  /** Translated menu items. */
  items: (NavItem & { label: string })[];
  theme: Theme;
  locale: Locale;
  labels: { menu: string; language: string; openMenu: string; closeMenu: string };
};

/**
 * The dashboard's side menu (task 119), from what the page and the server already read: the fixed column
 * from `lg` up, and below it the top bar whose button opens the same menu in a drawer. Top: the workspace
 * switcher (a link to /workspaces); middle: the nav; bottom: my account and its controls.
 */
export function SidebarMenu({ email, name, role, workspaceName, otherWorkspace = false, items, theme, locale, labels }: SidebarMenuProps) {
  const switcher = (
    <Link
      href="/workspaces"
      aria-label={`${workspaceName}: switch workspace`}
      title={`${workspaceName}: switch workspace`}
      className="flex items-center gap-2 rounded-md p-1 hover:bg-sidebar-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
    >
      <Mark />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">{workspaceName}</span>
        {otherWorkspace && <span className="truncate text-xs text-sidebar-muted">in another workspace</span>}
        {/* My role is the current workspace's; on another workspace's record it would mislabel that one. */}
        {!otherWorkspace && <span className="text-xs text-sidebar-muted">{workspaceRoleLabel(role)}</span>}
      </span>
      <ChevronsUpDownIcon aria-hidden="true" className="size-4 shrink-0 text-sidebar-muted" />
    </Link>
  );

  const account = (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-border text-xs font-semibold"
        >
          {initials(name, email)}
        </span>
        <span className="min-w-0 truncate text-sm text-sidebar-muted" title={email}>
          {email}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <LanguageSwitch locale={locale} label={labels.language} />
        <ThemeToggle theme={theme} />
      </div>
      <SignOutButton />
    </div>
  );

  const panel = (
    <SidebarPanel top={switcher} bottom={account}>
      <SidebarNav items={items} />
    </SidebarPanel>
  );

  return (
    <>
      <Sidebar label={labels.menu}>{panel}</Sidebar>
      <SidebarTopBar>
        <SidebarDrawer openLabel={labels.openMenu} closeLabel={labels.closeMenu} title={labels.menu}>
          {panel}
        </SidebarDrawer>
        <Mark />
        <span className="min-w-0 truncate text-sm font-semibold">{workspaceName}</span>
      </SidebarTopBar>
    </>
  );
}
