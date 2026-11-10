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
    // Must be identical in every zone, or one zone can't read another's cookie.
    advanced: { useSecureCookies: env.NODE_ENV === "production" },
  } satisfies BetterAuthOptions;
}
