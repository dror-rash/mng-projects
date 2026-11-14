// Walkthrough of the customer project flow (docs/PLAN.md "Target flow") with a screenshot of each screen, for
// the usage guide (task 117). Run against running dev servers: `pnpm --filter @repo/e2e flow-guide`
// (BASE_URL or SHELL_PORT for another address). Signs up throwaway @example.com people with fictional data and
// makes its own sample photo and PDF reports; writes PNGs and manifest.json to e2e/flow-guide/ (or OUT).
/* global process, console, setTimeout */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

import { chromium, expect } from "@playwright/test";

const BASE = process.env.BASE_URL ?? `http://localhost:${process.env.SHELL_PORT ?? 3000}`;
const OUT = process.env.OUT ?? fileURLToPath(new URL("../flow-guide", import.meta.url));
mkdirSync(OUT, { recursive: true });
const manifest = [];
const run = Date.now().toString(36);
const day = (offset) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;

async function settle(page) {
  await page.waitForLoadState("load");
  await page.waitForTimeout(700);
}
async function shot(page, step, title, what, opts = {}) {
  await settle(page);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const id = `${String(++n).padStart(2, "0")}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}`;
  if (opts.locator) await opts.locator.screenshot({ path: `${OUT}/${id}.png` });
  else await page.screenshot({ path: `${OUT}/${id}.png`, fullPage: opts.fullPage ?? true });
  manifest.push({ id, step, title, what, who: opts.who ?? "Office admin", url: page.url().replace(BASE, "") });
  console.log("shot", id);
}
async function part(name, fn) {
  try {
    await fn();
  } catch (e) {
    manifest.push({ id: `FAIL-${name}`, error: String(e.message ?? e).split("\n").slice(0, 4).join(" ") });
    console.log("FAIL", name, String(e.message ?? e).split("\n")[0]);
  }
}
async function press(page, name) {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST").catch(() => {}),
    page.getByRole("button", { name, exact: true }).first().click(),
  ]);
  await settle(page);
}
let lastSignUp = 0;
async function signUp(page, name) {
  // Better Auth allows 3 sign-ups/sign-ins per 10 seconds; the lane keeps the limit on.
  const wait = lastSignUp + 11_000 - Date.now();
  if (wait > 0) await sleep(wait);
  lastSignUp = Date.now();
  const creds = { email: `${name.split(" ")[0].toLowerCase()}-${run}@example.com`, password: "correct-horse-battery" };
  const h = { origin: BASE };
  expect((await page.request.post("/api/auth/sign-up/email", { data: { name, ...creds }, headers: h })).ok()).toBeTruthy();
  expect((await page.request.post("/api/auth/sign-in/email", { data: creds, headers: h })).ok()).toBeTruthy();
}
const region = (page, name) => page.getByRole("region", { name, exact: true });

const browser = await chromium.launch();
const ctx = () => browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });

// Sample files, drawn by the browser: a site photo (JPEG) and two one-page reports (PDF).
const paper = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
await paper.setContent(
  '<div style="height:800px;background:linear-gradient(160deg,#5b6b7a,#2b333d);display:flex;align-items:center;justify-content:center">' +
    '<div style="width:420px;height:560px;background:#c9ced4;border:12px solid #8a939c;border-radius:8px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:28px;box-sizing:border-box">' +
    '<div style="background:#1f2328;border-radius:4px"></div>'.repeat(16) +
    "</div></div>",
);
const photo = { name: "site-photo.jpg", mimeType: "image/jpeg", buffer: await paper.screenshot({ type: "jpeg", quality: 80 }) };
async function report(name, title, lines) {
  await paper.setContent(`<div style="font:16px Arial;padding:48px"><h1>${title}</h1>${lines.map((l) => `<p>${l}</p>`).join("")}</div>`);
  return { name, mimeType: "application/pdf", buffer: await paper.pdf({ format: "A4" }) };
}
const inspection = await report("inspection-report.pdf", "Inspection report", [
  "Customer: Acme Ltd › Acme Retail", "Site: Dizengoff store", "Project: Store wiring",
  "Findings: main panel checked, breaker 4 trips under load.", "Recommendation: replace breaker 4.",
]);
const completion = await report("completion-report.pdf", "Work completion report", [
  "Project: Store wiring", "All cables pulled, panel fitted, breaker 4 replaced.", "Tested at 230 V. Work complete.",
]);
await paper.context().close();

