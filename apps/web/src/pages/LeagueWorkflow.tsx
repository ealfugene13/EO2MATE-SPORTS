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
import { PageTitle, Button, Metric, Panel } from './shared';
import { League } from './League';
import { Competition } from './Competition';
import { Teams } from './Teams';
import { Setup } from './Setup';

export function LeagueWorkflow() {
  type OrgState={id:string;name:string;workflow_status:'SETUP'|'SUBMITTED'|'APPROVED'|'LOCKED';setup_submitted_at:string|null;setup_approved_at:string|null;league_locked_at:string|null;setup_review_note:string|null};
  const [organization,setOrganization]=useState<OrgState|null>(null);
  const [role,setRole]=useState('');const [competitions,setCompetitions]=useState<{id:string;name:string;format:string}[]>([]);
  const [teams,setTeams]=useState<{id:string;name:string}[]>([]);const [rosters,setRosters]=useState<{team_id:string;player_id:string;status:string}[]>([]);
  const [gamesCount,setGamesCount]=useState(0);const [startAt,setStartAt]=useState(()=>{const date=new Date(Date.now()+7*86400000);date.setMinutes(date.getMinutes()-date.getTimezoneOffset());return date.toISOString().slice(0,16);});
  const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  async function load(){setLoading(true);setError('');try{const workspace=await getWorkspace();const user=await supabase.auth.getUser();const [org,membership,comps,teamRows,rosterRows,gameRows]=await Promise.all([
      supabase.from('organizations').select('id,name,workflow_status,setup_submitted_at,setup_approved_at,league_locked_at,setup_review_note').eq('id',workspace.id).single(),
      supabase.from('organization_members').select('user_role').eq('organization_id',workspace.id).eq('user_id',user.data.user?.id??'').single(),
      supabase.from('competitions').select('id,name,format').eq('organization_id',workspace.id),
      supabase.from('teams').select('id,name').eq('organization_id',workspace.id).eq('active',true),
      supabase.from('rosters').select('team_id,player_id,status').eq('organization_id',workspace.id),
      supabase.from('games').select('id').eq('organization_id',workspace.id),
    ]);const problem=org.error||membership.error||comps.error||teamRows.error||rosterRows.error||gameRows.error;if(problem)throw problem;setOrganization(org.data as OrgState);setRole(membership.data.user_role);setCompetitions(comps.data??[]);setTeams(teamRows.data??[]);setRosters(rosterRows.data??[]);setGamesCount(gameRows.data?.length??0);
    }catch(e){setError(e instanceof Error?e.message:'Unable to load league workflow.');}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  const activeRosterCount=(teamId:string)=>new Set(rosters.filter(row=>row.team_id===teamId&&row.status==='ACTIVE').map(row=>row.player_id)).size;
  const ready=competitions.length>0&&teams.length>=2&&teams.every(team=>activeRosterCount(team.id)>=5);
  const status=organization?.workflow_status??'SETUP';
  async function transition(name:string,args:Record<string,unknown>){if(!organization)return;setBusy(true);setError('');setNotice('');try{const {data,error:rpcError}=await supabase.rpc(name,args);if(rpcError)throw rpcError;const generated=data&&typeof data==='object'&&'games_generated' in data?Number((data as {games_generated:number}).games_generated):null;setNotice(generated!==null?`Owner approval complete. ${generated} games generated and the league is locked.`:typeof data==='number'?`${data} games generated.`:'League workflow updated.');await load();}catch(e){setError(e instanceof Error?e.message:'Unable to update league workflow.');}finally{setBusy(false);}}
  async function generateSchedule(){if(!organization)return;void transition('generate_league_schedule',{p_organization_id:organization.id,p_start_at:new Date(startAt).toISOString()});}
  return <><PageTitle eyebrow="LEAGUE SETUP" title="League workflow" subtitle="Create the league and rules, add teams and players, submit for owner review, then generate and lock the schedule on approval." action={<Button onClick={()=>void load()}><Activity size={15}/>Refresh</Button>}/>
    <DataState loading={loading} error={error} onRetry={()=>void load()}/>{notice&&<div className="success-banner"><CheckCircle2 size={17}/>{notice}</div>}{error&&!loading&&<div className="form-error" role="alert">{error}</div>}
    {organization&&<><div className="metrics-grid compact"><Metric label="WORKFLOW STATUS" value={status} note={organization.name} icon={ShieldCheck} tone={status==='LOCKED'?'green':status==='APPROVED'?'blue':'orange'}/><Metric label="COMPETITIONS" value={String(competitions.length)} note="Competition and rules" icon={Trophy}/><Metric label="ACTIVE TEAMS" value={String(teams.length)} note="At least 2 required" icon={Users} tone="purple"/><Metric label="GAMES" value={String(gamesCount)} note={status==='LOCKED'?'Stats update during games':'Generated after approval'} icon={CalendarDays} tone="green"/></div>
      <div className="dashboard-grid"><Panel title="Setup checklist"><div className="review-checks"><span>{competitions.length>0?<CheckCircle2 size={15}/>:<Clock3 size={15}/>} Competition and rules {competitions.length?'saved':'required'}</span><span>{teams.length>=2?<CheckCircle2 size={15}/>:<Clock3 size={15}/>} Teams {teams.length}/2 minimum</span>{teams.map(team=><span key={team.id}>{activeRosterCount(team.id)>=5?<CheckCircle2 size={15}/>:<Clock3 size={15}/>} {team.name}: {activeRosterCount(team.id)} active players (5 required)</span>)}</div>{organization.setup_review_note&&<div className="callout">Review note: {organization.setup_review_note}</div>}</Panel>
        <Panel title="Setup and review steps"><div className="review-checks"><span><b>1.</b> Create organization and league</span><span><b>2.</b> Save competition format and rules</span><span><b>3.</b> Add teams, players, and roster assignments</span><span><b>4.</b> Bulk upload photos and logos; defaults show when no image is assigned</span><span><b>5.</b> Submit setup for the owner’s final review</span><span><b>6.</b> Owner approval generates the schedule and locks league setup</span></div>
          {(status==='SETUP')&&<Button variant="primary" onClick={()=>void transition('submit_league_for_review',{p_organization_id:organization.id})} disabled={busy||!ready||!['OWNER','ADMIN'].includes(role)}><ShieldCheck size={16}/>Submit for final review</Button>}
          {status==='SUBMITTED'&&<><label>First game date and time<input type="datetime-local" value={startAt} onChange={event=>setStartAt(event.target.value)}/></label><Button variant="primary" onClick={()=>void transition('approve_league_setup',{p_organization_id:organization.id,p_review_note:null,p_start_at:new Date(startAt).toISOString()})} disabled={busy||role!=='OWNER'}><Check size={16}/>Approve, generate schedule, and lock</Button>{role!=='OWNER'&&<div className="rule-help">The organization owner must review and approve this league. Approval creates the schedule and locks setup.</div>}</>}
          {status==='APPROVED'&&<><label>First game date and time<input type="datetime-local" value={startAt} onChange={event=>setStartAt(event.target.value)}/></label><div className="form-footer"><Button variant="primary" onClick={()=>void generateSchedule()} disabled={busy||gamesCount>0||competitions.length===0||!['OWNER','ADMIN'].includes(role)}><CalendarDays size={16}/>Generate schedule / bracket</Button><Button onClick={()=>void transition('lock_league',{p_organization_id:organization.id})} disabled={busy||gamesCount===0||!['OWNER','ADMIN'].includes(role)}><ShieldCheck size={16}/>Lock league</Button></div></>}
          {status==='LOCKED'&&<div className="success-banner"><CheckCircle2 size={17}/>League locked. Only game results and player/team stats can change through recorded game events.</div>}
          {status==='SETUP'&&!['OWNER','ADMIN'].includes(role)&&<div className="rule-help">Your role is {role||'STAFF'}. An OWNER or ADMIN can submit the completed setup for review.</div>}
        </Panel></div></>}
  </>;
}
