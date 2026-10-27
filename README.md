# EO2MATE Sports — Basketball UI Prototype

Responsive basketball league operations UI based on the EO2MATE Sports initial design. It covers the staff journey from sign-in and league setup through roster approval, game-day scoring, result review, public scoreboard, standings, and reports.

## Run the UI

Requirements: Node.js 22 or later and npm.

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal. The sign-in screen opens a demo workspace when Supabase credentials are not configured.

## Publish the UI with GitHub Pages

This repository includes `.github/workflows/deploy-pages.yml` for the `EO2MATE-SPORTS` repository.

1. Push the project files to the repository's `main` branch. If the default branch has a different name, update the workflow branch filter first.
2. In GitHub, open **Settings → Pages** and choose **GitHub Actions** under **Build and deployment → Source**.
3. Open **Actions** and wait for **Deploy basketball UI to GitHub Pages** to finish successfully.
4. Open `https://sports.eo2mate.com/` after GitHub Pages reports the custom domain and HTTPS certificate as ready.

The workflow builds only `apps/web`; it does not deploy the API or apply the Supabase migration. The Pages URL is a UI preview and uses sample data.

## Screens and interactions

- Sign in with an MFA field and demo-mode notice.
- Organization dashboard with live games, upcoming games, review tasks, standings, and season leaders.
- Competition and rule configuration, teams, player directory, and registration review.
- Game schedule, live game console, five-player lineup and bench, substitutions, game clock and period controls, timeouts, player stat entry, play-by-play, event undo, and result review/finalization.
- Standings, read-only public live scoreboard, announcements, staff access/audit view, and reports.
- Responsive navigation and game-day layout for smaller screens.

The live console demonstrates event entry and score updates in local component state. Its clock counts down while running; substitutions update the active lineup; and player actions update the selected player's preview box score. Sample data is fictional. The UI does not persist changes, authenticate users in demo mode, enforce permissions, or publish to a public site. Supabase integration and production security gates must be completed before using real league or player data.

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
