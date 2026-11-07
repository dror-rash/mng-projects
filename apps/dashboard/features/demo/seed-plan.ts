import type { OrganizationStatus } from "@/features/organizations/organization-kinds";
import type { FieldInput } from "@/features/reading-forms/field-input";
import { parseFieldType } from "@/features/reading-forms/field-type";
import type { ReadingField, ReadingValues } from "@/features/readings/reading-values";
import type { CalendarDate } from "@/features/tasks/due-dates";
import { todayUtc } from "@/features/tasks/due-dates";
import type { TaskPriority } from "@/features/tasks/task-priority";
import type { TaskStatus } from "@/features/tasks/task-status";

/** Every demo customer carries this tag, so a rerun can find and replace the previous demo data. */
export const DEMO_TAG = "demo";

export type DemoTask = {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: CalendarDate | null;
  completedAt: Date | null;
  createdAt: Date;
  assignedToMe: boolean;
  /** Also links the task to the project's customer, so it shows under the customer's open tasks. */
  linkCustomer: boolean;
};

/** A visit to the project's site (task 058) by the seeding user, on a past day; some carry a reading (task 076). */
export type DemoVisit = {
  visitedOn: CalendarDate;
  /** On the visit's day; also the visit's creation time. */
  recordedAt: Date;
  notes: string;
  /** Which values the visit's reading of the demo form gets (`demoReadingValues`); null for no reading. */
  reading: number | null;
};

export type DemoProject = {
  name: string;
  description: string;
  createdAt: Date;
  tasks: DemoTask[];
  /** The customer's sub-company this project is for (task 053), by name; null for the customer itself. */
  subCompany: string | null;
  /** Where the work is (task 055): one of the sites of the project's customer (or sub-company), by name. */
  site: string;
  /** Oldest first; none until a task has started. */
  visits: DemoVisit[];
};

/** A site with the people to meet there (task 054). Coordinates are decimal strings, both or neither. */
export type DemoSite = {
  name: string;
  address: string;
  accessNotes: string | null;
  latitude: string | null;
  longitude: string | null;
  contacts: { name: string; role: string; phone: string }[];
};

/** A sub-company of a demo customer (task 053): its own details and sites; it shares the customer's demo tag. */
export type DemoSubCompany = { name: string; about: string; phone: string; sites: DemoSite[] };

export type DemoCustomer = {
  name: string;
  status: OrganizationStatus;
  email: string;
  phone: string;
  website: string;
  about: string;
  tags: string[];
  contacts: { name: string; role: string; email: string; phone: string; primary: boolean }[];
  notes: { body: string; createdAt: Date }[];
  subCompanies: DemoSubCompany[];
  sites: DemoSite[];
  projects: DemoProject[];
};

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** [status, priority, due in N days (negative = overdue, null = no date), completed N days ago, assigned to me]. */
type TaskSpec = [TaskStatus, TaskPriority, number | null, number | null, boolean?];

