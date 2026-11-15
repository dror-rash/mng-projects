"use client";

import { MenuIcon, XIcon } from "lucide-react";
import * as React from "react";

import { cn } from "../lib/utils";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "./sheet";
import { sidebarFocusRing as focusRing, sidebarSurface } from "./sidebar";

/**
 * The menu button and the drawer it opens (below `lg`), from the start side. Choosing a link inside closes
 * it; buttons (language, theme, log out) leave it open. `title` names the drawer for assistive technology.
 */
function SidebarDrawer({
  openLabel,
  closeLabel,
  title,
  defaultOpen = false,
  children,
}: {
  openLabel: string;
  closeLabel: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  // A plain click on a link opens the page here; a new tab or window (modifier keys, middle click) keeps the menu.
  function closeOnLink(event: React.MouseEvent) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("a[href]")) setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className={cn("-ms-1 rounded-md p-2 hover:bg-sidebar-border", focusRing)}>
        <MenuIcon aria-hidden="true" className="size-5" />
        <span className="sr-only">{openLabel}</span>
      </SheetTrigger>
      <SheetContent
        side="start"
        showClose={false}
        onClickCapture={closeOnLink}
        className={cn("w-59 max-w-[85vw] gap-0 border-sidebar-border", sidebarSurface)}
      >
        <div className="flex items-center justify-between gap-2 px-3 pt-3">
          <SheetTitle className="sr-only">{title}</SheetTitle>
          <SheetClose className={cn("ms-auto rounded-md p-2 hover:bg-sidebar-border", focusRing)}>
            <XIcon aria-hidden="true" className="size-5" />
            <span className="sr-only">{closeLabel}</span>
          </SheetClose>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

export { SidebarDrawer };
