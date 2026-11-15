import * as React from "react";

import { cn } from "../lib/utils";
import { ChartTooltip } from "./chart-tooltip";

/** A chart color slot (`--chart-1` … `--chart-5`). */
export type ChartSlot = 1 | 2 | 3 | 4 | 5;

/** `slot` names the segment's color; without it a segment takes the slot of its position. */
export type StackedBarSegment = { label: string; value: number; slot?: ChartSlot };

type StackedBarProps = Omit<React.ComponentProps<"figure">, "children"> & {
  /** Accessible name of the chart, e.g. "Tasks by status". */
  label: string;
  /** Up to five segments, colored by the slot they name, else in fixed order (chart-1 … chart-5). */
  segments: StackedBarSegment[];
  emptyText?: string;
};

// Fixed order, never cycled: validated as adjacent pairs for color-vision deficiency in light and dark.
const SEGMENT_COLORS = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];

const segmentColor = (segment: StackedBarSegment, index: number) => SEGMENT_COLORS[(segment.slot ?? index + 1) - 1];

/**
 * Part-to-whole in one bar. The legend repeats each value, so color is never the only cue.
 * Stays server-renderable: only the tooltip on each segment (focus, hover, tap) is a client island.
 */
function StackedBar({ label, segments, emptyText = "No data yet", className, ...props }: StackedBarProps) {
  if (segments.length > SEGMENT_COLORS.length) {
    throw new Error(`StackedBar supports at most ${SEGMENT_COLORS.length} segments; fold the rest into "Other".`);
  }
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <figure aria-label={label} className={cn("space-y-3", className)} {...props}>
      {total === 0 ? (
        <>
          <div className="h-3 rounded bg-muted" />
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        </>
      ) : (
        <div className="flex h-3 gap-0.5 rounded">
          {segments.map((segment, i) => {
            if (segment.value === 0) return null;
            const text = `${segment.label}: ${segment.value} (${Math.round((segment.value / total) * 100)}%)`;
            return (
              <ChartTooltip key={segment.label} content={text}>
                <div
                  data-segment
                  role="img"
                  aria-label={text}
                  tabIndex={0}
                  className={cn(
                    "h-full first:rounded-l last:rounded-r focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    segmentColor(segment, i),
                  )}
                  style={{ flexGrow: segment.value }}
                />
              </ChartTooltip>
            );
          })}
        </div>
      )}
      <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {segments.map((segment, i) => (
          <li key={segment.label} className="flex items-center gap-2">
            <span aria-hidden="true" className={cn("size-2.5 rounded-sm", segmentColor(segment, i))} />
            <span className="text-muted-foreground">{segment.label}</span>
            <span className="font-medium tabular-nums">{segment.value}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export { StackedBar };