/** One project shape per state the dashboard can show; each customer gets all 15. */
const ARCHETYPES: { description: string; startedDaysAgo: number; tasks: TaskSpec[] }[] = [
  {
    description: "Not started: every task is still to do.",
    startedDaysAgo: 6,
    tasks: [["todo", "medium", 10, null], ["todo", "low", 14, null], ["todo", "medium", null, null], ["todo", "high", 21, null]],
  },
  {
    description: "Just kicked off: one task in progress.",
    startedDaysAgo: 9,
    tasks: [["in_progress", "high", 3, null, true], ["todo", "medium", 7, null], ["todo", "low", null, null], ["todo", "medium", 12, null]],
  },
  {
    description: "About halfway, with one task overdue.",
    startedDaysAgo: 40,
    tasks: [
      ["done", "medium", null, 20], ["done", "low", null, 12], ["done", "high", null, 5],
      ["in_progress", "medium", 2, null], ["in_progress", "high", -1, null, true],
      ["todo", "medium", 9, null], ["todo", "low", null, null], ["todo", "medium", 15, null],
    ],
  },
  {
    description: "Almost done: one task left.",
    startedDaysAgo: 60,
    tasks: [
      ["done", "high", null, 50], ["done", "medium", null, 41], ["done", "medium", null, 30], ["done", "low", null, 22],
      ["done", "medium", null, 9], ["done", "high", null, 2], ["done", "low", null, 1], ["in_progress", "medium", 1, null, true],
    ],
  },
  {
    description: "Completed: every task is done.",
    startedDaysAgo: 45,
    tasks: [["done", "high", null, 30], ["done", "medium", null, 25], ["done", "medium", null, 19], ["done", "low", null, 14], ["done", "medium", null, 11], ["done", "low", null, 9]],
  },
  { description: "Empty: no tasks yet.", startedDaysAgo: 3, tasks: [] },
  {
    description: "Behind schedule: several tasks overdue.",
    startedDaysAgo: 30,
    tasks: [["todo", "high", -5, null], ["in_progress", "high", -2, null, true], ["todo", "medium", -9, null], ["done", "medium", null, 15]],
  },
  {
    description: "Deadline week: everything is due in the next few days.",
    startedDaysAgo: 18,
    tasks: [["todo", "medium", 1, null], ["in_progress", "high", 3, null], ["todo", "low", 5, null], ["todo", "medium", 6, null, true]],
  },
  {
    description: "Urgent: all high priority, one due today.",
    startedDaysAgo: 10,
    tasks: [["in_progress", "high", 0, null, true], ["todo", "high", 1, null], ["done", "high", null, 1], ["todo", "high", -1, null]],
  },
  {
    description: "Backlog: low-priority ideas with no dates.",
    startedDaysAgo: 75,
    tasks: Array.from({ length: 8 }, (): TaskSpec => ["todo", "low", null, null]),
  },
  {
    description: "Mine: every task is assigned to me.",
    startedDaysAgo: 20,
    tasks: [["in_progress", "medium", 4, null, true], ["todo", "high", 2, null, true], ["todo", "low", null, null, true], ["done", "medium", null, 3, true]],
  },
  {
    description: "Busy week: most tasks finished in the last few days.",
    startedDaysAgo: 25,
    tasks: [["done", "medium", null, 0], ["done", "high", null, 2], ["done", "low", null, 4], ["done", "medium", null, 5], ["in_progress", "low", 8, null]],
  },
  {
    description: "Long-running: started six months ago, many tasks in every state.",
    startedDaysAgo: 180,
    tasks: [
      ["done", "high", null, 160], ["done", "medium", null, 120], ["done", "medium", null, 90], ["done", "low", null, 60],
      ["done", "medium", null, 31], ["done", "high", null, 6], ["in_progress", "medium", 5, null], ["in_progress", "high", -3, null],
      ["todo", "medium", 20, null], ["todo", "low", null, null], ["todo", "high", 30, null], ["todo", "medium", null, null],
    ],
  },
  {
    description: "New this week: just created.",
    startedDaysAgo: 2,
    tasks: [["todo", "medium", null, null], ["todo", "low", 14, null]],
  },
  {
    description: "Mixed: every priority in every column.",
    startedDaysAgo: 35,
    tasks: (["todo", "in_progress", "done"] as const).flatMap((status) =>
      (["high", "medium", "low"] as const).map((priority, i): TaskSpec => [
        status,
        priority,
        status === "done" ? null : 4 + i * 5,
        status === "done" ? 7 + i * 3 : null,
      ]),
    ),
  },
];

const THEMES = [
  "Website redesign", "Mobile app", "Q4 campaign", "Data migration", "Onboarding portal",
  "Brand refresh", "Analytics dashboard", "Support handbook", "Payment integration", "Office move",
  "Security audit", "Newsletter", "Inventory system", "Product launch", "Training program",
];

const TASK_TITLES = [
  "Gather requirements", "Draft the plan", "Review with stakeholders", "Design mockups", "Set up environment",
  "Write the first version", "Test on staging", "Fix review comments", "Prepare launch checklist", "Update documentation",
  "Collect feedback", "Plan the next phase", "Order supplies", "Book the kickoff meeting", "Send weekly update",
  "Check the budget", "Train the team", "Migrate old records", "Run a security check", "Write the summary",
];

