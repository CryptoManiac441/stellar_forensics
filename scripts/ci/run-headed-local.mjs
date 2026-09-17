#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

const TRUTHY = new Set(["1", "true", "yes", "on"]);

if (TRUTHY.has(String(process.env.CI ?? "").trim().toLowerCase())) {
  process.stderr.write(
    "npm run test:headed is local-only. GitHub Actions must use npm run test:ci (native headless, no xvfb).\n"
  );
  process.exit(1);
}

process.env.HEADED = "1";
const child = spawn(process.execPath, ["--test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env
});
child.once("exit", (code, signal) => {
  process.exitCode = typeof code === "number" ? code : 1;
  if (signal) process.exitCode = 1;
});
child.once("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
