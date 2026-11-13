/**
 * Catalogue parity (ADR-0011): each catalogue's `en` and `he` must have the same keys and the same ICU
 * placeholders, so a missing translation fails a unit test instead of showing a key on the page. Every
 * package or zone with a catalogue runs this in its own `messages.test.ts`.
 */
export type Messages = { [key: string]: string | Messages };

/**
 * The argument names in an ICU message: `{name}`, `{count, plural, …}`, `{kind, select, …}`, `{n, number}`,
 * also inside plural and select branches. Branch text (`one {task}`) and quoted text (`'{name}'`) are not
 * arguments. A small walk over the message, so no parser dependency.
 */
function placeholders(message: string): string[] {
  const names = new Set<string>();
  let i = 0;

  // Text up to the end, or up to the `}` that closes the branch being read.
  function text(): void {
    while (i < message.length) {
      const char = message[i];
      if (char === "'") quoted();
      else if (char === "{") argument();
      else if (char === "}") return;
      else i++;
    }
  }

  // `''` is an apostrophe; `'` before `{`, `}`, `#` or `|` quotes up to the next `'`.
  function quoted(): void {
    const next = message[i + 1];
    if (next === "'") i += 2;
    else if (next !== undefined && "{}#|".includes(next)) {
      const close = message.indexOf("'", i + 1);
      i = close === -1 ? message.length : close + 1;
    } else i++;
  }

  function readUntil(stops: string): string {
    const begin = i;
    while (i < message.length && !stops.includes(message[i]!)) i++;
    return message.slice(begin, i).trim();
  }

  function argument(): void {
    i++; // {
    const name = readUntil(",}");
    if (/^[A-Za-z_]\w*$/.test(name)) names.add(name);
    if (message[i] === "}") return void i++;
    i++; // ,
    const type = readUntil(",}");
    if (message[i] === "}") return void i++;
    i++; // ,
    if (type === "plural" || type === "selectordinal" || type === "select") branches();
    else style();
  }

  // `one {…} other {…}` (with `=0` and `offset:1`), up to the argument's closing `}`.
  function branches(): void {
    while (i < message.length) {
      readUntil("{}");
      if (message[i] === "}") return void i++;
      i++; // {
      text();
      i++; // } closing the branch
    }
  }

  // A number or date style (`::currency/ILS`): no arguments, up to the closing `}`.
  function style(): void {
    readUntil("}");
    i++;
  }

  text();
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