/** Made-up companies on the reserved `.example` domain; statuses cover lead, active and past. */
const CUSTOMERS: {
  name: string;
  domain: string;
  status: OrganizationStatus;
  about: string;
  tags: string[];
  contacts: [string, string][];
  /** Sub-companies (task 053); every third project goes to the first, the next to the second. */
  subCompanies?: [string, string][];
}[] = [
  { name: "Brightline Studios", domain: "brightline.example", status: "active", about: "Design studio, our longest-running customer.", tags: ["design", "retainer"], contacts: [["Maya Cohen", "Creative director"], ["Liam Brooks", "Producer"], ["Noa Levi", "Finance"]] },
  { name: "Harborview Dental", domain: "harborview.example", status: "active", about: "Chain of three dental clinics.", tags: ["healthcare"], contacts: [["Daniel Price", "Operations manager"], ["Sara Kim", "Front desk lead"]], subCompanies: [["Harborview North Clinic", "The original clinic, downtown."], ["Harborview Kids", "Children's dentistry brand, two locations."]] },
  { name: "Copperleaf Farms", domain: "copperleaf.example", status: "lead", about: "Organic produce supplier; evaluating us for a new ordering site.", tags: ["agriculture", "prospect"], contacts: [["Omar Haddad", "Owner"], ["Grace Turner", "Sales"]] },
  { name: "Old Mill Bakery", domain: "oldmill.example", status: "past", about: "Finished the online shop last year; no current contract.", tags: ["retail"], contacts: [["Ella Novak", "Owner"], ["Tom Reyes", "Manager"]] },
  { name: "Nimbus Analytics", domain: "nimbus.example", status: "active", about: "Data startup; fast-moving, lots of parallel work.", tags: ["saas", "priority"], contacts: [["Ari Shapiro", "CTO"], ["Priya Nair", "Product lead"], ["Ben Ortiz", "Engineer"]] },
];

/** Made-up places for demo sites; every other one has coordinates (around Tel Aviv and Haifa). */
const SITE_PLACES: [string, string, string | null, string | null][] = [
  ["Head office", "1 Harbor St, Tel Aviv", "32.0853", "34.7818"],
  ["Haifa warehouse", "12 Port Rd, Haifa", null, null],
  ["North branch", "8 Carmel Ave, Haifa", "32.7940", "34.9896"],
  ["Service center", "40 Industrial Zone, Holon", null, null],
  ["Main store", "15 Market St, Jerusalem", "31.7683", "35.2137"],
];

const ON_SITE: [string, string][] = [
  ["Yossi Mizrahi", "Facility manager"],
  ["Rina Cohen", "Security"],
  ["Avi Peretz", "Maintenance lead"],
];

function demoSite(index: number, label?: string): DemoSite {
  const [name, address, latitude, longitude] = SITE_PLACES[index % SITE_PLACES.length]!;
  const [contact, role] = ON_SITE[index % ON_SITE.length]!;
  return {
    name: label ?? name,
    address,
    accessNotes: index % 2 === 0 ? "Report to the front desk; parking behind the building." : null,
    latitude,
    longitude,
    contacts: [{ name: contact, role, phone: `+1 555 03${index % 10}0` }],
  };
}

/**
 * The demo's reading form (task 076): published in the workspace by the seed, or reused when a published form of
 * this name is already there. Readings in the plan fill it in with `demoReadingValues`.
 */
export const DEMO_FORM: { name: string; description: string; fields: FieldInput[] } = {
  name: "Site inspection (demo)",
  description: "A quick check of the site's electrical setup, made by the demo data.",
  fields: [
    { label: "Voltage", type: "number", required: true, unit: "V", options: null },
    { label: "Breaker panel OK", type: "yes_no", required: true, unit: null, options: null },
    { label: "Condition", type: "choice", required: true, unit: null, options: ["Good", "Fair", "Needs repair"] },
    { label: "Remarks", type: "text", required: false, unit: null, options: null },
  ],
};

const VISIT_NOTES = [
  "Walked the site with the on-site contact; everything as planned.",
  "Checked progress against the plan. Two small fixes noted for next time.",
  "Met the facility manager, reviewed access and safety rules.",
  "Measured the main panel and photographed the wiring.",
  "Follow-up visit: the open items from last time are done.",
  "Short stop to drop off parts and check the schedule.",
];

const READING_NUMBERS = [230, 228.5, 231.2, 229.8];
const READING_REMARKS = ["All fine.", "Panel door sticks; reported to maintenance.", "Labels missing on two breakers.", "Clean and dry."];

/**
 * The values of a demo reading for a form's `fields`, as the reading form stores them (`reading-values.ts`):
 * every field filled in, by its type, chosen by `variant`; a Date field gets the visit's day.
 */
export function demoReadingValues(fields: ReadingField[], variant: number, visitedOn: CalendarDate): ReadingValues {
  const values: ReadingValues = {};
  for (const field of fields) {
    switch (parseFieldType(field.type)) {
      case "number":
        values[field.id] = READING_NUMBERS[variant % READING_NUMBERS.length]!;
        break;
      case "yes_no":
        values[field.id] = variant % 3 !== 0;
        break;
      case "choice":
        // The database requires two or more options on a Choice field. Without any (it can't happen), the field
        // stays empty, and the reading form would refuse a required one: the seed's insert doesn't check.
        if (field.options && field.options.length > 0) values[field.id] = field.options[variant % field.options.length]!;
        break;
      case "date":
        values[field.id] = visitedOn;
        break;
      default:
        // Text, and a type this app doesn't know, which the reading form takes as text.
        values[field.id] = READING_REMARKS[variant % READING_REMARKS.length]!;
    }
  }
  return values;
}

