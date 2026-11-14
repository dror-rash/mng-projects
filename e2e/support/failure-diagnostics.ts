// What a failed scenario's page showed, for the CI log of a deployed run (task 114). The preview job keeps
// traces off (the repository is public), so this short text is all there is to diagnose a failure with.
// It holds the URL, the visible headings and the error texts: never field values, cookies or invite tokens.

export type PageSnapshot = { url: string; headings: string[]; errors: string[] };

/** Query parameters whose values can be secrets (password reset, verification, invites). */
const SECRET_PARAM = /token|secret|code|password|key/i;
const REDACTED = "[redacted]";
const MAX_TEXT = 80;

/** An invite link's token, wherever the link appears in `text`. */
function redactInvite(text: string) {
  return text.replace(/\/invite\/[^/?#&]+/g, `/invite/${REDACTED}`);
}

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
  url.pathname = redactInvite(url.pathname);
  // Values come decoded, so a return path (`next=%2Fdashboard%2Finvite%2F<token>`) is redacted too.
  const query = new URLSearchParams(
    [...url.searchParams].map(([name, value]) => [name, SECRET_PARAM.test(name) ? REDACTED : redactInvite(value)]),
  ).toString();
  return `${url.pathname}${query ? `?${query}` : ""}`;
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
