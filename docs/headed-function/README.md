# Headed function test — README

This folder is the audit trail for the hybrid headed full-functionality engagement.

## What this repo actually is

`main` is a **Node.js CLI** (`src/cli.js`). There is no Playwright suite, no HTTP API, and no in-repo web UI. A Windows WinForms desktop exists on unmerged branch `cryptomaniac441-stellar-cli-verifier`; it was **not** copied here because it cannot run on this Linux VM and is already a separate branch.

## Headed vs headless (honest labels)

| Mode | Command | What actually ran |
|------|---------|-------------------|
| Terminal-headed | `npm run test:headed` | CLI with `stdio: inherit`. Live terminal output. **Not** a GUI. |
| Captured / headless | `npm run test:headed:headless` | Same CLI smoke with pipes instead of inherit. |
| Browser headed | n/a | No browser UI on `main`. **Not claimed green.** |
| WinForms headed | n/a on this VM | Windows-only; requires .NET 8 + Windows. **Not claimed green.** |

Never treat `npm test` passing as headed-GUI proof.

## Local headed commands

```bash
npm test
npm run test:headed
node scripts/headed-smoke.mjs --headed
node scripts/headed-smoke.mjs --headless
```

On Windows, if using the desktop branch: `npm run start:desktop`.

## Excluded on purpose

- `scan --all-drives` (scan-everything)
- `--password-search containers` (all-drives password crawl)

Bounded substitutes: `scan --root` and `scan --file`, plus `--password-file` / `--password-env`.
