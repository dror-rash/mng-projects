import { Slot } from "@radix-ui/react-slot";
import * as React from "react";

import { cn } from "../lib/utils";

type FilterChipProps = React.ComponentProps<typeof Slot> & { selected?: boolean };

/**
 * A pill for one value in a set of filters. Wraps its child (a link) so routing stays with the app.
 * The selected chip gets aria-current="true": one of a set, not "the current page".
 */
export function FilterChip({ selected = false, className, ...props }: FilterChipProps) {
  return (
    <Slot
      aria-current={selected ? "true" : undefined}
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-sm hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-primary bg-primary text-primary-foreground hover:bg-primary-hover",
        className,
      )}
      {...props}
    />
  );
}
