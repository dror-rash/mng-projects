import { getPoolDb, schema } from "@repo/db";
import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { rateLimitOptions } from "./rate-limit";

type Env = Record<string, string | undefined>;

/**
 * Better Auth's options for every zone, from `env`. Separate from `server.ts` (which adds the Next.js
 * plugin) so database tests can build several instances with the same settings.
 */
export function authOptions(env: Env) {
  // Preview deploys have unpredictable *.run.app hosts; only they set ALLOW_PREVIEW_ORIGINS.
  const allowPreviewOrigins = env.ALLOW_PREVIEW_ORIGINS === "true";

  return {
    // The pool, never a request's `withAccess` transaction: the adapter keeps what it is given, and
    // getAuth() may first run inside one. Auth tables have grants and no row-level security.
    database: drizzleAdapter(getPoolDb(), { provider: "pg", schema }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: allowPreviewOrigins ? ["https://*.run.app", "https://*.a.run.app"] : [],
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    ...rateLimitOptions(env),
    advanced: {
      // Must be identical in every zone, or one zone can't read another's cookie.
      useSecureCookies: env.NODE_ENV === "production",
      // The client address the rate limit counts by: the header Cloud Run sets, and no other. Better Auth trusts
      // it only with a single value; with several (a client sending its own, which Cloud Run appends to) it
      // can't tell which to believe and counts the request in one bucket shared by all such requests on that
      // path (review SEC-10). No trusted proxies: a future load balancer's format is SEC-20's.
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
  } satisfies BetterAuthOptions;
}