// ---------- Getting started ----------
const admin = await (await ctx()).newPage();
await part("signup", async () => {
  lastSignUp = Date.now();
  await admin.goto("/signup");
  await admin.locator("#name").fill("Ruth Office");
  await admin.locator("#email").fill(`ruth-${run}@example.com`);
  await admin.locator("#password").fill("correct-horse-battery");
  await shot(admin, "Start", "Create the office account", "Sign up with name, email and password. The first account gets its own workspace and is its admin.");
  await admin.getByRole("button", { name: "Create account" }).click();
  await admin.waitForURL((u) => !u.pathname.startsWith("/signup"), { timeout: 20000 });
});

// ---------- Step 1: inquiry ----------
let customerUrl, subUrl, siteUrl, projectUrl;
await part("customer", async () => {
  await admin.goto("/dashboard/customers/new");
  await admin.getByLabel("Name", { exact: true }).fill("Acme Ltd");
  await admin.getByLabel("Status", { exact: true }).selectOption({ label: "Lead" }).catch(() => {});
  for (const [label, value] of [["Email", "office@acme.example"], ["Phone", "03-555-0100"], ["Address", "12 Rothschild Blvd, Tel Aviv"], ["Tags", "retail"]]) {
    const f = admin.getByLabel(label, { exact: true });
    if (await f.count()) await f.first().fill(value);
  }
  await shot(admin, "1", "New customer as a Lead", "Customers › New customer. A new inquiry starts as a customer with the status Lead.");
  await press(admin, "Save customer");
  await admin.waitForURL(/\/dashboard\/customers\/[^/]+$/);
  customerUrl = admin.url();
  await admin.getByLabel("Contact name", { exact: true }).fill("Noa Ben-David");
  await admin.getByLabel("Role", { exact: true }).fill("Facilities manager");
  const ce = admin.getByLabel("Contact email", { exact: true });
  if (await ce.count()) await ce.fill("noa@acme.example");
  await press(admin, "Add contact");
  await admin.getByLabel("Note", { exact: true }).fill("Inquiry by phone: Noa asked for new wiring and a panel check at the Dizengoff store.");
  await press(admin, "Add note");
  await shot(admin, "1", "Customer page with contact and inquiry note", "The customer’s contact person and a dated note recording the inquiry, with who wrote it.");
});
await part("subcompany", async () => {
  await admin.goto(customerUrl);
  await admin.getByRole("link", { name: "New sub-company", exact: true }).click();
  await admin.getByLabel("Name", { exact: true }).fill("Acme Retail");
  await press(admin, "Save customer");
  await admin.waitForURL(/\/dashboard\/customers\/[^/]+$/);
  subUrl = admin.url();
  await shot(admin, "1", "Sub-company", "A customer can have sub-companies (one level), each with its own sites and projects.");
});
await part("site", async () => {
  await admin.goto(subUrl);
  await admin.getByRole("link", { name: "New site", exact: true }).click();
  await admin.getByLabel("Site name", { exact: true }).fill("Dizengoff store");
  await admin.getByLabel("Address", { exact: true }).fill("50 Dizengoff St, Tel Aviv");
  await shot(admin, "1", "New site", "The physical place where the work happens.");
  await press(admin, "Save site");
  await admin.waitForURL(/\/sites\/[^/]+$/);
  siteUrl = admin.url();
  await admin.getByLabel("Contact name", { exact: true }).fill("Yossi Mizrahi");
  await admin.getByLabel("Role", { exact: true }).fill("Store manager");
  await press(admin, "Add contact");
  await shot(admin, "1", "Site with on-site contact", "The person to meet on site, seen by the crew.");
});
await part("project", async () => {
  await admin.goto(siteUrl);
  await admin.getByRole("link", { name: "New project", exact: true }).click();
  await admin.getByLabel("Project name").fill("Store wiring");
  const d = admin.getByLabel("Description", { exact: true });
  if (await d.count()) await d.fill("New wiring for the sales floor and a check of the main panel.");
  await shot(admin, "1", "New project on the site", "The inquiry becomes a project under the customer and its site.");
  await press(admin, "Create Project");
  await admin.waitForURL(/\/dashboard\/projects\/[^/]+$/);
  projectUrl = admin.url();
  await shot(admin, "1", "The new project", "Customer › sub-company, site and on-site contact on the project page.");
});

