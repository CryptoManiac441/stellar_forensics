#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export function collectJobDiagnostics(env = process.env, extras = {}) {
  return {
    generated_at: new Date().toISOString(),
    schema: "stellar-forensics.ci.cell-diagnostics.v1",
    matrix: {
      os: extras.os ?? env.MATRIX_OS ?? null,
      node: extras.node ?? env.MATRIX_NODE ?? null
    },
    runner: {
      platform: process.platform,
      arch: process.arch,
      os_type: os.type(),
      os_release: os.release()
    },
    versions: {
      node: process.version,
      npm: extras.npmVersion ?? env.NPM_VERSION ?? null
    },
    ci: {
      github_run_id: env.GITHUB_RUN_ID ?? null,
      github_job: env.GITHUB_JOB ?? null,
      github_sha: env.GITHUB_SHA ?? null,
      job_status: extras.jobStatus ?? env.JOB_STATUS ?? null,
      test_exit_code: extras.testExitCode ?? (env.TEST_EXIT_CODE === undefined ? null : Number(env.TEST_EXIT_CODE))
    },
    headless: extras.headless ?? null,
    env_flags: {
      CI: env.CI ?? null,
      HEADED: env.HEADED ?? null,
      PLAYWRIGHT_HEADED: env.PLAYWRIGHT_HEADED ?? null,
      FORCE_XVFB: env.FORCE_XVFB ?? null,
      DISPLAY: env.DISPLAY ?? null
    }
  };
}

export async function writeJobDiagnostics(filePath, diagnostics) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(diagnostics, null, 2)}\n`, "utf8");
  return filePath;
}

function readArg(name, args) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function isMain() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

async function main() {
  const out = readArg("--out", process.argv.slice(2));
  if (!out) {
    process.stderr.write("Usage: node scripts/ci/collect-job-diagnostics.mjs --out <path>\n");
    process.exitCode = 2;
    return;
  }
  const diagnostics = collectJobDiagnostics(process.env);
  await writeJobDiagnostics(path.resolve(out), diagnostics);
  process.stdout.write(`Wrote ${path.resolve(out)}\n`);
}

if (isMain()) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
