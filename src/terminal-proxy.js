#!/usr/bin/env node

import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), "cli.js");
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: ["ignore", process.stdout, process.stdout],
  windowsHide: true
});

child.once("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.once("close", (code, signal) => {
  process.exitCode = typeof code === "number" ? code : 1;
  if (signal) process.exitCode = 1;
});
