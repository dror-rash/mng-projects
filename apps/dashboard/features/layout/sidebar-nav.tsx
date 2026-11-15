"use client";

import { Building2Icon, FolderKanbanIcon, LayoutDashboardIcon } from "@repo/ui/icons";
import { SidebarLink } from "@repo/ui/sidebar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { currentNavItem, type NavItem } from "./nav";

const ICONS: Record<NavItem["labelKey"], ReactNode> = {
  overview: <LayoutDashboardIcon />,
  allProjects: <FolderKanbanIcon />,
  customers: <Building2Icon />,
};

/**
 * The menu's links (task 119). The only client part of the menu: it reads the address to mark the current
 * page (`currentNavItem`). Labels come translated from the server.
 */
export function SidebarNav({ items }: { items: (NavItem & { label: string })[] }) {
  // Null outside the Next router (Storybook): nothing is current.
  const current = currentNavItem(usePathname() ?? "", items);
  return (
    <nav aria-label="Dashboard" className="flex flex-col gap-1">
      {items.map((item) => (
        <SidebarLink key={item.href} asChild current={item.href === current?.href} icon={ICONS[item.labelKey]}>
          <Link href={item.href}>{item.label}</Link>
        </SidebarLink>
      ))}
    </nav>
  );
}
