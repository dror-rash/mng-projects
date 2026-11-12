// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AttachmentUploader } from "./attachment-uploader";

const actions = vi.hoisted(() => ({ startUploadAction: vi.fn(), finishUploadAction: vi.fn() }));
vi.mock("./actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AttachmentUploader", () => {
  it("sends the file to the signed URL with exactly the headers the server signed, size range included", async () => {
    const headers = {
      "Content-Type": "image/jpeg",
      "x-goog-if-generation-match": "0",
      "x-goog-content-length-range": "0,20971520",
    };
    actions.startUploadAction.mockResolvedValue({ ok: true, uploadUrl: "https://storage.example/upload", headers });
    actions.finishUploadAction.mockResolvedValue({ ok: true });
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    render(<AttachmentUploader visitId={null} kinds={["photo"]} />);
    const photo = new File(["jpeg bytes"], "site.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("Add photos"), photo);

    expect(await screen.findByText("Added site.jpg")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("https://storage.example/upload", { method: "PUT", headers, body: photo });
  });
});
