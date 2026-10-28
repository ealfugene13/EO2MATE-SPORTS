# EO2MATE Sports — Basketball League MVP

Responsive league operations app for organization setup, competitions and rules, teams, players, registrations, scheduling, game-day scoring, standings, reports, announcements, and staff access.

## Run locally

Requirements: Node.js 22 or later and npm.

```bash
npm install
npm run dev --workspace @sports/web
```

Copy `.env.example` to the web app's `.env.local` and configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The browser uses the anon key and relies on database RLS. Do not put the service-role key in a `VITE_` variable.

The API is required for event scoring and staff invitations:

```bash
npm run dev --workspace @sports/api
```

Run the API with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `API_PORT`, and `WEB_ORIGIN` set in its server environment. Configure the web app's `VITE_API_URL` to the deployed API URL outside local development. The service-role key stays on the server.

## Database setup

For a new Supabase project, apply migrations in order:

1. `0001_initial.sql` — organizations, members, teams, players, games, event history, RLS, and scoring RPCs.
2. `0002_parameterized_basketball_rules.sql` — versioned competition rules and per-game rule snapshots.
3. `0003_navigation_data.sql` — registration and announcement records, organization settings, organization creation and registration RPCs, finalization, audit triggers, and narrow public scoreboard views.

The first signed-in staff member can create the organization from **Organization setup**. The RPC assigns that account the `OWNER` role.

## Navigation data paths

- Dashboard, competition rules, teams, players, registrations, and schedule read organization-scoped Supabase rows.
- Team and player records can be added, and active status can be changed.
- Registration review supports creating a pending player registration, approving it, and returning it for changes.
- Game scheduling writes team, venue, and tip-off selections to `games`.
- Live scoring writes events through the authenticated API and the `record_game_event` database RPC. The database updates the score transactionally.
- Result review finalizes live games through the `finalize_game` RPC. Database triggers record status changes in the audit log.
- Standings and reports are calculated from saved results and events.
- Public scoreboard views expose only enabled public live games and approved player names.
- Announcements are saved for the organization. Email and push delivery are not wired yet.
- Staff invitations use the authenticated API and Supabase Auth email invitation flow. The API checks organization role and records an audit event.

The game-day scorer supports selecting a game, team, active roster player, event type, and saved period/clock. Automatic clock operation, timeout and foul enforcement, assist validation, and full box-score workflows still need server persistence before production use.

## Publish the UI

The GitHub Pages workflow builds `apps/web`; it does not deploy `apps/api`, configure secrets, or apply Supabase migrations. Deploy the API separately and configure GitHub Pages environment values before connecting the live UI. The public scoreboard stays empty until an organization enables its public portal and has a live game.

## Stack

- React, TypeScript, and Vite
- Supabase Auth, PostgreSQL, RLS, and RPCs
- Node.js API for privileged workflows
- Lucide icons
