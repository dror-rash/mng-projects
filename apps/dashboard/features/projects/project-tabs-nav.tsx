import { cn } from "@repo/ui/lib/utils";
import Link from "next/link";

import { type ProjectTab, projectTabPath } from "./project-tabs";

/** A tab's link text, translated by the page. */
export type ProjectTabLink = { tab: ProjectTab; label: string };

/**
 * The project page's tabs (task 122): a navigation named `label` ("Project sections") with a link per tab to its
 * own address (`?tab=…`), the open one `aria-current="page"`. Links rather than the ARIA tab widget: each tab is
 * its own server-rendered page. On a narrow screen the row scrolls inside itself, never the page; right to left
 * in Hebrew from the page's direction.
 */
export function ProjectTabs({
  projectId,
  open,
  tabs,
  label,
}: {
  projectId: string;
  open: ProjectTab;
  tabs: ProjectTabLink[];
  label: string;
}) {
  return (
    <nav aria-label={label} className="overflow-x-auto border-b">
      <ul className="flex w-max min-w-full gap-1">
        {tabs.map(({ tab, label: text }) => {
          const isOpen = tab === open;
          return (
            <li key={tab}>
              <Link
                href={projectTabPath(projectId, tab)}
                aria-current={isOpen ? "page" : undefined}
                className={cn(
                  "-mb-px block whitespace-nowrap border-b-2 px-3 py-2 text-sm",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                  isOpen
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
                )}
              >
                {text}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
