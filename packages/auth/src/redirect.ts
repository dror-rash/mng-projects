type OriginInput = {
  configured?: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  fallbackOrigin: string;
};

const first = (value?: string | null) => value?.split(",")[0]?.trim() || undefined;

export function resolvePublicOrigin({ configured, forwardedHost, forwardedProto, fallbackOrigin }: OriginInput): string {
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // ignore a malformed value and fall through
    }
  }
  const host = first(forwardedHost);
  if (host) {
    const proto = first(forwardedProto);
    const scheme = proto === "http" || proto === "https" ? proto : new URL(fallbackOrigin).protocol.replace(":", "");
    return `${scheme}://${host}`;
  }
  return fallbackOrigin;
}

const SAFE_NEXT_ORIGIN = "https://safe-next.invalid";

const hasUnsafeChar = (value: string) =>
  [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code <= 0x1f || code === 0x7f || char === "\\";
  });

const sameOrigin = (path: string) => {
  try {
    return new URL(path, SAFE_NEXT_ORIGIN).origin === SAFE_NEXT_ORIGIN;
  } catch {
    return false;
  }
};

/**
 * The post-login target for `next`, or `fallback`. Only same-origin paths are accepted: the result,
 * resolved against any origin, stays on that origin. It is the normalized path + query + hash.
 */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || hasUnsafeChar(next) || !sameOrigin(next)) return fallback;
  const { pathname, search, hash } = new URL(next, SAFE_NEXT_ORIGIN);
  const path = `${pathname}${search}${hash}`;
  return path.startsWith("/") && !path.startsWith("//") && sameOrigin(path) ? path : fallback;
}

export function loginUrl(next: string, loginPath = "/login"): string {
  return `${loginPath}?next=${encodeURIComponent(next)}`;
}
