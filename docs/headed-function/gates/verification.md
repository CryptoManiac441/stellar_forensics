# Verification gate

Recorded after code + docs + last functional tests. Commands below are the claims' evidence.

## Syntax (touched JS)

```bash
node --check src/cli.js
node --check src/extractors.js
node --check src/passwords.js
node --check test/cli.test.js
node --check test/cli.functional.test.js
node --check scripts/headed-smoke.mjs
```

Expected: exit 0 each.

## Full functional suite

```bash
npm test
```

Fresh result captured in `evidence/npm-test.txt`:

```
# tests 32
# pass 32
# fail 0
# duration_ms 8073.598756
```

## Headed smoke

```bash
npm run test:headed
```

Evidence: `evidence/headed-smoke.json`

Honest label: **terminal-headed** (inherited stdio). Not browser. Not WinForms.

## Headless/captured smoke

```bash
npm run test:headed:headless
```

Same journeys, stdio piped.

## What this does not prove

- `scan --all-drives` on Windows
- `--password-search containers`
- Playwright GUI
- Native Windows desktop
