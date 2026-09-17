#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export function evaluateSonarGateway(env = process.env) {
  const host = String(env.SONAR_HOST_URL ?? "").trim();
  const token = String(env.SONAR_TOKEN ?? "").trim();
  const organization = String(env.SONAR_ORGANIZATION ?? "").trim();
  const projectKey = String(env.SONAR_PROJECT_KEY ?? "").trim();
  const violations = [];

  if (!host) {
    violations.push(
      "SONAR_HOST_URL is empty. Set GitHub Actions repository or organization variable vars.SONAR_HOST_URL. Refusing silent quality-gate bypass."
    );
  } else {
    let parsed;
    try {
      parsed = new URL(host);
    } catch {
      violations.push("SONAR_HOST_URL is not a valid URL.");
    }
    if (parsed && !ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      violations.push("SONAR_HOST_URL must use http or https.");
    }
  }

  if (!token) {
    violations.push(
      "SONAR_TOKEN is empty. Set GitHub Actions secret secrets.SONAR_TOKEN. Refusing silent quality-gate bypass."
    );
  }

  const scannerArgs = ["-Dsonar.qualitygate.wait=true"];
  if (organization) scannerArgs.push(`-Dsonar.organization=${organization}`);
  if (projectKey) scannerArgs.push(`-Dsonar.projectKey=${projectKey}`);

  return {
    ok: violations.length === 0,
    violations,
    scannerArgs: scannerArgs.join(" "),
    hostPresent: host.length > 0,
    tokenPresent: token.length > 0,
    organizationPresent: organization.length > 0,
    projectKeyPresent: projectKey.length > 0
  };
}

export function writeGithubOutput(outputPath, fields) {
  const lines = Object.entries(fields).map(([key, value]) => `${key}=${value}`);
  fs.appendFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
}

function isMain() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMain()) {
  const result = evaluateSonarGateway(process.env);
  if (!result.ok) {
    process.stderr.write(`${result.violations.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      "Sonar gateway configuration accepted. Host URL is present. Token is present (value not logged). Quality gate wait is enabled.\n"
    );
    process.stdout.write(`scanner_args=${result.scannerArgs}\n`);
    if (process.env.GITHUB_OUTPUT) {
      writeGithubOutput(process.env.GITHUB_OUTPUT, { scanner_args: result.scannerArgs });
    }
  }
}
