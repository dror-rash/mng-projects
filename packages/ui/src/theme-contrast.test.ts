// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * WCAG contrast of the design tokens in `theme.css` (task 118). Text pairs need 4.5:1 (AA),
 * non-text marks (focus rings, the meter fill on its track) need 3:1 (1.4.11).
 * Tokens the test reads are written as hex, so no color-space converter is needed.
 */
const css = readFileSync(fileURLToPath(new URL("./theme.css", import.meta.url)), "utf8");

type Theme = "light" | "dark";

function block(theme: Theme): string {
  const selector = theme === "light" ? ":root" : ".dark";
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No ${selector} block in theme.css`);
  return css.slice(start, css.indexOf("}", start));
}

function token(theme: Theme, name: string): string {
  const value = new RegExp(`(?<![\\w-])--${name}:\\s*([^;]+);`).exec(block(theme))?.[1];
  if (value === undefined) throw new Error(`--${name} is not defined in the ${theme} theme`);
  return value.trim();
}

function channels(hex: string): [number, number, number] {
  const digits = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (digits === undefined) throw new Error(`${hex} is not a six-digit hex color`);
  const n = Number.parseInt(digits, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = channels(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `top` laid over `bottom` at `alpha` (0–1), as `bg-token/NN` paints it. */
function mix(top: string, bottom: string, alpha: number): string {
  const [a, b] = [channels(top), channels(bottom)];
  return `#${a.map((c, i) => Math.round(c * alpha + (b[i] ?? 0) * (1 - alpha)).toString(16).padStart(2, "0")).join("")}`;
}

const TEXT = 4.5;
const MARK = 3;

const pairs: { theme: Theme; fg: string; bg: string; min: number; what: string }[] = [
  // Text, light
  { theme: "light", fg: "foreground", bg: "background", min: TEXT, what: "body text on the canvas" },
  { theme: "light", fg: "card-foreground", bg: "card", min: TEXT, what: "body text on cards" },
  { theme: "light", fg: "muted-foreground", bg: "background", min: TEXT, what: "muted text on the canvas" },
  { theme: "light", fg: "muted-foreground", bg: "card", min: TEXT, what: "muted text on cards" },
  { theme: "light", fg: "muted-foreground", bg: "muted", min: TEXT, what: "muted text on muted rows" },
  { theme: "light", fg: "secondary-foreground", bg: "secondary", min: TEXT, what: "text on secondary fills" },
  { theme: "light", fg: "sidebar-foreground", bg: "sidebar", min: TEXT, what: "menu labels on the menu" },
  { theme: "light", fg: "sidebar-muted", bg: "sidebar", min: TEXT, what: "menu hints on the menu" },
  { theme: "light", fg: "primary-foreground", bg: "primary", min: TEXT, what: "button text on primary fills" },
  { theme: "light", fg: "sidebar-accent-foreground", bg: "sidebar-accent", min: TEXT, what: "the current menu item" },
  { theme: "light", fg: "destructive", bg: "background", min: TEXT, what: "error text on the canvas" },
  { theme: "light", fg: "destructive", bg: "card", min: TEXT, what: "error text on cards" },
  // Text, dark
  { theme: "dark", fg: "foreground", bg: "background", min: TEXT, what: "body text on the canvas" },
  { theme: "dark", fg: "card-foreground", bg: "card", min: TEXT, what: "body text on cards" },
  { theme: "dark", fg: "muted-foreground", bg: "background", min: TEXT, what: "muted text on the canvas" },
  { theme: "dark", fg: "muted-foreground", bg: "card", min: TEXT, what: "muted text on cards" },
  { theme: "dark", fg: "muted-foreground", bg: "muted", min: TEXT, what: "muted text on muted rows" },
  { theme: "dark", fg: "secondary-foreground", bg: "secondary", min: TEXT, what: "text on secondary fills" },
  { theme: "dark", fg: "sidebar-foreground", bg: "sidebar", min: TEXT, what: "menu labels on the menu" },
  { theme: "dark", fg: "sidebar-muted", bg: "sidebar", min: TEXT, what: "menu hints on the menu" },
  { theme: "dark", fg: "primary-foreground", bg: "primary", min: TEXT, what: "button text on primary fills" },
  { theme: "dark", fg: "sidebar-accent-foreground", bg: "sidebar-accent", min: TEXT, what: "the current menu item" },
  { theme: "dark", fg: "destructive", bg: "background", min: TEXT, what: "error text on the canvas" },
  { theme: "dark", fg: "destructive", bg: "card", min: TEXT, what: "error text on cards" },
  // Non-text marks
  { theme: "light", fg: "ring", bg: "background", min: MARK, what: "focus marks on the canvas" },
  { theme: "light", fg: "ring", bg: "card", min: MARK, what: "focus marks on cards" },
  { theme: "light", fg: "sidebar-ring", bg: "sidebar", min: MARK, what: "focus marks in the menu" },
  { theme: "light", fg: "chart-1", bg: "chart-track", min: MARK, what: "the meter fill on its track" },
  { theme: "dark", fg: "ring", bg: "background", min: MARK, what: "focus marks on the canvas" },
  { theme: "dark", fg: "ring", bg: "card", min: MARK, what: "focus marks on cards" },
  { theme: "dark", fg: "sidebar-ring", bg: "sidebar", min: MARK, what: "focus marks in the menu" },
  { theme: "dark", fg: "chart-1", bg: "chart-track", min: MARK, what: "the meter fill on its track" },
];

describe("theme contrast", () => {
  it.each(pairs.map((p) => [`${p.theme}: ${p.what} (--${p.fg} on --${p.bg}) reaches ${p.min}:1`, p] as const))(
    "%s",
    (_name, { theme, fg, bg, min }) => {
      expect(contrast(token(theme, fg), token(theme, bg))).toBeGreaterThanOrEqual(min);
    },
  );

  it.each([
    ["light", "background", "#f6f7eb"],
    ["light", "foreground", "#393e41"],
    ["light", "accent", "#e94f37"],
    ["light", "primary", "#c73a23"],
    ["light", "sidebar", "#393e41"],
    ["dark", "background", "#393e41"],
    ["dark", "accent", "#e94f37"],
    ["dark", "sidebar", "#26292b"],
  ] as const)("%s: --%s is the owner's %s", (theme, name, value) => {
    expect(token(theme, name).toLowerCase()).toBe(value);
  });

  it.each(["background", "card"])("dark: white text on the destructive button reaches 4.5:1 on --%s", (surface) => {
    // The dark destructive token is a light red for text; the button lays it over the surface at a low alpha.
    const button = readFileSync(fileURLToPath(new URL("./components/button.tsx", import.meta.url)), "utf8");
    for (const [, alpha] of button.matchAll(/dark:(?:hover:)?bg-destructive\/(\d+)/g)) {
      const fill = mix(token("dark", "destructive"), token("dark", surface), Number(alpha) / 100);
      expect(contrast("#ffffff", fill), `at ${alpha}%`).toBeGreaterThanOrEqual(TEXT);
    }
  });

  it("computes the WCAG ratio (black on white is 21:1)", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });
});
