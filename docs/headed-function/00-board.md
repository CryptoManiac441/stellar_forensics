# 00 — Board

Engagement: hybrid headed full-functionality (no scan-all).
Repo: `CryptoManiac441/stellar_forensics` on `main`.
Date: 2026-09-17.

## Lane plan

| Lane | Purpose | Status |
|------|---------|--------|
| Discover | Confirm stack vs hypothesis (Playwright/E2E/API/UI) | Done. CLI-only on main. |
| Matrix | Every user/system function except scan-all | `01-function-matrix.md` |
| Intended behavior | Operator-visible contracts | `02-intended-behavior.md` |
| Assault | Fullest automated functional/E2E suite | Loop 01, loop 03 re-assault |
| Fix | Root-cause S0/S1 | Loop 02, loop 03 |
| Retest | Defect + prior PASS suite | Loop 02 + loop 03 evidence |
| Truth | Headed vs headless labels | `gates/verification.md` |
| PR | One PR, do not merge | This branch |

## Boot facts

- Node v22.14.0, npm 10.9.7
- `DISPLAY=:1` present; `google-chrome` and `xvfb-run` present
- **No** `playwright.config.*`, **no** `.github/workflows` on main before this PR, **no** `AGENTS.md`
- Horizon testnet and public both HTTP 200 from this VM (`curl` ~70ms)
- Unmerged desktop: `origin/cryptomaniac441-stellar-cli-verifier` (WinForms + `--root`/`--file`)
- Hypothesis Playwright/API/UI on main: **false**

## Out of scope

- `scan --all-drives`
- `--password-search containers` (walks all Windows drive letters for password files)
- Copying the WinForms desktop into this PR
- Scan-all static analysis / Sonar-everything

## Open S0/S1 after loop 03

None. Loop 03 closed D08 (unreadable `--file` false success) and D09 (missing `--password-file`). Remaining S3: verbose secrets in logs, nested archive depth, env `PASSWORD` harvest, default decoded-log cwd drop.
