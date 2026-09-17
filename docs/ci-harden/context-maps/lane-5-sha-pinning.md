# Lane 5 context map — SHA pinning

## Investigated reality (2026-09-17, `origin/main` @ `75a930c`)

There were **no** GitHub Actions `uses:` blocks to pin. Mutable tags (`@v4`, `@main`) cannot exist until workflows exist. This lane pins every action at the moment CI is introduced so tag-move / compromised-tag supply-chain risk never lands on `main`.

## Upstream dependencies that could break

| Upstream (immutable ref resolved 2026-09-17 via GitHub Git refs API) | Human version | Breakage if the SHA is wrong |
| --- | --- | --- |
| `actions/checkout@11d5960a326750d5838078e36cf38b85af677262` | v4.4.0 | Checkout failure; all jobs die |
| `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020` | v4.4.0 | Node toolchain missing; `npm ci` / tests / scripts fail |
| `actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02` | v4.6.2 | Cell diagnostics never stored |
| `actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093` | v4.3.0 | Aggregator cannot read cell artifacts (must stay on artifact v4 with upload v4.6.2) |
| `SonarSource/sonarqube-scan-action@ba9859eae8dd6bd29e412f25ddbbef3d032000f4` | v8.2.2 | Quality gate job cannot run |

Tag-to-SHA resolution used `refs/tags/<tag>` and peeled annotated tags to the 40-character commit object. Do not retarget these comments without re-resolving.

## Downstream configurations relying on this block

| Downstream | Reliance |
| --- | --- |
| Every job in `.github/workflows/*.yml` | `uses:` must be `owner/repo@<40 hex>` plus a trailing `# <version>` comment |
| `test/ci/workflow-pinning.test.js` | Fails CI if any `uses:` is a mutable tag, branch, or short SHA |
| Dependabot / manual bumps | Must change **both** the SHA and the trailing version comment together |
| Artifact aggregator (lane 2) | `upload-artifact` v4.x and `download-artifact` v4.x must remain a matched major; mixing v3/v4 artifacts is unsupported |

## Exact blast radius

**In scope**

- All `uses:` entries under `.github/workflows/`
- The pinning unit test
- This map's SHA table (must stay in sync with YAML)

**Out of scope**

- Pinning npm packages in `package-lock.json` (already a lockfile; different supply-chain control)
- Pinning GitHub-hosted runner images (`ubuntu-latest` remains a moving image tag; not an Action)

**Runtime blast**

- If GitHub ever garbage-collects an action SHA (rare), jobs fail loudly on checkout of that action — preferable to silently tracking a retagged `v4`

## Planned fix (applied only after this map)

1. Write every `uses:` with a full 40-character lowercase hex SHA.
2. Append `# <marketplace version>` on the same line for humans.
3. Add a unit test that parses workflow YAML text and rejects unpinned actions, including `uses: org/repo@v4` and `@main`.
4. Do not use `actions/*@v4` even in comments that could be copy-pasted as real `uses:` lines; comments may mention the version after `#` only.
