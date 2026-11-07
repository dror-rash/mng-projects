// Sign-up and sign-in pacing for runs against a deployment (task 069). Better Auth allows 3 requests per
// 10 seconds per IP on /sign-up* and /sign-in*, counted from the last request, and deployments never turn the
// limit off (rule 13). So, when enabled, no request to one of those paths goes out within `gapMs` of the
// previous one to the same path. One timeline per process: the preview job runs one worker.

export type Clock = { now: () => number; sleep: (ms: number) => Promise<void> };

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** The rate-limited path of an auth request's URL ("/api/auth/sign-up/email"), or undefined for any other request. */
export function limitedPath(url: string): string | undefined {
  const { pathname } = new URL(url, "http://localhost");
  return /^\/api\/auth\/sign-(up|in)(\/|$)/.test(pathname) ? pathname : undefined;
}

export type Pacer = {
  /** Waits until `gapMs` have passed since the last request to `path`. */
  wait: (path: string) => Promise<void>;
  /** Records a request to `path` now (call it when the response is back: the server counted it by then). */
  record: (path: string) => void;
  /** Waits, sends, and records the request, even when it fails. */
  send: <T>(path: string, request: () => Promise<T>) => Promise<T>;
};

export function createPacer({ enabled, gapMs, clock = realClock }: { enabled: boolean; gapMs: number; clock?: Clock }): Pacer {
  const last = new Map<string, number>();
  const pacer: Pacer = {
    wait: async (path) => {
      if (!enabled) return;
      const previous = last.get(path);
      if (previous === undefined) return;
      const left = previous + gapMs - clock.now();
      if (left > 0) await clock.sleep(left);
    },
    record: (path) => {
      if (enabled) last.set(path, clock.now());
    },
    send: async (path, request) => {
      await pacer.wait(path);
      try {
        return await request();
      } finally {
        pacer.record(path);
      }
    },
  };
  return pacer;
}
