# Stellar Forensics

Local Stellar secret-key discovery and Horizon verification CLI.

## Requirements

- Node.js `>= 22.12.0`
- Network access to Horizon is required only for `verify` / `scan --verify`

## Commands

```bash
npm start -- --help
node src/cli.js --help

# Bounded scan (preferred). Do not use --all-drives unless you intend a full Windows drive walk.
# --file must be readable. --password-file if set must exist.
node src/cli.js scan --root DIRECTORY [--verify] [--network public|testnet] [--password-search containers] [--password-env NAME] [--password-file FILE] [--output secrets.txt] [--results scan-results.json] [--decoded-log decoded-data.jsonl] [--verbose] [--log scan.log]
node src/cli.js scan --file FILE [same flags as above]

# Verify a secret-key file (one S... key per line) against Horizon
node src/cli.js verify secrets.txt --network testnet --output results.json [--verbose] [--log verify.log]

# Format verification JSON as a text report
node src/cli.js report results.json --output report.txt [--verbose] [--log report.log]
```

`--all-drives` walks Windows drive letters `A:\` through `Z:\`. It is a scan-everything operation. This repository's headed/functional suite does not run it.

## Tests

```bash
npm test                 # unit + functional/E2E (node:test)
npm run test:functional  # same suite, spec reporter
npm run test:headed      # CLI smoke with inherited stdio (--headed)
npm run test:headed:headless  # same smoke with captured stdio
```

There is no Playwright/browser UI on `main`. `test:headed` is terminal-headed (inherited stdio), not a WinForms or browser GUI. A Windows desktop shell exists on branch `cryptomaniac441-stellar-cli-verifier` (`npm run start:desktop` there) and cannot run on Linux.

`--headed` / `--headless` flags:

```bash
node scripts/headed-smoke.mjs --headed
node scripts/headed-smoke.mjs --headless
HEADLESS=1 node scripts/headed-smoke.mjs
```

## GitHub Actions

A `functional` workflow was **not** kept on this branch. Opening it failed immediately with:

`The job was not started because your account is locked due to a billing issue.`

That is an external blocker, not a test failure. Run `npm test` locally (evidence: `docs/headed-function/evidence/npm-test.txt`, 32/32).

## Notes

- Secrets stay local. Horizon receives derived public keys only during verification.
- Verbose logs and decoded JSONL can contain secret material. Treat those files as sensitive.
- The bundled `7zip-bin` `7za` binary is made executable at runtime if `npm install` left it without `+x`.
