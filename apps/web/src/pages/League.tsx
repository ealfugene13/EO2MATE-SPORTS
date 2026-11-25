import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Activity, ArrowDownToLine, ArrowRight, Award, CalendarDays, Check, CheckCircle2,
  ChevronDown, CircleHelp, Clock3, Download, Ellipsis, Filter, Flag, Plus, Radio,
  RefreshCw, Search, ShieldCheck, Sparkles, Trophy, Undo2, Users, UserRound, Wifi, WifiOff, Lock,
  ArrowLeftRight, ImagePlus, Pause, Play, Upload, X, MapPin, HeartPulse,
} from 'lucide-react';
import type { BasketballRules } from '../lib/basketballRules';
import { DataState, useWorkspaceRows } from '../lib/workspaceData';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { getWorkspace } from '../lib/workspaceData';
import { listQueuedGameEvents, queueGameEvent, removeQueuedGameEvent, setQueuedGameEventError, type QueuedGameEvent } from '../lib/offlineGameEvents';
import { PageTitle, Button, Pill, Metric, Panel } from './shared';
import { Dashboard } from './Dashboard';
import { Competition } from './Competition';

function formatLeagueCreationError(error:unknown){
  const value=error&&typeof error==='object'?error as {message?:unknown;details?:unknown;hint?:unknown;code?:unknown}:null;
  const message=typeof value?.message==='string'?value.message:error instanceof Error?error.message:typeof error==='string'?error:'';
  const details=typeof value?.details==='string'?`Details: ${value.details}`:'';
  const hint=typeof value?.hint==='string'?`Hint: ${value.hint}`:'';
  const code=value?.code?`Code: ${String(value.code)}`:'';
  return [`Unable to create the league${message?`: ${message}`:'.'}`,details,hint,code].filter(Boolean).join('\n');
}

export function League() {
  type LeagueRow = { id: string; organization_id: string; name: string; created_at: string };
  type LeagueCompetition = { id: string; league_id: string | null; name: string; format: string; status: string; created_at: string; seasons?: { name: string } | null };
  const [tab, setTab] = useState<'Dashboard' | 'League list'>('Dashboard');
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<LeagueRow[]>([]);
  const [organizationName, setOrganizationName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice,setNotice]=useState('');
  const [createOpen,setCreateOpen]=useState(false);
  const [createBusy,setCreateBusy]=useState(false);
  const [createError,setCreateError]=useState('');
  const [leagueForm,setLeagueForm]=useState({name:'',venueName:'',address:'',latitude:'',longitude:'',courtNotes:'',responderName:'',responderPhone:'',medicalNotes:''});
  const competitions = useWorkspaceRows<LeagueCompetition>('competitions', 'id,league_id,name,format,status,created_at,seasons(name)');
  const teams = useWorkspaceRows<{id:string;active:boolean}>('teams','id,active,created_at');
  const games = useWorkspaceRows<{id:string;status:string}>('games','id,status,created_at');
  async function load() {
    setLoading(true); setError('');
    try {
      const workspace = await getWorkspace();
      const [leagueResult, organizationResult] = await Promise.all([
        supabase.from('leagues').select('id,organization_id,name,created_at').eq('organization_id',workspace.id).order('created_at',{ascending:false}),
        supabase.from('organizations').select('name').eq('id',workspace.id).single(),
      ]);
      if (leagueResult.error) throw leagueResult.error;
      if (organizationResult.error) throw organizationResult.error;
      setLeagues((leagueResult.data ?? []) as LeagueRow[]);
      setOrganizationName(organizationResult.data.name);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load leagues.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function createLeague(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setCreateError('');setNotice('');
    if(leagueForm.responderPhone.replace(/\D/g,'').length<7){setCreateError('Enter a valid responder phone number with at least 7 digits.');return;}
    setCreateBusy(true);
    try{
      const workspace=await getWorkspace();
      const {error:createError}=await supabase.rpc('create_league_with_medical_setup',{
        p_organization_id:workspace.id,p_league_name:leagueForm.name.trim(),p_venue_name:leagueForm.venueName.trim(),p_venue_address:leagueForm.address.trim(),
        p_latitude:Number(leagueForm.latitude),p_longitude:Number(leagueForm.longitude),p_court_access_notes:leagueForm.courtNotes.trim(),
        p_responder_name:leagueForm.responderName.trim(),p_responder_phone:leagueForm.responderPhone.trim(),p_medical_access_message:leagueForm.medicalNotes.trim(),
      });
      if(createError)throw createError;
      setLeagueForm({name:'',venueName:'',address:'',latitude:'',longitude:'',courtNotes:'',responderName:'',responderPhone:'',medicalNotes:''});
      setCreateOpen(false);setNotice('League created with its required court and medical response details.');await load();
    }catch(e){setCreateError(formatLeagueCreationError(e));}
    finally{setCreateBusy(false);}
  }
  const selectedLeague = leagues.find(league => league.id === selectedLeagueId);
  const leagueCompetitions = competitions.rows.filter(item => item.league_id === selectedLeagueId);
  const table = (rows: LeagueRow[]) => <div className="table-wrap"><table><thead><tr><th>LEAGUE</th><th>ORGANIZATION</th><th>COMPETITIONS</th><th>CREATED</th></tr></thead><tbody>{rows.map(league=><tr key={league.id}><td><button className="text-link" onClick={()=>{setSelectedLeagueId(league.id);setTab('League list');}}><b>{league.name}</b> <ArrowRight size={13}/></button></td><td>{organizationName}</td><td>{competitions.rows.filter(item=>item.league_id===league.id).length}</td><td>{new Date(league.created_at).toLocaleDateString()}</td></tr>)}</tbody></table>{!loading&&!rows.length&&<div className="empty-state">No leagues found for this organization.</div>}</div>;
  return <>
    <PageTitle eyebrow="LEAGUE MANAGEMENT" title="League" subtitle="View league performance, browse leagues, and inspect linked competitions and their approved rules." action={<Button variant="primary" onClick={()=>{setCreateError('');setCreateOpen(true);}}><Plus size={16}/> Create League</Button>}/>
    {notice&&<div className="success-banner"><CheckCircle2 size={17}/>{notice}</div>}
    <div className="tab-row">{(['Dashboard','League list'] as const).map(value=><button key={value} className={tab===value?'selected':''} onClick={()=>{setTab(value);setSelectedLeagueId(null);}}>{value}{value==='League list'&&<span>{leagues.length}</span>}</button>)}</div>
    <DataState loading={loading||teams.loading||games.loading||competitions.loading} error={error||teams.error||games.error||competitions.error} onRetry={()=>{void load();void teams.reload();void games.reload();void competitions.reload();}}/>
    {selectedLeague ? <>
      <div className="table-actions"><Button onClick={()=>{setSelectedLeagueId(null);setTab('League list');}}><ArrowRight size={14}/> Back to league list</Button></div>
      <div className="metrics-grid"><Metric label="COMPETITIONS" value={String(leagueCompetitions.length)} note={selectedLeague.name} icon={Trophy}/><Metric label="DRAFT" value={String(leagueCompetitions.filter(item=>item.status==='DRAFT').length)} note="Editable competitions" icon={Clock3} tone="blue"/><Metric label="PENDING REVIEW" value={String(leagueCompetitions.filter(item=>item.status==='PENDING_REVIEW').length)} note="Awaiting approval" icon={ShieldCheck} tone="orange"/><Metric label="APPROVED" value={String(leagueCompetitions.filter(item=>item.status==='APPROVED').length)} note="Locked competitions" icon={CheckCircle2} tone="green"/></div>
      <Panel title={`Competitions under ${selectedLeague.name}`} action={<Link className="text-link" to="/competition">Competition management <ArrowRight size={14}/></Link>}><div className="table-wrap"><table><thead><tr><th>COMPETITION</th><th>SEASON</th><th>FORMAT</th><th>STATUS</th><th>APPLIED RULES</th></tr></thead><tbody>{leagueCompetitions.map(item=><tr key={item.id}><td><Link className="text-link" to={`/competition?competition=${encodeURIComponent(item.id)}`}><b>{item.name}</b> <ArrowRight size={13}/></Link></td><td>{item.seasons?.name??'—'}</td><td>{item.format.replaceAll('_',' ')}</td><td><Pill tone={item.status==='APPROVED'?'soft-green':item.status==='PENDING_REVIEW'?'soft-orange':'neutral'}>{item.status.replaceAll('_',' ')}</Pill></td><td><Link className="text-link" to={`/competition?competition=${encodeURIComponent(item.id)}`}>View applied rules <ArrowRight size={13}/></Link></td></tr>)}</tbody></table>{!competitions.loading&&!leagueCompetitions.length&&<div className="empty-state">No competitions are assigned to this league. Create a competition and select this league.</div>}</div></Panel>
    </> : tab==='Dashboard'?<>
      <div className="metrics-grid"><Metric label="LEAGUES IN ORGANIZATION" value={String(leagues.length)} note={organizationName||'Current organization'} icon={Trophy}/><Metric label="ACTIVE TEAMS" value={String(teams.rows.filter(row=>row.active).length)} note="Current organization" icon={Users} tone="blue"/><Metric label="SCHEDULED GAMES" value={String(games.rows.filter(row=>row.status==='SCHEDULED').length)} note="Current organization" icon={CalendarDays} tone="purple"/><Metric label="FINAL GAMES" value={String(games.rows.filter(row=>row.status==='FINAL').length)} note="Current organization" icon={CheckCircle2} tone="green"/></div>
      <div className="dashboard-grid"><Panel title="Leagues in your organization" action={<button className="text-link" onClick={()=>setTab('League list')}>View all <ArrowRight size={14}/></button>}>{table(leagues.slice(0,5))}</Panel><Panel title="Competition overview"><div className="attention-item"><span className="attention-icon blue"><Trophy size={17}/></span><div><b>{competitions.rows.length} competitions</b><small>{competitions.rows.filter(item=>item.status==='APPROVED').length} approved and locked</small></div><Link to="/competition">View competitions <ArrowRight size={14}/></Link></div></Panel></div>
    </>:<Panel title="Leagues under your organization" action={<span className="muted tiny">{organizationName} · {leagues.length} leagues</span>}>{table(leagues)}</Panel>}
    {createOpen&&<div className="modal-scrim" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!createBusy)setCreateOpen(false);}}><form className="schedule-modal league-create-modal" onSubmit={createLeague}><div className="modal-heading"><div><span className="eyebrow">REQUIRED LEAGUE SETUP</span><h2>Create league</h2><p>Enter the court location and emergency response details before the league is saved.</p></div><button type="button" className="icon-button" aria-label="Close" disabled={createBusy} onClick={()=>setCreateOpen(false)}><X size={17}/></button></div><div className="league-create-fields"><Panel title="League"><div className="field-grid"><label className="span-2">League name<input autoFocus maxLength={120} required value={leagueForm.name} onChange={e=>setLeagueForm({...leagueForm,name:e.target.value})} placeholder="e.g. Pineda Basketball League"/></label></div></Panel><Panel title="Court location"><div className="field-grid"><label>Court name<input maxLength={120} required value={leagueForm.venueName} onChange={e=>setLeagueForm({...leagueForm,venueName:e.target.value})} placeholder="Main gym or court"/></label><label className="span-2">Full address<input maxLength={300} required value={leagueForm.address} onChange={e=>setLeagueForm({...leagueForm,address:e.target.value})} placeholder="Street, barangay, city, province"/></label><label>Latitude<input type="number" step="any" min={-90} max={90} required value={leagueForm.latitude} onChange={e=>setLeagueForm({...leagueForm,latitude:e.target.value})} placeholder="e.g. 14.5995"/></label><label>Longitude<input type="number" step="any" min={-180} max={180} required value={leagueForm.longitude} onChange={e=>setLeagueForm({...leagueForm,longitude:e.target.value})} placeholder="e.g. 120.9842"/></label><label className="span-2">Court access instructions<textarea rows={2} maxLength={1000} required value={leagueForm.courtNotes} onChange={e=>setLeagueForm({...leagueForm,courtNotes:e.target.value})} placeholder="Entrance, gate, parking, floor, and responder access"/></label></div></Panel><Panel title="Medical response"><div className="field-grid"><label>Local emergency responder / clinic<input maxLength={120} required value={leagueForm.responderName} onChange={e=>setLeagueForm({...leagueForm,responderName:e.target.value})} placeholder="Rescue team, clinic, or ambulance service"/></label><label>Responder phone<input type="tel" maxLength={40} required value={leagueForm.responderPhone} onChange={e=>setLeagueForm({...leagueForm,responderPhone:e.target.value})} placeholder="+63…"/><small className="muted">Enter at least 7 digits.</small></label><label className="span-2">AED and first-aid kit location / access<textarea rows={2} maxLength={1000} required value={leagueForm.medicalNotes} onChange={e=>setLeagueForm({...leagueForm,medicalNotes:e.target.value})} placeholder="Where equipment is kept and how staff can reach it"/></label></div></Panel></div>{createError&&<div className="form-error" role="alert" style={{whiteSpace:'pre-wrap'}}>{createError}</div>}<div className="modal-footer"><Button disabled={createBusy} onClick={()=>setCreateOpen(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={createBusy}><MapPin size={15}/>{createBusy?'Saving league…':'Create league'}</Button></div></form></div>}
  </>;
}
