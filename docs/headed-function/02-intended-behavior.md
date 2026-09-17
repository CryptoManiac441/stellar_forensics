# 02 — Intended behavior

Source: `src/cli.js`, `src/extractors.js`, `src/passwords.js`, `package.json` usage text.

## Product

Stellar Forensics discovers Stellar secret keys (`S` + 55 base32 chars) in local files, optionally verifies derived public keys against Horizon, and formats those records as a text report. Secret keys are not sent to Horizon.

## CLI contract

- No command or `--help` / `-h` prints usage and exits 0.
- Unknown command prints usage and exits 2.
- Runtime errors print `Error: …` and exit 1.

### scan

Exactly one of:

- `--all-drives` — walk `A:\`…`Z:\` (Windows scan-everything; out of this engagement)
- `--root DIRECTORY` — recursive bounded directory
- `--file FILE` — one file

Missing or combined scopes → error.

`--root` must be an existing directory. `--file` must be an existing **readable** file; permission errors on that named file exit 1 (directory walks still skip unreadable siblings).

`--password-file` if present must be an existing file. A missing path is an error, not a silent empty password list.

Writes:

- `--output` (default `secrets.txt`) — unique secret keys, one per line
- `--output`.sources.json — grouped provenance
- `--decoded-log` (default `decoded-data.jsonl`) — decoded buffers as base64
- `--log` when `--verbose`
- `--results` when `--verify` (default `scan-results.json`)

`--password-search` if present must be `containers`. That mode walks all Windows drives for labeled passwords and is excluded from this engagement. `--password-file` and `--password-env` are the bounded substitutes.

`--network` is `public` (default) or `testnet`.

### verify

Input: text file, one secret per line, `#` comments allowed. Empty after filter → error.
For each key: derive public key; Horizon `loadAccount`; classify `verified` / `valid_key_account_not_found` / `invalid_secret` / horizon failure statuses.

### report

Input: verification JSON. Output: human-readable text including status, keys, provenance, and account summary.

## Extractors

Carriers: text, base64, hex, appended-data (`STELLAR_FORensics_PAYLOAD`), png, jpeg, wav, gzip, deflate, brotli, plus 7-Zip archive members when the header matches ZIP/7z/RAR/gzip/tar.

If the bundled `7za` is not executable after `npm install`, the CLI chmods it to `0755` on non-Windows before spawning.

## Logging

Verbose JSONL logs may include secret keys and decoded payloads. Treat as sensitive. Flush on both success and failure for scan/verify/report.
