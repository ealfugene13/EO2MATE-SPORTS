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
import { PageTitle, Button, Pill, Panel, RegistrationRow } from './shared';

export function Registrations() {
  const { rows, loading, error, reload } = useWorkspaceRows<RegistrationRow>('registrations', 'id,status,submitted_at,review_note,players(first_name,last_name),teams(name)');
  const teamsData=useWorkspaceRows<{id:string;name:string}>('teams','id,name,created_at');
  const seasonsData=useWorkspaceRows<{id:string;name:string}>('seasons','id,name,active');
  const [busyId, setBusyId] = useState(''); const [actionError, setActionError] = useState('');
  const [createOpen,setCreateOpen]=useState(false);const [creating,setCreating]=useState(false);
  async function createRegistration(event:FormEvent<HTMLFormElement>){event.preventDefault();const workspace=await getWorkspace().catch(e=>{setActionError(e instanceof Error?e.message:'Unable to find organization.');return null;});if(!workspace)return;const form=new FormData(event.currentTarget);setCreating(true);setActionError('');try{const {error:createError}=await supabase.rpc('create_registration',{p_organization_id:workspace.id,p_first_name:String(form.get('first_name')).trim(),p_last_name:String(form.get('last_name')).trim(),p_team_id:String(form.get('team_id')||'')||null,p_season_id:String(form.get('season_id')||'')||null});if(createError)throw createError;setCreateOpen(false);await reload();}catch(e){setActionError(e instanceof Error?e.message:'Unable to create registration.');}finally{setCreating(false);}}
  async function review(row: RegistrationRow, status: RegistrationRow['status']) {
    setBusyId(row.id); setActionError('');
    try { const {error:reviewError}=await supabase.rpc('review_registration',{p_registration_id:row.id,p_status:status});if(reviewError)throw reviewError;await reload(); }
    catch (e) { setActionError(e instanceof Error ? e.message : 'Unable to update registration.'); }
    finally { setBusyId(''); }
  }
  return <><PageTitle title="Registration review" subtitle="Create registration records and review eligibility within your organization." action={<Button variant="primary" onClick={()=>{setCreateOpen(true);setActionError('');}}><Plus size={16}/>Register player</Button>}/><DataState loading={loading} error={error} onRetry={() => void reload()}/>{actionError && <div className="form-error" role="alert">{actionError}</div>}{!loading && !error && <Panel title="Player registrations"><div className="table-wrap"><table><thead><tr><th>PLAYER</th><th>TEAM</th><th>SUBMITTED</th><th>STATUS</th><th>REVIEW</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.players ? `${row.players.first_name} ${row.players.last_name}` : 'Player record unavailable'}</td><td>{row.teams?.name ?? '—'}</td><td>{new Date(row.submitted_at).toLocaleString()}</td><td><Pill tone={row.status === 'APPROVED' ? 'soft-green' : row.status === 'PENDING' ? 'soft-orange' : 'neutral'}>{row.status}</Pill></td><td>{row.status === 'PENDING' ? <div className="table-actions"><Button disabled={busyId === row.id} onClick={() => void review(row, 'RETURNED')}>Return</Button><Button variant="primary" disabled={busyId === row.id} onClick={() => void review(row, 'APPROVED')}>{busyId === row.id ? 'Saving…' : 'Approve'}</Button></div> : 'Reviewed'}</td></tr>)}</tbody></table>{rows.length === 0 && <div className="empty-state">No registration records yet.</div>}</div></Panel>}{createOpen&&<div className="modal-scrim"><form className="schedule-modal" onSubmit={createRegistration}><div className="modal-heading"><div><span className="eyebrow">PLAYER REGISTRATION</span><h2>Register player</h2><p>Approval adds the player to the selected season roster.</p></div><button type="button" className="icon-button" onClick={()=>setCreateOpen(false)}>×</button></div><div className="field-grid"><label>First name<input name="first_name" maxLength={100} required/></label><label>Last name<input name="last_name" maxLength={100} required/></label><label>Team<select name="team_id"><option value="">Assign team later</option>{teamsData.rows.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Season<select name="season_id"><option value="">No season</option>{seasonsData.rows.map(season=><option key={season.id} value={season.id}>{season.name}</option>)}</select></label></div>{actionError&&<div className="form-error">{actionError}</div>}<div className="modal-footer"><Button onClick={()=>setCreateOpen(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={creating}>{creating?'Saving…':'Create registration'}</Button></div></form></div>}</>;
}
