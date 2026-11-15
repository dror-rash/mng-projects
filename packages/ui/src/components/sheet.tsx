"use client";

import * as SheetPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import * as React from "react";

import { cn } from "../lib/utils";

/**
 * shadcn Sheet (on the Radix dialog): a panel over the page. Focus stays inside while it is open, Escape
 * and the close button close it, and focus goes back to the control that opened it. Sides are logical, so
 * `side="start"` opens from the left in English and from the right in Hebrew.
 */
function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

const SIDES = {
  start: "inset-y-0 start-0 h-full w-3/4 max-w-xs border-e",
  end: "inset-y-0 end-0 h-full w-3/4 max-w-xs border-s",
  top: "inset-x-0 top-0 h-auto border-b",
  bottom: "inset-x-0 bottom-0 h-auto border-t",
} as const;

function SheetContent({
  className,
  children,
  side = "start",
  closeLabel = "Close",
  closeClassName,
  showClose = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: keyof typeof SIDES;
  /** The close button's accessible name (translated by the caller). */
  closeLabel?: string;
  closeClassName?: string;
  /** Off when the content places its own `SheetClose`. */
  showClose?: boolean;
}) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay data-slot="sheet-overlay" className="fixed inset-0 z-50 bg-black/50" />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        // No description: the title names the panel and its content speaks for itself.
        aria-describedby={undefined}
        className={cn("fixed z-50 flex flex-col gap-4 bg-background shadow-lg", SIDES[side], className)}
        {...props}
      >
        {children}
        {showClose && (
          <SheetPrimitive.Close
            className={cn(
              "absolute end-3 top-3 rounded-sm p-1 opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              closeClassName,
            )}
          >
            <XIcon aria-hidden="true" className="size-4" />
            <span className="sr-only">{closeLabel}</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-1.5 p-4", className)} {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn("font-semibold", className)} {...props} />;
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description data-slot="sheet-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger };
