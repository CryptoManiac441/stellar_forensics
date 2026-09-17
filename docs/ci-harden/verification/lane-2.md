# Lane 2 verification — Matrix resilience

## Verification completion statement

Lane 2 is complete. The test job uses `strategy.fail-fast: false` on an OS × Node matrix, each cell uploads diagnostics with `if: always()`, and `matrix-diagnostics` always aggregates those artifacts.

## Evidence

1. **Parse.** Workflow `jobs.test.strategy.fail-fast` is `false`. Matrix is `os: [ubuntu-latest, windows-latest, macos-latest]` × `node-version: ["22"]`. There is no browser matrix because this repo has no browser tests.
2. **Post-execution aggregator.** `matrix-diagnostics` has `if: always()`, `needs: [test]`, downloads `diagnostics-*` with `merge-multiple: false` (avoids `cell.json` clobber), then runs `scripts/ci/aggregate-diagnostics.mjs`.
3. **Unit tests.** `test/ci/aggregate-diagnostics.test.js` confirmed two cells remain in the summary when one has `test_exit_code: 1`. Empty input produces an explicit “no cell.json” summary instead of a skip.
4. **Local aggregator run.** After `npm run test:ci`, `aggregate-diagnostics.mjs` reported `Cells found: 1`, `Test exit | 0`, `Headless ok | yes`.

## Reasoning

Fail-fast cancellation was the cascade to prevent. Cells still fail the job when tests fail (`continue-on-error` is not set on the test step). Siblings keep running and still upload. The aggregator is independent of any one cell’s exit code.

## Residual

This environment cannot execute the three GitHub-hosted OS images. YAML + local aggregator tests are the available proof; live multi-OS artifact upload is GitHub Actions behavior of `if: always()` plus `upload-artifact`.
