import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeAdvisories, runProductionAuditGate } from "../../scripts/ci/production-audit.mjs";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const repoAllowlist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".github", "audit-allowlist.json");

test("production audit passes a clean production tree", async () => {
  const auditJson = JSON.parse(await fs.readFile(path.join(fixtures, "audit-clean.json"), "utf8"));
  const result = runProductionAuditGate({
    auditJson,
    allowlistPath: repoAllowlist,
    now: new Date("2026-09-17T00:00:00.000Z")
  });
  assert.equal(result.ok, true);
  assert.equal(result.advisoryCount, 0);
  assert.equal(result.blocking.length, 0);
});

test("production advisory without allowlist fails the gate", async () => {
  const auditJson = JSON.parse(await fs.readFile(path.join(fixtures, "audit-prod-high.json"), "utf8"));
  const result = runProductionAuditGate({
    auditJson,
    allowlistPath: repoAllowlist,
    now: new Date("2026-09-17T00:00:00.000Z")
  });
  assert.equal(result.ok, false);
  assert.equal(result.blocking.length, 1);
  assert.equal(result.blocking[0].id, "GHSA-ffff-ffff-ffff");
});

test("allowlisted production advisory passes until expiry", async () => {
  const auditJson = JSON.parse(await fs.readFile(path.join(fixtures, "audit-prod-high.json"), "utf8"));
  const result = runProductionAuditGate({
    auditJson,
    allowlistPath: path.join(fixtures, "allowlist-valid.json"),
    now: new Date("2026-09-17T00:00:00.000Z")
  });
  assert.equal(result.ok, true);
  assert.equal(result.allowlisted.length, 1);
  assert.equal(result.blocking.length, 0);
});

test("expired allowlist exception fails closed", async () => {
  const auditJson = JSON.parse(await fs.readFile(path.join(fixtures, "audit-prod-high.json"), "utf8"));
  const result = runProductionAuditGate({
    auditJson,
    allowlistPath: path.join(fixtures, "allowlist-expired.json"),
    now: new Date("2026-09-17T00:00:00.000Z")
  });
  assert.equal(result.ok, false);
  assert.ok(result.configErrors.some((line) => line.includes("expired")));
});

test("normalizeAdvisories reads npm v2 via objects and skips alias-only nodes", () => {
  const advisories = normalizeAdvisories({
    vulnerabilities: {
      "left-pad": {
        via: [{ name: "left-pad", url: "https://github.com/advisories/GHSA-ffff-ffff-ffff", severity: "high", title: "x" }],
        severity: "high"
      },
      "alias-pkg": {
        via: ["left-pad"],
        severity: "high"
      }
    }
  });
  assert.equal(advisories.length, 1);
  assert.equal(advisories[0].id, "GHSA-ffff-ffff-ffff");
  assert.equal(advisories[0].package, "left-pad");
});

test("repository allowlist has an exceptions array and no placeholder rows", async () => {
  const allowlist = JSON.parse(await fs.readFile(repoAllowlist, "utf8"));
  assert.equal(Array.isArray(allowlist.exceptions), true);
  assert.equal(allowlist.exceptions.length, 0);
});

test("production audit CLI audits with --omit=dev", async () => {
  const source = await fs.readFile(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "ci", "production-audit.mjs"),
    "utf8"
  );
  assert.match(source, /npm", \["audit", "--omit=dev", "--json"\]/);
});
