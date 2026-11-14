/** This zone's basePath (`next.config.ts`). */
const BASE_PATH = "/dashboard";

/**
 * `path` (a path of this zone, as `redirect()` and `<Link>` take it) as the browser sees it: under the
 * basePath. For URLs Next doesn't prefix itself: absolute redirects, a plain form post's `Location`.
 */
export function withBasePath(path: string) {
  return `${BASE_PATH}${path === "/" ? "" : path}`;
}
