// Evaluates the Workload Identity provider's `attribute.deploy_target` mapping (infra/main.tf) for a set of GitHub
// token claims, the way Google's STS would, and prints the result: main, preview, none, or error (a claim the
// expression reads is missing, which makes STS refuse the token). For test-workflows.sh (task 083).
//
// The expression is CEL. It may use only the part of CEL that JavaScript reads the same way (claims, single-quoted
// strings, == != && || ! ?: ( ) + and .startsWith/.endsWith), and the script refuses anything else, so evaluating it
// as JavaScript gives CEL's answer. Interpolations are replaced from the .tf files' locals and `repo`.
//
// Run: node infra/scripts/wif-deploy-target.mjs <repo owner/name> '<claims as JSON>'
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const infra = fileURLToPath(new URL("..", import.meta.url));
const tf = readdirSync(infra)
  .filter((f) => f.endsWith(".tf"))
  .map((f) => readFileSync(infra + f, "utf8"))
  .join("\n");

/** The HCL string literal assigned to `key` on one line, unescaped. */
function hclString(key) {
  const re = new RegExp(`^\\s*"?${key.replace(/\./g, "\\.")}"?\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*$`, "m");
  const m = tf.match(re);
  if (!m) throw new Error(`no one-line string for ${key} in infra/*.tf`);
  return m[1].replace(/\\(.)/g, "$1");
}

function interpolate(text, repo) {
  return text.replace(/\$\{([^}]*)\}/g, (_, ref) => {
    if (ref === "var.github_repository") return repo;
    const local = ref.match(/^local\.([a-z_]+)$/);
    if (local) return interpolate(hclString(local[1]), repo);
    throw new Error(`unsupported interpolation \${${ref}}`);
  });
}

/**
 * Refuses any token outside the CEL subset JavaScript evaluates the same way. A claim must be compared or
 * prefix-checked right away: a bare claim (`assertion.x && …`) is truthy in JavaScript but an error in CEL.
 */
function checkSubset(expr) {
  const token = /\s+|'[^'\\]*'|assertion\.[a-z_]+|\.(?:startsWith|endsWith)\(|==|!=|&&|\|\||[!?:()+]/y;
  const tokens = [];
  let at = 0;
  while (at < expr.length) {
    token.lastIndex = at;
    const m = token.exec(expr);
    if (!m) throw new Error(`not in the supported CEL subset at: ${expr.slice(at, at + 30)}`);
    if (m[0].trim()) tokens.push(m[0]);
    at = token.lastIndex;
  }
  tokens.forEach((t, i) => {
    if (t.startsWith("assertion.") && !/^(==|!=|\.startsWith\(|\.endsWith\()$/.test(tokens[i + 1] ?? "")) {
      throw new Error(`${t} must be followed by ==, != or .startsWith(/.endsWith(`);
    }
  });
}

const [repo, claimsJson] = process.argv.slice(2);
const expr = interpolate(hclString("attribute.deploy_target"), repo);
checkSubset(expr);
const claims = JSON.parse(claimsJson);
const assertion = new Proxy(claims, {
  get(target, key) {
    if (!Object.hasOwn(target, key)) throw new Error(`missing claim ${String(key)}`);
    return target[key];
  },
});
let result;
try {
  result = new Function("assertion", `"use strict"; return (${expr});`)(assertion);
} catch (e) {
  if (!String(e.message).startsWith("missing claim")) throw e;
  result = "error";
}
process.stdout.write(`${result}\n`);
