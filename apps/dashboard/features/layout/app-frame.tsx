import { cn } from "@repo/ui/lib/utils";
import { SidebarInset } from "@repo/ui/sidebar";
import type { ReactNode } from "react";

import { AppSidebar, type AppSidebarProps } from "./app-sidebar";

/**
 * The frame of every dashboard page (task 119): the side menu on the start side (the drawer on a phone) and
 * the page's `<main>` beside it. Pages pass what they already read (session, workspace); `className` is for
 * `<main>` (its width and spacing).
 */
export function AppFrame({ className, children, ...menu }: AppSidebarProps & { className?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppSidebar {...menu} />
      <SidebarInset>
        <main className={cn("mx-auto w-full", className)}>{children}</main>
      </SidebarInset>
    </div>
  );
}
