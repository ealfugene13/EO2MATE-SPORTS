# EO2MATE Sports — Navigation and data flow

1. **Sign in:** Supabase Auth password sign-in, verified TOTP challenge when enabled, and password reset. Authenticated routes redirect to sign-in.
2. **Organization setup:** create an organization through a security-definer RPC, or update its name, timezone, privacy contact, and public scoreboard setting. The creator is assigned `OWNER`.
3. **Dashboard:** reads organization teams, players, registrations, games, scores, and statuses.
4. **Competition and rules:** saves a versioned `competitions.rule_settings` JSON value. The database snapshots those rules onto new games.
5. **Teams and players:** add and deactivate/reactivate organization records. Assign active players to a team's season roster. Player queries omit birth dates.
6. **Registration review:** create a player plus pending registration in one database RPC; owners and admins can approve or return records. Approval adds assigned players to their season roster.
7. **Game schedule:** create games from organization teams and venues; filter saved games by status and venue.
8. **Live scoring:** start a scheduled game, save period and clock values, select a side and active roster player, and save an event through the API. `record_game_event` verifies the caller, role, team, and active roster assignment and updates the score in a transaction.
9. **Review and finalize:** inspect saved game events and score, then finalize through an owner/admin-only RPC. Game status changes are audited.
10. **Standings and reports:** calculate totals from finalized games and their saved event history.
11. **Public scoreboard:** query narrow read-only views. The organization must enable the public portal; names appear only with explicit public-name approval.
12. **Announcements:** save a subject, body, and audience to the organization. Delivery notifications are not yet implemented.
13. **Staff access and audit:** list organization members and audit events; owner/admin invitations go through the authenticated API.

## Trust boundaries

The browser uses only the Supabase anon key. Organization membership and role checks are enforced by RLS and security-definer RPCs. The Node API holds the service-role key server-side and verifies both the bearer token and organization role before privileged actions. Public views return a limited set of live game fields and consent-approved player names.

## Apply schema

Apply `supabase/migrations/0001_initial.sql`, then `0002_parameterized_basketball_rules.sql`, then `0003_navigation_data.sql`. The GitHub Pages workflow does not run migrations or deploy the API.
