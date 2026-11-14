import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));
const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

import { redirectFromAction } from "./redirect-from-action";

describe("redirectFromAction", () => {
  beforeEach(() => {
    redirect.mockClear();
  });

  it("leaves the path to the client router when the form was posted with JavaScript", async () => {
    request.headers = new Headers({ "next-action": "abc123" });
    await redirectFromAction("/sites/site-1");
    expect(redirect).toHaveBeenCalledWith("/sites/site-1");
  });

  it("sends a form posted without JavaScript to the path under the dashboard's basePath", async () => {
    request.headers = new Headers({ "content-type": "multipart/form-data; boundary=x" });
    await redirectFromAction("/sites/site-1?tab=contacts");
    expect(redirect).toHaveBeenCalledWith("/dashboard/sites/site-1?tab=contacts");
  });

  it("sends a form posted without JavaScript home to the dashboard's root", async () => {
    request.headers = new Headers();
    await redirectFromAction("/");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
