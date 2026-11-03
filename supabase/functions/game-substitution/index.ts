import { z } from 'npm:zod@3.24.1';
import { authenticate, isResponse, json, methodNotAllowed, preflight, readJson } from '../_shared/server.ts';

const schema = z.object({
  game_id: z.string().uuid(), organization_id: z.string().uuid(), team_id: z.string().uuid(),
  player_out: z.string().uuid(), player_in: z.string().uuid(), period: z.number().int().min(1).max(20), clock_ms: z.number().int().min(0),
});

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'POST') return methodNotAllowed(request, 'POST');
  const auth = await authenticate(request);
  if (isResponse(auth)) return auth;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return json(request, parsed.error.flatten(), 422);
  const values = parsed.data;
  const { data, error } = await auth.supabase.rpc('record_game_substitution', {
    p_actor: auth.user.id, p_game_id: values.game_id, p_organization_id: values.organization_id,
    p_team_id: values.team_id, p_player_out: values.player_out, p_player_in: values.player_in,
    p_period: values.period, p_clock_ms: values.clock_ms,
  });
  if (error) return json(request, { error: error.message }, 400);
  return json(request, data, 201);
});
