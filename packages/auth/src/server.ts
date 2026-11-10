import { betterAuth } from "better-auth";
import { nextCookies, toNextJsHandler } from "better-auth/next-js";
import { headers } from "next/headers";

import { authOptions } from "./options";

function createAuth() {
  const options = authOptions(process.env);
  return betterAuth({
    ...options,
    plugins: [...options.plugins, nextCookies()], // keep last
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;

/** Lazy so builds don't need secrets or a database. Every zone shares the same DB + secret. */
export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}

/** The current session (or null). Always check this in server code; middleware is only a fast path. */
export async function getSession() {
  // Read headers FIRST. In Next, awaiting headers() is what marks the page as dynamic and stops it
  // being prerendered at build time. If getAuth() ran first, a build without DB env would crash.
  const requestHeaders = await headers();
  return getAuth().api.getSession({ headers: requestHeaders });
}

/** Mount in the zone that owns /api/auth (the shell): `export const { GET, POST } = authRouteHandlers();` */
export function authRouteHandlers() {
  return {
    GET: (request: Request) => toNextJsHandler(getAuth()).GET(request),
    POST: (request: Request) => toNextJsHandler(getAuth()).POST(request),
  };
}
