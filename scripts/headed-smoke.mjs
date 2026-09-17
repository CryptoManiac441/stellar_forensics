#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Keypair } from "@stellar/stellar-sdk";

const repositoryRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(repositoryRoot, "src", "cli.js");
const headless = process.argv.includes("--headless") || process.env.HEADLESS === "1" || process.env.HEADLESS === "true";
const headed = !headless;

function run(args, cwd) {
  return new Promise((resolve, reject) => {
    const stdio = headed ? "inherit" : ["ignore", "pipe", "pipe"];
    const child = spawn(process.execPath, [cli, ...args], { cwd, stdio, env: process.env, windowsHide: !headed });
    let stdout = "";
    let stderr = "";
    if (!headed) {
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
    }
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code: code ?? 1, signal, stdout, stderr, args }));
  });
}

const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-forensics-headed-"));
const evidenceDir = path.join(repositoryRoot, "docs", "headed-function", "evidence");
await fs.mkdir(evidenceDir, { recursive: true });

const secret = Keypair.random().secret();
const scanFile = path.join(fixtureRoot, "carrier.txt");
const secretsOut = path.join(fixtureRoot, "secrets.txt");
const verifyOut = path.join(fixtureRoot, "results.json");
const reportOut = path.join(fixtureRoot, "report.txt");
await fs.writeFile(scanFile, `${secret}\n`);

const steps = [];
try {
  steps.push(await run(["--help"], repositoryRoot));
  steps.push(await run([
    "scan", "--file", scanFile, "--output", secretsOut,
    "--decoded-log", path.join(fixtureRoot, "decoded.jsonl"),
    "--verbose", "--log", path.join(fixtureRoot, "scan.log")
  ], repositoryRoot));
  steps.push(await run(["verify", secretsOut, "--network", "testnet", "--output", verifyOut], repositoryRoot));
  steps.push(await run(["report", verifyOut, "--output", reportOut], repositoryRoot));
} finally {
  const summary = {
    generated_at: new Date().toISOString(),
    display: process.env.DISPLAY ?? null,
    headed,
    headless,
    command: "node scripts/headed-smoke.mjs",
    note: headed
      ? "stdio inherited (terminal-headed). This is not a browser or WinForms GUI session."
      : "stdio captured (--headless). This is not a browser or WinForms GUI session.",
    steps: steps.map((step) => ({ args: step.args, code: step.code, signal: step.signal })),
    fixture_root: fixtureRoot
  };
  await fs.writeFile(path.join(evidenceDir, "headed-smoke.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

const failed = steps.find((step) => step.code !== 0);
if (failed) {
  console.error(`headed-smoke failed: ${failed.args.join(" ")} exit ${failed.code}`);
  process.exitCode = failed.code;
} else if (!headed) {
  console.log("headed-smoke completed in headless/captured stdio mode");
} else {
  console.log("headed-smoke completed with inherited stdio");
}
