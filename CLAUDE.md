# Northern Irish Links 2026 — Golf Trip App

## What This Is
A real-time golf trip companion app for 8 players traveling to Northern Ireland, June 26–July 3, 2026. Built with React + Vite + Firebase Firestore + Vercel.

**Live at:** https://ni-links-2026.vercel.app

## Architecture
- **Single-file React app:** `src/App.jsx` (~3400 lines) — this is where nearly all changes happen
- **Firebase config:** `src/firebase.js` — Firestore subscriptions, save function
- **Serverless scanner:** `api/scan-scorecard.js` — Vercel serverless function for scorecard photo scanning via Anthropic vision API
- **Build:** Vite with manual chunk splitting (react/firebase/app)

## Players (8)
| ID | Name | Handicap | Emoji | Team |
|----|------|----------|-------|------|
| p1 | Jeff Andrea | 10.2 | 🔴 | 🇮🇹 Italians |
| p2 | Brian Smith | 12.8 | 🔵 | 🦅 WASPs |
| p3 | Daniel DiBiasio | 9.2 | ⚪ | 🇮🇹 Italians |
| p4 | Mark McGrath | 7.0 | 🔴 | 🦅 WASPs |
| p5 | Steve Lopiano | 12.1 | 🔵 | 🇮🇹 Italians |
| p6 | Carl Simon | 6.7 | ⚪ | 🦅 WASPs |
| p7 | Rory Callagy | 7.2 | 🔴 | 🦅 WASPs |
| p8 | Eric Ferraris | 5.7 | 🔵 | 🇮🇹 Italians |

## Courses (5 rounds)
1. **Ardglass** — Par 70, Sat Jun 27
2. **Royal County Down** — Par 71, Sun Jun 28
3. **Castlerock (Mussenden)** — Par 73, Mon Jun 29
4. **Royal Portrush (Dunluce)** — Par 72, Tue Jun 30
5. **Portstewart (Strand)** — Par 72, Wed Jul 1

Each course has selectable tees with different slope ratings. Selected tees are stored in state and update all handicap calculations.

## Key Constants & Data
- `APP_VERSION` — bump this on every meaningful change
- `DEFAULT_PLAYERS` — player roster with handicap indices (force-synced on load unless manually edited)
- `DEFAULT_INDIVIDUAL_PROPS` — individual prop bets (force-synced via `syncProps`)
- `COURSES` — course data including pars, stroke indices, and tee options
- `TEAM_MATCHUPS` — WASPs vs Italians team definition
- `BOOKKEEPER_IDS` — ["p2", "p6"] (Brian & Carl) — only these can edit Bets & Expenses
- `GROSS_GROUP_A` / `GROSS_GROUP_B` — Irish-themed names for handicap bracket groups

## Access Control (3 layers)
1. **Guests** — read-only everything, "Players Only" lock on Bets/Expenses
2. **Non-gatekeeper players** — can enter scores, join H2H bets, opt into skins; Bets/Expenses are view-only except H2H joining and skins opt-in
3. **Gatekeepers (Brian p2, Carl p6)** — full access to create/settle/delete bets, manage expenses, edit handicaps

The master `update()` function enforces this via `canEditBooksRef` — it strips book-related fields from non-gatekeeper writes. `h2hBets` and `skinsEligible` are exempted so all players can join those.

## Betting Structure
- **🏆 Team Stableford** — WASPs vs Italians, NET, $100/man, winner's 4 each win $100
- **⛳ Ind (Gross Brackets)** — Group A (⛰️ The Mournes, low HI) vs Group B (🌊 The Causeway, high HI), gross Stableford, $50/man winner-take-all per group
- **🔪 Skins** — Gross and Net skins, $20/skin, player opt-in, auto-computed from scores
- **🎯 Props** — Individual net props, $20/man, player-selectable eligibility, leader auto-computed
- **🤝 H2H** — Head-to-head bets, any player can join sides, gatekeepers create/settle

## Scoring System
- **Course handicap:** `HI × (slope / 113)` rounded. Slope comes from `ACTIVE_SLOPES[courseIdx]` which updates when tees are selected.
- **Net Stableford:** Eagle 4, Birdie 3, Par 2, Bogey 1, Double+ 0 (net of course handicap via stroke index)
- **Gross Stableford:** Same points but handicap = 0 (no strokes given)
- **Skins:** Sole low score wins the hole; ties push (accumulate to next hole)
- **Strokes per hole:** `strokesOnHole(courseHcp, holeSI)` — 1 stroke if SI ≤ hcp, 2 if SI ≤ hcp-18

## Money Math Rules
ALL money must conserve to exactly $0 across all players. Key patterns:
- Team bets: winners split losers' money only
- Props: eligible players pay buy-in, winner takes pot
- Skins: each skin won = $20 from each other eligible player
- Expenses: payer credited full amount, each split member debited their share (including payer if in split)
- Always test with: `Object.values(balances).reduce((a,b) => a+b, 0) === 0`

## Firebase State
All synced state lives in Firestore doc `/trips/ni-links-2026`. Fields:
`players, scores, games, bets, individualProps, h2hBets, teamMatches, drinks, expenses, selectedTees, skinsEligible`

Chat is in a separate `/chat` collection.

## Deploy Workflow
This project auto-deploys via Vercel on git push. To deploy changes:
```bash
cd /Users/carlsimon/Downloads/ni-links-2026
git add .
git commit -m "description of change - vX.X"
git push
```
Vercel picks up the push and deploys in ~60-90 seconds.

**Common issue:** `Could not resolve host: github.com` — transient WiFi DNS. Just re-run `git push`.

## Before Making Changes
1. Always `npm run build` before pushing to catch errors
2. Bump `APP_VERSION` on every user-facing change
3. Check brace/bracket balance after edits
4. Test money conservation for any bet/expense changes
5. The `syncProps` function force-syncs prop definitions from code on every load — so changing DEFAULT_INDIVIDUAL_PROPS in code will update everyone's app

## GitHub
- Repo: github.com/carlrsimon-png/ni-links-2026
- Branch: main
