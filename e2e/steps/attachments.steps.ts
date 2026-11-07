import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, type Page } from "@playwright/test";
import { sql } from "@repo/db";
import { getMaintenanceDb } from "@repo/db/maintenance";
import { createUploadUrl, objectKey } from "@repo/storage";

import { Given, Then, When } from "./fixtures";
import { idOf, ids, pageOf, projectPath } from "./partner-access.steps";

// Photos and files (task 059, ADR-0008). Files are made in memory; uploads go to the local storage server.

/** A small real JPEG (1×1 pixel), so pages and storage handle a real image. */
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  pdf: "application/pdf",
  txt: "text/plain",
};

export function fileOf(name: string, size?: number) {
  const ext = name.split(".").pop()!;
  const buffer = size ? Buffer.alloc(size, 1) : ext === "jpg" ? JPEG : Buffer.from(`Test file ${name}\n`);
  return { name, mimeType: TYPES[ext] ?? "application/octet-stream", buffer };
}

const section = (page: Page) => page.getByRole("region", { name: "Photos and files", exact: true });

/** The upload error under the buttons (Next.js also renders an empty role="alert" announcer). */
export const uploadError = (page: Page) => page.getByRole("alert").filter({ hasText: /\S/ });

/** Picks the file (or a file on disk) with the hidden input behind the button, then waits for the upload to settle. */
export async function addFile(page: Page, button: string, file: ReturnType<typeof fileOf> | string) {
  await page.getByLabel(button, { exact: true }).setInputFiles(file);
  await expect(page.getByRole("status").filter({ hasText: /^Added/ }).or(uploadError(page)).first()).toBeVisible();
}

When("I add the photo {string} with {string}", async ({ page }, name: string, button: string) => {
  await addFile(page, button, fileOf(name));
  await expect(section(page).getByRole("img", { name, exact: true })).toBeVisible();
});

When("I add the file {string} with {string}", async ({ page }, name: string, button: string) => {
  await addFile(page, button, fileOf(name));
});

