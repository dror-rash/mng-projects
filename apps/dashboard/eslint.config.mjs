import config, { restrictedImports } from "@repo/config/eslint.mjs";

export default [
  ...config,
  // Seeds write past row-level security through the maintenance connection.
  { files: ["scripts/**/*.ts"], rules: restrictedImports({ allowMaintenance: true }) },
  // Database tests set up their rows the same way.
  { files: ["features/**/*.db.test.ts"], rules: restrictedImports({ allowMaintenance: true }) },
];
