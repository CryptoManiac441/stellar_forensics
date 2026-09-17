# Lane 1 context map — Headless transition

## Investigated reality (2026-09-17, `origin/main` @ `75a930c`)

This repository had **no** `.github/workflows` directory, **no** Playwright dependency, **no** `playwright.config.*`, and **no** `xvfb` / `xvfb-run` / `DISPLAY` usage in scripts or tests. Production tests are Node's built-in test runner (`npm test` → `node --test` in `package.json`). There is no browser UI under test on `main`.

The "headed test buffer handicap" therefore does **not** currently exist as a running CI cost. The defect to prevent is introducing virtual-display overhead (or headed Playwright) into the first production pipeline.

## Upstream dependencies that could break

| Upstream | Coupling | Breakage if this lane is wrong |
| --- | --- | --- |
| `package.json` `scripts.test` | CI invokes this (or `test:ci`) as the unit-test entrypoint | Changing the script to wrap `xvfb-run` would add a display server the CLI tests do not need and would fail on Windows matrix cells |
| `test/*.js` (Node test runner) | Pure process tests; no browser | Playwright-only flags (`--headed`) would be dead config or a false dependency |
| `@stellar/stellar-sdk`, `7zip-bin` | Runtime used by tests | Unrelated; this lane must not change application extractors or Horizon calls |
| Local developer shells | May set `HEADED=1` for future UI work | CI must not inherit headed flags from documentation copy-paste |

## Downstream configurations relying on this block

| Downstream | Reliance |
| --- | --- |
| `.github/workflows/ci.yml` `test` job | Must export `CI=true`, must not install xvfb, must not start a virtual framebuffer, must call `npm run test:ci` |
| `scripts/ci/assert-native-headless.mjs` | Fail-closed guard: headed flags and Xvfb are illegal when `CI` is set |
| `package.json` `test:headed` | Local-only convenience; must remain a no-op wrapper around Node tests until a real UI suite exists |
| `scripts/ci/collect-job-diagnostics.mjs` | Records headless assertion outcome per matrix cell |
| Future Playwright adoption | Must read this map: CI native `headless: true`, local `HEADED=1` only; never `xvfb-run npx playwright test` |

## Exact blast radius

**In scope**

- New CI workflow environment for the test job
- New `test:ci` / `test:headed` npm scripts
- New `scripts/ci/assert-native-headless.mjs` and its unit tests
- Documentation under `docs/ci-harden/`

**Out of scope / must not change**

- `src/cli.js`, `src/extractors.js`, `src/passwords.js` behavior
- Existing assertions in `test/cli.test.js`
- Adding a Playwright browser suite (would invent a UI that this CLI does not have)

**Runtime blast**

- GitHub Actions `test` matrix cells (Linux/macOS/Windows). Linux cells must not spawn Xvfb. Windows/macOS cells have no Xvfb to strip; the same Node test command runs natively.

## Planned fix (applied only after this map)

1. Production CI runs `npm run test:ci` which asserts native headless then `node --test`.
2. Workflow YAML contains no `xvfb`, `xvfb-run`, `Xdummy`, or `DISPLAY=` assignments.
3. `test:headed` is documented as local-only and is never referenced by workflows.
4. If Playwright is added later, CI must use Playwright's native headless (`CI=true` → `headless: true`), not a virtual display.
