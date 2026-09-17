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
