# Architecture

## Trust boundaries
Browser uses Supabase anon credentials only. Supabase RLS enforces tenant isolation. The Node API owns privileged workflows and uses the service-role key only server-side. Every privileged live-stat mutation verifies organization membership/role again inside a PostgreSQL RPC.

## Multi-tenancy
Every business entity carries `organization_id`. Membership is explicit in `organization_members`. RLS policies call `is_org_member` / `has_org_role`.

## PII
Keep only operationally necessary player PII. Birth dates are protected by tenant RLS and should not appear on public scoreboard views. Add consent/retention rules before production collection of minors' information.

## Game integrity
`game_events` is append-only operational history. Corrections use reversal events. Score totals are updated transactionally by RPC. Reports can derive player statistics from event history.

## Expansion
The tenant shell is sport-neutral. Basketball event types are V1-specific. Future sports should add sport-specific event schemas rather than polluting basketball rules.
