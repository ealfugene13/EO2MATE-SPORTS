import { z } from 'npm:zod@3.24.1';
import { adminClient, authenticate, isResponse, json, methodNotAllowed, preflight, readJson } from '../_shared/server.ts';

const schema = z.object({
  game_id: z.string().uuid(),
  home_player_ids: z.array(z.string().uuid()).length(5),
  away_player_ids: z.array(z.string().uuid()).length(5),
  home_coach_confirmed: z.literal(true),
  away_coach_confirmed: z.literal(true),
  keyword: z.string().max(100).optional(),
});

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'POST') return methodNotAllowed(request, 'POST');
  const auth = await authenticate(request);
  if (isResponse(auth)) return auth;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return json(request, { error: 'INVALID_STARTING_LINEUPS' }, 422);
  const values = parsed.data;
  try {
    const admin = adminClient();
    const { data: game, error: gameError } = await admin.from('games')
      .select('id,organization_id,home_team_id,away_team_id,status,scheduled_at')
      .eq('id', values.game_id).maybeSingle();
    if (gameError) return json(request, { error: gameError.message }, 400);
    if (!game) return json(request, { error: 'GAME_NOT_FOUND' }, 404);
    const { data: membership, error: membershipError } = await admin.from('organization_members')
      .select('role,user_role,active').eq('organization_id', game.organization_id).eq('user_id', auth.user.id).maybeSingle();
    if (membershipError) return json(request, { error: membershipError.message }, 400);
    if (!membership?.active || !['OWNER', 'ADMIN', 'STAFF', 'SCORER', 'STATISTICIAN', 'COACH'].includes(membership.user_role || membership.role)) return json(request, { error: 'FORBIDDEN' }, 403);
    if (game.status !== 'SCHEDULED' && game.status !== 'LIVE') return json(request, { error: 'GAME_NOT_AWAITING_STARTING_LINEUPS' }, 409);
    if (game.status === 'SCHEDULED' && !game.scheduled_at) return json(request, { error: 'GAME_SCHEDULE_REQUIRED' }, 409);
    const early = game.status === 'SCHEDULED' && !!game.scheduled_at && new Date(game.scheduled_at).getTime() > Date.now();
    if (early) {
      const expected = Deno.env.get('EARLY_START_KEYWORD');
      if (!expected) return json(request, { error: 'EARLY_START_KEYWORD_NOT_CONFIGURED' }, 500);
      if (!values.keyword?.trim()) return json(request, { error: 'EARLY_START_KEYWORD_REQUIRED' }, 403);
      if (values.keyword.trim() !== expected) return json(request, { error: 'INVALID_EARLY_START_KEYWORD' }, 403);
    }
    const { data, error } = await admin.rpc('start_game_with_lineups_authorized', {
      p_actor: auth.user.id, p_game_id: game.id, p_home_player_ids: values.home_player_ids,
      p_away_player_ids: values.away_player_ids, p_home_coach_confirmed: true, p_away_coach_confirmed: true,
      p_early_start_authorized: early,
    });
    if (error) return json(request, { error: error.message }, 400);
    return json(request, data);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : 'GAME_START_FAILED' }, 500);
  }
});
