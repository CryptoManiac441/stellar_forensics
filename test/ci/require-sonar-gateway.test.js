import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { evaluateSonarGateway, writeGithubOutput } from "../../scripts/ci/require-sonar-gateway.mjs";

test("missing SONAR_HOST_URL fails closed instead of skipping", () => {
  const result = evaluateSonarGateway({
    SONAR_HOST_URL: "",
    SONAR_TOKEN: "not-a-real-token"
  });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((line) => line.includes("SONAR_HOST_URL")));
  assert.ok(result.violations.some((line) => line.includes("silent quality-gate bypass")));
});

test("missing SONAR_TOKEN fails closed", () => {
  const result = evaluateSonarGateway({
    SONAR_HOST_URL: "https://sonarcloud.io",
    SONAR_TOKEN: "   "
  });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((line) => line.includes("SONAR_TOKEN")));
});

test("invalid host URL is rejected", () => {
  const result = evaluateSonarGateway({
    SONAR_HOST_URL: "not-a-url",
    SONAR_TOKEN: "not-a-real-token"
  });
  assert.equal(result.ok, false);
});

test("valid vars/secrets pattern enables quality-gate wait", () => {
  const result = evaluateSonarGateway({
    SONAR_HOST_URL: "https://sonarcloud.io",
    SONAR_TOKEN: "not-a-real-token",
    SONAR_ORGANIZATION: "cryptomaniac441",
    SONAR_PROJECT_KEY: "CryptoManiac441_stellar_forensics"
  });
  assert.equal(result.ok, true);
  assert.match(result.scannerArgs, /sonar\.qualitygate\.wait=true/);
  assert.match(result.scannerArgs, /sonar\.organization=cryptomaniac441/);
  assert.match(result.scannerArgs, /sonar\.projectKey=CryptoManiac441_stellar_forensics/);
  assert.equal(result.scannerArgs.includes("not-a-real-token"), false);
});

test("GitHub output writer does not persist the token", () => {
  const filePath = path.join(os.tmpdir(), `sonar-output-${process.pid}.txt`);
  writeGithubOutput(filePath, { scanner_args: "-Dsonar.qualitygate.wait=true" });
  const text = fs.readFileSync(filePath, "utf8");
  fs.rmSync(filePath, { force: true });
  assert.match(text, /scanner_args=-Dsonar\.qualitygate\.wait=true/);
  assert.equal(text.includes("SONAR_TOKEN"), false);
});
