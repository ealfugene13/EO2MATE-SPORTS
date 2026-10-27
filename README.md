# EO2MATE Sports — Basketball UI Prototype

Responsive basketball league operations UI based on the EO2MATE Sports initial design. It covers the staff journey from sign-in and league setup through roster approval, game-day scoring, result review, public scoreboard, standings, and reports.

## Run the UI

Requirements: Node.js 22 or later and npm.

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal. The sign-in screen opens a demo workspace when Supabase credentials are not configured.

## Screens and interactions

- Sign in with an MFA field and demo-mode notice.
- Organization dashboard with live games, upcoming games, review tasks, standings, and season leaders.
- Competition and rule configuration, teams, player directory, and registration review.
- Game schedule, live game console, play-by-play, event correction/undo, and result review/finalization.
- Standings, read-only public live scoreboard, announcements, staff access/audit view, and reports.
- Responsive navigation and game-day layout for smaller screens.

The live console demonstrates event entry and score updates in local component state. Sample data is fictional. The UI does not persist changes, authenticate users in demo mode, enforce permissions, or publish to a public site. Supabase integration and production security gates must be completed before using real league or player data.

## Stack

- React + TypeScript + Vite
- Node.js + TypeScript API workspace
- Supabase PostgreSQL/Auth/Realtime/Storage foundation
- Lucide icons

## Project layout

- `apps/web`: UI
- `apps/api`: API workspace
- `supabase/migrations`: initial database migration
- `docs`: architecture and UI flow notes

## Configuration

Copy `.env.example` to `apps/web/.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` only when connecting to a non-production test project. Never put the Supabase service-role key in the browser.
