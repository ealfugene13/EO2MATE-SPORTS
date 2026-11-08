import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Activity, ArrowDownToLine, ArrowRight, Award, CalendarDays, Check, CheckCircle2,
  ChevronDown, CircleHelp, Clock3, Download, Ellipsis, Filter, Flag, Plus, Radio,
  RefreshCw, Search, ShieldCheck, Sparkles, Trophy, Undo2, Users, UserRound, Wifi, WifiOff, Lock,
  ArrowLeftRight, ImagePlus, Pause, Play, Upload, X,
} from 'lucide-react';
import type { BasketballRules } from '../lib/basketballRules';
import { DataState, useWorkspaceRows } from '../lib/workspaceData';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { getWorkspace } from '../lib/workspaceData';
import { listQueuedGameEvents, queueGameEvent, removeQueuedGameEvent, setQueuedGameEventError, type QueuedGameEvent } from '../lib/offlineGameEvents';
import { PageTitle, Button, Pill, Panel, StaffRow, AuditRow } from './shared';

export function Access() {
  const [tab,setTab]=useState<'Staff'|'Audit log'>('Staff');
  const staff=useWorkspaceRows<StaffRow>('organization_members','user_id,user_role,active,created_at');
  const audit=useWorkspaceRows<AuditRow>('audit_log','id,actor_id,action,entity_type,entity_id,created_at');
  const [open,setOpen]=useState(false);const [saving,setSaving]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');
  async function invite(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!staff.workspace)return;const form=new FormData(event.currentTarget);setSaving(true);setError('');setMessage('');try{const result=await api<{email:string;role:string}>('/api/organization-members/invite',{method:'POST',body:JSON.stringify({organization_id:staff.workspace.id,email:String(form.get('email')),role:String(form.get('role'))})});setMessage(`Invitation sent to ${result.email}.`);setOpen(false);void staff.reload();void audit.reload();}catch(e){setError(e instanceof Error?e.message:'Unable to invite staff.');}finally{setSaving(false);}}
  const selected=tab==='Staff'?staff:audit;
  return <><PageTitle title="Staff access & audit" subtitle="Review members and audited actions for this organization." action={tab==='Staff'?<Button variant="primary" onClick={()=>{setOpen(true);setError('');}}><Plus size={16}/>Invite staff</Button>:undefined}/><div className="tab-row">{(['Staff','Audit log'] as const).map(value=><button key={value} className={tab===value?'selected':''} onClick={()=>setTab(value)}>{value}</button>)}</div><DataState loading={selected.loading} error={selected.error} onRetry={()=>void selected.reload()}/>{message&&<div className="success-banner"><CheckCircle2 size={17}/>{message}</div>}{error&&<div className="form-error" role="alert">{error}</div>}{!selected.loading&&!selected.error&&<Panel title={tab==='Staff'?'Organization members':'Recent audit activity'}><div className="table-wrap"><table><thead>{tab==='Staff'?<tr><th>USER ID</th><th>ROLE</th><th>ADDED</th><th>STATUS</th></tr>:<tr><th>TIME</th><th>ACTOR</th><th>ACTION</th><th>RECORD</th></tr>}</thead><tbody>{tab==='Staff'?(staff.rows as StaffRow[]).map(row=><tr key={row.user_id}><td><code>{row.user_id.slice(0,8)}…</code></td><td>{row.user_role}</td><td>{new Date(row.created_at).toLocaleDateString()}</td><td><Pill tone={row.active?'soft-green':'neutral'}>{row.active?'ACTIVE':'INACTIVE'}</Pill></td></tr>):(audit.rows as AuditRow[]).map(row=><tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}</td><td><code>{row.actor_id?.slice(0,8) ?? 'System'}…</code></td><td>{row.action}</td><td>{row.entity_type}{row.entity_id?` · ${row.entity_id.slice(0,8)}`:''}</td></tr>)}</tbody></table>{tab==='Staff'&&!staff.rows.length&&<div className="empty-state">No staff members found.</div>}{tab==='Audit log'&&!audit.rows.length&&<div className="empty-state">No audit events have been recorded.</div>}</div></Panel>}
    {open&&<div className="modal-scrim"><form className="schedule-modal" onSubmit={invite}><div className="modal-heading"><div><span className="eyebrow">STAFF ACCESS</span><h2>Invite organization member</h2><p>The invitation is scoped to this organization.</p></div><button type="button" className="icon-button" onClick={()=>setOpen(false)}>×</button></div><div className="field-grid"><label className="span-2">Email<input type="email" name="email" required/></label><label>Role<select name="role"><option value="STAFF">Staff</option><option value="ADMIN">Admin</option></select></label></div>{error&&<div className="form-error">{error}</div>}<div className="modal-footer"><Button onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={saving}>{saving?'Sending…':'Send invitation'}</Button></div></form></div>}
  </>;
}
