import { Button } from "@repo/ui/button";
import { FilterChip } from "@repo/ui/filter-chip";
import Link from "next/link";
import { notFound } from "next/navigation";

import { canChangeCustomers, canSeeCustomers } from "@/features/access/scope";
import { AppFrame } from "@/features/layout/app-frame";
import { firstParam, withParams } from "@/features/navigation/search-params";
import { CustomersTable } from "@/features/organizations/customers-table";
import { ORGANIZATION_STATUSES, parseOrganizationStatus } from "@/features/organizations/organization-kinds";
import { listTopLevelCustomers, listTopLevelCustomerTags } from "@/features/organizations/queries";
import { sameTag } from "@/features/organizations/tag-list";
import { requireWorkspace } from "@/features/workspaces/require-workspace";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const status = parseOrganizationStatus(firstParam(params.status)) ?? undefined;
  const tag = firstParam(params.tag);
  // Each filter link changes its own filter and keeps the other one.
  const link = (next: { status?: string; tag?: string }) => withParams("/customers", { status, tag, ...next });
  const { session, workspace } = await requireWorkspace(link({}));
  // A partner's users see customer names only, never customer pages (row-level security hides them too).
  if (!canSeeCustomers(workspace.role)) {
    notFound();
  }

  const [customers, tags] = await Promise.all([
    listTopLevelCustomers(session.user.id, workspace.id, { status, tag }),
    listTopLevelCustomerTags(session.user.id, workspace.id),
  ]);

  return (
    <AppFrame email={session.user.email} name={session.user.name} role={workspace.role} workspaceName={workspace.name} className="max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
        {canChangeCustomers(workspace.role) && (
          <Button asChild>
            <Link href="/customers/new">New customer</Link>
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
          <FilterChip selected={!status}>
            <Link href={link({ status: undefined })}>All statuses</Link>
          </FilterChip>
          {ORGANIZATION_STATUSES.map((s) => (
            <FilterChip key={s.status} selected={status === s.status}>
              <Link href={link({ status: s.status })}>{s.label}</Link>
            </FilterChip>
          ))}
        </nav>
        {(tags.length > 0 || tag) && (
          <nav aria-label="Filter by tag" className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Tags:</span>
            <FilterChip selected={!tag}>
              <Link href={link({ tag: undefined })}>Any tag</Link>
            </FilterChip>
            {tags.map((t) => (
              <FilterChip key={t} selected={sameTag(tag, t)}>
                <Link href={link({ tag: t })}>{t}</Link>
              </FilterChip>
            ))}
            {/* A filter from an old link or a typo still shows, so it can be seen and cleared. */}
            {tag && !tags.some((t) => sameTag(tag, t)) && (
              <FilterChip selected>
                <Link href={link({ tag })}>{tag}</Link>
              </FilterChip>
            )}
          </nav>
        )}
      </div>

      {/* Top-level customers only; sub-companies are on their parent's page (task 072). */}
      <CustomersTable customers={customers} filtered={Boolean(status || tag)} canAdd={canChangeCustomers(workspace.role)} />
    </AppFrame>
  );
}