// ---------- Step 5: scheduling (form, worker, crew, tasks) ----------
await part("form", async () => {
  await admin.goto("/dashboard/forms/new");
  await admin.getByLabel("Name", { exact: true }).fill("Panel check");
  await press(admin, "Create form");
  await admin.waitForURL(/\/dashboard\/forms\/[0-9a-f-]{36}$/);
  for (const [label, type, unit, options, required] of [["Voltage", "Number", "V", null, true], ["Cable condition", "Choice", null, ["Good", "Worn", "Damaged"], false]]) {
    await admin.getByLabel("Label", { exact: true }).fill(label);
    await admin.getByLabel("Type", { exact: true }).selectOption({ label: type });
    if (unit) await admin.getByLabel("Unit", { exact: true }).fill(unit);
    if (options) await admin.getByLabel("Options", { exact: true }).fill(options.join("\n"));
    await admin.getByLabel("Required", { exact: true }).setChecked(required);
    await press(admin, "Add field");
  }
  await shot(admin, "7", "Build a reading form", "Admins build the forms crews fill on site: fields with a type, unit, options and Required.");
  await press(admin, "Publish");
});
const worker = await (await ctx()).newPage();
await part("worker", async () => {
  await admin.goto("/dashboard/workspace");
  await admin.getByLabel("Role", { exact: true }).selectOption({ label: "Worker" });
  await press(admin, "Create invite link");
  const link = await admin.getByLabel("Invite link", { exact: true }).inputValue();
  await shot(admin, "5", "Invite a field worker", "Workspace › Members: an invite link for the Worker role.");
  await signUp(worker, "Dana Levi");
  await worker.goto(link);
  await shot(worker, "5", "The worker joins", "The worker opens the link and joins the workspace.", { who: "Field worker" });
  await press(worker, "Join workspace");
  await worker.waitForURL(/\/dashboard$/);
});
await part("crew-tasks", async () => {
  await admin.goto(projectUrl);
  await admin.getByLabel("Worker to add", { exact: true }).selectOption({ label: "Dana Levi" });
  await press(admin, "Add to crew");
  for (const t of ["Pull cables", "Fit the panel", "Check breaker 4"]) {
    await admin.getByLabel("Task title").fill(t);
    await press(admin, "Add task");
    await admin.getByRole("listitem").filter({ hasText: t }).first().waitFor();
  }
  await admin.getByRole("link", { name: "Pull cables", exact: true }).click();
  await admin.waitForURL(/\/tasks\/[^/]+$/);
  await admin.getByLabel("Priority", { exact: true }).selectOption({ label: "High" });
  await admin.getByLabel("Due date", { exact: true }).fill(day(4));
  await admin.getByLabel("Assignee", { exact: true }).selectOption({ label: "Dana Levi" });
  await shot(admin, "5", "Plan a task", "Priority, due date and assignee on a task.");
  await press(admin, "Save changes");
  await admin.goto(projectUrl);
  await admin.getByRole("link", { name: "Fit the panel", exact: true }).click();
  await admin.waitForURL(/\/tasks\/[^/]+$/);
  await admin.getByLabel("Due date", { exact: true }).fill(day(7));
  await admin.getByLabel("Assignee", { exact: true }).selectOption({ label: "Dana Levi" });
  await press(admin, "Save changes");
  await admin.goto(projectUrl);
  await shot(admin, "5", "Project with crew and task board", "The crew and the To do / In progress / Done board.");
});

