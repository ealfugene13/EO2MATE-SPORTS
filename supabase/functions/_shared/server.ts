import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.57.4';

const projectUrl = Deno.env.get('SUPABASE_URL') ?? '';
const publicKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';

function corsHeaders(request: Request): Headers | null {
  const origin = request.headers.get('origin');
  const allowedOrigins = (Deno.env.get('WEB_ORIGIN') ?? 'https://sports.eo2mate.com,http://localhost:5173')
    .split(',').map(value => value.trim()).filter(Boolean);
  if (origin && !allowedOrigins.includes(origin)) return null;
  return new Headers({
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  });
}

export function json(request: Request, value: unknown, status = 200): Response {
  const headers = corsHeaders(request) ?? new Headers();
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(value), { status, headers });
}

export function preflight(request: Request): Response {
  const headers = corsHeaders(request);
  if (!headers) return new Response('Origin not allowed', { status: 403 });
  return new Response('ok', { status: 200, headers });
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function adminClient(): SupabaseClient {
  if (!projectUrl || !serviceKey) throw new Error('Supabase server credentials are unavailable.');
  return createClient(projectUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type AuthenticatedContext = { user: User; supabase: SupabaseClient };

export async function authenticate(request: Request): Promise<AuthenticatedContext | Response> {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return json(request, { error: 'UNAUTHORIZED' }, 401);
  if (!projectUrl || !publicKey) return json(request, { error: 'SUPABASE_CONFIGURATION_MISSING' }, 500);
  const client = createClient(projectUrl, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return json(request, { error: 'UNAUTHORIZED' }, 401);
  return { user: data.user, supabase: client };
}

export function isResponse(value: AuthenticatedContext | Response): value is Response {
  return value instanceof Response;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function methodNotAllowed(request: Request, method: string): Response {
  return json(request, { error: 'METHOD_NOT_ALLOWED' }, 405);
}
