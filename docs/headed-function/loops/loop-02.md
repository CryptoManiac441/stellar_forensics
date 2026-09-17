# Loop 02 — Fix wave + retest

## Context map (multi-file)

| Defect | Files | Why together |
|--------|-------|----------------|
| D01 7za EACCES | `src/extractors.js`, `test/cli.test.js` | Runtime chmod helper must be what tests and archive extract use |
| D02 bounded scan | `src/cli.js`, usage, functional tests | CLI contract + tests for `--root`/`--file` |
| D03 flush | `src/cli.js` scan/verify/report | Same logger lifecycle |
| D04 handle close | `src/cli.js` `scanOneFile` | Extracted from `scanDirectory` for `--file` |

No API schema files. No secrets added.

## Fixes

1. **D01 (S1)** — `resolveSevenZipPath()` runs `chmod 0755` on the bundled non-Windows `7za` when `X_OK` fails. Imports moved to top of `extractors.js` (they were previously after the functions; ESM hoists them, but the file violated in-repo import layout).
2. **D02 (S1)** — `scan` requires exactly one of `--all-drives | --root | --file`. `--root`/`--file` validate existence. `--file` scans one file without walking siblings.
3. **D03 (S2)** — scan/verify/report wrap work in `try/finally` and flush logs on failure.
4. **D04 (S2)** — header `fs.open` close is in `finally`.
5. **D05–D07 (S3)** — usage text, deflate unit coverage, renamed invalid-secret test.
6. Headed-capable script `scripts/headed-smoke.mjs` with `--headed` / `--headless`.
7. GitHub Actions `functional` workflow: `npm test` + headless headed-smoke (CI is captured stdio, not GUI).

`--all-drives` behavior left intact but **not executed** in tests.

## Retest

Command: `chmod 644 node_modules/7zip-bin/linux/x64/7za && npm test`

Result (post-fix, including password-env + scan --file --verify):

`npm test` → **32/32 pass, 0 fail** (`docs/headed-function/evidence/npm-test.txt`). Prior PASS unit tests were included in that same process. D01 regression: chmod 644 then `resolveSevenZipPath()` restores `X_OK`.
