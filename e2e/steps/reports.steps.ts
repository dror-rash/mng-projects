import { expect, type Page } from "@playwright/test";
import { and, eq, schema } from "@repo/db";
import { getMaintenanceDb } from "@repo/db/maintenance";

import { adminAttachment, attachmentPath, expectDownloadAs, fileOf, uploadError } from "./attachments.steps";
import { Given, origin, type People, type ScenarioState, signUp, Then, userId, When } from "./fixtures";
import { idOf, pageOf, projectPath, shownText } from "./partner-access.steps";
import { insertCustomerWithSite } from "./project-form";
import { myRecordId } from "./sites.steps";
import { setHiddenFields } from "./workers.steps";
import { pressAndWait } from "./workspaces.steps";

// Uploaded reports (task 064, ADR-0008): attachments of kind "report" on a project, in its "Reports" section.
// The upload scenarios go through the page only, so task 069 can run them against a preview.

const reports = (page: Page) => page.getByRole("region", { name: "Reports", exact: true });

Then("the reports listed are {string}", async ({ page }, names: string) => {
  await expect(reports(page).getByRole("link")).toHaveText(names.split(",").map((n) => n.trim()));
});

Then("the report {string} downloads as {string}", async ({ page }, name: string, fileName: string) => {
  const link = reports(page).getByRole("link", { name, exact: true });
  await expect(link).toBeVisible();
  await expectDownloadAs(page, (await link.getAttribute("href"))!, fileName);
});

// --- The leak suite's two-partner workspace (partner-access.steps.ts) --------------------------------------

Given("the admin uploaded the report {string} to {string}", async ({ state }, name: string, project: string) => {
  await adminAttachment(state, "report", name, idOf(state, project), null);
});

When("I open the address of the report {string}", async ({ state }, name: string) => {
  state.keptUrl = attachmentPath(idOf(state, `${name}:attachment`));
});

When(
  "I start a report upload on {string} with the project id of {string}",
  async ({ page, state }, project: string, other: string) => {
    state.replay = async (id) => {
      await page.goto(`${projectPath(state, project)}?tab=reports`);
      await reports(page)
        .locator('input[name="projectId"]')
        .evaluate((input, value) => {
          (input as HTMLInputElement).value = value;
        }, id);
      await page.getByLabel("Upload a report", { exact: true }).setInputFiles(fileOf("sneaky-report.pdf"));
      await expect(uploadError(page)).toBeVisible();
    };
    await state.replay(idOf(state, other));
  },
);

Then("the admin sees no reports on {string}", async ({ people, state }, project: string) => {
  const admin = await pageOf(state, people, "admin");
  await admin.goto(`${projectPath(state, project)}?tab=reports`);
  await expect(reports(admin)).toContainText("No reports yet.");
  await expect(reports(admin).getByRole("link")).toHaveCount(0);
});

/** A user of the partner (signed up and made a member on first use), in a browser of their own. */
export async function partnerUser(state: ScenarioState, people: People, partner: string) {
  const key = `${partner} user`;
  const known = state.accounts?.[key]?.page;
  if (known) return known;
  const page = await people.newPerson();
  const account = await signUp(page, `${partner} User`);
  await getMaintenanceDb()
    .insert(schema.workspaceMember)
    .values({ workspaceId: idOf(state, "workspace"), userId: await userId(page), role: "partner", partnerId: idOf(state, partner) });
  state.accounts = { ...state.accounts, [key]: { account, page } };
  return page;
}

When("the {string} user opens the {string} project page", async ({ people, state }, partner: string, project: string) => {
  const page = await partnerUser(state, people, partner);
  await page.goto(projectPath(state, project));
  await expect(page.getByRole("heading", { name: project, level: 1 })).toBeVisible();
});

Then("the {string} user sees the text {string}", async ({ people, state }, partner: string, text: string) => {
  await expect(shownText(await partnerUser(state, people, partner), text)).toBeVisible();
});

// --- Writes posted directly, bypassing the page (the access audit's leak suite) ---------------------------
// A poster without the form uses the same form on a report of their own, pointed at the other report: the
// server must refuse it on access, not on the missing button. `state.replay` posts it again with a made-up id.

