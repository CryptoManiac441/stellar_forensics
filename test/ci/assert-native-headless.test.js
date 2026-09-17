import test from "node:test";
import assert from "node:assert/strict";
import { evaluateHeadlessPolicy, assertNativeHeadless } from "../../scripts/ci/assert-native-headless.mjs";

test("local headed flags are allowed when CI is unset", () => {
  const policy = evaluateHeadlessPolicy({ HEADED: "1", PLAYWRIGHT_HEADED: "1" });
  assert.equal(policy.ok, true);
  assert.equal(policy.ci, false);
  assert.equal(policy.headed, true);
});

test("CI native headless accepts CI=true without headed flags", () => {
  const policy = evaluateHeadlessPolicy({ CI: "true", HEADED: "0", PLAYWRIGHT_HEADLESS: "1" });
  assert.equal(policy.ok, true);
  assert.equal(policy.ci, true);
  assert.equal(policy.headed, false);
});

test("CI rejects headed Playwright or HEADED flags", () => {
  const headed = evaluateHeadlessPolicy({ CI: "true", HEADED: "1" });
  assert.equal(headed.ok, false);
  assert.ok(headed.violations.some((line) => line.includes("native headless")));

  const playwright = evaluateHeadlessPolicy({ CI: "1", PLAYWRIGHT_HEADED: "true" });
  assert.equal(playwright.ok, false);
});

test("CI rejects xvfb virtual display buffers", () => {
  const forced = evaluateHeadlessPolicy({ CI: "true", FORCE_XVFB: "1" });
  assert.equal(forced.ok, false);

  const running = evaluateHeadlessPolicy({ CI: "true" }, { xvfbRunning: true });
  assert.equal(running.ok, false);
  assert.ok(running.violations.some((line) => line.includes("Xvfb")));
});

test("assertNativeHeadless throws the policy violations", () => {
  assert.throws(
    () => assertNativeHeadless({ CI: "true", PWDEBUG: "1" }),
    (error) => error instanceof Error && error.policy?.ok === false
  );
});
