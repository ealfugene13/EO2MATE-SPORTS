# EO2MATE Sports Basketball — UI Flow

The UI prototype follows the initial design flow and keeps the courtside scorer focused on the active game.

1. **Sign in:** staff account, MFA field, and organization context.
2. **Organization overview:** today's games, live games, pending registration and result review, standings snapshot, and season leaders.
3. **Competition setup:** season, division, configured basketball rules, tie-break order, and saved rule version.
4. **Team and player setup:** team directory, roster state, player sports profile, and public-profile visibility.
5. **Registration review:** eligibility status and guardian verification review, separated from the scorer workflow.
6. **Schedule and matchup:** weekly schedule, date navigation, venue/status filters, matchups, scorer and reviewer assignment, and a scheduling-conflict preview.
7. **Pre-game readiness:** available from the game schedule before enabling live scoring; the roster and game rules must be confirmed.
8. **Live scoring:** team score, quarter and clock, on-court player selection, made/missed shots, rebounds, assists, steals, blocks, turnovers, fouls, substitution, and append-only play-by-play with undo/correction affordance.
9. **Review and finalize:** score reconciliation, sync state, box score, and result finalization.
10. **League outputs:** standings, a read-only public scoreboard preview, announcements, audit/access view, and reports.

The schedule modal demonstrates a UI conflict-check state. It is sample data only; real venue/team/staff conflict validation must be enforced by the API and database before deployment.

All displayed league data is fictional. The prototype uses local component state and is not connected to a live Supabase project.
