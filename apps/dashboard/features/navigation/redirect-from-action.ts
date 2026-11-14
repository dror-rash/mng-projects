import { headers } from "next/headers";
import { redirect } from "next/navigation";

const BASE_PATH = "/dashboard";

/**
 * Ends a server action with a redirect to `path`, a path in this zone without the basePath (`/sites/<id>`).
 * Use it instead of `redirect()` in every action that redirects (task 114).
 *
 * The client router adds the basePath to an action's redirect. A form posted before React hydrates (a slow
 * phone, or a page loaded again after a failed client navigation) is a plain form post, and Next 15 answers
 * it with `Location: <path>` as given: without the basePath the browser lands on the shell's 404, after
 * the action has already saved. Such a post has no `Next-Action` header (the client router sends one), so
 * it gets the full path here.
 */
export async function redirectFromAction(path: string): Promise<never> {
  const fromClientRouter = (await headers()).has("next-action");
  redirect(fromClientRouter ? path : `${BASE_PATH}${path === "/" ? "" : path}`);
}
