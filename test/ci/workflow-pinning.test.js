import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const workflowPath = path.join(repoRoot, ".github", "workflows", "ci.yml");
const PINNED_ACTION = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?@[0-9a-f]{40}$/;
const VERSION_COMMENT = /\bv?\d+\.\d+/;

test("CI workflow is SHA-pinned, fail-fast disabled, headless, and Sonar-gated", async () => {
  const text = await fs.readFile(workflowPath, "utf8");

  assert.equal(/xvfb-run/i.test(text), false);
  assert.equal(/\bxvfb\b/i.test(text), false);
  assert.equal(/DISPLAY\s*:/i.test(text), false);
  assert.equal(/fail-fast:\s*true/.test(text), false);
  assert.match(text, /fail-fast:\s*false/);
  assert.match(text, /if:\s*always\(\)/);
  assert.match(text, /npm run test:ci/);
  assert.equal(text.includes("test:headed"), false);
  assert.match(text, /vars\.SONAR_HOST_URL/);
  assert.match(text, /secrets\.SONAR_TOKEN/);
  assert.equal(/sonar\.login\s*=/.test(text), false);
  assert.equal(/xox[baprs]-/.test(text), false);
  assert.match(text, /scripts\/ci\/require-sonar-gateway\.mjs/);
  assert.match(text, /npm run audit:production/);

  const usesLines = [...text.matchAll(/^\s*uses:\s*(.+)$/gm)].map((match) => match[1].trim());
  assert.ok(usesLines.length >= 5, "expected pinned actions in the workflow");
  for (const line of usesLines) {
    const [spec, ...commentParts] = line.split("#");
    const action = spec.trim().replace(/^["']|["']$/g, "");
    if (action.startsWith("./")) continue;
    assert.match(action, PINNED_ACTION);
    assert.ok(commentParts.join("#").trim().length > 0, `missing version comment for ${action}`);
    assert.match(commentParts.join("#"), VERSION_COMMENT);
  }
});

test("sonar-project.properties has no host URL or token", async () => {
  const text = await fs.readFile(path.join(repoRoot, "sonar-project.properties"), "utf8");
  assert.equal(/sonar\.host\.url=/i.test(text), false);
  assert.equal(/sonar\.token=/i.test(text), false);
  assert.equal(/sonar\.login=/i.test(text), false);
  assert.match(text, /sonar\.sources=src/);
});
