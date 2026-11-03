import { z } from 'npm:zod@3.24.1';
import { authenticate, isResponse, json, methodNotAllowed, preflight, readJson } from '../_shared/server.ts';

const schema = z.object({ event_id: z.string().uuid(), reason: z.string().trim().min(1).max(500).optional() });

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'POST') return methodNotAllowed(request, 'POST');
  const auth = await authenticate(request);
  if (isResponse(auth)) return auth;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return json(request, parsed.error.flatten(), 422);
  const { data, error } = await auth.supabase.rpc('reverse_game_event', {
    p_actor: auth.user.id, p_event_id: parsed.data.event_id, p_reason: parsed.data.reason || 'Operator correction',
  });
  if (error) return json(request, { error: error.message }, 400);
  return json(request, data);
});
