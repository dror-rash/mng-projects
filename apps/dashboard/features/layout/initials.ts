/**
 * The menu avatar's letters (task 119): the first letters of my first and last name, or the first letter
 * of my email when I have no name. Upper case where the script has it.
 */
export function initials(name: string | null | undefined, email: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = words.length === 0 ? [email] : words.length === 1 ? words : [words[0]!, words.at(-1)!];
  return letters.map((word) => Array.from(word)[0] ?? "").join("").toLocaleUpperCase();
}
