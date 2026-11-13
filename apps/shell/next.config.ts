import path from "node:path";

import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Load the repo-root .env for local dev (apps don't read it by default in a monorepo).
loadEnvConfig(path.join(__dirname, "../../"), process.env.NODE_ENV !== "production", undefined, true);

// NOTE: rewrites are evaluated at BUILD time, so EXAMPLE_ZONE_URL must be present when
// `next build` runs (the Dockerfile and CI pass it as a build arg).
const exampleZone = process.env.EXAMPLE_ZONE_URL ?? "http://localhost:3001";
const dashboardZone = process.env.DASHBOARD_ZONE_URL ?? "http://localhost:3002";

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@repo/ui", "@repo/auth", "@repo/db", "@repo/i18n"],
  // The shell is the default zone: it serves "/", owns /login, /signup and /api/auth,
  // and proxies other zones by path.
  async rewrites() {
    return [
      { source: "/example", destination: `${exampleZone}/example` },
      { source: "/example/:path+", destination: `${exampleZone}/example/:path+` },
      { source: "/dashboard", destination: `${dashboardZone}/dashboard` },
      { source: "/dashboard/:path+", destination: `${dashboardZone}/dashboard/:path+` },
    ];
  },
};

// Messages per request from i18n/request.ts (ADR-0011).
export default createNextIntlPlugin("./i18n/request.ts")(config);
