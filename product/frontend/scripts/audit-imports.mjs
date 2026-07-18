import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const root = path.resolve(".");
const repoRoot = path.resolve(root, "../..");
const tracked = new Set(
  execSync("git ls-files product/frontend/", { cwd: repoRoot, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((f) => f.replace(/^product\/frontend\//, "").replace(/\\/g, "/")),
);

const imports = new Set();
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx?|jsx?|mjs)$/.test(entry.name)) {
      const text = fs.readFileSync(full, "utf8");
      for (const m of text.matchAll(/from ["']@\/([^"']+)["']/g)) imports.add(m[1]);
    }
  }
}
walk(root);

const missing = [];
const caseMismatch = [];
for (const imp of imports) {
  const candidates = [imp, `${imp}.tsx`, `${imp}.ts`, `${imp}/index.tsx`, `${imp}/index.ts`];
  const matches = candidates.filter((c) => tracked.has(c));
  if (!matches.length) {
    missing.push(imp);
    continue;
  }
  const exact = matches.some((m) => m === imp || m.startsWith(`${imp}.`));
  if (!exact && matches.length) caseMismatch.push({ import: imp, actual: matches[0] });
}

console.log(JSON.stringify({ missing, caseMismatch }, null, 2));