// ---------- Step 7: field work ----------
let visitUrl;
await part("worker-project", async () => {
  await worker.goto("/dashboard/my-tasks");
  await shot(worker, "5", "The worker’s tasks", "My tasks: what is assigned to me, soonest due first.", { who: "Field worker" });
  await worker.goto("/dashboard/projects");
  await worker.getByRole("link", { name: "Store wiring", exact: true }).click();
  await worker.waitForURL(/\/dashboard\/projects\/[^/]+$/);
  await shot(worker, "7", "The worker opens the project", "The crew sees the site, the person to meet and the tasks.", { who: "Field worker" });
});
await part("visit", async () => {
  await worker.getByRole("link", { name: "Record a visit", exact: true }).click();
  await worker.getByLabel("Notes", { exact: true }).fill("Main panel checked; breaker 4 trips under load. Cables pulled on the sales floor.");
  await shot(worker, "7", "Record a visit", "Date, who was there and notes.", { who: "Field worker" });
  await press(worker, "Save visit");
  await worker.waitForURL(/\/visits\/[^/]+$/);
  visitUrl = worker.url();
  await worker.getByLabel("Add photos", { exact: true }).setInputFiles(photo);
  await worker.getByRole("status").filter({ hasText: /^Added/ }).first().waitFor({ timeout: 30000 });
  await worker.reload();
  await shot(worker, "7", "Visit with a photo", "Photos taken on site are added to the visit (the sample photo is drawn by the script).", { who: "Field worker" });
});
await part("reading", async () => {
  await worker.goto(visitUrl);
  await worker.getByRole("link", { name: "Add a reading", exact: true }).click();
  await worker.getByRole("main").getByRole("link", { name: "Panel check", exact: true }).click();
  await worker.getByLabel("Voltage").fill("230");
  const cond = worker.getByLabel("Cable condition");
  if (await cond.count()) await cond.first().selectOption({ label: "Worn" }).catch(() => cond.first().check?.());
  await shot(worker, "7", "Fill a reading", "The published form, filled on the visit.", { who: "Field worker" });
  await press(worker, "Save reading");
  await worker.waitForURL(/\/readings\/[^/]+$/);
  await shot(worker, "7", "The saved reading", "Values with units, who filled it and when.", { who: "Field worker" });
});
await part("task-done", async () => {
  await worker.goto(projectUrl);
  await worker.getByRole("listitem").filter({ hasText: "Pull cables" }).getByRole("button", { name: "Move to Done" }).click();
  await worker.getByRole("region", { name: "Done" }).getByRole("listitem").filter({ hasText: "Pull cables" }).waitFor();
});
await part("office-sees", async () => {
  await admin.goto(projectUrl);
  await shot(admin, "7", "The office sees the field work", "Back in the office: the visit, photo, reading and finished task on the project.");
});

// ---------- Steps 8 and 10: reports ----------
await part("report", async () => {
  await admin.goto(projectUrl);
  await admin.getByLabel("Upload a report", { exact: true }).setInputFiles(inspection);
  await admin.getByRole("status").filter({ hasText: /^Added/ }).first().waitFor({ timeout: 30000 });
  await admin.reload();
  const r = region(admin, "Reports");
  await shot(admin, "8", "Upload the office report", "The office report on the project, downloadable by everyone allowed to see it.", (await r.count()) ? { locator: r } : {});
});
await part("completion", async () => {
  await admin.goto(projectUrl);
  await admin.getByLabel("Upload a report", { exact: true }).setInputFiles(completion);
  await admin.getByRole("status").filter({ hasText: /^Added/ }).first().waitFor({ timeout: 30000 });
  await admin.reload();
  const r = region(admin, "Reports");
  await shot(admin, "10", "Upload the completion report", "The work-completion report, uploaded the same way.", (await r.count()) ? { locator: r } : {});
});

// ---------- Step 11: expert opinion as a project ----------
await part("opinion", async () => {
  await admin.goto(siteUrl);
  await admin.getByRole("link", { name: "New project", exact: true }).click();
  await admin.getByLabel("Project name").fill("Expert opinion: water damage");
  const d = admin.getByLabel("Description", { exact: true });
  if (await d.count()) await d.fill("Expert opinion on water damage in the storeroom, for the insurer.");
  await press(admin, "Create Project");
  await admin.waitForURL(/\/dashboard\/projects\/[^/]+$/);
  await shot(admin, "11", "An expert opinion as a project", "Expert opinions and arbitrations run as projects on the same site, with visits, readings and reports.");
});

// ---------- Step 12: communications ----------
await part("comms", async () => {
  await admin.goto(customerUrl);
  for (const body of ["Call with Noa: wiring done, completion report sent by email.", "WhatsApp from Noa: asked about the storeroom water damage."]) {
    await admin.getByLabel("Note", { exact: true }).fill(body);
    await press(admin, "Add note");
  }
  await shot(admin, "12", "Log calls, emails and WhatsApp", "Each contact with the customer as a dated note on the customer, newest first.");
});

// ---------- Overview ----------
await part("overview", async () => {
  await admin.goto("/dashboard/projects");
  await shot(admin, "Overview", "All projects", "Every project with its customer, status and progress.");
  await admin.goto("/dashboard");
  await shot(admin, "Overview", "Home", "Totals, overdue and due this week, tasks by status, recent projects.");
});

writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log("done", manifest.filter((m) => !m.error).length, "shots,", manifest.filter((m) => m.error).length, "failed");
await browser.close();
