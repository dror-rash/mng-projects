import type { getProjectForUser } from "@/features/projects/queries";

/** The project the page shows, as `getProjectForUser` returns it. */
export type PageProject = NonNullable<Awaited<ReturnType<typeof getProjectForUser>>>;
