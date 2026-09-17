# Loop 01 — Assault

## Environment

- Branch: `cursor/headed-function-matrix-418f` from `origin/main` @ `75a930c`
- Command: `npm install && npm test` (before fixes)
- Node 22.14.0

## Baseline result

```
# tests 14
# pass 13
# fail 1
```

Failing test: `real ZIP containers feed extracted members into the extractor`

```
error: 'spawn /workspace/node_modules/7zip-bin/linux/x64/7za EACCES'
code: 'EACCES'
```

`ls -l node_modules/7zip-bin/linux/x64/7za` → `-rw-r--r--` (not executable). `chmod +x` makes `7za --help` work. Root cause: install did not preserve execute bit; extractor assumed it was executable.

## Additional FAIL cards (manual + CLI probe, not scan-all)

| ID | Sev | Function | Repro | Expected | Actual |
|----|-----|----------|-------|----------|--------|
| D01 | S1 | Archive extraction / ZIP E2E | `npm test` after `npm install` | ZIP members scanned | `EACCES` on `7za` |
| D02 | S1 | Bounded scan | `node src/cli.js scan` | Operator can scan a folder/file without all-drives | `Error: Scanning requires --all-drives.` Full A–Z walk is the only scan path — excluded by this mission, so scan was untestable |
| D03 | S2 | Scan diagnostics on failure | scan throws before completion | decoded log + verbose log flushed | flush only after success path |
| D04 | S2 | Header handle leak | `fs.open` then `read` throws | handle closed | `close()` not in `finally` |
| D05 | S3 | Usage vs flags | `--decoded-log`, `--results`, `--root`, `--file` | documented | `--root`/`--file` missing; `--decoded-log`/`--results` missing |
| D06 | S3 | Deflate carrier listed | `SUPPORTED_CARRIERS` includes deflate | tested | gzip+brotli only |
| D07 | S3 | Misnamed unit test | `Stellar SDK derives a stable public key from a secret` | name matches assertion | asserts invalid secret throws |

## Not run

- `scan --all-drives` (excluded)
- `--password-search containers` (all-drives password crawl)
- WinForms desktop (not on main; Linux cannot execute)
- Playwright (no browser app)

## Headed

DISPLAY=:1 exists, but there is no GUI on main. Headed browser/WinForms **not executed**. Terminal-headed script added in loop 02.
