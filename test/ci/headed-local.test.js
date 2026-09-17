import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const headedRunner = path.join(repoRoot, "scripts", "ci", "run-headed-local.mjs");

test("headed local runner refuses to run when CI is set", () => {
  const result = spawnSync(process.execPath, [headedRunner], {
    encoding: "utf8",
    env: { ...process.env, CI: "true" }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /local-only/);
});
