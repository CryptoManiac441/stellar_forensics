# Lane 3 context map — Audit refinement

## Investigated reality (2026-09-17, `origin/main` @ `75a930c`)

There was **no** `npm audit` CI job and **no** `devDependencies` in `package.json`. Runtime dependencies are only:

- `@stellar/stellar-sdk` (Horizon/keypair verification)
- `7zip-bin` (archive extraction)

There is therefore **no** current "devDependency audit bottleneck" blocking deploys — there are no deploys and no audit gate. The defect to prevent is a future `npm audit` (default tree, including toolchain packages) failing the pipeline on advisories that never ship to users.

## Upstream dependencies that could break

| Upstream | Coupling | Breakage if this lane is wrong |
| --- | --- | --- |
| `package-lock.json` | `npm ci` + `npm audit --omit=dev` resolve this lockfile | A lockfile change can introduce a production advisory that must fail the gate |
| `@stellar/stellar-sdk` | Production; talks to Horizon | A real SDK advisory must **not** be silently ignored |
| `7zip-bin` | Production; spawns a vendor binary | A real advisory on this package must fail or be explicitly allowlisted with expiry |
| Future `devDependencies` (linters, Playwright, TypeScript) | Must be omitted from the gating audit | Default `npm audit` would block on toolchain CVEs |

## Downstream configurations relying on this block

| Downstream | Reliance |
| --- | --- |
| `.github/workflows/ci.yml` `production-audit` job | Invokes `node scripts/ci/production-audit.mjs` after `npm ci` |
| `.github/audit-allowlist.json` | Only place a production advisory may be excepted; expired entries fail the gate |
| `npm run audit:production` | Local/operator equivalent of the CI gate |
| Deploy / release (none automated today) | Must depend on `production-audit` succeeding if a deploy workflow is added later |
| `docs/ci-harden/README.md` | Documents omit-dev behavior and allowlist schema |

## Exact blast radius

**In scope**

- `scripts/ci/production-audit.mjs` (production-facing audit + allowlist engine)
- `.github/audit-allowlist.json` (starts with zero exceptions)
- `production-audit` CI job
- Fixture-driven tests under `test/ci/production-audit.test.js`
- `package.json` script `audit:production`

**Out of scope**

- Changing runtime dependency versions to "fix" hypothetical CVEs
- `npm audit fix` mutations of the lockfile
- Ignoring production advisories without an allowlist row

**Runtime blast**

- One Ubuntu job, Node 22, `npm ci`, then the audit script
- Requires network to `registry.npmjs.org` in CI; unit tests inject fixture JSON and do not call the registry
- Does not publish packages; cannot block a deploy that does not exist, but will block the CI workflow

## Planned fix (applied only after this map)

1. Gating command is production-facing: `npm audit --omit=dev --json` (devDependency-only advisories never fail the job).
2. Automated allowlist: `.github/audit-allowlist.json` entries require `id`, `package`, `reason`, and `expires` (ISO-8601 date). Expired or incomplete rows fail.
3. Unallowlisted production advisories fail the job with the GHSA/CVE id printed (never a silent zero-exit).
4. Informational full-tree audit JSON may be attached as a diagnostic artifact; it must not be the gate.
