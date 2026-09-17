# Evidence index

| File | What it proves |
|------|----------------|
| `syntax-check.txt` | `node --check` on touched JS exited 0 |
| `npm-test.txt` | `npm test` — 32/32 pass, 0 fail (includes unit + functional/E2E; Horizon testnet used for verify) |
| `headed-smoke.json` | `npm run test:headed` — help, scan --file, verify testnet, report; `"headed": true` means inherited stdio, not a GUI |

No screenshots: there is no browser UI on `main`. DISPLAY=:1 was set but unused for GUI.
