// TypeScript 6 checks side-effect imports (`noUncheckedSideEffectImports`), and Next 15's
// types only declare CSS modules. This lets the root layout import its global stylesheet.
declare module "*.css";
