import { useCallback, useEffect, useState } from 'react';
import { supabase, configured } from './supabase';

export type Workspace = { id: string; name: string; user_grp: string; role: 'OWNER' | 'ADMIN' | 'STAFF' };
type Row = Record<string, unknown>;

export async function getWorkspace(): Promise<Workspace> {
  if (!configured) throw new Error('Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to connect this app to Supabase.');
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Sign in with a league staff account to load organization data.');
  const { data, error } = await supabase.from('organization_members')
    .select('organization_id,user_grp,user_role,organizations(id,name)')
    .eq('user_id', user.id).eq('active', true).limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.organization_id) throw new Error('Your account is not assigned to an active sports organization.');
  const org = Array.isArray(data.organizations) ? data.organizations[0] : data.organizations;
  return { id: data.organization_id, name: org?.name ?? 'Sports organization', user_grp: data.user_grp, role: data.user_role };
}

export function useWorkspaceRows<T extends object>(table: string, columns: string) {
  const [rows, setRows] = useState<T[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const org = await getWorkspace(); setWorkspace(org);
      const { data, error: queryError } = await supabase.from(table).select(columns)
        .eq('organization_id', org.id).order('created_at', { ascending: false });
      if (queryError) throw queryError;
      setRows((data ?? []) as unknown as T[]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load organization data.'); }
    finally { setLoading(false); }
  }, [table, columns]);
  useEffect(() => { void reload(); }, [reload]);
  const insert = useCallback(async (values: Row) => {
    const org = workspace ?? await getWorkspace();
    const { data, error: insertError } = await supabase.from(table).insert({ ...values, organization_id: org.id }).select('id').single();
    if (insertError) throw insertError;
    await reload();
    return data.id as string;
  }, [reload, table, workspace]);
  const update = useCallback(async (id: string, values: Row) => {
    const org = workspace ?? await getWorkspace();
    const { error: updateError } = await supabase.from(table).update(values).eq('id', id).eq('organization_id', org.id);
    if (updateError) throw updateError;
    await reload();
  }, [reload, table, workspace]);
  return { rows, workspace, loading, error, reload, insert, update };
}

export function DataState({ loading, error, onRetry }: { loading: boolean; error: string; onRetry?: () => void }) {
  if (loading) return <div className="empty-state">Loading organization data…</div>;
  if (error) return <div className="form-error" role="alert">{error}{onRetry && <> <button className="text-link" onClick={onRetry}>Retry</button></>}</div>;
  return null;
}
