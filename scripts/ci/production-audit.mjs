#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_ALLOWLIST = path.join(REPO_ROOT, ".github", "audit-allowlist.json");
const REQUIRED_EXCEPTION_FIELDS = ["id", "package", "reason", "expires"];

function uniqueKey(advisory) {
  return `${advisory.id}\0${advisory.package}`;
}

export function normalizeAdvisories(auditJson) {
  const advisories = [];

  if (auditJson?.advisories && typeof auditJson.advisories === "object") {
    for (const entry of Object.values(auditJson.advisories)) {
      if (!entry || typeof entry !== "object") continue;
      advisories.push({
        package: entry.module_name ?? entry.name ?? "unknown",
        severity: entry.severity ?? "unknown",
        title: entry.title ?? "",
        id: entry.github_advisory_id ?? entry.cves?.[0] ?? String(entry.id ?? "unidentified"),
        url: entry.url ?? null,
        range: entry.vulnerable_versions ?? ""
      });
    }
  }

  const vulnerabilities = auditJson?.vulnerabilities;
  if (vulnerabilities && typeof vulnerabilities === "object") {
    for (const [name, entry] of Object.entries(vulnerabilities)) {
      const via = Array.isArray(entry?.via) ? entry.via : [];
      const objects = via.filter((item) => item && typeof item === "object");
      if (objects.length === 0) continue;
      for (const item of objects) {
        const url = String(item.url ?? "");
        const ghsaMatch = url.match(/GHSA-[\w-]+/);
        const id = ghsaMatch?.[0]
          ?? (typeof item.source === "string" && item.source.startsWith("GHSA-") ? item.source : null)
          ?? (item.cve ? String(item.cve) : null)
          ?? (item.source != null ? String(item.source) : `${name}:unidentified`);
        advisories.push({
          package: String(item.name ?? name).toLowerCase(),
          severity: item.severity ?? entry.severity ?? "unknown",
          title: item.title ?? "",
          id,
          url: url || null,
          range: item.range ?? entry.range ?? ""
        });
      }
    }
  }

  const seen = new Set();
  return advisories.filter((advisory) => {
    const key = uniqueKey(advisory);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseExpiry(expires) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
    return new Date(`${expires}T23:59:59.999Z`);
  }
  return new Date(expires);
}

export function loadAllowlist(allowlistPath) {
  const raw = fs.readFileSync(allowlistPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.exceptions)) {
    throw new Error(`Allowlist ${allowlistPath} must be an object with an exceptions array.`);
  }
  return parsed;
}

export function evaluateProductionAudit({ advisories, allowlist, now = new Date() }) {
  const exceptions = allowlist.exceptions;
  const configErrors = [];
  const activeExceptions = [];

  for (const [index, row] of exceptions.entries()) {
    if (!row || typeof row !== "object") {
      configErrors.push(`exceptions[${index}] must be an object`);
      continue;
    }
    for (const field of REQUIRED_EXCEPTION_FIELDS) {
      if (typeof row[field] !== "string" || row[field].trim() === "") {
        configErrors.push(`exceptions[${index}] missing required string field "${field}"`);
      }
    }
    if (typeof row.expires === "string" && row.expires.trim() !== "") {
      const expiresAt = parseExpiry(row.expires.trim());
      if (Number.isNaN(expiresAt.getTime())) {
        configErrors.push(`exceptions[${index}] expires must be an ISO-8601 date`);
      } else if (expiresAt.getTime() < now.getTime()) {
        configErrors.push(`exceptions[${index}] id=${row.id} expired on ${row.expires}`);
      } else {
        activeExceptions.push({
          id: row.id.trim(),
          package: row.package.trim().toLowerCase(),
          reason: row.reason.trim(),
          expires: row.expires.trim()
        });
      }
    }
  }

  const allowlisted = [];
  const blocking = [];

  for (const advisory of advisories) {
    const match = activeExceptions.find((row) => {
      const idMatch = row.id === advisory.id;
      const packageMatch = row.package === "*" || row.package === String(advisory.package).toLowerCase();
      return idMatch && packageMatch;
    });
    if (match) {
      allowlisted.push({ advisory, exception: match });
    } else {
      blocking.push(advisory);
    }
  }

  const violations = [
    ...configErrors,
    ...blocking.map((advisory) => (
      `Production advisory ${advisory.id} (${advisory.package}, ${advisory.severity}) is not allowlisted: ${advisory.title || "no title"}`
    ))
  ];

  return {
    ok: violations.length === 0,
    violations,
    configErrors,
    allowlisted,
    blocking,
    advisoryCount: advisories.length
  };
}

export function runNpmProductionAudit() {
  const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    cwd: REPO_ROOT
  });
  const stdout = result.stdout || "";
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(
      `npm audit --omit=dev did not return JSON (exit ${result.status}): ${(result.stderr || stdout).slice(0, 2000)}`
    );
  }
}

function readArg(name, args) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

export function runProductionAuditGate({ auditJson, allowlistPath = DEFAULT_ALLOWLIST, now = new Date() }) {
  const allowlist = loadAllowlist(allowlistPath);
  const advisories = normalizeAdvisories(auditJson);
  return evaluateProductionAudit({ advisories, allowlist, now });
}

function isMain() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMain()) {
  try {
    const args = process.argv.slice(2);
    const auditJsonPath = readArg("--audit-json", args);
    const allowlistPath = readArg("--allowlist", args) ?? DEFAULT_ALLOWLIST;
    const auditJson = auditJsonPath
      ? JSON.parse(fs.readFileSync(path.resolve(auditJsonPath), "utf8"))
      : runNpmProductionAudit();
    const result = runProductionAuditGate({ auditJson, allowlistPath, now: new Date() });
    process.stdout.write(`${JSON.stringify({
      ok: result.ok,
      advisory_count: result.advisoryCount,
      blocking_count: result.blocking.length,
      allowlisted_count: result.allowlisted.length,
      blocking: result.blocking,
      allowlisted: result.allowlisted.map((entry) => ({
        id: entry.advisory.id,
        package: entry.advisory.package,
        expires: entry.exception.expires,
        reason: entry.exception.reason
      })),
      violations: result.violations
    }, null, 2)}\n`);
    if (!result.ok) {
      process.stderr.write(`${result.violations.join("\n")}\n`);
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
