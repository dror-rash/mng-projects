import path from "node:path";

import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

loadEnvConfig(path.join(__dirname, "../../"), process.env.NODE_ENV !== "production", undefined, true);

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@repo/ui", "@repo/auth", "@repo/db", "@repo/storage", "@repo/i18n"],
  // basePath puts pages AND assets (/dashboard/_next/...) under one prefix, so the shell
  // only needs a single rewrite pair and assets never collide with other zones.
  basePath: "/dashboard",
  // Invite links carry a secret token (task 028): don't send it on in a Referer, and keep it out of
  // the dev server's request log. The join page (/invite, no token in its URL) uses "same-origin":
  // with "no-referrer" the browser sends `Origin: null` and Next rejects the server action.
  async headers() {
    return [
      { source: "/invite/:token", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/invite", headers: [{ key: "Referrer-Policy", value: "same-origin" }] },
    ];
  },
  logging: { incomingRequests: { ignore: [/\/invite\//] } },
};

// Messages per request from i18n/request.ts (ADR-0011).
export default createNextIntlPlugin("./i18n/request.ts")(config);
