import { getTranslations } from "next-intl/server";

import type { ProjectTab } from "@/features/projects/project-tabs";

/**
 * The Sales and Billing tabs until they have sections (task 122): a line saying what will show there (work orders
 * and quotes, tasks 106–107 and M16; bills, M19).
 */
export async function LaterTab({ tab }: { tab: Extract<ProjectTab, "sales" | "billing"> }) {
  const t = await getTranslations("projectTabs");
  return <p className="text-sm text-muted-foreground">{t(tab === "sales" ? "salesLater" : "billingLater")}</p>;
}
