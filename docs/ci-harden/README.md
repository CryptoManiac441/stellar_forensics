# CI hardening (five lanes)

This directory records the investigation, blast radius, and verification for the production GitHub Actions pipeline in `.github/workflows/ci.yml`.

`main` had **no** workflows, Playwright, xvfb, Sonar job, or npm-audit gate. The lanes add a hardened pipeline instead of inventing a browser suite the CLI does not have.

| Lane | Intent | Status | Map | Verification |
| --- | --- | --- | --- | --- |
| 1 | Native headless CI; no virtual display; local headed only | Done | [context-maps/lane-1-headless.md](context-maps/lane-1-headless.md) | [verification/lane-1.md](verification/lane-1.md) |
| 2 | `fail-fast: false` + post-run diagnostic aggregator | Done | [context-maps/lane-2-matrix.md](context-maps/lane-2-matrix.md) | [verification/lane-2.md](verification/lane-2.md) |
| 3 | Production-facing audit (`npm audit --omit=dev`) + allowlist | Done | [context-maps/lane-3-audit.md](context-maps/lane-3-audit.md) | [verification/lane-3.md](verification/lane-3.md) |
| 4 | `vars.SONAR_HOST_URL` / `secrets.SONAR_TOKEN`; fail closed; wait for quality gate | Done | [context-maps/lane-4-sonar.md](context-maps/lane-4-sonar.md) | [verification/lane-4.md](verification/lane-4.md) |
| 5 | Pin every Action to a 40-character SHA + version comment | Done | [context-maps/lane-5-sha-pinning.md](context-maps/lane-5-sha-pinning.md) | [verification/lane-5.md](verification/lane-5.md) |

## Operator commands

- CI / native headless: `npm run test:ci`
- Local headed (refused when `CI` is set): `npm run test:headed`
- Production audit gate: `npm run audit:production`

## Sonar (required before `sonar-quality-gate` can pass)

Set repository or organization:

- Variable `SONAR_HOST_URL`
- Secret `SONAR_TOKEN`
- Optional variables `SONAR_ORGANIZATION`, `SONAR_PROJECT_KEY`

Empty host or token fails the job. That is intentional.

## Allowlist

Canonical file: `.github/audit-allowlist.json`. Do not add a nested copy under `scripts/`.

## Second pass (2026-09-17)

Local re-run after the verification docs landed:

- `npm test` — 37/37 pass
- `CI=true HEADED=0 npm run test:ci` — 37/37 pass; headless policy ok
- `CI=true HEADED=1` and `CI=true npm run test:headed` — exit 1 (headed forbidden in CI)
- `npm run audit:production` — 0 production advisories
- PyYAML + actionlint v1.7.12 — workflow parse/lint ok; 13 `uses:` all 40-char SHA + version comment
- `require-sonar-gateway.mjs` with empty env — exit 1 (fail-closed)

GitHub Actions on this PR did **not** execute jobs. Every job annotation is `The job was not started because your account is locked due to a billing issue.` That is an org billing lock, not a workflow defect. After billing is restored, `sonar-quality-gate` will still fail until `vars.SONAR_HOST_URL` and `secrets.SONAR_TOKEN` are set.

There is still no Playwright suite on `main` (Node CLI only). CI sets `PLAYWRIGHT_HEADLESS=1` and rejects `PLAYWRIGHT_HEADED` / xvfb so a future Playwright job cannot silently go headed.
