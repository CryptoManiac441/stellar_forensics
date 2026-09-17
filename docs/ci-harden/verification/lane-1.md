# Lane 1 verification — Headless transition

## Verification completion statement

Lane 1 is complete. Production CI runs Node tests in native headless mode. There is no virtual display server in `.github/workflows/ci.yml`, and local headed execution is isolated to `npm run test:headed`.

## Evidence

1. **Parse.** PyYAML load of `.github/workflows/ci.yml` succeeded. The workflow contains no `xvfb`, `xvfb-run`, or `DISPLAY:` assignment. The test job runs `npm run test:ci` and does not reference `test:headed`.
2. **Behavior.** `scripts/ci/assert-native-headless.mjs` allows `HEADED=1` when `CI` is unset and fails when `CI=true` and `HEADED=1` (confirmed: local exit 0; `CI=true HEADED=1` exit 1). `scripts/ci/run-headed-local.mjs` exits non-zero when `CI` is set (`test/ci/headed-local.test.js`).
3. **Execution.** `CI=true HEADED=0 npm run test:ci` wrote `diagnostics/headless.json` with `ci: true`, `headed: false`, `xvfbRunning: false`, `ok: true`, and finished **37/37** tests passing. `npm test` also **37/37** pass.
4. **actionlint** v1.7.12 on `.github/workflows/ci.yml` exited 0.

## Reasoning

This repository had no Playwright suite and no existing xvfb wrapper. Inventing a browser matrix would not have tested a UI. The real headed-buffer risk was introducing `xvfb-run` into the first CI pipeline. The workflow never starts a framebuffer; CI is `native` Node; local headed remains an explicit npm script that CI refuses to run.

## Residual

GitHub-hosted Linux images may still have `DISPLAY` set by the runner image. The policy treats an **Xvfb process** and headed Playwright flags as violations, not a leftover `DISPLAY` value. That matches the investigated CLI (no browser).
