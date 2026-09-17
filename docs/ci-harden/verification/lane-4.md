# Lane 4 verification — Sonar gateway

## Verification completion statement

Lane 4 is complete. `SONAR_HOST_URL` is injected from `vars.SONAR_HOST_URL` and `SONAR_TOKEN` from `secrets.SONAR_TOKEN`. Missing values fail the job before scan (no `if:` skip). Scanner args include `-Dsonar.qualitygate.wait=true`. No host URL or token is hardcoded.

## Evidence

1. **Parse.** `sonar-quality-gate` binds `SONAR_HOST_URL: ${{ vars.SONAR_HOST_URL }}` and `SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}` on both the gateway script and `SonarSource/sonarqube-scan-action`. `sonar-project.properties` has `sonar.sources=src` and no `sonar.host.url` / `sonar.token` / `sonar.login`.
2. **Fail-closed CLI.** `node scripts/ci/require-sonar-gateway.mjs` with empty env exited 1 (`SONAR_HOST_URL is empty` and `SONAR_TOKEN is empty`, “Refusing silent quality-gate bypass”). Host-only also exited 1. Host+token exited 0 and printed `scanner_args=-Dsonar.qualitygate.wait=true` without echoing the token.
3. **Unit tests.** `test/ci/require-sonar-gateway.test.js` covers missing host, missing token, invalid URL, organization/project-key flags, and GitHub output without persisting the token.
4. **actionlint** exited 0 on the workflow.

## Reasoning

The investigated tree had no Sonar job, which is an omission-bypass. Skipping when vars are empty would recreate that bypass. Fail-closed means this PR’s `sonar-quality-gate` job stays red until maintainers set the repository variable and secret. That is the intended gate, not a silent skip.

## Residual

Live Sonar server analysis cannot be executed in this workspace (no `SONAR_TOKEN`). Operators must set:

- `vars.SONAR_HOST_URL`
- `secrets.SONAR_TOKEN`
- optional `vars.SONAR_ORGANIZATION`, `vars.SONAR_PROJECT_KEY`

GitHub-hosted jobs on PR #5 currently do not start because the GitHub account is locked for billing. That failure is independent of this gateway. After billing is restored, missing Sonar vars/secrets still fail closed.
