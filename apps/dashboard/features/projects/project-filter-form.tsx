"use client";

import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { NativeSelect } from "@repo/ui/native-select";
import Form from "next/form";

import type { ProjectFilters } from "./project-filters";
import { PROJECT_STATUSES } from "./project-status";

type CustomerOption = { id: string; name: string };
type StageOption = { value: string; label: string };

/**
 * The All projects filters as a GET form, so they live in the URL. Selects and the checkbox apply on
 * change; search applies on Enter. Apply submits everything (and is all there is without JavaScript).
 * The page keys this form on the filters, so its fields reset when a link changes them. The view and
 * the sort (`sortParams`, from the column headers) ride along as hidden fields.
 */
export function ProjectFilterForm({
  filters,
  sortParams,
  customers,
  stages,
}: {
  filters: ProjectFilters;
  sortParams: Record<string, string>;
  customers: CustomerOption[];
  /** Every stage in order, translated (task 101). */
  stages: StageOption[];
}) {
  const applyNow = (event: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => event.currentTarget.form?.requestSubmit();

  return (
    <Form action="/projects" role="search" aria-label="Filter projects" className="flex flex-wrap items-end gap-3">
      {filters.view === "tiles" && <input type="hidden" name="view" value="tiles" />}
      {Object.entries(sortParams).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="space-y-1">
        <label htmlFor="q" className="text-sm font-medium">Search projects</label>
        <Input id="q" name="q" type="search" placeholder="Project name" defaultValue={filters.q ?? ""} className="w-56" />
      </div>
      <div className="space-y-1">
        <label htmlFor="customer" className="text-sm font-medium">Customer</label>
        <NativeSelect id="customer" name="customer" defaultValue={filters.customer ?? ""} onChange={applyNow}>
          <option value="">Any customer</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <label htmlFor="status" className="text-sm font-medium">Status</label>
        <NativeSelect id="status" name="status" defaultValue={filters.status ?? ""} onChange={applyNow}>
          <option value="">Any status</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s.status} value={s.status}>{s.label}</option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <label htmlFor="stage" className="text-sm font-medium">Stage</label>
        <NativeSelect id="stage" name="stage" defaultValue={filters.stage ?? ""} onChange={applyNow}>
          <option value="">Any stage</option>
          {stages.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </NativeSelect>
      </div>
      <label className="flex h-9 items-center gap-2 text-sm">
        <input type="checkbox" name="overdue" value="1" defaultChecked={filters.overdue} onChange={applyNow} className="size-4" />
        Overdue only
      </label>
      <Button type="submit" variant="outline">Apply</Button>
    </Form>
  );
}
