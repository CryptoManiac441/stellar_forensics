# Lane 3 verification — Audit refinement

## Verification completion statement

Lane 3 is complete. The deploy-facing gate is production-only (`npm audit --omit=dev`) plus `.github/audit-allowlist.json`. DevDependency-only advisories cannot fail the job. The allowlist requires `id`, `package`, `reason`, and `expires`; expired rows fail closed.

## Evidence

1. **Parse.** `production-audit` job runs `npm run audit:production`. `scripts/ci/production-audit.mjs` invokes `npm audit --omit=dev --json`. A preceding `npm audit --json` step is `continue-on-error: true` (informational full tree only).
2. **Live gate.** `npm run audit:production` on this lockfile exited 0 with `advisory_count: 0`, `blocking_count: 0`, empty allowlist.
3. **Fixture tests.** Clean tree passes; `GHSA-ffff-ffff-ffff` without allowlist fails; the same GHSA with `allowlist-valid.json` passes; `allowlist-expired.json` fails closed. Canonical allowlist `exceptions` is `[]`.
4. **Docs.** Allowlist schema is described in `.github/audit-allowlist.json` `description` and in `docs/ci-harden/context-maps/lane-3-audit.md`.

## Reasoning

`package.json` currently has no `devDependencies`, so a default `npm audit` would already match production. The omit-dev gate plus allowlist still prevents a future toolchain package from blocking deploys, while a real production GHSA still fails unless an explicit, dated exception exists.

## Residual

The informational full-tree audit is not a gate. Operators must read `diagnostics-production-audit` if they want dev-tree noise. No production exceptions are pre-approved.