/** A confirmed report written to the database (no stored file: the list and the forms don't need one). */
async function insertReport(
  workspaceId: string,
  projectId: string,
  uploadedBy: string,
  name: string,
  deleted = false,
) {
  const id = crypto.randomUUID();
  const deletedAt = deleted ? new Date(Date.now() - 60_000) : null;
  await getMaintenanceDb().insert(schema.attachment).values({
    id,
    workspaceId,
    projectId,
    kind: "report",
    storageKey: `${workspaceId}/${projectId}/${id}`,
    fileName: name,
    contentType: "application/pdf",
    sizeBytes: 100,
    uploadedBy,
    confirmedAt: new Date(),
    deletedAt,
    deletedBy: deleted ? uploadedBy : null,
  });
  return id;
}

/** A workspace of the user's own (they're its admin) with one project: where their own forms are. */
async function ownWorkspace(userId: string) {
  const db = getMaintenanceDb();
  const workspaceId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  await db.insert(schema.workspace).values({ id: workspaceId, name: "My own" });
  await db.insert(schema.workspaceMember).values({ workspaceId, userId, role: "admin", joinedAt: new Date() });
  const { organizationId, siteId } = await insertCustomerWithSite(workspaceId, "Decoy client");
  await db.insert(schema.project).values({ id: projectId, name: "Decoy", workspaceId, organizationId, siteId });
  return { workspaceId, projectId };
}

async function projectOfAttachment(id: string) {
  const [row] = await getMaintenanceDb()
    .select({ projectId: schema.attachment.projectId })
    .from(schema.attachment)
    .where(eq(schema.attachment.id, id));
  return row!.projectId;
}

/** Posts the delete form of my report `mine` on the page at `path`, with its hidden fields set to the target. */
async function postReportDelete(page: Page, path: string, mine: string, projectId: string, attachmentId: string) {
  await page.goto(`${path}?tab=reports`);
  await expect(page.getByRole("button", { name: `Delete ${mine}`, exact: true })).toBeVisible();
  await setHiddenFields(page, `Delete ${mine}`, { projectId, attachmentId });
  await pressAndWait(page, `Delete ${mine}`);
}

When("I post the delete form of the report {string}", async ({ page, state }, name: string) => {
  const own = await ownWorkspace(idOf(state, "me"));
  await insertReport(own.workspaceId, own.projectId, idOf(state, "me"), "my-report.pdf");
  const target = idOf(state, `${name}:attachment`);
  const projectId = await projectOfAttachment(target);
  state.replay = (id) => postReportDelete(page, `/dashboard/projects/${own.projectId}`, "my-report.pdf", projectId, id);
  await state.replay(target);
});

When(
  "I post the delete form of the report {string} on {string}",
  async ({ page, state }, name: string, project: string) => {
    await insertReport(idOf(state, "workspace"), idOf(state, project), idOf(state, "me"), "my-report.pdf");
    state.replay = (id) => postReportDelete(page, projectPath(state, project), "my-report.pdf", idOf(state, project), id);
    await state.replay(idOf(state, `${name}:attachment`));
  },
);

/** The refused post shows the error page, and so does the same post with a made-up id. */
async function expectRefusedLikeMadeUp(page: Page, state: ScenarioState) {
  const refused = page.getByRole("heading", { name: "Something went wrong", level: 1 });
  await expect(refused).toBeVisible();
  await state.replay!(crypto.randomUUID());
  await expect(refused).toBeVisible();
}

Then("the delete is refused, the same as with a made-up id", async ({ page, state }) => {
  await expectRefusedLikeMadeUp(page, state);
});

Then("the restore is refused, the same as with a made-up id", async ({ page, state }) => {
  await expectRefusedLikeMadeUp(page, state);
});

Then("the admin sees the reports {string} on {string}", async ({ people, state }, names: string, project: string) => {
  const admin = await pageOf(state, people, "admin");
  await admin.goto(`${projectPath(state, project)}?tab=reports`);
  await expect(reports(admin).getByRole("link")).toHaveText(names.split(",").map((n) => n.trim()));
});

