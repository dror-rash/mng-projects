/**
 * Better Auth rate-limits sign-up/sign-in in production (its defaults: 3 requests per 10 seconds per client
 * address and path). The counts live in the database (`rate_limit`, task 089), so every server instance shares
 * one budget; Better Auth's in-memory default gives each Cloud Run instance its own.
 *
 * Acceptance tests run production builds and sign up many accounts from one IP, so the test servers (only) set
 * AUTH_DISABLE_RATE_LIMIT=true. Never set it in a deployed environment.
 */
export function rateLimitOptions(
  env: Record<string, string | undefined>,
): { rateLimit: { enabled: false } | { storage: "database" } } {
  return env.AUTH_DISABLE_RATE_LIMIT === "true" ? { rateLimit: { enabled: false } } : { rateLimit: { storage: "database" } };
}
