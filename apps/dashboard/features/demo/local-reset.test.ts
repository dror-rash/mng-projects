import { describe, expect, it } from "vitest";

import { failureMessage, isLocalDatabase, isLocalServer, isTestAccount } from "./local-reset";

const local = { DATABASE_URL: "postgres://app:app@localhost:5432/app" };

describe("isLocalDatabase", () => {
  it("accepts a database on localhost, 127.0.0.1 or ::1", () => {
    expect(isLocalDatabase(local)).toEqual({ local: true });
    expect(isLocalDatabase({ DATABASE_URL: "postgresql://app@127.0.0.1/app" })).toEqual({ local: true });
    expect(isLocalDatabase({ DATABASE_URL: "postgres://app@[::1]:5432/app" })).toEqual({ local: true });
  });

  it("accepts a lane's database on localhost", () => {
    expect(isLocalDatabase({ DATABASE_URL: "postgres://app:app@localhost:5432/app_lane2", NODE_ENV: "development" })).toEqual({
      local: true,
    });
  });

  it("refuses without a DATABASE_URL", () => {
    expect(isLocalDatabase({})).toEqual({ local: false, reason: "DATABASE_URL is not set." });
  });

  it("refuses a database on another host", () => {
    expect(isLocalDatabase({ DATABASE_URL: "postgres://app:secret@10.0.0.5:5432/app" })).toEqual({
      local: false,
      reason: 'DATABASE_URL points at "10.0.0.5", not at localhost.',
    });
    expect(isLocalDatabase({ DATABASE_URL: "postgres://app@db.example.com/app" }).local).toBe(false);
    expect(isLocalDatabase({ DATABASE_URL: "postgres://app@localhost.example.com/app" }).local).toBe(false);
  });

  it("refuses a DATABASE_URL it can't read, or a socket", () => {
    expect(isLocalDatabase({ DATABASE_URL: "not a url" }).local).toBe(false);
    expect(isLocalDatabase({ DATABASE_URL: "postgres:///app?host=/var/run/postgresql" }).local).toBe(false);
  });

  it("refuses a host or hostaddr in the query string that isn't local", () => {
    expect(isLocalDatabase({ DATABASE_URL: "postgres://u:p@localhost/app?host=db.prod.example.com" })).toEqual({
      local: false,
      reason: 'DATABASE_URL points at "db.prod.example.com", not at localhost.',
    });
    expect(isLocalDatabase({ DATABASE_URL: "postgres://u@localhost/app?hostaddr=10.0.0.1" })).toEqual({
      local: false,
      reason: 'DATABASE_URL points at "10.0.0.1", not at localhost.',
    });
    expect(isLocalDatabase({ DATABASE_URL: "postgres://u@localhost/app?hostaddr=127.0.0.1" })).toEqual({ local: true });
  });

  it("refuses a local database that isn't the app's or a lane's (a proxy or tunnel to another one)", () => {
    expect(isLocalDatabase({ DATABASE_URL: "postgres://u@127.0.0.1:5432/production" })).toEqual({
      local: false,
      reason: 'DATABASE_URL names the database "production", not app or app_lane<n>.',
    });
    expect(isLocalDatabase({ DATABASE_URL: "postgres://u@localhost/app_lane" }).local).toBe(false);
    expect(isLocalDatabase({ DATABASE_URL: "postgres://u@localhost/app_lane2x" }).local).toBe(false);
    expect(isLocalDatabase({ DATABASE_URL: "postgres://u@localhost/postgres" }).local).toBe(false);
  });

  it("refuses when Cloud SQL is configured", () => {
    expect(isLocalDatabase({ ...local, CLOUD_SQL_CONNECTION_NAME: "project:region:instance" })).toEqual({
      local: false,
      reason: "CLOUD_SQL_CONNECTION_NAME is set: this is a deployed database.",
    });
  });

  it("refuses in production", () => {
    expect(isLocalDatabase({ ...local, NODE_ENV: "production" })).toEqual({
      local: false,
      reason: "NODE_ENV is production.",
    });
  });
});

describe("isTestAccount", () => {
  it("is true for the e2e accounts, at example.com", () => {
    expect(isTestAccount("e2e-123@example.com")).toBe(true);
    expect(isTestAccount("Someone@Example.COM")).toBe(true);
  });

  it("is false for real accounts, and look-alike domains", () => {
    expect(isTestAccount("owner@company.co.il")).toBe(false);
    expect(isTestAccount("me@notexample.com")).toBe(false);
    expect(isTestAccount("me@example.com.evil.io")).toBe(false);
    expect(isTestAccount("me@sub.example.com")).toBe(false);
  });
});

describe("isLocalServer", () => {
  const cloudSql = { local: false, reason: "the connected server is Cloud SQL." };

  it("allows a server with no Cloud SQL markers", () => {
    expect(isLocalServer({ cloudSqlRole: false, cloudSqlSettings: false })).toEqual({ local: true });
  });

  it("refuses a server with the Cloud SQL role", () => {
    expect(isLocalServer({ cloudSqlRole: true, cloudSqlSettings: false })).toEqual(cloudSql);
  });

  it("refuses a server with cloudsql settings", () => {
    expect(isLocalServer({ cloudSqlRole: false, cloudSqlSettings: true })).toEqual(cloudSql);
  });

  it("refuses a server with both", () => {
    expect(isLocalServer({ cloudSqlRole: true, cloudSqlSettings: true })).toEqual(cloudSql);
  });
});

describe("failureMessage", () => {
  it("is the message of the error that caused a failed query", () => {
    const cause = new Error("connect ECONNREFUSED 127.0.0.1:5432");
    expect(failureMessage(new Error("Failed query: select 1", { cause }))).toBe("connect ECONNREFUSED 127.0.0.1:5432");
  });

  it("is the error's code when its message is empty", () => {
    const cause = Object.assign(new AggregateError([], ""), { code: "ECONNREFUSED" });
    expect(failureMessage(new Error("Failed query: select 1", { cause }))).toBe("ECONNREFUSED");
  });

  it("is the error's own message without a cause", () => {
    expect(failureMessage(new Error("password authentication failed"))).toBe("password authentication failed");
    expect(failureMessage("boom")).toBe("boom");
  });
});
