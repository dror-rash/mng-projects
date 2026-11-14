import { loginUrl, resolvePublicOrigin } from "@repo/auth/redirect";
import { getSession } from "@repo/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { withBasePath } from "@/features/navigation/base-path";

/**
 * The session (or null), looked up once per server render. Outside a render (in a server action) React's
 * `cache` doesn't memoize, so each call asks `@repo/auth` again.
 */
export const currentSession = cache(() => getSession());

/**
 * Returns the session, or sends the visitor to the shell's login page and back to `path` afterwards.
 * Redirects to an absolute URL: `redirect("/login")` would get this zone's basePath (`/dashboard/login`).
 */
export async function requireSession(path: string) {
  const session = await currentSession();
  if (session) return session;

  const h = await headers();
  const origin = resolvePublicOrigin({
    configured: process.env.BETTER_AUTH_URL,
    forwardedHost: h.get("x-forwarded-host"),
    forwardedProto: h.get("x-forwarded-proto"),
    fallbackOrigin: `http://${h.get("host") ?? "localhost"}`,
  });
  redirect(new URL(loginUrl(withBasePath(path)), origin).toString());
}

/**
 * For server actions: the session, or throws. Read it before opening `withAccess` (`@repo/db`), so an
 * action never holds a transaction's connection while it waits for another one.
 */
export async function requireActionSession() {
  const session = await currentSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}
