import { authenticate, isResponse, json, methodNotAllowed, preflight } from '../_shared/server.ts';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'GET') return methodNotAllowed(request, 'GET');
  const auth = await authenticate(request);
  if (isResponse(auth)) return auth;
  const { data, error } = await auth.supabase.from('profiles').select('id,display_name').eq('id', auth.user.id).single();
  if (error) return json(request, { error: error.message }, 400);
  return json(request, data);
});
