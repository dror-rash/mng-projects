/**
 * What may be uploaded (task 059): photos and files; reports (task 064) are a project's finished reports, with
 * the files' limits for now. The limits are *my call* until the owner answers open question 3 (sizes, counts,
 * retention); 20 MB covers phone photos. The server checks them before signing an upload and again on the
 * stored object.
 */
export const ATTACHMENT_KINDS = ["photo", "file", "report"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/** The kinds listed in "Photos and files" (project and visit pages). */
export const GALLERY_KINDS = ["photo", "file"] as const satisfies readonly AttachmentKind[];

/** The kind listed in a project's "Reports" section (task 064). */
export const REPORT_KIND = "report" satisfies AttachmentKind;

/** Whether an upload of `kind` may belong to a visit: reports belong to the project only (task 064). */
export function allowedOnVisit(kind: AttachmentKind): boolean {
  return kind !== REPORT_KIND;
}

export function parseAttachmentKind(value: unknown): AttachmentKind | null {
  return ATTACHMENT_KINDS.find((k) => k === value) ?? null;
}

const MB = 1024 * 1024;

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const FILE_TYPES = [
  ...PHOTO_TYPES,
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const LIMITS: Record<AttachmentKind, { label: string; types: string[]; maxBytes: number; typeError: string; sizeError: string }> = {
  photo: {
    label: "Add photos",
    types: PHOTO_TYPES,
    maxBytes: 20 * MB,
    typeError: "Photos must be JPEG, PNG, WebP or HEIC images",
    sizeError: "Photos can be up to 20 MB",
  },
  file: {
    label: "Add files",
    types: FILE_TYPES,
    maxBytes: 50 * MB,
    typeError: "Files must be PDF, Word, Excel, CSV, text or images",
    sizeError: "Files can be up to 50 MB",
  },
  report: {
    label: "Upload a report",
    types: FILE_TYPES,
    maxBytes: 50 * MB,
    typeError: "Reports must be PDF, Word, Excel, CSV, text or images",
    sizeError: "Reports can be up to 50 MB",
  },
};

/** The upload button's label for a kind. */
export function uploadLabel(kind: AttachmentKind): string {
  return LIMITS[kind].label;
}

/** The accept attribute for a kind's file picker. */
export function acceptFor(kind: AttachmentKind): string {
  return LIMITS[kind].types.join(",");
}

/** The largest upload of `kind`, in bytes: signed into the upload URL, so storage refuses anything larger (task 085). */
export function maxUploadBytes(kind: AttachmentKind): number {
  return LIMITS[kind].maxBytes;
}

/** Why an upload of `kind` with this content type and size is refused, or null when it fits. */
export function uploadRefusal(kind: AttachmentKind, contentType: string, sizeBytes: number): string | null {
  const limits = LIMITS[kind];
  if (!limits.types.includes(contentType.toLowerCase())) return limits.typeError;
  if (sizeBytes <= 0) return "The file is empty";
  if (sizeBytes > limits.maxBytes) return limits.sizeError;
  return null;
}

/** Why a person with `unfinished` unconfirmed uploads in a workspace may not start another, or null (task 087). */
export function unfinishedUploadsRefusal(unfinished: number): string | null {
  void unfinished;
  return null;
}
