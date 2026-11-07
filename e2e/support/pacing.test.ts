import { describe, expect, it } from "vitest";

import { type Clock, createPacer, limitedPath } from "./pacing";

/** A clock that only moves when the code under test sleeps; it keeps every sleep. */
function fakeClock(start = 1_000_000): Clock & { sleeps: number[] } {
  let now = start;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
  };
}

const SIGN_UP = "/api/auth/sign-up/email";
const SIGN_IN = "/api/auth/sign-in/email";

describe("limitedPath", () => {
  it("returns the path of sign-up and sign-in requests", () => {
    expect(limitedPath("https://preview.example/api/auth/sign-up/email")).toBe(SIGN_UP);
    expect(limitedPath("http://localhost:3010/api/auth/sign-in/email?x=1")).toBe(SIGN_IN);
    expect(limitedPath(SIGN_UP)).toBe(SIGN_UP);
  });

  it("returns undefined for other requests", () => {
    expect(limitedPath("https://preview.example/api/auth/get-session")).toBeUndefined();
    expect(limitedPath("https://preview.example/signup")).toBeUndefined();
    expect(limitedPath("https://preview.example/api/auth/sign-out")).toBeUndefined();
  });
});

describe("createPacer", () => {
  it("never waits when it is not enabled", async () => {
    const clock = fakeClock();
    const pacer = createPacer({ enabled: false, gapMs: 11_000, clock });
    await pacer.send(SIGN_UP, async () => "first");
    await pacer.send(SIGN_UP, async () => "second");
    expect(clock.sleeps).toEqual([]);
  });

  it("sends the first request to a path without waiting", async () => {
    const clock = fakeClock();
    const pacer = createPacer({ enabled: true, gapMs: 11_000, clock });
    expect(await pacer.send(SIGN_UP, async () => "sent")).toBe("sent");
    expect(clock.sleeps).toEqual([]);
  });

  it("waits until the gap has passed since the previous request to the same path", async () => {
    const clock = fakeClock();
    const pacer = createPacer({ enabled: true, gapMs: 11_000, clock });
    await pacer.send(SIGN_UP, async () => undefined);
    await clock.sleep(3_000); // the scenario does something else for 3 seconds
    await pacer.send(SIGN_UP, async () => undefined);
    expect(clock.sleeps).toEqual([3_000, 8_000]);
  });

  it("doesn't wait when the gap has already passed", async () => {
    const clock = fakeClock();
    const pacer = createPacer({ enabled: true, gapMs: 11_000, clock });
    await pacer.send(SIGN_UP, async () => undefined);
    await clock.sleep(12_000);
    await pacer.send(SIGN_UP, async () => undefined);
    expect(clock.sleeps).toEqual([12_000]);
  });

  it("doesn't wait for a request to a different path", async () => {
    const clock = fakeClock();
    const pacer = createPacer({ enabled: true, gapMs: 11_000, clock });
    await pacer.send(SIGN_UP, async () => undefined);
    await pacer.send(SIGN_IN, async () => undefined);
    expect(clock.sleeps).toEqual([]);
  });

  it("counts the gap from when the previous response came back", async () => {
    const clock = fakeClock();
    const pacer = createPacer({ enabled: true, gapMs: 11_000, clock });
    await pacer.send(SIGN_UP, () => clock.sleep(2_000)); // a slow response
    await pacer.send(SIGN_UP, async () => undefined);
    expect(clock.sleeps).toEqual([2_000, 11_000]);
  });

  it("records a request that failed", async () => {
    const clock = fakeClock();
    const pacer = createPacer({ enabled: true, gapMs: 11_000, clock });
    await expect(pacer.send(SIGN_UP, async () => Promise.reject(new Error("network")))).rejects.toThrow("network");
    await pacer.send(SIGN_UP, async () => undefined);
    expect(clock.sleeps).toEqual([11_000]);
  });

  it("paces after a request recorded by watching a page", async () => {
    const clock = fakeClock();
    const pacer = createPacer({ enabled: true, gapMs: 11_000, clock });
    pacer.record(SIGN_UP); // the sign-up page's own request
    await pacer.wait(SIGN_UP);
    expect(clock.sleeps).toEqual([11_000]);
  });
});
