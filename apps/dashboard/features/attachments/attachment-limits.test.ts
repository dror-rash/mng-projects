import { describe, expect, it } from "vitest";

import {
  allowedOnVisit,
  GALLERY_KINDS,
  parseAttachmentKind,
  REPORT_KIND,
  unfinishedUploadsRefusal,
  uploadLabel,
  uploadRefusal,
} from "./attachment-limits";

const MB = 1024 * 1024;

describe("parseAttachmentKind", () => {
  it("knows photos, files and reports, nothing else", () => {
    expect(parseAttachmentKind("photo")).toBe("photo");
    expect(parseAttachmentKind("file")).toBe("file");
    expect(parseAttachmentKind("report")).toBe("report");
    expect(parseAttachmentKind("Report")).toBeNull();
    expect(parseAttachmentKind("x")).toBeNull();
    expect(parseAttachmentKind(undefined)).toBeNull();
  });
});

describe("uploadRefusal", () => {
  it("takes JPEG, PNG, WebP and HEIC photos up to 20 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/heic"]) {
      expect(uploadRefusal("photo", type, 20 * MB)).toBeNull();
    }
    expect(uploadRefusal("photo", "text/plain", 10)).toBe("Photos must be JPEG, PNG, WebP or HEIC images");
    expect(uploadRefusal("photo", "image/jpeg", 20 * MB + 1)).toBe("Photos can be up to 20 MB");
  });

  it("takes documents and images as files up to 50 MB", () => {
    for (const type of ["application/pdf", "text/csv", "text/plain", "image/png", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]) {
      expect(uploadRefusal("file", type, 50 * MB)).toBeNull();
    }
    expect(uploadRefusal("file", "application/x-msdownload", 10)).toBe("Files must be PDF, Word, Excel, CSV, text or images");
    expect(uploadRefusal("file", "application/pdf", 50 * MB + 1)).toBe("Files can be up to 50 MB");
  });

  it("takes the files' documents and images as reports up to 50 MB, with report messages", () => {
    for (const type of ["application/pdf", "text/csv", "text/plain", "image/jpeg", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]) {
      expect(uploadRefusal("report", type, 50 * MB)).toBeNull();
    }
    expect(uploadRefusal("report", "video/mp4", 10)).toBe("Reports must be PDF, Word, Excel, CSV, text or images");
    expect(uploadRefusal("report", "application/octet-stream", 10)).toBe("Reports must be PDF, Word, Excel, CSV, text or images");
    expect(uploadRefusal("report", "application/pdf", 50 * MB + 1)).toBe("Reports can be up to 50 MB");
    expect(uploadRefusal("report", "application/pdf", 0)).toBe("The file is empty");
  });

  it("refuses empty files", () => {
    expect(uploadRefusal("file", "application/pdf", 0)).toBe("The file is empty");
  });
});

describe("uploadLabel", () => {
  it("names each kind's upload button", () => {
    expect(uploadLabel("photo")).toBe("Add photos");
    expect(uploadLabel("file")).toBe("Add files");
    expect(uploadLabel("report")).toBe("Upload a report");
  });
});

describe("GALLERY_KINDS and REPORT_KIND", () => {
  it("puts photos and files in Photos and files, and reports apart", () => {
    expect(GALLERY_KINDS).toEqual(["photo", "file"]);
    expect(REPORT_KIND).toBe("report");
  });
});

describe("allowedOnVisit", () => {
  it("lets photos and files be added to a visit, but not reports", () => {
    expect(allowedOnVisit("photo")).toBe(true);
    expect(allowedOnVisit("file")).toBe(true);
    expect(allowedOnVisit("report")).toBe(false);
  });
});

describe("unfinishedUploadsRefusal", () => {
  it("lets a person have up to 10 unfinished uploads in a workspace, and refuses the 11th", () => {
    expect(unfinishedUploadsRefusal(0)).toBeNull();
    expect(unfinishedUploadsRefusal(9)).toBeNull();
    expect(unfinishedUploadsRefusal(10)).toBe("Too many uploads in progress. Try again later.");
    expect(unfinishedUploadsRefusal(25)).toBe("Too many uploads in progress. Try again later.");
  });
});
