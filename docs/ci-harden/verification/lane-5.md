# Lane 5 verification — SHA pinning

## Verification completion statement

Lane 5 is complete. Every `uses:` in `.github/workflows/ci.yml` is pinned to a 40-character lowercase commit SHA with a trailing human version comment. `test/ci/workflow-pinning.test.js` fails the suite if a mutable tag or missing comment is introduced.

## Evidence

1. **Parse.** PyYAML + line scan found **13** `uses:` entries. Each SHA is 40 hex characters:

   - `actions/checkout@11d5960a326750d5838078e36cf38b85af677262` # v4.4.0
   - `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020` # v4.4.0
   - `actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02` # v4.6.2
   - `actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093` # v4.3.0
   - `SonarSource/sonarqube-scan-action@ba9859eae8dd6bd29e412f25ddbbef3d032000f4` # v8.2.2

   SHAs were resolved from GitHub Git refs on 2026-09-17 (see context map).
2. **Tests.** `npm test` includes the pinning test and passed **37/37** after the version-comment regex fix (`commentParts` do not include `#`).
3. **actionlint** v1.7.12 exited 0.
4. **Secret scan** of workflow + `scripts/ci/*` found no `ghp_`, `github_pat_`, `sonar.login`, or similar credential patterns.

## Reasoning

There were no pre-existing Actions to unpin. Pinning at introduction prevents `uses: owner/repo@v4` from ever landing. Upload v4.6.2 is paired with download v4.3.0 so artifact majors match.

## Residual

Runner images (`ubuntu-latest`, etc.) remain moving tags. npm packages remain lockfile-pinned, not Action-SHA-pinned. Those are outside this lane.
