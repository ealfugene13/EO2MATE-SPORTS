import { z } from 'npm:zod@3.24.1';
import { adminClient, authenticate, isResponse, json, methodNotAllowed, preflight, readJson } from '../_shared/server.ts';

const planSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,39}$/),
  name: z.string().trim().min(2).max(100),
  description: z.string().max(600).default(''),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default('PHP'),
  monthly_price: z.number().min(0).max(999999999),
  yearly_price: z.number().min(0).max(999999999),
  trial_days: z.number().int().min(0).max(365).default(0),
  team_limit: z.number().int().min(0).nullable().default(null),
  player_limit: z.number().int().min(0).nullable().default(null),
  staff_seat_limit: z.number().int().min(0).nullable().default(null),
  features: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  active: z.boolean().default(true),
});
const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('detect') }),
  z.object({ action: z.literal('list') }),
  z.object({ action: z.literal('save_plan'), plan: planSchema }),
  z.object({
    action: z.literal('create_account'),
    organization_name: z.string().trim().min(2).max(120),
    owner_name: z.string().trim().min(2).max(120),
    owner_email: z.string().trim().email().max(254),
    plan_id: z.string().uuid(),
    status: z.enum(['TRIAL','ACTIVE']),
    billing_cycle: z.enum(['MONTHLY','YEARLY','CUSTOM']),
    payment_mode: z.enum(['MANUAL','PAYMONGO']),
    custom_price: z.number().min(0).max(999999999).optional(),
    starts_at: z.string().datetime().optional(),
    current_period_ends_at: z.string().datetime().nullable().optional(),
    admin_notes: z.string().max(2000).default(''),
  }),
  z.object({
    action: z.literal('update_subscription'),
    organization_id: z.string().uuid(),
    status: z.enum(['TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED','EXPIRED']),
    billing_cycle: z.enum(['MONTHLY','YEARLY','CUSTOM']),
    payment_mode: z.enum(['MANUAL','PAYMONGO']),
    plan_id: z.string().uuid().nullable(),
    price_amount: z.number().min(0).max(999999999),
    starts_at: z.string().datetime(),
    trial_ends_at: z.string().datetime().nullable(),
    current_period_ends_at: z.string().datetime().nullable(),
    admin_notes: z.string().max(2000).default(''),
  }),
]);

async function supportAccess(request: Request, userId: string) {
  const admin = adminClient();
  const { data, error } = await admin.from('platform_support_admins').select('active').eq('user_id', userId).maybeSingle();
  if (error) return { response: json(request, { error: 'SUPPORT_ADMIN_CHECK_FAILED' }, 500) };
  if (!data?.active) return { response: json(request, { error: 'FORBIDDEN' }, 403) };
  return { admin };
}

