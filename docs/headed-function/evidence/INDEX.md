# Evidence index

| File | What it proves |
|------|----------------|
| `syntax-check.txt` | Loop 02 `node --check` on touched JS exited 0 |
| `npm-test.txt` | Loop 02 `npm test` — 32/32 pass |
| `npm-test-loop-03.txt` | Loop 03 `npm test` — **36/36 pass**, 0 fail (prior suite + unreadable `--file`, missing password file, gzip `--file`, public Horizon, missing verify/report operands) |
| `headed-smoke.json` | Latest `npm run test:headed` — inherited stdio, `"headed": true`, not a GUI |
| `headed-smoke-loop-03.json` | Copy of loop 03 headed smoke |

No screenshots: there is no browser UI on `main`. DISPLAY=:1 was set but unused for GUI.