/**
 * 1–4 visits on past days after the project started (none until a task has started); the most recent visit
 * of every other project carries a reading.
 */
function demoVisits(ci: number, pi: number, startedDaysAgo: number, started: boolean, today: CalendarDate): DemoVisit[] {
  if (!started) return [];
  const count = 1 + ((pi + ci) % 4);
  return Array.from({ length: count }, (_, k) => {
    // Spread over the days between the start and yesterday, oldest first.
    const daysAgo = 1 + Math.floor(((startedDaysAgo - 2) * (count - k)) / (count + 1));
    const visitedOn = plusDays(today, -daysAgo);
    return {
      visitedOn,
      recordedAt: new Date(Date.parse(`${visitedOn}T09:00:00Z`) + (pi % 8) * HOUR),
      notes: VISIT_NOTES[(ci + pi + k) % VISIT_NOTES.length]!,
      reading: k === count - 1 && pi % 2 === 1 ? ci * ARCHETYPES.length + pi : null,
    };
  });
}

function plusDays(date: CalendarDate, days: number): CalendarDate {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

/**
 * Demo customers, projects, tasks and visits (some with a reading of `DEMO_FORM`), with dates relative to `now`
 * (UTC calendar days, like the app). Pure and deterministic: the same day gives the same plan.
 */
export function buildDemoPlan(now: Date): DemoCustomer[] {
  const today = todayUtc(now);
  const ago = (days: number, hours = 0) => new Date(now.getTime() - days * DAY - hours * HOUR);

  return CUSTOMERS.map((customer, ci) => {
    const subCompanies = (customer.subCompanies ?? []).map(([name, about], si) => ({
      name,
      about,
      phone: `+1 555 02${ci}${si}`,
      sites: [demoSite(ci + si + 2, `${name} location`)],
    }));
    // One or two sites per customer (task 054).
    const sites = ci % 2 === 0 ? [demoSite(ci), demoSite(ci + 1)] : [demoSite(ci)];
    return {
      name: customer.name,
      status: customer.status,
      email: `hello@${customer.domain}`,
      phone: `+1 555 01${ci}0`,
      website: `https://${customer.domain}`,
      about: customer.about,
      tags: [DEMO_TAG, ...customer.tags],
      contacts: customer.contacts.map(([name, role], i) => ({
        name,
        role,
        email: `${name.split(" ")[0]!.toLowerCase()}@${customer.domain}`,
        phone: `+1 555 01${ci}${i + 1}`,
        primary: i === 0,
      })),
      notes: [
        { body: `Kickoff call with ${customer.contacts[0]![0]}. Agreed on monthly check-ins.`, createdAt: ago(21 + ci) },
        { body: "Sent the latest status report; waiting on feedback.", createdAt: ago(3, ci) },
      ],
      subCompanies,
      sites,
      projects: ARCHETYPES.map((archetype, pi) => {
        // Customers start each kind of project a few hours apart, so "recently started" isn't a tie.
        const createdAt = ago(archetype.startedDaysAgo, ci * 3 + 1);
        const sub = subCompanies[pi % 3];
        const ownSites = sub?.sites ?? sites;
        return {
          name: THEMES[(pi + ci * 3) % THEMES.length]!,
          description: archetype.description,
          createdAt,
          subCompany: sub?.name ?? null,
          // Projects take turns among the sites of their customer (or sub-company).
          site: ownSites[pi % ownSites.length]!.name,
          tasks: archetype.tasks.map(([status, priority, dueIn, completedDaysAgo, mine], ti) => ({
            title: TASK_TITLES[(pi * 3 + ti) % TASK_TITLES.length]!,
            status,
            priority,
            dueDate: dueIn === null ? null : plusDays(today, dueIn),
            completedAt: completedDaysAgo === null ? null : ago(completedDaysAgo, ti),
            createdAt: new Date(createdAt.getTime() + ti * HOUR),
            assignedToMe: mine ?? false,
            linkCustomer: ti % 2 === 0,
          })),
          visits: demoVisits(ci, pi, archetype.startedDaysAgo, archetype.tasks.some(([status]) => status !== "todo"), today),
        };
      }),
    };
  });
}
