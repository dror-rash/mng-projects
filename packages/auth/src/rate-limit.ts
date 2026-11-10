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

/**
 * The client address the rate limit counts by (`advanced.ipAddress`): `x-forwarded-for`, and no other header.
 * Cloud Run appends the address it sees to whatever x-forwarded-for the client sent, so only the rightmost
 * value can be believed. With trusted proxies set, Better Auth walks the header from the right and takes the
 * first address that isn't one of them; loopback is never a Cloud Run client, so that is the rightmost value
 * (a spoofed prefix can't pick the bucket or fill a shared one). This assumes Cloud Run's front end is the only
 * hop: revisit when a load balancer is added in front (SEC-20), whose own address would then be rightmost.
 */
export function addressOptions(): { ipAddress: { ipAddressHeaders: string[]; trustedProxies: string[] } } {
  return { ipAddress: { ipAddressHeaders: ["x-forwarded-for"], trustedProxies: ["127.0.0.1/32"] } };
}