/** Uploads a report with "Upload a report" on the page at `path`, its section's project id set to `projectId`. */
async function uploadReportTo(page: Page, path: string, projectId: string) {
  await page.goto(`${path}?tab=reports`);
  await reports(page)
    .locator('input[name="projectId"]')
    .evaluate((input, value) => {
      (input as HTMLInputElement).value = value;
    }, projectId);
  await page.getByLabel("Upload a report", { exact: true }).setInputFiles(fileOf("sneaky-report.pdf"));
  await expect(uploadError(page)).toBeVisible();
}

// The auditor has no uploader on the project; they use the one of a project of their own, pointed at it.
When("the auditor starts a report upload on {string}", async ({ people, state }, project: string) => {
  const auditor = await pageOf(state, people, "auditor");
  const own = await ownWorkspace(idOf(state, "Auditor"));
  state.replay = (id) => uploadReportTo(auditor, `/dashboard/projects/${own.projectId}`, id);
  await state.replay(idOf(state, project));
});

Then("the auditor's upload is refused, the same as with a made-up id", async ({ people, state }) => {
  const auditor = await pageOf(state, people, "auditor");
  const shown = await uploadError(auditor).innerText();
  expect(shown).toMatch(/^Couldn't add/);
  await state.replay!(crypto.randomUUID());
  expect(await uploadError(auditor).innerText()).toBe(shown);
});

// A visit's uploader offers photos and files only; the request is rewritten to ask for a report on the visit.
When(
  "I start a report upload on the visit {string} of {string}",
  async ({ page, state }, notes: string, project: string) => {
    const projectId = await myRecordId(page, "project", project);
    const [visit] = await getMaintenanceDb()
      .select({ id: schema.siteVisit.id })
      .from(schema.siteVisit)
      .where(and(eq(schema.siteVisit.projectId, projectId), eq(schema.siteVisit.notes, notes)));
    const visitPath = `/dashboard/projects/${projectId}/visits/${visit!.id}`;
    state.replay = async (id) => {
      await page.goto(visitPath);
      await page.unrouteAll();
      await page.route("**/*", async (route) => {
        const body = route.request().postData();
        if (route.request().method() === "POST" && body?.includes('"fileName"')) {
          await route.continue({
            postData: body.replace(/"kind":"[a-z]+"/, '"kind":"report"').replace(/"visitId":"[^"]+"/, `"visitId":"${id}"`),
          });
        } else {
          await route.continue();
        }
      });
      await page.getByLabel("Add files", { exact: true }).setInputFiles(fileOf("visit-report.pdf"));
      await expect(uploadError(page)).toBeVisible();
      await page.unrouteAll();
    };
    await state.replay(visit!.id);
  },
);

Given("the report {string} is deleted", async ({ state }, name: string) => {
  await getMaintenanceDb()
    .update(schema.attachment)
    .set({ deletedAt: new Date(Date.now() - 60_000), deletedBy: idOf(state, "Admin") })
    .where(eq(schema.attachment.id, idOf(state, `${name}:attachment`)));
});

// A partner has no Deleted page in the shared workspace; they use the one of a workspace of their own (made
// current with its cookie), on a deleted report of theirs, pointed at the other report.
When("I post the restore form of the report {string}", async ({ page, state }, name: string) => {
  const own = await ownWorkspace(idOf(state, "me"));
  await insertReport(own.workspaceId, own.projectId, idOf(state, "me"), "my-old-report.pdf", true);
  await page.context().addCookies([{ name: "workspace", value: own.workspaceId, url: origin }]);
  state.replay = async (id) => {
    await page.goto("/dashboard/deleted");
    await expect(page.getByRole("button", { name: "Restore my-old-report.pdf", exact: true })).toBeVisible();
    await setHiddenFields(page, "Restore my-old-report.pdf", { id });
    await pressAndWait(page, "Restore my-old-report.pdf");
  };
  await state.replay(idOf(state, `${name}:attachment`));
});
