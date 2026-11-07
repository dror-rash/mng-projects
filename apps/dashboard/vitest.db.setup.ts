import path from "node:path";

import { loadEnvConfig } from "@next/env";

// The repo-root .env, like the seed script; variables already set (a lane's) win.
loadEnvConfig(path.join(__dirname, "../.."));