function makeSlug(name: string) {
  const stem = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'sports-account';
  return `${stem}-${crypto.randomUUID().slice(0, 8)}`;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'POST') return methodNotAllowed(request, 'POST');
  const auth = await authenticate(request);
  if (isResponse(auth)) return auth;
  const parsed = requestSchema.safeParse(await readJson(request));
  if (!parsed.success) return json(request, { error: 'INVALID_SUPPORT_ADMIN_REQUEST', details: parsed.error.flatten() }, 422);
  const input = parsed.data;
  const access = await supportAccess(request, auth.user.id);
  if ('response' in access) return access.response;
  const { data: assurance, error: assuranceError } = await auth.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) return json(request, { error: 'MFA_CHECK_FAILED' }, 403);
  if (input.action === 'detect') return json(request, { is_support_admin: true, aal2: assurance.currentLevel === 'aal2' });
  if (assurance.currentLevel !== 'aal2') return json(request, { error: 'MFA_REQUIRED' }, 403);
  const admin = access.admin!;

  if (input.action === 'list') {
    const [{ data: accounts, error: accountsError }, { data: plans, error: plansError }, { data: subscriptions, error: subscriptionsError }] = await Promise.all([
      admin.from('platform_customer_accounts').select('*').order('created_at', { ascending: false }),
      admin.from('platform_subscription_plans').select('*').order('name'),
      admin.from('platform_subscriptions').select('*').order('updated_at', { ascending: false }),
    ]);
    if (accountsError || plansError || subscriptionsError) return json(request, { error: accountsError?.message ?? plansError?.message ?? subscriptionsError?.message ?? 'ADMIN_DATA_LOAD_FAILED' }, 500);
    const ids = (accounts ?? []).map(row => row.organization_id);
    const { data: organizations, error: organizationsError } = ids.length
      ? await admin.from('organizations').select('id,name,workflow_status').in('id', ids)
      : { data: [], error: null };
    if (organizationsError) return json(request, { error: organizationsError.message }, 500);
    const orgById = new Map((organizations ?? []).map(row => [row.id, row]));
    const planById = new Map((plans ?? []).map(row => [row.id, row]));
    const subByOrg = new Map((subscriptions ?? []).map(row => [row.organization_id, { ...row, plan: planById.get(row.plan_id) ?? null }]));
    return json(request, { accounts: (accounts ?? []).map(row => ({ ...row, organization: orgById.get(row.organization_id) ?? null, subscription: subByOrg.get(row.organization_id) ?? null })), plans: plans ?? [] });
  }

  if (input.action === 'save_plan') {
    const { id, ...values } = input.plan;
    const payload = { ...values, updated_by: auth.user.id, updated_at: new Date().toISOString() };
    const result = id
      ? await admin.from('platform_subscription_plans').update(payload).eq('id', id).select('*').single()
      : await admin.from('platform_subscription_plans').insert({ ...payload, created_by: auth.user.id }).select('*').single();
    if (result.error) return json(request, { error: result.error.message }, 400);
    await admin.from('platform_support_audit').insert({ actor_id: auth.user.id, action: id ? 'UPDATE_PLAN' : 'CREATE_PLAN', entity_id: result.data.id, metadata: { code: result.data.code, active: result.data.active } });
    return json(request, result.data, id ? 200 : 201);
  }

  if (input.action === 'create_account') {
    const { data: plan, error: planError } = await admin.from('platform_subscription_plans').select('*').eq('id', input.plan_id).eq('active', true).single();
    if (planError || !plan) return json(request, { error: 'ACTIVE_PLAN_REQUIRED' }, 409);
    let invitedUser: { id: string } | null = null;
    let createdInvite = false;
    const { data: existingUsers, error: listUsersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listUsersError) return json(request, { error: 'USER_LOOKUP_FAILED' }, 500);
    const existing = existingUsers.users.find(user => user.email?.toLowerCase() === input.owner_email.toLowerCase());
    if (existing) invitedUser = { id: existing.id };
    else {
      const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(input.owner_email, { data: { display_name: input.owner_name } });
      if (inviteError || !invitation.user) return json(request, { error: inviteError?.message ?? 'OWNER_INVITATION_FAILED' }, 400);
      invitedUser = { id: invitation.user.id };
      createdInvite = true;
    }
    let organizationId: string | null = null;
    try {
      const { data: createdOrg, error: orgError } = await admin.rpc('support_admin_create_organization', { p_name: input.organization_name, p_slug: makeSlug(input.organization_name) });
      if (orgError || !createdOrg) throw new Error(orgError?.message ?? 'ORGANIZATION_CREATE_FAILED');
      organizationId = createdOrg;
      const { error: memberError } = await admin.from('organization_members').insert({ organization_id: organizationId, user_id: invitedUser.id, role: 'OWNER', user_role: 'OWNER', user_grp: crypto.randomUUID(), active: true });
      if (memberError) throw memberError;
      const start = input.starts_at ? new Date(input.starts_at) : new Date();
      const price = input.billing_cycle === 'CUSTOM' ? (input.custom_price ?? 0) : input.billing_cycle === 'YEARLY' ? Number(plan.yearly_price) : Number(plan.monthly_price);
      const trialEnd = input.status === 'TRIAL' && Number(plan.trial_days) > 0 ? new Date(start.getTime() + Number(plan.trial_days) * 86400000).toISOString() : null;
      const { error: accountError } = await admin.from('platform_customer_accounts').insert({ organization_id: organizationId, owner_email: input.owner_email.toLowerCase(), account_status: 'ACTIVE', admin_notes: input.admin_notes, created_by: auth.user.id });
      if (accountError) throw accountError;
      const { error: subscriptionError } = await admin.from('platform_subscriptions').insert({ organization_id: organizationId, plan_id: plan.id, status: input.status, billing_cycle: input.billing_cycle, payment_mode: input.payment_mode, currency: plan.currency, price_amount: price, starts_at: start.toISOString(), trial_ends_at: trialEnd, current_period_ends_at: input.current_period_ends_at ?? null, admin_notes: input.admin_notes, created_by: auth.user.id, updated_by: auth.user.id });
      if (subscriptionError) throw subscriptionError;
      await admin.from('platform_support_audit').insert({ actor_id: auth.user.id, organization_id: organizationId, action: 'CREATE_ACCOUNT', entity_id: organizationId, metadata: { owner_email: input.owner_email.toLowerCase(), plan_id: plan.id, subscription_status: input.status } });
      return json(request, { organization_id: organizationId, owner_email: input.owner_email.toLowerCase(), invited: createdInvite, message: createdInvite ? 'Account created. The owner invitation email was sent.' : 'Account created and linked to the existing user.' }, 201);
    } catch (error) {
      if (organizationId) await admin.from('organizations').delete().eq('id', organizationId);
      if (createdInvite && invitedUser) await admin.auth.admin.deleteUser(invitedUser.id);
      return json(request, { error: error instanceof Error ? error.message : 'ACCOUNT_SETUP_FAILED' }, 400);
    }
  }

  if (input.action === 'update_subscription') {
    const { data: plan, error: planError } = input.plan_id
      ? await admin.from('platform_subscription_plans').select('id,currency').eq('id', input.plan_id).single()
      : { data: null, error: null };
    if (planError) return json(request, { error: 'PLAN_NOT_FOUND' }, 404);
    const { data, error } = await admin.from('platform_subscriptions').update({
      plan_id: input.plan_id, status: input.status, billing_cycle: input.billing_cycle,
      payment_mode: input.payment_mode, currency: plan?.currency ?? 'PHP', price_amount: input.price_amount,
      starts_at: input.starts_at, trial_ends_at: input.trial_ends_at,
      current_period_ends_at: input.current_period_ends_at, admin_notes: input.admin_notes,
      updated_by: auth.user.id, updated_at: new Date().toISOString(),
    }).eq('organization_id', input.organization_id).select('*').maybeSingle();
    if (error) return json(request, { error: error.message }, 400);
    if (!data) return json(request, { error: 'SUBSCRIPTION_NOT_FOUND' }, 404);
    await admin.from('platform_support_audit').insert({ actor_id: auth.user.id, organization_id: input.organization_id, action: 'UPDATE_SUBSCRIPTION', entity_id: data.id, metadata: { status: data.status, plan_id: data.plan_id, billing_cycle: data.billing_cycle, price_amount: data.price_amount } });
    return json(request, data);
  }

  return json(request, { error: 'UNSUPPORTED_ACTION' }, 400);
});
