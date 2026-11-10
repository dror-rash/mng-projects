import { getBucket } from "./client";

export { objectKey, workspacePrefix } from "./object-key";

// Files in object storage (task 057, ADR-0008): Google Cloud Storage deployed, fake-gcs-server locally.
// Server-only. Browsers upload and download through short-lived signed URLs; the bytes never pass through
// the app. This package never checks access: callers check it before asking for a URL.

const UPLOAD_SECONDS = 15 * 60;
const DOWNLOAD_SECONDS = 5 * 60;

/**
 * A signed `PUT` URL for `key` and the headers the upload must send: its content type, and
 * `x-goog-if-generation-match: 0`, so the URL only creates the object and can't replace it after the app
 * has checked it. It can't limit the size: check the upload with `stat` and `remove` what doesn't fit.
 */
export async function createUploadUrl({
  key,
  contentType,
  expiresInSeconds = UPLOAD_SECONDS,
}: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<{ url: string; headers: Record<string, string> }> {
  const extensionHeaders = { "x-goog-if-generation-match": "0" };
  const [url] = await getBucket()
    .file(key)
    .getSignedUrl({ version: "v4", action: "write", contentType, extensionHeaders, expires: Date.now() + expiresInSeconds * 1000 });
  return { url, headers: { "Content-Type": contentType, ...extensionHeaders } };
}

/** A signed `GET` URL for `key`; with `fileName`, the browser saves it under that name. */
export async function createDownloadUrl({
  key,
  fileName,
  expiresInSeconds = DOWNLOAD_SECONDS,
}: {
  key: string;
  fileName?: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const [url] = await getBucket()
    .file(key)
    .getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + expiresInSeconds * 1000,
      ...(fileName && { responseDisposition: `attachment; filename="${fileName.replace(/["\\\r\n]/g, "_")}"` }),
    });
  return url;
}

/** An uploaded object's size (bytes) and content type, or null when there's none. */
export async function stat(key: string): Promise<{ size: number; contentType: string | null } | null> {
  try {
    const [metadata] = await getBucket().file(key).getMetadata();
    return { size: Number(metadata.size), contentType: metadata.contentType ?? null };
  } catch (error) {
    if ((error as { code?: number }).code === 404) return null;
    throw error;
  }
}

/** Deletes `key`; a missing object is not an error. */
export async function remove(key: string): Promise<void> {
  await getBucket().file(key).delete({ ignoreNotFound: true });
}

/** Stub (task 086, red). */
export async function removePrefix(prefix: string, options: { pageSize?: number } = {}): Promise<void> {
  throw new Error(`Not implemented: ${prefix} ${options.pageSize}`);
}
