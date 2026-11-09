import { z } from 'npm:zod@3.24.1';
import { authenticate, isResponse, json, methodNotAllowed, preflight, readJson } from '../_shared/server.ts';

const schema = z.object({
  game_id: z.string().uuid(), organization_id: z.string().uuid(), team_id: z.string().uuid(),
  player_id: z.string().uuid().nullable().optional(), related_player_id: z.string().uuid().nullable().optional(),
  client_action_id: z.string().uuid(),
  event_type: z.enum(['PASS','FT_MADE','FT_MISSED','2PT_MADE','2PT_MISSED','3PT_MADE','3PT_MISSED','REBOUND_OFF','REBOUND_DEF','ASSIST','STEAL','BLOCK','TURNOVER','FOUL','FLAGRANT_FOUL','TECHNICAL_FOUL','TIMEOUT','OUT_OF_BOUNDS','SUB_IN','SUB_OUT']),
  period: z.number().int().min(1).max(20), clock_ms: z.number().int().min(0),
});

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'POST') return methodNotAllowed(request, 'POST');
  const auth = await authenticate(request);
  if (isResponse(auth)) return auth;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return json(request, parsed.error.flatten(), 422);
  const { data, error } = await auth.supabase.rpc('record_game_event', { p_actor: auth.user.id, p_payload: parsed.data });
  if (error) return json(request, { error: error.message }, 400);
  return json(request, data, 201);
});
