# Loop 03 — Second pass (re-assault from committed state)

Started from `f80bf28` (loop 02 shipped). Prior 7za chmod and `--root`/`--file` kept.

## Assault (fresh)

- `npm test` at start of this loop: **32/32 pass** (`/tmp/pass2-npm-test.txt` equivalent captured before edits)
- Extra probes (not scan-all):

| ID | Sev | Function | Repro | Expected | Actual |
|----|-----|----------|-------|----------|--------|
| D08 | S1 | `scan --file` unreadable | `chmod 000 locked.txt && scan --file locked.txt` | exit 1 | exit 0, `Found 0 candidate(s)` while verbose log had `file_scan_failed` EACCES |
| D09 | S2 | missing `--password-file` | `--password-file` path that does not exist | error | exit 0, scan continued with no extra passwords |
| D10 | S3 | cwd `decoded-data.jsonl` | `scan` without `--decoded-log` on usage errors | no cwd drop | empty `decoded-data.jsonl` in repo root (gitignored) |

Probes that **passed** (no defect): `scan --help` exit 0; `verify`/`report` with no file exit 2; gzip `--file` finds secret; `--output` missing value exit 1; verify `--network public` unused key `valid_key_account_not_found`; `#` comments in verify input.

Not run: `--all-drives`, `--password-search containers`, WinForms, Playwright.

## Fixes

1. **D08 (S1)** — `scanOneFile` rethrows when the path is the explicit `--file` target. Directory walks still swallow per-file errors.
2. **D09 (S2 FIX NOW)** — `scan` rejects a missing/non-file `--password-file` before password discovery (so it is not swallowed as a warning).

D10 left ACCEPT RISK S3 (gitignored default decoded log).

## Retest

`chmod 644 node_modules/7zip-bin/linux/x64/7za && npm test`

**36/36 pass, 0 fail** — `docs/headed-function/evidence/npm-test-loop-03.txt`

Includes prior PASS suite plus: unreadable `--file`, missing password file, gzip `--file`, public Horizon verify, verify/report missing operands, `scan --help`.

Terminal-headed smoke: `npm run test:headed` → `headed-smoke.json` / `headed-smoke-loop-03.json`, `"headed": true` (inherited stdio, not GUI).
