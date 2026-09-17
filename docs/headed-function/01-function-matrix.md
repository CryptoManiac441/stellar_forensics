# 01 — Function matrix

Scope: every user/system function on `main` **except** scan-all / scan-everything / bulk-scan-all.

Status key: `PASS` = automated evidence this run · `N/A` = excluded with reason · `ACCEPT RISK` = known leftover, not S0/S1.

| ID | Function | Surface | Evidence | Status |
|----|----------|---------|----------|--------|
| F01 | CLI help / no-args usage | `node src/cli.js --help` | `test/cli.functional.test.js` + headed-smoke | PASS |
| F02 | Unknown command exit 2 | `stellar-forensics nope` | functional test | PASS |
| F03 | `scan` requires exactly one scope | missing / combined flags | functional test | PASS |
| F04 | `scan --root DIRECTORY` bounded walk | CLI | functional ZIP+plain fixture | PASS |
| F05 | `scan --file FILE` single carrier | CLI | functional isolation test | PASS |
| F06 | `scan --file` missing path error | CLI | functional test | PASS |
| F07 | `scan --root` missing dir error | CLI | functional test | PASS |
| F08 | `scan --output` + `.sources.json` | CLI | F04 | PASS |
| F09 | `scan --decoded-log` | CLI | F04 | PASS |
| F10 | `scan --verbose --log` | CLI | F04 | PASS |
| F11 | `scan --verify` empty candidates | CLI | functional test | PASS |
| F12 | `scan --file --verify --network testnet` | CLI + Horizon | functional test | PASS |
| F13 | `scan --password-file` unlocks ZIP | CLI | functional test (member deleted after archive) | PASS |
| F14 | `scan --password-env` unlocks ZIP | CLI | functional test | PASS |
| F15 | `--password-search` invalid scope | CLI | functional test | PASS |
| F16 | `--password-search containers` | CLI | all-drives password crawl | N/A — scan-all family; not executed |
| F17 | `scan --all-drives` | CLI | Windows A–Z walk | N/A — scan-everything; not executed |
| F18 | `verify` missing file | CLI | functional test | PASS |
| F19 | `verify` empty/comment-only file | CLI | functional test | PASS |
| F20 | `verify` invalid secret → `invalid_secret` | CLI + testnet param fetch | functional test | PASS |
| F21 | `verify` valid unused key → `valid_key_account_not_found` | Horizon testnet | functional test HTTP 200 | PASS |
| F22 | `verify --network private` rejected | CLI | functional test | PASS |
| F23 | `report` text output | CLI | functional fixture | PASS |
| F24 | `report` invalid JSON | CLI | functional test | PASS |
| F25 | Extractor: raw text `S...` keys | `extractFromBuffer` | unit test | PASS |
| F26 | Extractor: base64 / hex | unit | unit test | PASS |
| F27 | Extractor: appended-data marker | unit | unit test | PASS |
| F28 | Extractor: PNG tEXt / JPEG COM / WAV LIST | unit | unit test | PASS |
| F29 | Extractor: gzip / deflate / brotli | unit | unit test (deflate added) | PASS |
| F30 | Nested gzip→base64 provenance | unit | unit test | PASS |
| F31 | ZIP archive member extraction via 7za | unit + functional | PASS after chmod repair | PASS |
| F32 | Archive signature detection | `isArchiveSignature` | unit test | PASS |
| F33 | `groupCandidates` provenance merge | unit | unit test | PASS |
| F34 | `horizonFailureStatus` mapping | unit | unit test | PASS |
| F35 | Password file/env parsing | `passwords.js` | unit test | PASS |
| F36 | Keypair derive public key | Stellar SDK | unit test | PASS |
| F37 | Invalid secret rejected by SDK | Stellar SDK | unit test | PASS |
| F38 | Node engine `>=22.12.0` | package.json | unit test | PASS |
| F39 | 7za execute-bit repair | `resolveSevenZipPath` | unit test chmod 644 → X_OK | PASS |
| F40 | Scan file-handle close on header read | `scanOneFile` | code + bounded scan PASS | PASS |
| F41 | Logger/decoded flush on scan/verify/report failure | CLI | code + missing-path tests still emit errors | PASS |
| F42 | Interactive container password prompt | TTY `promptForPassword` | skipped: only after F16 | N/A — depends on excluded all-drives password search |
| F43 | Windows desktop GUI | WinForms | not on `main`; Linux cannot run it | N/A — not in this checkout |
| F44 | Playwright / browser journeys | n/a | stack absent | N/A — no browser app |
| F45 | HTTP API routes | n/a | stack absent | N/A — CLI only |
| F46 | Verbose logs contain secret keys | logger | by design for forensics | ACCEPT RISK S3 — documented in AGENTS.md |
| F47 | Nested archive zip-bomb / no max depth | extractors | not exploited in suite | ACCEPT RISK S3 |
| F48 | `environmentPasswordCandidates` reads any `PASSWORD`/`SECRET` env | passwords.js | intended for archive unlock | ACCEPT RISK S3 — do not run untrusted env blindly |
