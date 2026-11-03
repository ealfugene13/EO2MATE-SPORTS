import { z } from 'npm:zod@3.24.1';
import { adminClient, authenticate, isResponse, json, methodNotAllowed, preflight, readJson } from '../_shared/server.ts';

const schema = z.object({ organization_id: z.string().uuid(), email: z.string().email(), role: z.enum(['ADMIN', 'STAFF']) });

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'POST') return methodNotAllowed(request, 'POST');
  const auth = await authenticate(request);
  if (isResponse(auth)) return auth;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return json(request, { error: 'INVALID_INVITATION' }, 422);
  const { organization_id, email, role } = parsed.data;
  try {
    const admin = adminClient();
    const { data: membership, error: membershipError } = await admin.from('organization_members')
      .select('user_grp,user_role,active,organizations!organization_members_organization_id_fkey(workflow_status)')
      .eq('organization_id', organization_id).eq('user_id', auth.user.id).maybeSingle();
    if (membershipError) return json(request, { error: membershipError.message }, 400);
    if (!membership?.active || !['OWNER', 'ADMIN'].includes(membership.user_role)) return json(request, { error: 'FORBIDDEN' }, 403);
    if ((membership.organizations as { workflow_status?: string } | null)?.workflow_status !== 'SETUP') return json(request, { error: 'LEAGUE_SETUP_LOCKED' }, 409);
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);
    if (inviteError || !invited.user) return json(request, { error: inviteError?.message ?? 'INVITATION_FAILED' }, 400);
    const { error: upsertError } = await admin.from('organization_members').upsert({
      organization_id, user_id: invited.user.id, user_grp: membership.user_grp, user_role: role,
      role: role === 'ADMIN' ? 'ADMIN' : 'STATISTICIAN', active: true,
    }, { onConflict: 'organization_id,user_id' });
    if (upsertError) return json(request, { error: upsertError.message }, 400);
    await admin.from('audit_log').insert({ organization_id, actor_id: auth.user.id, action: 'INVITE', entity_type: 'ORGANIZATION_MEMBER', entity_id: invited.user.id, metadata: { email, role } });
    return json(request, { user_id: invited.user.id, email, role }, 201);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : 'INVITATION_FAILED' }, 500);
  }
});
