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
import { PageTitle, Button, Pill, Metric, Panel } from './shared';
import { Dashboard, Competition } from './Dashboard';

export function League() {
  type LeagueRow = { id: string; organization_id: string; name: string; created_at: string };
  type LeagueCompetition = { id: string; league_id: string | null; name: string; format: string; status: string; created_at: string; seasons?: { name: string } | null };
  const [tab, setTab] = useState<'Dashboard' | 'League list'>('Dashboard');
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<LeagueRow[]>([]);
  const [organizationName, setOrganizationName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
  const selectedLeague = leagues.find(league => league.id === selectedLeagueId);
  const leagueCompetitions = competitions.rows.filter(item => item.league_id === selectedLeagueId);
  const table = (rows: LeagueRow[]) => <div className="table-wrap"><table><thead><tr><th>LEAGUE</th><th>ORGANIZATION</th><th>COMPETITIONS</th><th>CREATED</th></tr></thead><tbody>{rows.map(league=><tr key={league.id}><td><button className="text-link" onClick={()=>{setSelectedLeagueId(league.id);setTab('League list');}}><b>{league.name}</b> <ArrowRight size={13}/></button></td><td>{organizationName}</td><td>{competitions.rows.filter(item=>item.league_id===league.id).length}</td><td>{new Date(league.created_at).toLocaleDateString()}</td></tr>)}</tbody></table>{!loading&&!rows.length&&<div className="empty-state">No leagues found for this organization.</div>}</div>;
  return <>
    <PageTitle eyebrow="LEAGUE MANAGEMENT" title="League" subtitle="View league performance, browse leagues, and inspect linked competitions and their approved rules." action={<Link className="button primary" to="/setup?tab=league"><Plus size={16}/> Create League</Link>}/>
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
  </>;
}
