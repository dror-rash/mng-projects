import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { ClockAlertIcon } from "@repo/ui/icons";
import Link from "next/link";

import type { NeedsActionGroup } from "./needs-action";
import type { WhoseMove } from "./stage-checklist";
import { WhoseMoveBadge } from "./whose-move-badge";

/** A project as "Needs action" lists it, its text translated by the page. */
export type NeedsActionItem = {
  id: string;
  name: string;
  organizationId: string;
  /** Null when the user may not see it. */
  customerName: string | null;
  stageLabel: string;
  /** "N days" waited. */
  daysText: string;
  /** Whose move it is when the group's name doesn't say it (Ready for next stage under Our move), else null. */
  badge: { move: WhoseMove; label: string } | null;
};

export type NeedsActionList = { group: NeedsActionGroup; label: string; items: NeedsActionItem[]; more: boolean };

export type NeedsActionText = { heading: string; empty: string; viewAll: string };

/**
 * "Needs action" on the overview (task 124): a region with a region per group that has projects (Our move, Waiting
 * for customer), each named by its heading and listing the projects that waited too long, longest first (the page
 * orders and limits them), then a link to the board when there are more. The page passes the translated text.
 */
export function NeedsActionSection({
  groups,
  text,
  linkCustomers = true,
}: {
  groups: NeedsActionList[];
  text: NeedsActionText;
  /** Off for a partner's users, who see customer names but no customer pages. */
  linkCustomers?: boolean;
}) {
  const listed = groups.filter((g) => g.items.length > 0);
  return (
    <section aria-labelledby="needs-action" className="space-y-4">
      <h2 id="needs-action" className="text-xl font-semibold tracking-tight">
        {text.heading}
      </h2>
      {listed.length === 0 ? (
        <Card className="border-dashed p-6 text-center text-muted-foreground">{text.empty}</Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {listed.map((group) => (
            <Card key={group.group} role="region" aria-labelledby={`needs-action-${group.group}`}>
              <CardHeader className="pb-2">
                <CardTitle id={`needs-action-${group.group}`} className="text-base">
                  {group.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="divide-y">
                  {group.items.map((item) => (
                    <li key={item.id} className="py-2 first:pt-0 last:pb-0">
                      <Entry item={item} linkCustomers={linkCustomers} />
                    </li>
                  ))}
                </ul>
                {group.more && (
                  <Link href="/projects?view=board" className="text-sm font-medium underline">
                    {text.viewAll}
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function Entry({ item, linkCustomers }: { item: NeedsActionItem; linkCustomers: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
      <div className="flex min-w-0 flex-col">
        <Link href={`/projects/${item.id}`} className="font-medium hover:underline">
          {item.name}
        </Link>
        <span className="text-xs text-muted-foreground">
          {item.customerName &&
            (linkCustomers ? (
              <Link href={`/customers/${item.organizationId}`} className="hover:underline">
                {item.customerName}
              </Link>
            ) : (
              item.customerName
            ))}
          {item.customerName && " · "}
          {item.stageLabel}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {item.badge && <WhoseMoveBadge move={item.badge.move} label={item.badge.label} />}
        <span className="flex items-center gap-1 text-xs font-medium text-destructive">
          <ClockAlertIcon className="size-3.5" aria-hidden />
          {item.daysText}
        </span>
      </div>
    </div>
  );
}
