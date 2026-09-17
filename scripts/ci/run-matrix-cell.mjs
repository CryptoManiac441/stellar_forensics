#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { assertNativeHeadless, detectXvfbProcess, evaluateHeadlessPolicy } from "./assert-native-headless.mjs";
import { collectJobDiagnostics, writeJobDiagnostics } from "./collect-job-diagnostics.mjs";

function npmVersion() {
  const result = spawnSync("npm", ["-v"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

export async function runMatrixCell({
  cwd = process.cwd(),
  env = process.env,
  diagnosticsDir = path.join(cwd, "diagnostics"),
  execPath = process.execPath
} = {}) {
  fs.mkdirSync(diagnosticsDir, { recursive: true });
  const xvfbRunning = detectXvfbProcess();
  const policy = evaluateHeadlessPolicy(env, { xvfbRunning });
  fs.writeFileSync(path.join(diagnosticsDir, "headless.json"), `${JSON.stringify(policy, null, 2)}\n`, "utf8");

  try {
    assertNativeHeadless(env, { xvfbRunning });
  } catch (error) {
    const diagnostics = collectJobDiagnostics(env, {
      testExitCode: 1,
      jobStatus: "headless_policy_failed",
      headless: error.policy ?? policy,
      npmVersion: npmVersion()
    });
    await writeJobDiagnostics(path.join(diagnosticsDir, "cell.json"), diagnostics);
    throw error;
  }

  const result = spawnSync(execPath, ["--test"], {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  const combinedOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  fs.writeFileSync(path.join(diagnosticsDir, "test-output.txt"), combinedOutput, "utf8");
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const testExitCode = typeof result.status === "number" ? result.status : 1;
  const diagnostics = collectJobDiagnostics(env, {
    testExitCode,
    jobStatus: testExitCode === 0 ? "passed" : "failed",
    headless: policy,
    npmVersion: npmVersion()
  });
  await writeJobDiagnostics(path.join(diagnosticsDir, "cell.json"), diagnostics);
  return { testExitCode, policy, diagnostics };
}

function isMain() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

function main() {
  runMatrixCell()
    .then((result) => {
      process.exitCode = result.testExitCode;
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}

if (isMain()) {
  main();
}
