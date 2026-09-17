# Lane 4 context map — Sonar gateway

## Investigated reality (2026-09-17, `origin/main` @ `75a930c`)

There was **no** SonarQube/SonarCloud workflow, **no** `sonar-project.properties`, and **no** `SONAR_*` references. The "missing `SONAR_HOST_URL`" defect is real as an **omission**: no quality gate exists, so analysis can never fail the pipeline. The silent-bypass anti-pattern to prevent is `if: vars.SONAR_HOST_URL != ''` (skip scan when unset) or scanning without `sonar.qualitygate.wait=true`.

No tokens were found in the tree. This lane must keep it that way.

## Upstream dependencies that could break

| Upstream | Coupling | Breakage if this lane is wrong |
| --- | --- | --- |
| GitHub repository/organization **variable** `SONAR_HOST_URL` | Injected as `env.SONAR_HOST_URL` from `vars.SONAR_HOST_URL` | Empty/malformed URL must fail the job before the scanner runs |
| GitHub **secret** `SONAR_TOKEN` | Injected as `env.SONAR_TOKEN` from `secrets.SONAR_TOKEN` | Missing token must fail closed; must never be written to logs, artifacts, or `sonar-project.properties` |
| Optional `vars.SONAR_ORGANIZATION` / `vars.SONAR_PROJECT_KEY` | SonarCloud org and key overrides | Wrong org/key fails the scanner (loud), which is acceptable; do not default-skip |
| `sonar-project.properties` | Non-secret scanner identity (`sources`, `tests`, default project key) | Must not contain tokens, passwords, or host URLs |
| `actions/checkout` fetch-depth | Sonar blame/PR decoration | Shallow clone (depth 1) degrades analysis; sonar job uses `fetch-depth: 0` |
| Source tree `src/` + `test/` | Analyzer inputs | Unrelated application behavior; scanner is read-only |

## Downstream configurations relying on this block

| Downstream | Reliance |
| --- | --- |
| `.github/workflows/ci.yml` `sonar-quality-gate` job | Must call `scripts/ci/require-sonar-gateway.mjs` **before** `SonarSource/sonarqube-scan-action` |
| SonarQube Server / SonarCloud | Host must match `vars.SONAR_HOST_URL` (for example `https://sonarcloud.io` or a self-hosted base URL) |
| GitHub Checks for this workflow | A red sonar job is an explicit gate failure, not a skipped step |
| Operators | Must set `SONAR_HOST_URL` (variable) and `SONAR_TOKEN` (secret) on the repository or org; documented in `docs/ci-harden/README.md` |

## Exact blast radius

**In scope**

- `sonar-quality-gate` job
- `scripts/ci/require-sonar-gateway.mjs` and tests
- `sonar-project.properties` (non-secret metadata only)
- Documentation of required GitHub vars/secrets

**Out of scope**

- Hardcoding a host URL or token in YAML, properties, or docs examples (docs may name the **variable**, not a credential)
- `if:` conditions that skip the job when vars are empty
- Changing application logic to satisfy a rule that has not been observed

**Runtime blast**

- One Ubuntu job, independent of the test matrix (sonar should not be fail-fast cancelled by a test flake; it `needs` nothing from `test` except optional coverage we are not generating yet)
- Fails the overall workflow when host URL or token is missing — that is intentional fail-closed behavior for a repo that has not configured Sonar yet
- Token is passed only via `env` on the official scan action

## Planned fix (applied only after this map)

1. Bind `SONAR_HOST_URL: ${{ vars.SONAR_HOST_URL }}` and `SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}` only.
2. `require-sonar-gateway.mjs` exits non-zero on missing/invalid host URL or missing token (no skip path).
3. Scanner args include `-Dsonar.qualitygate.wait=true` so a failed quality gate fails the job.
4. Optional organization/project key from vars are appended as scanner `-D` flags; they are not secrets.
