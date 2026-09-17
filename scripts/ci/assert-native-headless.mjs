#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

const TRUTHY = new Set(["1", "true", "yes", "on"]);

function isTruthy(value) {
  return TRUTHY.has(String(value ?? "").trim().toLowerCase());
}

export function evaluateHeadlessPolicy(env = process.env, options = {}) {
  const ci = isTruthy(env.CI);
  const headed = isTruthy(env.HEADED) || isTruthy(env.PLAYWRIGHT_HEADED) || isTruthy(env.PWDEBUG);
  const forceXvfb = isTruthy(env.FORCE_XVFB);
  const xvfbRunning = options.xvfbRunning === true;
  const violations = [];

  if (ci && headed) {
    violations.push(
      "CI is set but HEADED, PLAYWRIGHT_HEADED, or PWDEBUG requested a headed session. Production CI must use native headless."
    );
  }
  if (ci && forceXvfb) {
    violations.push("FORCE_XVFB is set in CI. Virtual display buffers are forbidden in production CI.");
  }
  if (ci && xvfbRunning) {
    violations.push(
      "An Xvfb process is running in CI. Strip xvfb-run and virtual framebuffers; use Playwright or Node native headless."
    );
  }

  return {
    ci,
    headed,
    forceXvfb,
    xvfbRunning,
    ok: violations.length === 0,
    violations
  };
}

export function detectXvfbProcess() {
  if (process.platform !== "linux") return false;
  try {
    execFileSync("pgrep", ["-x", "Xvfb"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function assertNativeHeadless(env = process.env, options = {}) {
  const policy = evaluateHeadlessPolicy(env, options);
  if (!policy.ok) {
    const error = new Error(policy.violations.join("\n"));
    error.policy = policy;
    throw error;
  }
  return policy;
}

function isMain() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMain()) {
  try {
    const policy = assertNativeHeadless(process.env, { xvfbRunning: detectXvfbProcess() });
    process.stdout.write(`${JSON.stringify({ ok: true, policy })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
