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

/** A folder: one or more non-empty names, each ending in `/`. */
const PREFIX = /^([^/]+\/)+$/;

/**
 * Deletes every object under `prefix` (a folder such as `workspacePrefix(id)`); a missing object is not an
 * error. Deletes the first page of the listing until the listing is empty, without page tokens: deleting
 * moves the pages, and the local server leaves the token out. Refuses an empty prefix (the whole bucket) or
 * one without a trailing `/` (it would also match a neighbor: `ws-1` matches `ws-10/…`).
 *
 * Each delete names the generation the listing gave (`ifGenerationMatch`): that makes it idempotent, so the
 * client retries a transient failure (429, 5xx) instead of failing the whole folder. An object written again
 * since the listing answers 412 and is deleted on the next pass, at its new generation; a pass that lists
 * the same objects at the same generations again stops with an error rather than loop.
 */
export async function removePrefix(prefix: string, { pageSize = 100 }: { pageSize?: number } = {}): Promise<void> {
  if (!PREFIX.test(prefix)) {
    throw new Error(`Not a prefix: "${prefix}"`);
  }
  const bucket = getBucket();
  let previous = "";
  for (;;) {
    const [files] = await bucket.getFiles({ prefix, autoPaginate: false, maxResults: pageSize });
    if (files.length === 0) return;
    const listed = files.map((file) => `${file.name}#${file.metadata.generation}`).join("\n");
    if (listed === previous) {
      throw new Error("Removing a prefix made no progress");
    }
    previous = listed;
    await Promise.all(
      files.map(async (file) => {
        try {
          await file.delete({ ignoreNotFound: true, ifGenerationMatch: file.metadata.generation });
        } catch (error) {
          if ((error as { code?: number }).code !== 412) throw error;
        }
      }),
    );
  }
}
