import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const here = dirname(process.argv[1] ?? ".");
const serverRoot = resolve(here, "..");
const repoRoot = resolve(serverRoot, "..");

function apply(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\n/g, "\n");
    process.env[key] = value;
  }
}

apply(resolve(repoRoot, ".env.local"));
apply(resolve(serverRoot, ".env"));
