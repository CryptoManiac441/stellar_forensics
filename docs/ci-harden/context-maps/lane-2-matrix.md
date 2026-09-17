# Lane 2 context map — Matrix resilience

## Investigated reality (2026-09-17, `origin/main` @ `75a930c`)

There was **no** GitHub Actions matrix and therefore **no** `fail-fast` cascade. There were also **no** browser-engine jobs (Chromium/Firefox/WebKit). The product on `main` is a Node CLI; the real multi-cell dimension is **OS × Node**, not browsers.

Inventing a Chromium/Firefox/WebKit matrix that only re-runs `node --test` would waste runners and would not exercise a browser. This lane uses the matrix that the codebase can actually fail on: GitHub-hosted OS images plus the Node 22 line required by `package.json` `engines.node` (`>=22.12.0`).

## Upstream dependencies that could break

| Upstream | Coupling | Breakage if this lane is wrong |
| --- | --- | --- |
| `package.json` `engines.node` | Matrix Node version must satisfy `>=22.12.0` | Node 20 cells would fail install of `@stellar/stellar-sdk` ^17 |
| `7zip-bin` native binary | Tests spawn `7za` (`test/cli.test.js` ZIP container case) | A single OS cell can flake on binary path/exec bit; fail-fast would hide the other OSes |
| `node:test` + filesystem tmpdirs | Per-cell isolation | One cell's `fs.rm` failure must not cancel sibling cells |
| GitHub-hosted runners (`ubuntu-latest`, `windows-latest`, `macos-latest`) | Matrix `os` | Image deprecations affect one cell; others must still publish logs |

## Downstream configurations relying on this block

| Downstream | Reliance |
| --- | --- |
| `.github/workflows/ci.yml` `test` job `strategy` | `fail-fast: false` is mandatory so a flaky cell does not cancel siblings |
| `scripts/ci/collect-job-diagnostics.mjs` | Runs `if: always()` on each cell and writes a uniquely named JSON/log payload |
| `actions/upload-artifact` (SHA-pinned) | Each cell uploads `diagnostics-<os>-<node>` even on failure |
| `matrix-diagnostics` job | `needs: [test]` + `if: always()` downloads every cell artifact and aggregates |
| GitHub Actions UI / future required checks | Individual cell results remain visible; aggregator artifact is the operator-facing summary |
| Branch protection (not configured today) | If later required, must require the aggregator job and/or the matrix as a whole, not a single cell |

## Exact blast radius

**In scope**

- `test` job matrix (`os` × `node-version`)
- `strategy.fail-fast: false`
- Per-cell diagnostic collection + upload
- Post-matrix `matrix-diagnostics` job that always runs
- `scripts/ci/collect-job-diagnostics.mjs`, `scripts/ci/aggregate-diagnostics.mjs`, and their tests

**Out of scope**

- Application source
- Changing test assertions to "pass on flake"
- A fake browser matrix

**Runtime blast**

- Three OS cells × one Node line = three test jobs, plus one aggregator job
- Artifact storage: one zip per cell plus one summary artifact (retention 14 days)
- Aggregator failure must not delete cell artifacts already uploaded

## Planned fix (applied only after this map)

1. `strategy.fail-fast: false` on the test matrix.
2. Each cell writes diagnostics under a unique filename and uploads with `if: always()`.
3. Aggregator job uses `if: always()`, downloads all `diagnostics-*` artifacts into separate directories (`merge-multiple: false` so `job.json` files cannot clobber each other), and publishes `diagnostics-summary`.
4. Test job `continue-on-error` stays **false**: cells still fail the matrix result; we only stop cancellation of siblings.
