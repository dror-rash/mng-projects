import { Slot, Slottable } from "@radix-ui/react-slot";
import * as React from "react";

import { cn } from "../lib/utils";

/*
 * The side menu (task 119): a fixed 236px column on the inline-start side from `lg` up; below `lg` a top bar
 * whose menu button opens the same panel in a drawer from the start side. Logical classes only, so the menu
 * mirrors in right-to-left pages. Colors come from the `--sidebar-*` tokens.
 */

/**
 * The charcoal surface: maps the shared tokens to the `--sidebar-*` ones inside the menu, so controls built
 * for the page (the language switch, the theme toggle, the log out button) read right on it unchanged.
 */
export const sidebarSurface = cn(
  "bg-sidebar text-sidebar-foreground",
  "[--background:var(--sidebar)] [--foreground:var(--sidebar-foreground)] [--muted-foreground:var(--sidebar-muted)]",
  "[--secondary:var(--sidebar-border)] [--secondary-foreground:var(--sidebar-foreground)] [--border:var(--sidebar-border)]",
  "[--ring:var(--sidebar-ring)]",
);

export const sidebarFocusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring";

/** The fixed column on wide screens (hidden below `lg`, where `SidebarTopBar` and `SidebarDrawer` take over). */
function Sidebar({ label, className, children }: { label?: string; className?: string; children: React.ReactNode }) {
  return (
    <aside
      aria-label={label}
      data-slot="sidebar"
      className={cn(
        "fixed inset-y-0 start-0 z-30 hidden w-59 border-e border-sidebar-border lg:flex",
        sidebarSurface,
        className,
      )}
    >
      {children}
    </aside>
  );
}

/** The menu's three parts: the top (workspace), the middle (nav) and the bottom (account). */
function SidebarPanel({
  top,
  bottom,
  className,
  children,
}: {
  top?: React.ReactNode;
  bottom?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-slot="sidebar-panel" className={cn("flex h-full min-h-0 w-full flex-col", className)}>
      {top && <div className="border-b border-sidebar-border p-3">{top}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
      {bottom && <div className="border-t border-sidebar-border p-3">{bottom}</div>}
    </div>
  );
}

type SidebarLinkProps = React.ComponentProps<"a"> & {
  /** Marks the page I'm on (`aria-current="page"` and the accent fill). */
  current?: boolean;
  /** Decorative: hidden from assistive technology, the text names the link. */
  icon?: React.ReactNode;
  /** Renders the child element (e.g. a framework link) instead of an `<a>`. */
  asChild?: boolean;
};

/** One menu item: icon and label; the current page gets the accent fill. */
function SidebarLink({ current = false, icon, asChild = false, className, children, ...props }: SidebarLinkProps) {
  const Comp = asChild ? Slot : "a";
  return (
    <Comp
      data-slot="sidebar-link"
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-border",
        "aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground",
        sidebarFocusRing,
        className,
      )}
      {...props}
    >
      {icon && (
        <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-4">
          {icon}
        </span>
      )}
      <Slottable>{children}</Slottable>
    </Comp>
  );
}

/** The phone top bar (below `lg`): the menu button, the mark and the workspace name. */
function SidebarTopBar({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      data-slot="sidebar-top-bar"
      className={cn(
        "sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-sidebar-border px-3 lg:hidden",
        sidebarSurface,
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The page beside the menu: room for the fixed column on wide screens. */
function SidebarInset({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex min-w-0 flex-col lg:ps-59", className)}>{children}</div>;
}

export { Sidebar, SidebarInset, SidebarLink, SidebarPanel, SidebarTopBar };
