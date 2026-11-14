// What a failed scenario's page showed, for the CI log of a deployed run (task 114). The preview job keeps
// traces off (the repository is public), so this short text is all there is to diagnose a failure with.
// It holds the URL, the visible headings and the error texts: never field values, cookies or invite tokens.

export type PageSnapshot = { url: string; headings: string[]; errors: string[] };

/** Query parameters whose values can be secrets (password reset, verification, invites). */
const SECRET_PARAM = /token|secret|code|password|key/i;
const REDACTED = "[redacted]";
const MAX_TEXT = 80;

/** The URL's path and query, without the origin, invite tokens or secret-looking query values. */
export function redactUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  if (!url.pathname.startsWith("/")) {
    return raw;
  }
  url.pathname = url.pathname.replace(/\/invite\/[^/]+/, `/invite/${REDACTED}`);
  for (const name of [...url.searchParams.keys()]) {
    if (SECRET_PARAM.test(name)) url.searchParams.set(name, REDACTED);
  }
  return `${url.pathname}${url.search}`;
}

function shorten(text: string) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_TEXT ? `${flat.slice(0, MAX_TEXT - 1)}…` : flat;
}

function list(texts: string[]) {
  const shown = texts.map(shorten).filter(Boolean);
  return shown.length > 0 ? shown.join(" | ") : "none";
}

/** Three lines: the page's URL, its visible headings and its error texts. */
export function describePage(snapshot: PageSnapshot): string {
  return [`URL: ${redactUrl(snapshot.url)}`, `Headings: ${list(snapshot.headings)}`, `Errors: ${list(snapshot.errors)}`].join("\n");
}
