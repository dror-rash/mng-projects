/**
 * Catalogue parity (ADR-0011): each catalogue's `en` and `he` must have the same keys and the same ICU
 * placeholders, so a missing translation fails a unit test instead of showing a key on the page. Every
 * package or zone with a catalogue runs this in its own `messages.test.ts`.
 */
export type Messages = { [key: string]: string | Messages };

/** `{name}` and `{count, plural, …}` give `name` and `count`; plural branch text (`{# tasks}`) doesn't count. */
function placeholders(message: string): string[] {
  const names = new Set<string>();
  for (const match of message.matchAll(/\{\s*([A-Za-z_]\w*)\s*[,}]/g)) names.add(match[1]!);
  return [...names].sort();
}

export function catalogueDifferences(en: Messages, he: Messages, prefix = ""): string[] {
  const differences: string[] = [];
  for (const key of Object.keys(en)) {
    const path = prefix + key;
    const a = en[key]!;
    const b = he[key];
    if (b === undefined) {
      differences.push(`he is missing ${path}`);
    } else if (typeof a !== typeof b) {
      differences.push(`${path} is ${typeof a === "string" ? "text" : "a group"} in en but ${typeof b === "string" ? "text" : "a group"} in he`);
    } else if (typeof a === "string" && typeof b === "string") {
      const [inEn, inHe] = [placeholders(a).join(", "), placeholders(b).join(", ")];
      if (inEn !== inHe) differences.push(`${path} has placeholders ${inEn || "none"} in en but ${inHe || "none"} in he`);
    } else {
      differences.push(...catalogueDifferences(a as Messages, b as Messages, `${path}.`));
    }
  }
  for (const key of Object.keys(he)) {
    if (!(key in en)) differences.push(`en is missing ${prefix}${key}`);
  }
  return differences;
}