// Playwright hands files over 50 MB to the browser only from disk.
When("I add a {int} MB file {string} with {string}", async ({ page }, mb: number, name: string, button: string) => {
  const dir = await mkdtemp(join(tmpdir(), "e2e-upload-"));
  const path = join(dir, name);
  try {
    await writeFile(path, Buffer.alloc(mb * 1024 * 1024, 1));
    await addFile(page, button, path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Then("the {string} section shows the photo {string}", async ({ page }, region: string, name: string) => {
  await expect(page.getByRole("region", { name: region, exact: true }).getByRole("img", { name, exact: true })).toBeVisible();
});

Then("the {string} section shows the file {string}", async ({ page }, region: string, name: string) => {
  await expect(page.getByRole("region", { name: region, exact: true }).getByRole("link", { name, exact: true })).toBeVisible();
});

/** The attachment's address on the page: its link (a photo's link holds its image). */
async function hrefOf(page: Page, name: string) {
  const link = section(page).getByRole("link", { name, exact: true });
  await expect(link).toBeVisible();
  return (await link.getAttribute("href"))!;
}

Then("the photo {string} opens as an image", async ({ page }, name: string) => {
  const response = await page.request.get(await hrefOf(page, name));
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^image\//);
});

Then("the file {string} downloads as {string}", async ({ page }, name: string, fileName: string) => {
  await expectDownloadAs(page, await hrefOf(page, name), fileName);
});

/** The attachment's address redirects to a signed download of the object, as an attachment named `fileName`. */
export async function expectDownloadAs(page: Page, href: string, fileName: string) {
  const response = await page.request.get(href, { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  const signed = new URL(response.headers().location!);
  expect(signed.searchParams.get("response-content-disposition")).toBe(`attachment; filename="${fileName}"`);
  const download = await page.request.get(signed.toString());
  expect(download.status()).toBe(200);
}

// --- The leak suite's two-partner workspace (partner-access.steps.ts) --------------------------------------

/** The admin's upload, stored for real and written to the database as confirmed (its id: "<name>:attachment"). */
export async function adminAttachment(
  state: Parameters<typeof idOf>[0],
  kind: "photo" | "file" | "report",
  name: string,
  projectId: string,
  visitId: string | null,
) {
  const workspaceId = idOf(state, "workspace");
  const { mimeType, buffer } = fileOf(name);
  const key = objectKey({ workspaceId, projectId });
  const { url, headers } = await createUploadUrl({ key, contentType: mimeType });
  const upload = await fetch(url, { method: "PUT", headers, body: buffer });
  expect(upload.ok).toBe(true);
  const id = crypto.randomUUID();
  await getMaintenanceDb().execute(
    sql`insert into attachment (id, workspace_id, project_id, visit_id, kind, storage_key, file_name, content_type, size_bytes, uploaded_by, confirmed_at)
        values (${id}, ${workspaceId}, ${projectId}, ${visitId}, ${kind}, ${key}, ${name}, ${mimeType}, ${buffer.length}, ${idOf(state, "Admin")}, now())`,
  );
  Object.assign(ids(state), { [`${name}:attachment`]: id });
}

const adminPhoto = (state: Parameters<typeof idOf>[0], name: string, projectId: string, visitId: string | null) =>
  adminAttachment(state, "photo", name, projectId, visitId);

Given("the admin added the photo {string} to {string}", async ({ state }, name: string, project: string) => {
  await adminPhoto(state, name, idOf(state, project), null);
});

Given("the admin added the photo {string} to the visit {string}", async ({ state }, name: string, notes: string) => {
  await adminPhoto(state, name, idOf(state, `${notes}:visit-project`), idOf(state, `${notes}:visit`));
});

Given("the visit {string} is deleted", async ({ state }, notes: string) => {
  await getMaintenanceDb().execute(sql`update site_visit set deleted_at = now() where id = ${idOf(state, `${notes}:visit`)}`);
});

export const attachmentPath = (id: string) => `/dashboard/attachments/${id}`;

When("I open the address of the photo {string}", async ({ state }, name: string) => {
  state.keptUrl = attachmentPath(idOf(state, `${name}:attachment`));
});

// The address must not tell a photo that exists (but isn't mine) from one that doesn't.
Then("it is not found, the same as a made-up photo address", async ({ page, state }) => {
  const real = await page.request.get(state.keptUrl!, { maxRedirects: 0 });
  const madeUp = await page.request.get(attachmentPath(crypto.randomUUID()), { maxRedirects: 0 });
  expect(real.status()).toBe(404);
  expect(madeUp.status()).toBe(404);
  expect(await real.text()).toBe(await madeUp.text());
});


When(
  "I start an upload on {string} with the project id of {string}",
  async ({ page, state }, project: string, other: string) => {
    state.replay = async (id) => {
      await page.goto(projectPath(state, project));
      await section(page)
        .locator('input[name="projectId"]')
        .evaluate((input, value) => {
          (input as HTMLInputElement).value = value;
        }, id);
      await page.getByLabel("Add photos", { exact: true }).setInputFiles(fileOf("sneaky.jpg"));
      await expect(uploadError(page)).toBeVisible();
    };
    await state.replay(idOf(state, other));
  },
);

// The finish call names the upload it confirms; the route swaps in another one's id, as a tampered request could.
When(
  "I finish an upload on {string} with the upload id of {string}",
  async ({ page, state }, project: string, name: string) => {
    state.replay = async (id) => {
      await page.goto(projectPath(state, project));
      await page.unrouteAll();
      await page.route("**/*", async (route) => {
        const body = route.request().postData();
        if (route.request().method() === "POST" && body?.includes('"attachmentId"') && !body.includes('"fileName"')) {
          await route.continue({ postData: body.replace(/"attachmentId":"[^"]+"/, `"attachmentId":"${id}"`) });
        } else {
          await route.continue();
        }
      });
      await page.getByLabel("Add photos", { exact: true }).setInputFiles(fileOf("sneaky.jpg"));
      await expect(uploadError(page)).toBeVisible();
      await page.unrouteAll();
    };
    await state.replay(idOf(state, `${name}:attachment`));
  },
);

Then("the upload is refused, the same as with a made-up id", async ({ page, state }) => {
  const shown = await uploadError(page).innerText();
  expect(shown).toMatch(/^Couldn't add/);
  await state.replay!(crypto.randomUUID());
  expect(await uploadError(page).innerText()).toBe(shown);
});

Then("the admin sees only {string} on {string}", async ({ people, state }, name: string, project: string) => {
  const admin = await pageOf(state, people, "admin");
  await admin.goto(projectPath(state, project));
  const items = section(admin).getByRole("listitem");
  await expect(items).toHaveCount(1);
  await expect(items.first().getByRole("img", { name, exact: true })).toBeVisible();
});
