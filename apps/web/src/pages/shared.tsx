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

export async function getBasketballRuleDefaults(): Promise<BasketballRules> {
  // Supabase client automatically attaches the project's apikey and user session.
  // Opening the RPC URL directly in a browser is not a valid API test.
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Rule defaults request timed out after 12 seconds. Check the browser Network response for the RPC request.')), 12000));
  let rpcFailure = '';
  try {
    const { data, error } = await Promise.race([supabase.rpc('get_basketball_rule_defaults'), timeout]);
    if (error) throw error;
    if (data && typeof data === 'object' && !Array.isArray(data) && typeof data.periodLengthMinutes === 'number') return normalizeBasketballRules(data as Partial<BasketballRules>);
    rpcFailure = 'RPC returned empty or invalid rule defaults for this user.';
  } catch (error) {
    const details = error as {message?:string;code?:string;details?:string;hint?:string};
    rpcFailure = [details.message || String(error), details.code, details.details, details.hint].filter(Boolean).join(' | ');
  }
  // A user-specific override may be absent; the shared BASKETBALL defaults are still valid.
  const { data: shared, error: sharedError } = await supabase.from('basketball_rule_settings')
    .select('rule_settings').eq('sport', 'BASKETBALL').is('user_id', null).limit(1).maybeSingle();
  if (!sharedError && shared?.rule_settings && typeof shared.rule_settings === 'object' &&
      typeof (shared.rule_settings as BasketballRules).periodLengthMinutes === 'number') {
    return normalizeBasketballRules(shared.rule_settings as Partial<BasketballRules>);
  }
  const fallbackDetail = sharedError ? `${sharedError.message} (${sharedError.code || 'unknown code'})` : 'No accessible shared default record.';
  throw new Error(`Unable to load basketball rule defaults. RPC: ${rpcFailure} Shared defaults: ${fallbackDetail}`);
}

export type Row = { cells: string[]; status?: string };

export const defaultScheduleRules: Pick<BasketballRules,'scheduleDays'|'scheduleFrequency'|'scheduleStartDate'|'scheduleEndDate'|'maxGamesPerDay'|'firstGameTime'|'estimatedGameDurationMinutes'|'minutesBetweenGames'> = {
  scheduleDays:'MIXED',scheduleFrequency:'DAILY',scheduleStartDate:'',scheduleEndDate:'',maxGamesPerDay:6,firstGameTime:'09:00',estimatedGameDurationMinutes:150,minutesBetweenGames:30,
};

export function normalizeBasketballRules(value:Partial<BasketballRules>):BasketballRules{return {...defaultScheduleRules,...value} as BasketballRules;}

export function sameBasketballRules(left:Partial<BasketballRules>|null,right:Partial<BasketballRules>|null):boolean{
  if(!left||!right)return false;
  const normalizedLeft=normalizeBasketballRules(left);const normalizedRight=normalizeBasketballRules(right);
  return (Object.keys(normalizedLeft) as (keyof BasketballRules)[]).every(key=>normalizedLeft[key]===normalizedRight[key]);
}

export function getEligibleScheduleDates(rules:BasketballRules):string[]{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(rules.scheduleStartDate)||!/^\d{4}-\d{2}-\d{2}$/.test(rules.scheduleEndDate))return [];
  const start=Date.parse(`${rules.scheduleStartDate}T00:00:00Z`),end=Date.parse(`${rules.scheduleEndDate}T00:00:00Z`);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||end-start>5*366*86400000)return [];
  const step=rules.scheduleFrequency==='EVERY_OTHER_DAY'?2:rules.scheduleFrequency==='EVERY_THIRD_DAY'?3:1;
  const result:string[]=[];let eligibleIndex=0;
  for(let time=start;time<=end;time+=86400000){const day=new Date(time).getUTCDay();const allowed=rules.scheduleDays==='MIXED'||(rules.scheduleDays==='WEEKENDS_ONLY'&&(day===0||day===6))||(rules.scheduleDays==='WEEKDAYS_ONLY'&&day>=1&&day<=5);if(allowed){if(eligibleIndex%step===0)result.push(new Date(time).toISOString().slice(0,10));eligibleIndex++;}}
  return result;
}

export function manilaDateKey(value:Date|string):string{
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(value instanceof Date?value:new Date(value));
}

export function todayManilaDateKey():string{return manilaDateKey(new Date());}

export function requiredGames(teamCount:number,format:string):number{return format==='ROUND_ROBIN_DOUBLE'?teamCount*(teamCount-1):format==='SINGLE_ELIMINATION'?teamCount-1:teamCount*(teamCount-1)/2;}

export function assessSchedule(rules:BasketballRules,format:string,teamCount:number):{ok:boolean;message:string;games:number;slots:number;dates:number}{
  if(!rules.scheduleStartDate||!rules.scheduleEndDate)return {ok:false,message:'Choose both a schedule start date and end date.',games:0,slots:0,dates:0};
  if(rules.scheduleEndDate<rules.scheduleStartDate)return {ok:false,message:'The end date must be on or after the start date.',games:0,slots:0,dates:0};
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(rules.firstGameTime))return {ok:false,message:'Choose a valid first game time.',games:0,slots:0,dates:0};
  if(!Number.isInteger(rules.maxGamesPerDay)||rules.maxGamesPerDay<1||rules.maxGamesPerDay>64)return {ok:false,message:'Maximum games per day must be from 1 to 64.',games:0,slots:0,dates:0};
  if(!Number.isInteger(rules.estimatedGameDurationMinutes)||rules.estimatedGameDurationMinutes<60||rules.estimatedGameDurationMinutes>300)return {ok:false,message:'Estimated game duration must be from 60 to 300 minutes.',games:0,slots:0,dates:0};
  if(!Number.isInteger(rules.minutesBetweenGames)||rules.minutesBetweenGames<15||rules.minutesBetweenGames>360)return {ok:false,message:'Game interval must be between 15 and 360 minutes.',games:0,slots:0,dates:0};
  const dates=getEligibleScheduleDates(rules);if(!dates.length)return {ok:false,message:'No eligible game dates match the selected days and frequency.',games:0,slots:0,dates:0};
  const games=requiredGames(teamCount,format);const [firstHour,firstMinute]=rules.firstGameTime.split(':').map(Number);const firstMinutes=firstHour*60+firstMinute;const spacing=rules.estimatedGameDurationMinutes+rules.minutesBetweenGames;const dayCapacity=Math.floor((24*60-firstMinutes-rules.estimatedGameDurationMinutes)/spacing)+1;const gamesPerDay=Math.min(rules.maxGamesPerDay,Math.floor(teamCount/2),dayCapacity);const slots=dates.length*Math.max(0,gamesPerDay);
  if(dayCapacity<1)return {ok:false,message:'The first tip-off and estimated game duration push the game past midnight. Choose an earlier tip-off or shorter estimated duration.',games,slots,dates:dates.length};
  if(slots<games)return {ok:false,message:`This schedule fits ${slots} games across ${dates.length} eligible dates, but ${games} games are required for ${teamCount} teams. Extend the date range, allow more days, increase the daily limit, or reduce the team limit.`,games,slots,dates:dates.length};
  return {ok:true,message:`Fits ${games} games across ${dates.length} eligible dates (${gamesPerDay} per day maximum).`,games,slots,dates:dates.length};
}

export function scheduleTeamCount(format:string,minTeams:number,maxTeams:number):number{
  if(format!=='SINGLE_ELIMINATION')return maxTeams;
  const supported=[2,4,8,16,32,64,128].filter(n=>n>=minTeams&&n<=maxTeams);return supported[supported.length-1]??maxTeams;
}

export function buildGameSchedule(matches:{game_id:string|null;home_team_id:string|null;away_team_id:string|null;round_no:number;slot_no:number}[],rules:BasketballRules):{game_id:string;scheduled_at:string}[]{
  const dates=getEligibleScheduleDates(rules);const [hour,minute]=rules.firstGameTime.split(':').map(Number);const firstMinutes=hour*60+minute;const spacing=rules.estimatedGameDurationMinutes+rules.minutesBetweenGames;const dailyCapacity=Math.max(0,Math.floor((24*60-firstMinutes-rules.estimatedGameDurationMinutes)/spacing)+1);const pending=matches.filter(match=>match.game_id&&match.home_team_id&&match.away_team_id).slice().sort((a,b)=>a.round_no-b.round_no||a.slot_no-b.slot_no);const plan:{game_id:string;scheduled_at:string}[]=[];
  for(const date of dates){const usedTeams=new Set<string>();let gamesToday=0;for(let i=0;i<pending.length&&gamesToday<Math.min(rules.maxGamesPerDay,dailyCapacity);){const match=pending[i];if(usedTeams.has(match.home_team_id!)||usedTeams.has(match.away_team_id!)){i++;continue;}const totalMinutes=firstMinutes+gamesToday*spacing;const timeLabel=`${String(Math.floor(totalMinutes/60)).padStart(2,'0')}:${String(totalMinutes%60).padStart(2,'0')}`;plan.push({game_id:match.game_id!,scheduled_at:new Date(`${date}T${timeLabel}:00+08:00`).toISOString()});usedTeams.add(match.home_team_id!);usedTeams.add(match.away_team_id!);pending.splice(i,1);gamesToday++;}}
  return plan;
}

export type NumberRuleKey = { [K in keyof BasketballRules]: BasketballRules[K] extends number ? K : never }[keyof BasketballRules];

export type BooleanRuleKey = { [K in keyof BasketballRules]: BasketballRules[K] extends boolean ? K : never }[keyof BasketballRules];

export const ruleBounds: Record<NumberRuleKey, [number, number]> = {
  periodLengthMinutes: [1, 20], firstHalfTimeouts: [0, 10], secondHalfTimeouts: [0, 10],
  fourthQuarterTimeoutRestrictionMinutes: [0, 10], finalTwoMinuteTimeoutMax: [0, 10],
  timeoutDurationSeconds: [1, 300], playerFoulLimit: [1, 10], teamFoulPenaltyAt: [1, 10],
  teamFoulFreeThrows: [0, 5], technicalFreeThrows: [0, 5], ejectionTechnicalLimit: [1, 10],
  ejectionUnsportsmanlikeLimit: [1, 10], ejectionMixedTechnicalLimit: [1, 10],
  ejectionMixedUnsportsmanlikeLimit: [1, 10], overtimeMinutes: [1, 20], overtimeTimeouts: [0, 10],
  clockStopLastMinutes: [0, 10],
  maxGamesPerDay:[1,64],estimatedGameDurationMinutes:[60,300],minutesBetweenGames:[15,360],
};

export const initialEvents = [
  { id: 1, time: '06:42', name: 'Alex Cruz', number: '23', action: '2PT made', side: 'Warriors', points: 2 },
  { id: 2, time: '06:51', name: 'Ben Reyes', number: '08', action: 'Steal', side: 'Warriors', points: 0 },
  { id: 3, time: '07:08', name: 'Marco Yu', number: '17', action: 'Defensive rebound', side: 'Falcons', points: 0 },
  { id: 4, time: '07:23', name: 'Alex Cruz', number: '23', action: '2PT made', side: 'Warriors', points: 2 },
];

export const supportedImageTypes = new Set(['image/jpeg','image/png','image/webp','image/gif']);

export function PageTitle({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-title"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{subtitle}</p></div>{action && <div className="title-action">{action}</div>}</div>;
}

export function Button({ children, variant = 'secondary', onClick, className = '', type = 'button', disabled = false, title }: { children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost'; onClick?: () => void; className?: string; type?: 'button' | 'submit'; disabled?: boolean; title?: string }) {
  return <button type={type} className={`button ${variant} ${className}`} onClick={onClick} disabled={disabled} title={title}>{children}</button>;
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) { return <span className={`pill ${tone}`}>{children}</span>; }

export function Metric({ label, value, note, icon: Icon, tone = 'blue' }: { label: string; value: string; note: string; icon: typeof Activity; tone?: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18}/></div><div className="metric-label">{label}</div><strong>{value}</strong><small>{note}</small></div>;
}

export function Panel({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-heading"><h2>{title}</h2>{action}</div>{children}</section>;
}

export function Avatar({ initials, color = 'lavender' }: { initials: string; color?: string }) { return <span className={`avatar ${color}`}>{initials}</span>; }

export function DataPage({ title, subtitle, action, columns, rows, tabs }: { title: string; subtitle: string; action: string; columns: string[]; rows: Row[]; tabs?: string[] }) {
  const [query, setQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState(tabs?.[0] ?? 'All');
  const visible = useMemo(() => rows.filter(row => row.cells.join(' ').toLowerCase().includes(query.toLowerCase())), [rows, query]);
  return <><PageTitle title={title} subtitle={subtitle} action={<Button variant="primary"><Plus size={16}/>{action}</Button>}/>
    {tabs && <div className="tab-row">{tabs.map(tab => <button key={tab} className={selectedTab === tab ? 'selected' : ''} onClick={() => setSelectedTab(tab)}>{tab}<span>{tab === 'All' ? rows.length : tab === 'Pending' ? 6 : Math.max(1, rows.length - 6)}</span></button>)}</div>}
    <Panel title={tabs ? `${selectedTab} ${title.toLowerCase()}` : `${title} directory`} action={<div className="table-actions"><label className="search-box"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${title.toLowerCase()}…`}/></label><Button><Filter size={15}/> Filters</Button><Button><ArrowDownToLine size={15}/> Export</Button></div>}>
      <div className="table-wrap"><table><thead><tr>{columns.map(col => <th key={col}>{col}</th>)}<th/></tr></thead><tbody>{visible.map((row, i) => <tr key={`${title}-${i}`}>{row.cells.map((cell, j) => <td key={`${cell}-${j}`}>{j === row.cells.length - 1 && row.status ? <Pill tone={row.status === 'APPROVED' || row.status === 'FINAL' || row.status === 'READY' ? 'soft-green' : row.status === 'LIVE' ? 'live' : row.status === 'REVIEW' || row.status === 'PENDING' ? 'soft-orange' : 'neutral'}>{row.status}</Pill> : cell}</td>)}<td><button className="icon-button"><Ellipsis size={17}/></button></td></tr>)}</tbody></table></div>
      <div className="table-foot"><span>Showing 1–{visible.length} of {rows.length} records</span><div><Button>Previous</Button><Button>Next</Button></div></div>
    </Panel>
  </>;
}

export type DirectoryRow = { id: string; name?: string; code?: string | null; first_name?: string; last_name?: string; active?: boolean; photo_path?: string|null; logo_path?: string|null };

export type StatEvent={id:string;game_id:string;player_id:string|null;event_type:string;points:number;reversed_event_id:string|null};

export function averagePlayerStats(events:StatEvent[],playerId:string){
  const reversed=new Set(events.map(event=>event.reversed_event_id).filter(Boolean));const rows=events.filter(event=>event.player_id===playerId&&event.event_type!=='REVERSAL'&&!reversed.has(event.id));const games=new Set(rows.map(event=>event.game_id)).size;
  const totals={points:0,rebounds:0,assists:0,steals:0,blocks:0,turnovers:0};for(const event of rows){totals.points+=event.points;if(event.event_type.startsWith('REBOUND_'))totals.rebounds++;if(event.event_type==='ASSIST')totals.assists++;if(event.event_type==='STEAL')totals.steals++;if(event.event_type==='BLOCK')totals.blocks++;if(event.event_type==='TURNOVER')totals.turnovers++;}
  return {games,...Object.fromEntries(Object.entries(totals).map(([key,value])=>[key,games?value/games:0]))} as {games:number;points:number;rebounds:number;assists:number;steals:number;blocks:number;turnovers:number};
}

export function WorkspaceDirectory({ kind, onTeamSelect, onPlayerSelect, initialTeamId }: { kind: 'teams' | 'players'; onTeamSelect?: (team: DirectoryRow) => void; onPlayerSelect?: (player:DirectoryRow)=>void; initialTeamId?:string|null }) {
  const isTeams = kind === 'teams';
  const title = isTeams ? 'Teams' : 'Players';
  const [open, setOpen] = useState(false); const [saving, setSaving] = useState(false); const [formError, setFormError] = useState('');
  const [busyId,setBusyId]=useState('');const [actionError,setActionError]=useState('');const [logoBusyId,setLogoBusyId]=useState('');
  const data=useWorkspaceRows<DirectoryRow>(kind,isTeams?'id,name,code,logo_path,active,created_at':'id,first_name,last_name,photo_path,active,created_at');
  const appliedInitialTeam=useRef<string|null>(null);
  useEffect(()=>{if(isTeams&&initialTeamId&&initialTeamId!==appliedInitialTeam.current&&!data.loading){const row=data.rows.find(item=>item.id===initialTeamId);if(row){appliedInitialTeam.current=initialTeamId;onTeamSelect?.(row);}}},[isTeams,initialTeamId,data.loading,data.rows,onTeamSelect]);
  type RosterDirectoryRow={id:string;team_id:string;player_id:string;season_id:string;jersey_number:number|null;position:string|null;status:string;is_default_starter:boolean;players?:{first_name:string;last_name:string}|null;seasons?:{name:string}|null;teams?:{name:string}|null};
  const rosterData=useWorkspaceRows<RosterDirectoryRow>('rosters','id,team_id,player_id,season_id,jersey_number,position,status,is_default_starter,created_at,players(first_name,last_name),seasons(name),teams(name)');
  const statsData=useWorkspaceRows<StatEvent>('game_events','id,game_id,player_id,event_type,points,reversed_event_id,created_at');
  const [photoUrls,setPhotoUrls]=useState<Record<string,string>>({});
  useEffect(()=>{let cancelled=false;const withPhotos=data.rows.filter(row=>isTeams?row.logo_path:row.photo_path);void Promise.all(withPhotos.map(async row=>{const path=isTeams?row.logo_path!:row.photo_path!;const bucket=isTeams?'team-logos':'player-photos';const {data:photo}=await supabase.storage.from(bucket).createSignedUrl(path,3600);return photo?.signedUrl?([row.id,photo.signedUrl] as const):null;})).then(items=>{if(!cancelled)setPhotoUrls(Object.fromEntries(items.filter((item):item is readonly [string,string]=>Boolean(item))));});return()=>{cancelled=true;};},[data.rows,isTeams]);
  const playersData=useWorkspaceRows<{id:string;first_name:string;last_name:string;active:boolean}>('players','id,first_name,last_name,active,created_at');
  const seasonsData=useWorkspaceRows<{id:string;name:string;active:boolean}>('seasons','id,name,active,created_at');
  const [rosterTeamId,setRosterTeamId]=useState('');const [rosterSeasonId,setRosterSeasonId]=useState('');const [rosterPlayerId,setRosterPlayerId]=useState('');const [rosterError,setRosterError]=useState('');const [rosterSaving,setRosterSaving]=useState(false);
  async function toggleDefaultStarter(row:RosterDirectoryRow){setRosterError('');try{const {error}=await supabase.rpc('set_team_default_starter',{p_roster_id:row.id,p_is_default:!row.is_default_starter});if(error)throw error;await rosterData.reload();}catch(e){const message=e instanceof Error?e.message:String(e);setRosterError(message.includes('DEFAULT_STARTING_FIVE_LIMIT')?'A team can have only five default starters per season.':message||'Unable to update the default starting lineup.');}}
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setFormError('');
    const form = new FormData(event.currentTarget);
    const values = isTeams
      ? { name: String(form.get('name')).trim(), code: String(form.get('code')).trim() || null, active: true }
      : { first_name: String(form.get('first_name')).trim(), last_name: String(form.get('last_name')).trim(), active: true };
    try { await data.insert(values); setOpen(false); }
    catch (e) { setFormError(e instanceof Error ? e.message : `Unable to save ${title.toLowerCase()}.`); }
    finally { setSaving(false); }
  }
  async function uploadTeamLogo(team:DirectoryRow,file:File){if(!isTeams)return;if(!supportedImageTypes.has(file.type)||file.size>5*1024*1024){setActionError('Choose a JPG, PNG, WebP, or GIF image smaller than 5 MB.');return;}setLogoBusyId(team.id);setActionError('');try{const workspace=await getWorkspace();const safeName=file.name.toLowerCase().replace(/[^a-z0-9._-]/g,'-');const path=`${workspace.id}/${team.id}/${crypto.randomUUID()}-${safeName}`;const {error:uploadError}=await supabase.storage.from('team-logos').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});if(uploadError)throw uploadError;const {error:updateError}=await supabase.from('teams').update({logo_path:path}).eq('id',team.id).eq('organization_id',workspace.id);if(updateError){await supabase.storage.from('team-logos').remove([path]);throw updateError;}if(team.logo_path?.startsWith(`${workspace.id}/`))await supabase.storage.from('team-logos').remove([team.logo_path]);await data.reload();}catch(e){setActionError(e instanceof Error?e.message:'Unable to upload team logo.');}finally{setLogoBusyId('');}}
  return (
    <>
      <PageTitle title={title} subtitle={isTeams ? 'Manage teams in your active sports organization.' : 'Maintain player profiles within your organization.'} action={<Button variant="primary" onClick={() => { setOpen(true); setFormError(''); }}><Plus size={16}/>{isTeams ? 'Add team' : 'Register player'}</Button>} />
      <DataState loading={data.loading || (isTeams ? rosterData.loading : statsData.loading)} error={data.error || (isTeams ? rosterData.error : statsData.error)} onRetry={() => { void data.reload(); if (isTeams) void rosterData.reload(); else void statsData.reload(); }} />
      {actionError && <div className="form-error">{actionError}</div>}
      {!data.loading && !data.error && (
        <Panel title={`${title} directory`} action={<span className="muted tiny">{data.rows.length} records</span>}>
          <div className="table-wrap">
            <table>
              <thead><tr>
                {isTeams ? <><th>LOGO</th><th>TEAM</th><th>CODE</th><th>PLAYERS (ACTIVE / TOTAL)</th><th>STATUS</th></> : <><th>PHOTO</th><th>PLAYER</th><th>TEAM</th><th>POSITION</th><th>PPG</th><th>RPG</th><th>APG</th><th>STATUS</th></>}
                <th>ACTION</th>
              </tr></thead>
              <tbody>
                {data.rows.map(row => {
                  const roster = rosterData.rows.find(item => item.player_id === row.id && item.status === 'ACTIVE');
                  const averages = isTeams ? null : averagePlayerStats(statsData.rows, row.id);
                  return (
                    <tr key={row.id}>
                      {isTeams ? <>
                        <td>{photoUrls[row.id] ? <img src={photoUrls[row.id]} alt={`${row.name} logo`} style={{ width: 38, height: 38, borderRadius: 8, objectFit: 'contain' }} /> : <span className="avatar lavender">{row.code?.slice(0, 2) ?? row.name?.slice(0, 2)}</span>}</td>
                        <td>{onTeamSelect ? <button className="text-link" onClick={() => onTeamSelect(row)}><b>{row.name}</b></button> : <b>{row.name}</b>}</td>
                        <td>{row.code || '—'}</td>
                        <td>{new Set(rosterData.rows.filter(r=>r.team_id===row.id&&r.status==='ACTIVE').map(r=>r.player_id)).size} / {new Set(rosterData.rows.filter(r=>r.team_id===row.id).map(r=>r.player_id)).size}</td>
                        <td><Pill tone={row.active ? 'soft-green' : 'neutral'}>{row.active ? 'ACTIVE' : 'INACTIVE'}</Pill></td>
                      </> : <>
                        <td>{photoUrls[row.id] ? <img src={photoUrls[row.id]} alt={`${row.first_name} ${row.last_name}`} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} /> : <span className="avatar lavender">{`${row.first_name?.[0] ?? ''}${row.last_name?.[0] ?? ''}`}</span>}</td>
                        <td>{onPlayerSelect ? <button className="text-link" onClick={() => onPlayerSelect(row)}><b>{row.first_name} {row.last_name}</b></button> : <b>{row.first_name} {row.last_name}</b>}</td>
                        <td>{roster?.teams?.name ?? '—'}</td><td>{roster?.position ?? '—'}</td>
                        <td>{averages?.points.toFixed(1) ?? '0.0'}</td><td>{averages?.rebounds.toFixed(1) ?? '0.0'}</td><td>{averages?.assists.toFixed(1) ?? '0.0'}</td>
                        <td><Pill tone={row.active ? 'soft-green' : 'neutral'}>{row.active ? 'ACTIVE' : 'INACTIVE'}</Pill></td>
                      </>}
                      <td className="table-actions">
                        {isTeams && <>
                          <label className="button secondary" style={{ display: 'inline-flex', width: 'fit-content', cursor: 'pointer' }} title="Upload team logo">
                            <ImagePlus size={14}/>{logoBusyId === row.id ? 'Uploading…' : 'Logo'}
                            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden disabled={Boolean(logoBusyId)} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadTeamLogo(row, file); event.target.value = ''; }} />
                          </label>
                          <Button onClick={() => { setRosterTeamId(row.id); setRosterError(''); }}>Manage roster</Button>
                        </>}
                        <Button disabled={busyId === row.id} onClick={async () => { setBusyId(row.id); setActionError(''); try { await data.update(row.id, { active: !row.active }); } catch (e) { setActionError(e instanceof Error ? e.message : 'Unable to change status.'); } finally { setBusyId(''); } }}>{row.active ? 'Deactivate' : 'Reactivate'}</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data.rows.length === 0 && <div className="empty-state">No {title.toLowerCase()} yet. Add the first record to begin.</div>}
          </div>
        </Panel>
      )}
      {isTeams && <Panel title="Active roster assignments">
        <p className="rule-help">Mark up to five active players per team and season as default starters. Coaches can adjust these five for a specific game.</p><div className="table-wrap"><table><thead><tr><th>PLAYER</th><th>TEAM</th><th>SEASON</th><th>JERSEY</th><th>POSITION</th><th>STATUS</th><th>DEFAULT STARTER</th><th /></tr></thead>
          <tbody>{rosterData.rows.map(row => <tr key={row.id}><td>{row.players ? `${row.players.first_name} ${row.players.last_name}` : 'Player'}</td><td>{data.rows.find(team => team.id === row.team_id)?.name ?? row.team_id.slice(0, 8)}</td><td>{row.seasons?.name ?? '—'}</td><td>{row.jersey_number ?? '—'}</td><td>{row.position ?? '—'}</td><td>{row.status}</td><td>{row.status === 'ACTIVE' && <Button disabled={!isTeams} variant={row.is_default_starter ? 'primary' : 'secondary'} onClick={() => void toggleDefaultStarter(row)}>{row.is_default_starter ? 'Starter' : 'Set starter'}</Button>}</td><td><Button onClick={async () => { try { await rosterData.update(row.id, { status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE', ...(row.status === 'ACTIVE' ? { is_default_starter: false } : {}) }); } catch (e) { setRosterError(e instanceof Error ? e.message : 'Unable to update roster status.'); } }}>{row.status === 'ACTIVE' ? 'Remove' : 'Reactivate'}</Button></td></tr>)}</tbody>
        </table>{!rosterData.rows.length && <div className="empty-state">No roster assignments yet.</div>}{rosterError && <div className="form-error">{rosterError}</div>}</div>
      </Panel>}
      {open && <div className="modal-scrim" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
        <form className="schedule-modal" onSubmit={submit}><div className="modal-heading"><div><span className="eyebrow">ORGANIZATION DATA</span><h2>{isTeams ? 'Add a team' : 'Register a player'}</h2><p>This record is scoped to your active organization.</p></div><button type="button" className="icon-button" onClick={() => setOpen(false)}>×</button></div>
          <div className="field-grid">{isTeams ? <><label>Team name<input name="name" required maxLength={120} /></label><label>Team code<input name="code" maxLength={12} /></label></> : <><label>First name<input name="first_name" required maxLength={100} /></label><label>Last name<input name="last_name" required maxLength={100} /></label></>}</div>
          {formError && <div className="form-error" role="alert">{formError}</div>}
          <div className="modal-footer"><Button onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save record'}</Button></div>
        </form>
      </div>}
      {isTeams && rosterTeamId && <div className="modal-scrim"><form className="schedule-modal" onSubmit={async event => { event.preventDefault(); setRosterSaving(true); setRosterError(''); const form = new FormData(event.currentTarget); try { await rosterData.insert({ team_id: rosterTeamId, player_id: rosterPlayerId, season_id: rosterSeasonId, jersey_number: Number(form.get('jersey_number')) || null, position: String(form.get('position') || '') || null, status: 'ACTIVE' }); setRosterTeamId(''); } catch (e) { setRosterError(e instanceof Error ? e.message : 'Unable to assign player to this roster.'); } finally { setRosterSaving(false); } }}>
          <div className="modal-heading"><div><span className="eyebrow">TEAM ROSTER</span><h2>Manage roster</h2><p>{data.rows.find(team => team.id === rosterTeamId)?.name}</p></div><button type="button" className="icon-button" onClick={() => setRosterTeamId('')}>×</button></div>
          <div className="field-grid"><label>Season<select value={rosterSeasonId} onChange={e => setRosterSeasonId(e.target.value)} required><option value="">Choose season</option>{seasonsData.rows.map(season => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label><label>Player<select value={rosterPlayerId} onChange={e => setRosterPlayerId(e.target.value)} required><option value="">Choose player</option>{playersData.rows.filter(player => player.active && !rosterData.rows.some(row => row.season_id === rosterSeasonId && row.team_id === rosterTeamId && row.player_id === player.id)).map(player => <option key={player.id} value={player.id}>{player.first_name} {player.last_name}</option>)}</select></label><label>Jersey number<input name="jersey_number" type="number" min="0" max="99" /></label><label>Position<input name="position" maxLength={30} /></label></div>
          {rosterError && <div className="form-error">{rosterError}</div>}
          <div className="modal-footer"><Button onClick={() => setRosterTeamId('')}>Close</Button><Button type="submit" variant="primary" disabled={rosterSaving || !rosterSeasonId || !rosterPlayerId}>{rosterSaving ? 'Saving…' : 'Add to roster'}</Button></div>
        </form></div>}
    </>
  );
}

export function MasterBulkImport({kind,onImported}:{kind:'teams'|'players';onImported:()=>void}) {
  const [csv,setCsv]=useState(''); const [busy,setBusy]=useState(false);
  const [dialog,setDialog]=useState<{title:string;message:string;success:boolean}|null>(null);
  const [preview,setPreview]=useState<{rows:Record<string,string>[];error:string}>({rows:[],error:''});
  const columns=kind==='teams'?['team_name','team_code']:['player_name','team_name','jersey_number'];
  function parse(text:string){
    const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());
    if(!lines.length)throw new Error('CSV file is empty.');
    const parseLine=(line:string)=>{const result:string[]=[];let value='';let quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){result.push(value.trim());value='';}else value+=ch;}if(quoted)throw new Error('Unclosed CSV quote.');result.push(value.trim());return result;};
    const header=parseLine(lines[0]).map(x=>x.toLowerCase());
    if(header.join(',')!==columns.join(','))throw new Error(`Expected CSV header: ${columns.join(',')}`);
    if(lines.length<2||lines.length>2001)throw new Error('Provide 1 to 2000 data rows.');
    return lines.slice(1).map((line,index)=>{const fields=parseLine(line);if(fields.length!==columns.length)throw new Error(`CSV row ${index+2}: expected ${columns.length} columns.`);const row:Record<string,string>={};columns.forEach((key,i)=>row[key]=fields[i]);if(!row[kind==='teams'?'team_name':'player_name'])throw new Error(`CSV row ${index+2}: name is required.`);if(kind==='players'&&row.jersey_number&&(!/^\d+$/.test(row.jersey_number)||Number(row.jersey_number)>99))throw new Error(`CSV row ${index+2}: jersey number must be 0–99.`);return row;});
  }
  function update(text:string){setCsv(text);try{setPreview({rows:parse(text),error:''});}catch(e){setPreview({rows:[],error:e instanceof Error?e.message:'Invalid CSV'});}}
  function template(){const content=kind==='teams'?'team_name,team_code\nNorth Falcons,NF\nSouth Tigers,ST\n':'player_name,team_name,jersey_number\nAlex Cruz,North Falcons,12\nJohn Reyes,North Falcons,23\n';const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=kind==='teams'?'team_upload_template.csv':'player_upload_template.csv';a.click();URL.revokeObjectURL(url);}
  async function submit(){setBusy(true);try{const rows=parse(csv);const workspace=await getWorkspace();const {data,error}=await supabase.rpc('bulk_import_master_directory',{p_organization_id:workspace.id,p_kind:kind,p_rows:rows});if(error)throw error;setDialog({title:'Import completed',message:`${rows.length} CSV rows processed. ${JSON.stringify(data)}`,success:true});setCsv('');setPreview({rows:[],error:''});onImported();}catch(e){setDialog({title:'Import failed',message:e instanceof Error?e.message:'Unable to import CSV.',success:false});}finally{setBusy(false);}}
  return <Panel title={kind==='teams'?'Bulk upload teams (CSV)':'Bulk upload players (CSV)'} action={<Upload size={17}/>}>
    <p className="muted">{kind==='teams'?'Create or reuse organization teams. Team logos are uploaded separately.':'Create or reuse organization players. Optional team assignment requires an existing team and active season roster setup; this import creates master player records only.'}</p>
    <div className="field-grid"><label>Choose CSV<input type="file" accept=".csv,text/csv" onChange={e=>{const file=e.target.files?.[0];if(file)void file.text().then(update).catch(()=>setDialog({title:'File error',message:'Unable to read CSV.',success:false}));}}/></label><div><Button onClick={template}><Download size={15}/> Download {kind==='teams'?'team':'player'} template</Button></div></div>
    <label>CSV content<textarea rows={5} style={{width:'100%',boxSizing:'border-box',fontFamily:'monospace'}} value={csv} onChange={e=>update(e.target.value)} placeholder={columns.join(',')}/></label>
    {csv&&<div className="muted" style={{margin:'8px 0'}}>{preview.error?`Validation: ${preview.error}`:`${preview.rows.length} rows ready`}</div>}
    {preview.rows.length>0&&<div className="table-wrap" style={{maxHeight:250,overflow:'auto'}}><table><thead><tr>{columns.map(col=><th key={col}>{col.toUpperCase()}</th>)}</tr></thead><tbody>{preview.rows.slice(0,10).map((row,i)=><tr key={i}>{columns.map(col=><td key={col}>{row[col]}</td>)}</tr>)}</tbody></table>{preview.rows.length>10&&<div className="muted">Previewing first 10 of {preview.rows.length} rows</div>}</div>}
    <div className="form-footer"><span className="muted">Import is atomic. Existing matching records are reused.</span><Button variant="primary" disabled={busy||!preview.rows.length} onClick={()=>void submit()}>{busy?'Importing…':'Validate & import'}</Button></div>
    {dialog&&<div role="presentation" style={{position:'fixed',inset:0,background:'rgba(15,23,42,.58)',display:'grid',placeItems:'center',zIndex:10000,padding:20}}><div role={dialog.success?'dialog':'alertdialog'} aria-modal="true" aria-label={dialog.title} style={{background:'white',borderRadius:16,padding:24,width:'min(460px,100%)',borderTop:`6px solid ${dialog.success?'#16a34a':'#dc2626'}`,boxShadow:'0 24px 70px #0004'}}><h3 style={{color:dialog.success?'#166534':'#991b1b'}}>{dialog.success?'✓ ':'! '}{dialog.title}</h3><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{dialog.message}</p><div style={{display:'flex',justifyContent:'flex-end'}}><Button variant="primary" onClick={()=>setDialog(null)}>Close</Button></div></div></div>}
  </Panel>;
}

export function TeamSummary() {
  type Team={id:string;name:string;active:boolean};type Game={home_team_id:string;away_team_id:string;home_score:number;away_score:number;status:string};
  const teams=useWorkspaceRows<Team>('teams','id,name,active,created_at');const games=useWorkspaceRows<Game>('games','home_team_id,away_team_id,home_score,away_score,status,created_at');
  const finalGames=games.rows.filter(game=>game.status==='FINAL');
  const standings=teams.rows.map(team=>{const stat={played:0,wins:0,losses:0,pointsFor:0,pointsAgainst:0};for(const game of finalGames){if(game.home_team_id!==team.id&&game.away_team_id!==team.id)continue;const home=game.home_team_id===team.id;const scored=home?game.home_score:game.away_score;const allowed=home?game.away_score:game.home_score;stat.played++;stat.pointsFor+=scored;stat.pointsAgainst+=allowed;if(scored>allowed)stat.wins++;else stat.losses++;}return {...team,...stat};}).sort((a,b)=>b.wins-a.wins||(b.pointsFor-b.pointsAgainst)-(a.pointsFor-a.pointsAgainst));
  return <><DataState loading={teams.loading||games.loading} error={teams.error||games.error} onRetry={()=>{void teams.reload();void games.reload();}}/><div className="metrics-grid"><Metric label="TEAMS" value={String(teams.rows.filter(team=>team.active).length)} note="Active teams" icon={Users}/><Metric label="GAMES PLAYED" value={String(finalGames.length)} note="Final results" icon={Activity} tone="orange"/><Metric label="UPCOMING" value={String(games.rows.filter(game=>game.status==='SCHEDULED').length)} note="Scheduled games" icon={CalendarDays} tone="purple"/><Metric label="TOTAL TEAMS" value={String(teams.rows.length)} note="Active and inactive" icon={Trophy} tone="green"/></div><Panel title="Team standings"><div className="table-wrap"><table><thead><tr><th>RANK</th><th>TEAM</th><th>GP</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>DIFF</th></tr></thead><tbody>{standings.map((team,index)=><tr key={team.id}><td>{index+1}</td><td>{team.name}</td><td>{team.played}</td><td>{team.wins}</td><td>{team.losses}</td><td>{team.pointsFor}</td><td>{team.pointsAgainst}</td><td>{team.pointsFor-team.pointsAgainst}</td></tr>)}</tbody></table>{!teams.loading&&!standings.length&&<div className="empty-state">Add teams to see the league standings.</div>}</div></Panel></>;
}

export function TeamDetails({team,onBack}:{team:DirectoryRow;onBack:()=>void}) {
  type Roster={id:string;team_id:string;player_id:string;season_id:string;jersey_number:number|null;position:string|null;status:string;players?:{first_name:string;last_name:string}|null;seasons?:{name:string}|null};
  type Game={id:string;home_team_id:string;away_team_id:string;home_score:number;away_score:number;status:string;scheduled_at:string|null;home_team?:{name:string};away_team?:{name:string}};
  const roster=useWorkspaceRows<Roster>('rosters','id,team_id,player_id,season_id,jersey_number,position,status,created_at,players(first_name,last_name),seasons(name)');
  const games=useWorkspaceRows<Game>('games','id,home_team_id,away_team_id,home_score,away_score,status,scheduled_at,created_at,home_team:teams!games_home_team_id_fkey(name),away_team:teams!games_away_team_id_fkey(name)');
  const [logoUrl,setLogoUrl]=useState('');
  useEffect(()=>{let cancelled=false;if(team.logo_path){void supabase.storage.from('team-logos').createSignedUrl(team.logo_path,3600).then(({data})=>{if(!cancelled)setLogoUrl(data?.signedUrl??'');});}return()=>{cancelled=true;};},[team.logo_path]);
  const players=roster.rows.filter(row=>row.team_id===team.id&&row.status==='ACTIVE');const played=games.rows.filter(game=>game.status==='FINAL'&&(game.home_team_id===team.id||game.away_team_id===team.id));
  const wins=played.filter(game=>game.home_team_id===team.id?game.home_score>game.away_score:game.away_score>game.home_score).length;
  const future=games.rows.filter(game=>game.status==='SCHEDULED'&&(game.home_team_id===team.id||game.away_team_id===team.id));
  return <><div className="form-footer"><Button onClick={onBack}><ArrowRight size={14}/>Back to team list</Button></div><div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,marginBottom:20}}>{logoUrl?<img src={logoUrl} alt={`${team.name} logo`} style={{width:224,height:224,borderRadius:16,objectFit:'contain',display:'block',margin:'0 auto'}}/>:<span className="avatar lavender" style={{width:224,height:224,fontSize:60,borderRadius:16,display:"inline-flex",alignItems:"center",justifyContent:"center"}} aria-label={`${team.name} default logo`}>{team.code?.slice(0,2)??team.name?.slice(0,2)}</span>}<h2 style={{margin:0}}>{team.name}</h2></div><DataState loading={roster.loading||games.loading} error={roster.error||games.error} onRetry={()=>{void roster.reload();void games.reload();}}/><div className="metrics-grid compact"><Metric label="ACTIVE PLAYERS" value={String(players.length)} note="Current roster" icon={Users}/><Metric label="WINS" value={String(wins)} note={`${played.length} games played`} icon={Trophy} tone="green"/><Metric label="LOSSES" value={String(played.length-wins)} note="Final games" icon={Flag} tone="orange"/><Metric label="UPCOMING" value={String(future.length)} note="Scheduled games" icon={CalendarDays} tone="purple"/></div><div className="dashboard-grid"><Panel title="Active roster"><div className="table-wrap"><table><thead><tr><th>PLAYER</th><th>JERSEY</th><th>POSITION</th><th>SEASON</th></tr></thead><tbody>{players.map(player=><tr key={player.id}><td>{player.players?`${player.players.first_name} ${player.players.last_name}`:'Player'}</td><td>{player.jersey_number??'—'}</td><td>{player.position??'—'}</td><td>{player.seasons?.name??'—'}</td></tr>)}</tbody></table>{!roster.loading&&!players.length&&<div className="empty-state">No active players are assigned to this team.</div>}</div></Panel><Panel title="Games"><div className="table-wrap"><table><thead><tr><th>DATE</th><th>MATCHUP</th><th>SCORE</th><th>STATUS</th></tr></thead><tbody>{games.rows.filter(game=>game.home_team_id===team.id||game.away_team_id===team.id).map(game=><tr key={game.id}><td>{game.scheduled_at?new Date(game.scheduled_at).toLocaleDateString():'—'}</td><td>{game.home_team?.name??'Home'} vs {game.away_team?.name??'Away'}</td><td>{game.home_score} – {game.away_score}</td><td>{game.status}</td></tr>)}</tbody></table>{!games.loading&&!games.rows.some(game=>game.home_team_id===team.id||game.away_team_id===team.id)&&<div className="empty-state">No games scheduled for this team.</div>}</div></Panel></div></>;
}

export function PlayerSummary() {
  type Player={id:string;first_name:string;last_name:string;active:boolean};
  type Event={id:string;game_id:string;player_id:string|null;event_type:string;points:number;reversed_event_id:string|null};
  type StatGame={id:string;competition_id:string|null;status:string};
  type StatCompetition={id:string;league_id:string|null;name:string};
  type StatLeague={id:string;name:string};
  const players=useWorkspaceRows<Player>('players','id,first_name,last_name,active,created_at');
  const events=useWorkspaceRows<Event>('game_events','id,game_id,player_id,event_type,points,reversed_event_id,created_at');
  const games=useWorkspaceRows<StatGame>('games','id,competition_id,status,created_at');
  const competitions=useWorkspaceRows<StatCompetition>('competitions','id,league_id,name,created_at');
  const leagues=useWorkspaceRows<StatLeague>('leagues','id,name,created_at');
  const [scope,setScope]=useState<'ORGANIZATION'|'LEAGUE'|'COMPETITION'>('ORGANIZATION');
  const [leagueId,setLeagueId]=useState('');
  const [competitionId,setCompetitionId]=useState('');
  const selectedLeagueCompetitions=competitions.rows.filter(c=>c.league_id===leagueId);
  const eligibleGames=new Set(games.rows.filter(g=>g.status==='FINAL'&&(scope==='ORGANIZATION'||(scope==='LEAGUE'&&!!leagueId&&!!g.competition_id&&selectedLeagueCompetitions.some(c=>c.id===g.competition_id))||(scope==='COMPETITION'&&!!competitionId&&g.competition_id===competitionId))).map(g=>g.id));
  const reversed=new Set(events.rows.map(event=>event.reversed_event_id).filter(Boolean));
  const valid=events.rows.filter(event=>eligibleGames.has(event.game_id)&&event.event_type!=='REVERSAL'&&!reversed.has(event.id));
  const leaderboard=players.rows.map(player=>{const mine=valid.filter(event=>event.player_id===player.id);return {...player,points:mine.reduce((sum,event)=>sum+Number(event.points||0),0),rebounds:mine.filter(event=>event.event_type.startsWith('REBOUND_')).length,assists:mine.filter(event=>event.event_type==='ASSIST').length,steals:mine.filter(event=>event.event_type==='STEAL').length,blocks:mine.filter(event=>event.event_type==='BLOCK').length,gp:new Set(mine.map(event=>event.game_id)).size};}).filter(p=>p.gp>0).sort((a,b)=>b.points-a.points||b.rebounds-a.rebounds).slice(0,50);
  const loading=players.loading||events.loading||games.loading||competitions.loading||leagues.loading;
  const error=players.error||events.error||games.error||competitions.error||leagues.error;
  return <>
    <DataState loading={loading} error={error} onRetry={()=>{void players.reload();void events.reload();void games.reload();void competitions.reload();void leagues.reload();}}/>
    <Panel title="Player statistics scope"><div className="field-grid">
      <label>Statistics level<select value={scope} onChange={e=>{setScope(e.target.value as typeof scope);setLeagueId('');setCompetitionId('');}}><option value="ORGANIZATION">Organization</option><option value="LEAGUE">League</option><option value="COMPETITION">Competition</option></select></label>
      {scope==='LEAGUE'&&<label>League<select value={leagueId} onChange={e=>setLeagueId(e.target.value)}><option value="">Select a league</option>{leagues.rows.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
      {scope==='COMPETITION'&&<label>Competition<select value={competitionId} onChange={e=>setCompetitionId(e.target.value)}><option value="">Select a competition</option>{competitions.rows.map(c=><option key={c.id} value={c.id}>{c.name} ({leagues.rows.find(l=>l.id===c.league_id)?.name??'Unassigned league'})</option>)}</select></label>}
    </div><div className="rule-help">{scope==='ORGANIZATION'?'Organization totals: all finalized games in this organization only.':scope==='LEAGUE'?'League totals: finalized games in competitions of the selected league only.':'Competition totals: finalized games in the selected competition only.'} Reversed events and unfinished games are excluded. Players without official events are not ranked.</div></Panel>
    <div className="metrics-grid"><Metric label="RANKED PLAYERS" value={String(leaderboard.length)} note="Players with recorded events (top 50)" icon={UserRound}/><Metric label="FINAL GAMES" value={String(eligibleGames.size)} note="Selected scope" icon={Activity} tone="orange"/><Metric label="ASSISTS" value={String(valid.filter(event=>event.event_type==='ASSIST').length)} note="Selected scope" icon={Award} tone="purple"/><Metric label="REBOUNDS" value={String(valid.filter(event=>event.event_type.startsWith('REBOUND_')).length)} note="Selected scope" icon={Users} tone="green"/></div>
    <Panel title="Player stat leaderboard"><div className="table-wrap"><table><thead><tr><th>RANK</th><th>PLAYER</th><th>GP*</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th></tr></thead><tbody>{leaderboard.map((player,index)=><tr key={player.id}><td>{index+1}</td><td>{player.first_name} {player.last_name}</td><td>{player.gp}</td><td><b>{player.points}</b></td><td>{player.rebounds}</td><td>{player.assists}</td><td>{player.steals}</td><td>{player.blocks}</td></tr>)}</tbody></table>{!loading&&!leaderboard.length&&<div className="empty-state">No finalized games with recorded player events in this scope.</div>}</div><div className="rule-help">*GP is games with recorded player events, not an official participation count. Scope totals use unique game IDs; competitions without a league are included only at organization or competition level.</div></Panel>
  </>;
}

export function PlayerDetails({player,onBack}:{player:DirectoryRow;onBack:()=>void}) {
  type Roster={id:string;player_id:string;team_id:string;season_id:string;jersey_number:number|null;position:string|null;status:string;teams?:{name:string}|null;seasons?:{name:string}|null;created_at?:string};
  const rosters=useWorkspaceRows<Roster>('rosters','id,player_id,team_id,season_id,jersey_number,position,status,created_at,teams(name),seasons(name)');
  const events=useWorkspaceRows<StatEvent>('game_events','id,game_id,player_id,event_type,points,reversed_event_id,created_at');
  const [photoPath,setPhotoPath]=useState(player.photo_path??null);
  const [photoUrl,setPhotoUrl]=useState('');
  const [photoError,setPhotoError]=useState('');
  const [uploading,setUploading]=useState(false);
  useEffect(()=>{let cancelled=false;setPhotoUrl('');setPhotoError('');if(photoPath){void supabase.storage.from('player-photos').createSignedUrl(photoPath,3600).then(({data,error})=>{if(cancelled)return;if(error)setPhotoError(error.message);else setPhotoUrl(data?.signedUrl??'');});}return()=>{cancelled=true;};},[photoPath]);
  const assignments=rosters.rows.filter(row=>row.player_id===player.id).sort((a,b)=>(b.created_at??'').localeCompare(a.created_at??''));
  const activeAssignments=assignments.filter(row=>row.status==='ACTIVE');
  const current=activeAssignments[0];
  const averages=averagePlayerStats(events.rows,player.id);
  async function uploadPhoto(file?:File){
    if(!file)return;
    if(!supportedImageTypes.has(file.type)||file.size>5*1024*1024){setPhotoError('Choose a JPG, PNG, WebP, or GIF image under 5 MB.');return;}
    setUploading(true);setPhotoError('');
    try{
      const workspace=await getWorkspace();
      const safeName=file.name.toLowerCase().replace(/[^a-z0-9._-]/g,'-');
      const path=`${workspace.id}/${player.id}/${crypto.randomUUID()}-${safeName}`;
      const {error:uploadError}=await supabase.storage.from('player-photos').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
      if(uploadError)throw uploadError;
      const {error:updateError}=await supabase.from('players').update({photo_path:path}).eq('id',player.id).eq('organization_id',workspace.id);
      if(updateError){await supabase.storage.from('player-photos').remove([path]);throw updateError;}
      setPhotoPath(path);
      // Old photo is retained to avoid breaking other references; cleanup can be handled separately.
    }catch(e){setPhotoError(e instanceof Error?e.message:'Photo upload failed.');}
    finally{setUploading(false);}
  }
  return <>
    <div className="form-footer"><Button onClick={onBack}><ArrowLeftRight size={14}/>Back to player list</Button><h2>{player.first_name} {player.last_name}</h2></div>
    <DataState loading={rosters.loading||events.loading} error={rosters.error||events.error} onRetry={()=>{void rosters.reload();void events.reload();}}/>
    <div className="dashboard-grid">
      <Panel title="Player profile">
        <div style={{display:'flex',alignItems:'center',gap:18,padding:8,flexWrap:'wrap'}}>
          <div style={{display:'grid',gap:8,justifyItems:'center'}}>
            {photoUrl?<img src={photoUrl} alt={`${player.first_name} ${player.last_name}`} style={{width:224,height:224,borderRadius:16,objectFit:'cover'}}/>:<span className="avatar lavender" style={{width:224,height:224,fontSize:60,display:'grid',placeItems:'center'}}>{`${player.first_name?.[0]??''}${player.last_name?.[0]??''}`}</span>}
            <label className="button" style={{cursor:uploading?'wait':'pointer',fontSize:12,padding:'8px 12px',border:'1px solid #d1d5db',borderRadius:8}}>
              <ImagePlus size={14} style={{verticalAlign:'middle',marginRight:5}}/>{uploading?'Uploading…':photoPath?'Change photo':'Upload photo'}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={uploading} style={{display:'none'}} onChange={e=>{void uploadPhoto(e.target.files?.[0]);e.target.value='';}}/>
            </label>
          </div>
          <div><h2>{player.first_name} {player.last_name}</h2>
            {current?<p><b>Current team:</b> {current.teams?.name??'Team'} · {current.position??'Position not set'} · #{current.jersey_number??'—'} · {current.seasons?.name??'Season'}</p>:<p>No active team assignment</p>}
            {activeAssignments.length>1&&<p className="muted">{activeAssignments.length} active team assignments; see the roster history below.</p>}
            <Pill tone={player.active?'soft-green':'neutral'}>{player.active?'ACTIVE':'INACTIVE'}</Pill>
            {photoError&&<p role="alert" style={{color:'#b91c1c'}}>{photoError}</p>}
          </div>
        </div>
      </Panel>
      <Panel title="Average stats"><div className="metrics-grid compact"><Metric label="GAMES WITH RECORDED STATS" value={String(averages.games)} note="Based on saved player events" icon={Activity}/><Metric label="POINTS / GAME" value={averages.points.toFixed(1)} note="PPG" icon={Trophy} tone="orange"/><Metric label="REBOUNDS / GAME" value={averages.rebounds.toFixed(1)} note="RPG" icon={Users} tone="blue"/><Metric label="ASSISTS / GAME" value={averages.assists.toFixed(1)} note="APG" icon={Award} tone="purple"/></div><div className="metrics-grid compact"><Metric label="STEALS / GAME" value={averages.steals.toFixed(1)} note="SPG" icon={ShieldCheck}/><Metric label="BLOCKS / GAME" value={averages.blocks.toFixed(1)} note="BPG" icon={Flag} tone="green"/><Metric label="TURNOVERS / GAME" value={averages.turnovers.toFixed(1)} note="TPG" icon={Activity} tone="orange"/></div></Panel>
    </div>
    <Panel title="Team assignment history"><div className="table-wrap"><table><thead><tr><th>TEAM</th><th>SEASON</th><th>POSITION</th><th>JERSEY</th><th>STATUS</th></tr></thead><tbody>{assignments.map(row=><tr key={row.id}><td>{row.teams?.name??'Team'}</td><td>{row.seasons?.name??'—'}</td><td>{row.position??'—'}</td><td>{row.jersey_number??'—'}</td><td>{row.status}</td></tr>)}</tbody></table>{!rosters.loading&&!assignments.length&&<div className="empty-state">Assign this player to a team roster to show team and position.</div>}</div></Panel>
  </>;
}

export function BulkPlayerPhotoUpload({onUploaded}:{onUploaded:()=>void}) {
  type PlayerOption={id:string;first_name:string;last_name:string;photo_path:string|null;active:boolean};type TeamOption={id:string;name:string;active:boolean};type RosterOption={id:string;team_id:string;player_id:string;status:string};type Assignment={file:File;playerId:string};
  const players=useWorkspaceRows<PlayerOption>('players','id,first_name,last_name,photo_path,active,created_at');const teams=useWorkspaceRows<TeamOption>('teams','id,name,active,created_at');const rosters=useWorkspaceRows<RosterOption>('rosters','id,team_id,player_id,status,created_at');const [teamId,setTeamId]=useState('');const [assignments,setAssignments]=useState<Assignment[]>([]);const [saving,setSaving]=useState(false);const [progress,setProgress]=useState('');const [error,setError]=useState('');const [notice,setNotice]=useState('');const [inputKey,setInputKey]=useState(0);
  const teamPlayers=rosters.rows.filter(row=>row.team_id===teamId&&row.status==='ACTIVE').map(row=>players.rows.find(player=>player.id===row.player_id&&player.active)).filter((player):player is PlayerOption=>Boolean(player));
  function normalized(value:string){return value.toLowerCase().replace(/\.[^.]+$/,'').replace(/[^a-z0-9]/g,'');}
  function chooseFiles(files:FileList|null){const selected=Array.from(files??[]);setAssignments(selected.map(file=>{const key=normalized(file.name);const match=teamPlayers.find(row=>key.includes(normalized(`${row.first_name}${row.last_name}`)));return {file,playerId:match?.id??''};}));setError('');setNotice('');}
  const assigned=assignments.map(row=>row.playerId).filter(Boolean);const duplicate=assigned.some((id,index)=>assigned.indexOf(id)!==index);
  const invalid=assignments.some(row=>!supportedImageTypes.has(row.file.type)||row.file.size>5*1024*1024);
  async function upload(){setSaving(true);setProgress('');setError('');setNotice('');let uploaded=0;try{const workspace=await getWorkspace();for(let index=0;index<assignments.length;index++){const {file,playerId}=assignments[index];if(!playerId)throw new Error(`Assign a player to ${file.name}.`);if(!supportedImageTypes.has(file.type)||file.size>5*1024*1024)throw new Error(`${file.name} must be a JPG, PNG, WebP, or GIF smaller than 5 MB.`);setProgress(`Uploading ${index+1} of ${assignments.length}…`);const safeName=file.name.toLowerCase().replace(/[^a-z0-9._-]/g,'-');const path=`${workspace.id}/${playerId}/${crypto.randomUUID()}-${safeName}`;const {error:uploadError}=await supabase.storage.from('player-photos').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});if(uploadError)throw uploadError;const oldPath=players.rows.find(row=>row.id===playerId)?.photo_path;const {error:updateError}=await supabase.from('players').update({photo_path:path}).eq('id',playerId).eq('organization_id',workspace.id);if(updateError){await supabase.storage.from('player-photos').remove([path]);throw updateError;}if(oldPath?.startsWith(`${workspace.id}/`))await supabase.storage.from('player-photos').remove([oldPath]);uploaded++;}setNotice(`${uploaded} player photo${uploaded===1?'':'s'} uploaded and assigned.`);setAssignments([]);setInputKey(value=>value+1);onUploaded();}catch(e){setError(e instanceof Error?e.message:'Unable to upload player photos.');}finally{setSaving(false);setProgress('');}}
  return <Panel title="Bulk player photo upload" action={<ImagePlus size={17}/>}><p className="muted">Choose a team first. Images can then be assigned to players on that team. Matching filenames are suggested automatically.</p><div className="field-grid" style={{marginBottom:12}}><label>Team<select value={teamId} onChange={event=>{setTeamId(event.target.value);setAssignments([]);setError('');setNotice('');}} disabled={teams.loading}><option value="">Choose team</option>{teams.rows.filter(team=>team.active).map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></label></div>{teams.loading&&<div className="rule-help">Loading teams…</div>}{teams.error&&<div className="form-error">{teams.error}</div>}{teamId&&rosters.loading&&<div className="rule-help">Loading team roster…</div>}{teamId&&players.loading&&<div className="rule-help">Loading players…</div>}{teamId&&rosters.error&&<div className="form-error">{rosters.error}</div>}{teamId&&players.error&&<div className="form-error">{players.error}</div>}{teamId&&teamPlayers.length===0&&!rosters.loading&&!players.loading&&<div className="rule-help">This team has no active roster players. Add players to the team before assigning photos.</div>}<label className="button secondary" style={{display:'inline-flex',width:'fit-content',cursor:teamId?'pointer':'not-allowed',opacity:teamId?1:.6}}><Upload size={15}/>Choose images<input key={inputKey} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden disabled={!teamId||teamPlayers.length===0} onChange={event=>chooseFiles(event.target.files)}/></label>{assignments.length>0&&<div className="table-wrap" style={{marginTop:12}}><table><thead><tr><th>IMAGE FILE</th><th>PLAYER</th><th>SIZE</th></tr></thead><tbody>{assignments.map((row,index)=><tr key={`${row.file.name}-${index}`}><td>{row.file.name}</td><td><select aria-label={`Assign ${row.file.name} to player`} value={row.playerId} onChange={event=>setAssignments(current=>current.map((item,rowIndex)=>rowIndex===index?{...item,playerId:event.target.value}:item))}><option value="">Choose player</option>{teamPlayers.map(player=><option key={player.id} value={player.id}>{player.first_name} {player.last_name}</option>)}</select></td><td>{(row.file.size/1024).toFixed(0)} KB</td></tr>)}</tbody></table></div>}{duplicate&&<div className="form-error">Choose a different player for each image.</div>}{invalid&&<div className="form-error">Images must be supported and under 5 MB each.</div>}{error&&<div className="form-error" role="alert">{error}</div>}{notice&&<div className="success-banner"><CheckCircle2 size={17}/>{notice}</div>}{progress&&<div className="rule-help">{progress}</div>}{assignments.length>0&&<div className="form-footer"><span className="muted">Private player photos · maximum 5 MB each</span><Button variant="primary" onClick={()=>void upload()} disabled={saving||duplicate||invalid||assignments.some(row=>!row.playerId)||players.loading||rosters.loading}>{saving?'Uploading…':'Upload and assign'}</Button></div>}</Panel>;
}

export function BulkTeamLogoUpload({onUploaded}:{onUploaded:()=>void}) {
  type TeamOption={id:string;name:string;logo_path:string|null};type Assignment={file:File;teamId:string};
  const teams=useWorkspaceRows<TeamOption>('teams','id,name,logo_path,created_at');const [assignments,setAssignments]=useState<Assignment[]>([]);const [saving,setSaving]=useState(false);const [progress,setProgress]=useState('');const [error,setError]=useState('');const [notice,setNotice]=useState('');const [inputKey,setInputKey]=useState(0);
  function normalized(value:string){return value.toLowerCase().replace(/\.[^.]+$/,'').replace(/[^a-z0-9]/g,'');}
  function chooseFiles(files:FileList|null){const selected=Array.from(files??[]);setAssignments(selected.map(file=>{const key=normalized(file.name);const match=teams.rows.find(team=>key.includes(normalized(team.name)));return {file,teamId:match?.id??''};}));setError('');setNotice('');}
  const assigned=assignments.map(row=>row.teamId).filter(Boolean);const duplicate=assigned.some((id,index)=>assigned.indexOf(id)!==index);const invalid=assignments.some(row=>!supportedImageTypes.has(row.file.type)||row.file.size>5*1024*1024);
  async function upload(){setSaving(true);setProgress('');setError('');setNotice('');let uploaded=0;try{const workspace=await getWorkspace();for(let index=0;index<assignments.length;index++){const {file,teamId}=assignments[index];const team=teams.rows.find(row=>row.id===teamId);if(!team)throw new Error(`Choose a team for ${file.name}.`);if(!supportedImageTypes.has(file.type)||file.size>5*1024*1024)throw new Error(`${file.name} must be a JPG, PNG, WebP, or GIF smaller than 5 MB.`);setProgress(`Uploading ${index+1} of ${assignments.length}…`);const safeName=file.name.toLowerCase().replace(/[^a-z0-9._-]/g,'-');const path=`${workspace.id}/${team.id}/${crypto.randomUUID()}-${safeName}`;const {error:uploadError}=await supabase.storage.from('team-logos').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});if(uploadError)throw uploadError;const {error:updateError}=await supabase.from('teams').update({logo_path:path}).eq('id',team.id).eq('organization_id',workspace.id);if(updateError){await supabase.storage.from('team-logos').remove([path]);throw updateError;}if(team.logo_path?.startsWith(`${workspace.id}/`))await supabase.storage.from('team-logos').remove([team.logo_path]);uploaded++;}setNotice(`${uploaded} team logo${uploaded===1?'':'s'} uploaded and assigned.`);setAssignments([]);setInputKey(value=>value+1);}catch(e){const message=e instanceof Error?e.message:'Unable to upload team logos.';setError(uploaded?`${uploaded} logo${uploaded===1?' was':'s were'} saved before the next upload failed: ${message}`:message);}finally{if(uploaded>0)onUploaded();setSaving(false);setProgress('');}}
  return <Panel title="Bulk team logo upload" action={<ImagePlus size={17}/>}><p className="muted">Choose multiple images, then assign each one to a team. Matching filenames are suggested automatically.</p><label className="button secondary" style={{display:'inline-flex',width:'fit-content',cursor:teams.loading?'not-allowed':'pointer',opacity:teams.loading ? .6 : 1}}><Upload size={15}/>Choose images<input key={inputKey} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden disabled={teams.loading||teams.rows.length===0} onChange={event=>chooseFiles(event.target.files)}/></label>{teams.loading&&<div className="rule-help">Loading teams…</div>}{teams.error&&<div className="form-error">{teams.error}</div>}{!teams.loading&&!teams.error&&!teams.rows.length&&<div className="rule-help">Create a team before uploading its logo.</div>}{assignments.length>0&&<div className="table-wrap" style={{marginTop:12}}><table><thead><tr><th>IMAGE FILE</th><th>TEAM</th><th>SIZE</th></tr></thead><tbody>{assignments.map((row,index)=><tr key={`${row.file.name}-${index}`}><td>{row.file.name}</td><td><select aria-label={`Assign ${row.file.name} to team`} value={row.teamId} onChange={event=>setAssignments(current=>current.map((item,rowIndex)=>rowIndex===index?{...item,teamId:event.target.value}:item))}><option value="">Choose team</option>{teams.rows.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></td><td>{(row.file.size/1024).toFixed(0)} KB</td></tr>)}</tbody></table></div>}{duplicate&&<div className="form-error">Choose a different team for each image.</div>}{invalid&&<div className="form-error">Images must be supported and under 5 MB each.</div>}{error&&<div className="form-error" role="alert">{error}</div>}{notice&&<div className="success-banner"><CheckCircle2 size={17}/>{notice}</div>}{progress&&<div className="rule-help">{progress}</div>}{assignments.length>0&&<div className="form-footer"><span className="muted">Team logos · maximum 5 MB each</span><Button variant="primary" onClick={()=>void upload()} disabled={saving||duplicate||invalid||assignments.some(row=>!row.teamId)||teams.loading}>{saving?'Uploading…':'Upload and assign'}</Button></div>}</Panel>;
}

export type RegistrationRow = { id: string; status: 'PENDING' | 'APPROVED' | 'RETURNED'; submitted_at: string; review_note?: string | null; players?: { first_name: string; last_name: string } | null; teams?: { name: string } | null };

export function TeamLogo({name,logoPath,size=48}:{name:string;logoPath?:string|null;size?:number}){
  const [url,setUrl]=useState('');
  useEffect(()=>{let cancelled=false;setUrl('');if(logoPath){void supabase.storage.from('team-logos').createSignedUrl(logoPath,3600).then(({data})=>{if(!cancelled)setUrl(data?.signedUrl??'');});}return()=>{cancelled=true;};},[logoPath]);
  const initials=name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'TM';
  return url?<img src={url} alt={`${name} logo`} style={{width:size,height:size,objectFit:'contain',borderRadius:12,background:'#fff',border:'1px solid #e2e8f0',padding:3,flex:'0 0 auto'}}/>:<span aria-label={`${name} logo placeholder`} style={{width:size,height:size,display:'inline-flex',alignItems:'center',justifyContent:'center',borderRadius:12,background:'linear-gradient(135deg,#eff6ff,#fff7ed)',border:'1px solid #dbe3ee',color:'#475569',fontSize:Math.max(12,size*.27),fontWeight:800,flex:'0 0 auto'}}>{initials}</span>;
}

export type CalendarGame={id:string;scheduled_at:string|null;status:string;home_score:number;away_score:number;home_team?:{id?:string;name:string;logo_path?:string|null}|null;away_team?:{id?:string;name:string;logo_path?:string|null}|null;venue?:{name:string}|null};

export function TeamPageLink({id,name}:{id?:string|null;name:string}){return id?<Link className="text-link" to={`/teams?team=${encodeURIComponent(id)}`}>{name}</Link>:<span>{name}</span>;}

export function OpenGameLink({id}:{id:string}){return <Link className="button secondary" style={{padding:'6px 9px',fontSize:12}} to={`/games/live?game=${encodeURIComponent(id)}`}><Play size={13}/>Open game</Link>;}

export function GamesCalendar({games,compact=false,selectedFilter='ALL',onDateChange}:{games:CalendarGame[];compact?:boolean;selectedFilter?:string;onDateChange?:(date:string)=>void}){
  const now=new Date();
  const [month,setMonth]=useState(()=>new Date(now.getFullYear(),now.getMonth(),1));
  const [selectedDate,setSelectedDate]=useState(()=>todayManilaDateKey());
  const [calendarOpen,setCalendarOpen]=useState(false);
  const year=month.getFullYear();const monthIndex=month.getMonth();
  const monthLabel=new Intl.DateTimeFormat('en',{month:'long',year:'numeric'}).format(new Date(Date.UTC(year,monthIndex,1)));
  const leadingDays=new Date(Date.UTC(year,monthIndex,1)).getUTCDay();
  const daysInMonth=new Date(Date.UTC(year,monthIndex+1,0)).getUTCDate();
  const cellCount=Math.ceil((leadingDays+daysInMonth)/7)*7;
  const cells=Array.from({length:cellCount},(_,index)=>{const day=index-leadingDays+1;const date=new Date(Date.UTC(year,monthIndex,day));return {day,dateKey:date.toISOString().slice(0,10),inMonth:day>=1&&day<=daysInMonth};});
  const gamesByDate=new Map<string,CalendarGame[]>();
  for(const game of games){if(!game.scheduled_at)continue;const dateKey=manilaDateKey(game.scheduled_at);gamesByDate.set(dateKey,[...(gamesByDate.get(dateKey)??[]),game]);}
  const selectedGames=(gamesByDate.get(selectedDate)??[]).slice().sort((a,b)=>(a.scheduled_at??'').localeCompare(b.scheduled_at??''));
  const shiftMonth=(amount:number)=>setMonth(current=>new Date(current.getFullYear(),current.getMonth()+amount,1));
  const chooseCell=(cell:{dateKey:string;inMonth:boolean})=>{setSelectedDate(cell.dateKey);onDateChange?.(cell.dateKey);if(!cell.inMonth){const date=new Date(`${cell.dateKey}T12:00:00`);setMonth(new Date(date.getFullYear(),date.getMonth(),1));}};
  const today=()=>{const key=todayManilaDateKey();setSelectedDate(key);onDateChange?.(key);setMonth(new Date(`${key}T12:00:00`));};
  return <>
    <div className="sr-head" style={{padding:compact?'0':'10px 0'}}><div><strong>{selectedFilter==='ALL'?'All dates':new Date(`${selectedFilter}T12:00:00`).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',weekday:'short',month:'short',day:'numeric',year:'numeric'})}</strong><div className="muted tiny">{selectedFilter==='ALL'?`${games.length} games in the current filters`:`${selectedGames.length} games on this day · ${games.length} scheduled total`}</div></div><Button variant="secondary" onClick={()=>setCalendarOpen(true)}><CalendarDays size={15}/>{selectedFilter==='ALL'?'Choose date':new Date(`${selectedFilter}T12:00:00`).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}</Button></div>
    {calendarOpen&&<div role="presentation" onClick={()=>setCalendarOpen(false)} style={{position:'fixed',inset:0,zIndex:10000,background:'rgba(15,23,42,.48)',display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(2px)'}}><section role="dialog" aria-modal="true" aria-label="Choose game date" onClick={event=>event.stopPropagation()} style={{width:'min(760px,100%)',maxHeight:'90vh',overflowY:'auto',background:'#fff',border:'1px solid #dbe3ee',borderRadius:16,boxShadow:'0 24px 70px rgba(15,23,42,.28)',padding:compact?16:22,display:'grid',gap:14}}>
      <div className="sr-head"><div><div className="eyebrow">GAME CALENDAR</div><h3 style={{margin:'3px 0'}}>{monthLabel}</h3><div className="muted tiny">Select a date to see its games. Numbers show games scheduled that day.</div></div><div style={{display:'flex',gap:7,alignItems:'center'}}><Button onClick={today}>Today</Button><Button aria-label="Previous month" onClick={()=>shiftMonth(-1)}><ArrowRight size={15} style={{transform:'rotate(180deg)'}}/></Button><Button aria-label="Next month" onClick={()=>shiftMonth(1)}><ArrowRight size={15}/></Button><button type="button" className="icon-button" aria-label="Close calendar" onClick={()=>setCalendarOpen(false)}><X size={18}/></button></div></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:5}}>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day=><div key={day} style={{padding:'7px 3px',textAlign:'center',fontSize:11,fontWeight:800,color:'#64748b'}}>{day}</div>)}{cells.map(cell=>{const count=(gamesByDate.get(cell.dateKey)??[]).length;const selected=cell.dateKey===selectedDate;const isToday=cell.dateKey===todayManilaDateKey();return <button key={cell.dateKey} type="button" onClick={()=>chooseCell(cell)} disabled={!cell.inMonth} aria-pressed={selected} aria-label={`${cell.dateKey}${count?`, ${count} games`:''}`} style={{minHeight:56,padding:'6px 7px',textAlign:'left',borderRadius:9,border:selected?'2px solid #f97316':isToday?'1px solid #fdba74':'1px solid #e2e8f0',background:selected?'#fff7ed':'#fff',color:cell.inMonth?'#172033':'#94a3b8',cursor:'pointer'}}><span style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontWeight:selected?800:600,fontSize:13}}>{cell.inMonth?cell.day:''}{cell.inMonth&&count>0&&<span style={{minWidth:20,height:20,padding:'0 4px',borderRadius:999,background:'#ffedd5',color:'#c2410c',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800}}>{count}</span>}</span>{isToday&&cell.inMonth&&<small style={{display:'block',fontSize:9,color:'#c2410c',marginTop:4}}>Today</small>}</button>;})}</div>
      <div style={{borderTop:'1px solid #e2e8f0',paddingTop:12}}><div className="sr-head" style={{marginBottom:8}}><strong>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',weekday:'long',month:'long',day:'numeric',year:'numeric'})}</strong><Pill>{selectedGames.length} games</Pill></div>{selectedGames.length?<div className="table-wrap"><table><thead><tr><th>TIP-OFF</th><th>MATCHUP</th><th>VENUE</th><th>SCORE</th><th>STATUS</th><th></th></tr></thead><tbody>{selectedGames.map(game=><tr key={game.id}><td>{new Date(game.scheduled_at!).toLocaleTimeString('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit'})}</td><td><TeamPageLink id={game.home_team?.id} name={game.home_team?.name??'Home team'}/> <span className="muted">vs</span> <TeamPageLink id={game.away_team?.id} name={game.away_team?.name??'Away team'}/></td><td>{game.venue?.name??'—'}</td><td>{game.home_score}–{game.away_score}</td><td><Pill tone={game.status==='LIVE'?'live':game.status==='FINAL'?'soft-green':'neutral'}>{game.status}</Pill></td><td><OpenGameLink id={game.id}/></td></tr>)}</tbody></table></div>:<div className="empty-state">No games are scheduled for this date.</div>}</div>
      <div style={{display:'flex',justifyContent:'space-between',gap:8}}><Button onClick={()=>{onDateChange?.('ALL');setCalendarOpen(false);}}>All dates</Button><Button variant="primary" onClick={()=>setCalendarOpen(false)}>Done</Button></div>
    </section></div>}
  </>;
}

export function GameScheduleList() {
  const [scheduleOpen,setScheduleOpen]=useState(false);
  const [saved,setSaved]=useState(false);
  const [gameDateFilter,setGameDateFilter]=useState('ALL');
  type TeamChoice = { id: string; name: string; logo_path?:string|null };
  type VenueChoice = { id: string; name: string };
  type CompetitionChoice = { id: string; name: string; league_id: string | null; season_id: string | null };
  type LeagueChoice = { id: string; name: string };
  type GameRow = { id: string; competition_id: string | null; scheduled_at: string | null; status: string; home_score: number; away_score: number; home_team?: TeamChoice; away_team?: TeamChoice; venue?: VenueChoice | null };
  const gamesData = useWorkspaceRows<GameRow>('games','id,competition_id,scheduled_at,status,home_score,away_score,created_at,home_team:teams!games_home_team_id_fkey(id,name,logo_path),away_team:teams!games_away_team_id_fkey(id,name,logo_path),venue:venues(id,name)');
  const teamsData = useWorkspaceRows<TeamChoice>('teams','id,name,created_at');
  const venuesData = useWorkspaceRows<VenueChoice>('venues','id,name,created_at');
  const competitionsData = useWorkspaceRows<CompetitionChoice>('competitions','id,name,league_id,season_id,created_at');
  const leaguesData = useWorkspaceRows<LeagueChoice>('leagues','id,name,created_at');
  const matchups = gamesData.rows;
  const [statusFilter,setStatusFilter]=useState('ALL');const [venueFilter,setVenueFilter]=useState('ALL');
  const [leagueFilter,setLeagueFilter]=useState('ALL');const [competitionFilter,setCompetitionFilter]=useState('ALL');
  const [competitionId,setCompetitionId]=useState('');
  const availableCompetitions=competitionsData.rows.filter(competition=>leagueFilter==='ALL'||competition.league_id===leagueFilter);
  const gamesMatchingFilters=matchups.filter(game=>{
    const competition=competitionsData.rows.find(item=>item.id===game.competition_id);
    return (statusFilter==='ALL'||game.status===statusFilter)
      &&(venueFilter==='ALL'||game.venue?.id===venueFilter)
      &&(leagueFilter==='ALL'||competition?.league_id===leagueFilter)
      &&(competitionFilter==='ALL'||game.competition_id===competitionFilter);
  });
  const visibleMatchups=gameDateFilter==='ALL'?gamesMatchingFilters:gamesMatchingFilters.filter(game=>game.scheduled_at&&manilaDateKey(game.scheduled_at)===gameDateFilter);
  const [home,setHome]=useState(''); const [away,setAway]=useState('');
  const [saveError,setSaveError]=useState(''); const [saving,setSaving]=useState(false);
  useEffect(() => { if (!home && teamsData.rows[0]) setHome(teamsData.rows[0].id); if (!away && teamsData.rows[1]) setAway(teamsData.rows[1].id); }, [home,away,teamsData.rows]);
  async function createMatchup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const date = String(form.get('date')); const time = String(form.get('time'));
    if (!home || !away || home === away) return;
    setSaving(true); setSaveError('');
    try { const competition=competitionsData.rows.find(item=>item.id===competitionId); await gamesData.insert({ home_team_id: home, away_team_id: away, venue_id: String(form.get('venue') || '') || null, competition_id: competition?.id??null, season_id: competition?.season_id??null, scheduled_at: new Date(`${date}T${time}:00+08:00`).toISOString(), status:'SCHEDULED' }); setScheduleOpen(false); setSaved(true); }
    catch (e) { setSaveError(e instanceof Error ? e.message : 'Unable to schedule this game.'); }
    finally { setSaving(false); }
  }
  return <>
    <PageTitle eyebrow="GAME DAY OPERATIONS" title="Game schedule" subtitle="Create matchups and track scheduled, live, and finalized games." action={<Button variant="primary" onClick={()=>{setScheduleOpen(true);setSaved(false);}}><Plus size={16}/> Schedule a matchup</Button>}/>
    {saved && <div className="success-banner"><CheckCircle2 size={17}/> Matchup saved to the organization schedule.</div>}{saveError && <div className="form-error" role="alert">{saveError}</div>}
    <DataState loading={gamesData.loading || teamsData.loading || venuesData.loading || competitionsData.loading || leaguesData.loading} error={gamesData.error || teamsData.error || venuesData.error || competitionsData.error || leaguesData.error} onRetry={() => { void gamesData.reload(); void teamsData.reload(); void venuesData.reload(); void competitionsData.reload(); void leaguesData.reload(); }}/>
    <div className="schedule-toolbar"><div className="schedule-week"><div><b>{visibleMatchups.length} of {matchups.length} games</b><small>Loaded from this organization</small></div></div><div className="schedule-filters"><label>League<select value={leagueFilter} onChange={e=>{setLeagueFilter(e.target.value);setCompetitionFilter('ALL');}}><option value="ALL">All leagues</option>{leaguesData.rows.map(league=><option key={league.id} value={league.id}>{league.name}</option>)}</select></label><label>Competition<select value={competitionFilter} onChange={e=>setCompetitionFilter(e.target.value)}><option value="ALL">All competitions</option>{availableCompetitions.map(competition=><option key={competition.id} value={competition.id}>{competition.name}</option>)}</select></label><label>Status<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">All statuses</option><option value="SCHEDULED">Scheduled</option><option value="LIVE">Live</option><option value="FINAL">Final</option><option value="CANCELLED">Cancelled</option></select></label><label>Venue<select value={venueFilter} onChange={e=>setVenueFilter(e.target.value)}><option value="ALL">All venues</option>{venuesData.rows.map(venue=><option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label></div></div>
    <Panel title="Organization schedule" action={<span className="muted tiny">{visibleMatchups.length} shown</span>}>
      <GamesCalendar games={gamesMatchingFilters} selectedFilter={gameDateFilter} onDateChange={setGameDateFilter}/><div className="table-wrap" style={{marginTop:12}}><table><thead><tr><th>DATE & TIP-OFF</th><th>MATCHUP</th><th>LEAGUE</th><th>COMPETITION</th><th>VENUE</th><th>SCORE</th><th>STATUS</th><th></th></tr></thead><tbody>{visibleMatchups.map(game=>{const competition=competitionsData.rows.find(item=>item.id===game.competition_id);const league=leaguesData.rows.find(item=>item.id===competition?.league_id);return <tr key={game.id}><td>{game.scheduled_at ? new Date(game.scheduled_at).toLocaleString() : 'Unscheduled'}</td><td><div className="matchup-cell"><TeamLogo name={game.home_team?.name??'Home team'} logoPath={game.home_team?.logo_path} size={32}/><TeamPageLink id={game.home_team?.id} name={game.home_team?.name ?? 'Home team'}/><span className="muted">vs</span><TeamLogo name={game.away_team?.name??'Away team'} logoPath={game.away_team?.logo_path} size={32}/><TeamPageLink id={game.away_team?.id} name={game.away_team?.name ?? 'Away team'}/></div></td><td>{league?.name??'—'}</td><td>{competition?.name??'—'}</td><td>{game.venue?.name ?? '—'}</td><td>{game.home_score} – {game.away_score}</td><td><Pill tone={game.status==='LIVE'?'live':game.status==='FINAL'?'soft-green':'neutral'}>{game.status}</Pill></td><td><OpenGameLink id={game.id}/></td></tr>;})}</tbody></table>{!gamesData.loading && visibleMatchups.length === 0 && <div className="empty-state">No games match these filters.</div>}</div>
    </Panel>
    <div className="schedule-notes"><span><CheckCircle2 size={15}/> Schedule changes are saved in Supabase</span><Link to="/games/review">Open result review <ArrowRight size={14}/></Link></div>
    {scheduleOpen && <div className="modal-scrim" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setScheduleOpen(false);}}><form className="schedule-modal" onSubmit={createMatchup}><div className="modal-heading"><div><span className="eyebrow">GAME SCHEDULING</span><h2>Schedule a matchup</h2><p>Choose a competition, teams, venue, date, and tip-off time.</p></div><button type="button" className="icon-button" onClick={()=>setScheduleOpen(false)}>×</button></div><div className="field-grid"><label className="span-2">Competition<select value={competitionId} onChange={e=>setCompetitionId(e.target.value)}><option value="">No competition</option>{competitionsData.rows.map(competition=><option key={competition.id} value={competition.id}>{leaguesData.rows.find(league=>league.id===competition.league_id)?.name ? `${leaguesData.rows.find(league=>league.id===competition.league_id)?.name} · ` : ''}{competition.name}</option>)}</select></label><label>Home team<select value={home} onChange={e=>setHome(e.target.value)} required>{teamsData.rows.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Away team<select value={away} onChange={e=>setAway(e.target.value)} required>{teamsData.rows.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Date<input name="date" type="date" required/></label><label>Tip-off time<input name="time" type="time" required/></label><label className="span-2">Venue<select name="venue"><option value="">No venue selected</option>{venuesData.rows.map(venue=><option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label></div>{(!teamsData.rows.length || home===away) && <div className="form-error">Add at least two different teams before scheduling.</div>}{saveError && <div className="form-error">{saveError}</div>}<div className="modal-footer"><Button onClick={()=>setScheduleOpen(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={saving || teamsData.rows.length < 2}>{saving ? 'Saving…' : <><CalendarDays size={15}/> Save matchup</>}</Button></div></form></div>}
  </>;
}

export type LiveTeam = 'Warriors' | 'Falcons';

export type LivePlayer = { name: string; number: string; position: string; onCourt: boolean; disqualified?: boolean; stats: Record<string, number> };

export type PendingPass = { team: LiveTeam; passer: LivePlayer; receiver: LivePlayer };

export type PendingFreeThrows = { team: LiveTeam; remaining: number; reason: string; resumeTeam?: LiveTeam };

export type LiveEvent = { id: number; time: string; name: string; number: string; action: string; side: LiveTeam; points: number; playerName?: string; stat?: string; statDeltas?: Record<string, number>; substitution?: { outNumber: string; inNumber: string }; clockChange?: { remaining: number; period: string }; pass?: { passerNumber: string; receiverNumber: string }; teamFoul?: boolean; freeThrowsAwarded?: { team: LiveTeam; count: number }; freeThrowsBefore?: PendingFreeThrows; disqualification?: string };

export const startingPlayers: Record<LiveTeam, LivePlayer[]> = {
  Warriors: [
    { name: 'Alex Cruz', number: '23', position: 'PG', onCourt: true, stats: { PTS: 18, REB: 4, AST: 3, PF: 2 } },
    { name: 'Ben Reyes', number: '08', position: 'SG', onCourt: true, stats: { PTS: 12, REB: 3, AST: 5 } },
    { name: 'Dan Lim', number: '05', position: 'SF', onCourt: true, stats: { PTS: 9, REB: 5, AST: 2 } },
    { name: 'Eli Lee', number: '11', position: 'PF', onCourt: true, stats: { PTS: 14, REB: 7, AST: 1 } },
    { name: 'Finn Tan', number: '14', position: 'C', onCourt: true, stats: { PTS: 8, REB: 6, BLK: 1 } },
    { name: 'Noah Lim', number: '02', position: 'G', onCourt: false, stats: { PTS: 4, AST: 1 } },
    { name: 'Luis Tan', number: '19', position: 'F', onCourt: false, stats: { REB: 2 } },
    { name: 'Kai Ong', number: '30', position: 'C', onCourt: false, stats: {} },
  ],
  Falcons: [
    { name: 'Marco Yu', number: '17', position: 'PG', onCourt: true, stats: { PTS: 16, REB: 3, AST: 6 } },
    { name: 'Paolo Dizon', number: '04', position: 'SG', onCourt: true, stats: { PTS: 11, REB: 2, AST: 3 } },
    { name: 'Chris Santos', number: '21', position: 'SF', onCourt: true, stats: { PTS: 10, REB: 4, STL: 1 } },
    { name: 'Jared Santos', number: '11', position: 'PF', onCourt: true, stats: { PTS: 15, REB: 8, BLK: 1 } },
    { name: 'Nico Ong', number: '33', position: 'C', onCourt: true, stats: { PTS: 7, REB: 9 } },
    { name: 'Rafi Cruz', number: '06', position: 'G', onCourt: false, stats: { PTS: 4, AST: 2 } },
    { name: 'Ben Yu', number: '25', position: 'F', onCourt: false, stats: { REB: 2 } },
    { name: 'Jules Tan', number: '09', position: 'C', onCourt: false, stats: {} },
  ],
};

export function LiveGamePrototype() {
  const [rules, setRules] = useState<BasketballRules>({} as BasketballRules);
  useEffect(() => { void getBasketballRuleDefaults().then(setRules).catch(() => {}); }, []);
  const [events, setEvents] = useState<LiveEvent[]>(initialEvents.map(event => ({ ...event, side: event.side as LiveTeam })));
  const [score, setScore] = useState<Record<LiveTeam, number>>({ Warriors: 68, Falcons: 65 });
  const [teams, setTeams] = useState(startingPlayers);
  const [selected, setSelected] = useState('23');
  const [activeTeam, setActiveTeam] = useState<LiveTeam>('Warriors');
  const [period, setPeriod] = useState('Q4');
  const [clockRunning, setClockRunning] = useState(false);
  const [remaining, setRemaining] = useState(402);
  const [timeouts, setTimeouts] = useState<Record<LiveTeam, number>>(() => {
    const allotment = period === 'Q1' || period === 'Q2' ? rules.firstHalfTimeouts : rules.secondHalfTimeouts;
    return { Warriors: allotment, Falcons: allotment };
  });
  const [teamFouls, setTeamFouls] = useState<Record<LiveTeam, number>>({ Warriors: 3, Falcons: 4 });
  const [notice, setNotice] = useState('Demo mode · events are held in this browser preview.');
  const [subOpen, setSubOpen] = useState(false);
  const [subOut, setSubOut] = useState('23');
  const [subIn, setSubIn] = useState('02');
  const [clockOpen, setClockOpen] = useState(false);
  const [clockInput, setClockInput] = useState('06:42');
  const [clockReason, setClockReason] = useState('');
  const [passOpen, setPassOpen] = useState(false);
  const [passTarget, setPassTarget] = useState('');
  const [pendingPass, setPendingPass] = useState<PendingPass | null>(null);
  const [assistPrompt, setAssistPrompt] = useState<{ passer: LivePlayer; shooter: LivePlayer; team: LiveTeam } | null>(null);
  const [timeoutOpen, setTimeoutOpen] = useState(false);
  const [coachRequestConfirmed, setCoachRequestConfirmed] = useState(false);
  const [timeoutRemaining, setTimeoutRemaining] = useState<number | null>(null);
  const [timeoutCapApplied, setTimeoutCapApplied] = useState(false);
  const [foulOutPlayer, setFoulOutPlayer] = useState<{ team: LiveTeam; player: LivePlayer; reason: string } | null>(null);
  const [foulOutReplacement, setFoulOutReplacement] = useState('');
  const [foulOpen, setFoulOpen] = useState(false);
  const [foulKind, setFoulKind] = useState<'defensive' | 'offensive' | 'technical' | 'unsportsmanlike'>('defensive');
  const [technicalResumeTeam, setTechnicalResumeTeam] = useState<LiveTeam>('Falcons');
  const [pendingFreeThrows, setPendingFreeThrows] = useState<PendingFreeThrows | null>(null);
  const player = teams[activeTeam].find(p => p.number === selected) ?? teams[activeTeam].find(p => p.onCourt)!;
  const onCourt = teams[activeTeam].filter(p => p.onCourt);
  const bench = teams[activeTeam].filter(p => !p.onCourt && !p.disqualified);
  const displayTime = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;

  useEffect(() => {
    if (!clockRunning || remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [clockRunning, remaining]);
  useEffect(() => { if (remaining === 0) setClockRunning(false); }, [remaining]);
  useEffect(() => {
    if (timeoutRemaining === null || timeoutRemaining <= 0) return;
    const timer = window.setInterval(() => setTimeoutRemaining(value => value === null ? null : Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [timeoutRemaining]);
  useEffect(() => {
    if (timeoutRemaining === 0) { setTimeoutRemaining(null); setNotice('Timeout ended. Start the game clock when ready.'); }
  }, [timeoutRemaining]);
  useEffect(() => {
    const capAt = rules.fourthQuarterTimeoutRestrictionMinutes * 60;
    if (period !== 'Q4' || remaining > capAt || timeoutCapApplied) return;
    if (timeouts.Warriors <= rules.finalTwoMinuteTimeoutMax && timeouts.Falcons <= rules.finalTwoMinuteTimeoutMax) {
      setTimeoutCapApplied(true);
      return;
    }
    setTimeouts(current => ({ ...current, Warriors: Math.min(current.Warriors, rules.finalTwoMinuteTimeoutMax), Falcons: Math.min(current.Falcons, rules.finalTwoMinuteTimeoutMax) }));
    setTimeoutCapApplied(true);
    setEvents(current => [{ id: Date.now(), time: displayTime, name: 'Game officials', number: '', action: `Timeout allotment capped at ${rules.finalTwoMinuteTimeoutMax} in final ${rules.fourthQuarterTimeoutRestrictionMinutes}:00`, side: activeTeam, points: 0 }, ...current]);
    setNotice(`Final ${rules.fourthQuarterTimeoutRestrictionMinutes}:00 timeout limit applied`);
  }, [activeTeam, displayTime, period, remaining, rules, timeoutCapApplied, timeouts]);

  function shouldStopClockForDeadBall() {
    if (!rules.runningClockEnabled) return true;
    const inConfiguredStopPeriod = (period === 'Q2' && rules.clockStopInSecondQuarter) || (period === 'Q4' && rules.clockStopInFourthQuarter);
    return inConfiguredStopPeriod && remaining <= rules.clockStopLastMinutes * 60;
  }

  function record(action: string, points = 0, stat = '') {
    if (timeoutRemaining !== null) { setNotice('Wait for the timeout to end before recording the next game event'); return; }
    if (pendingFreeThrows && pendingFreeThrows.team === activeTeam && stat !== 'FTM' && stat !== 'FTA') {
      setNotice(`Record the remaining ${pendingFreeThrows.remaining} free throw${pendingFreeThrows.remaining === 1 ? '' : 's'} first`);
      return;
    }
    const chosen = teams[activeTeam].find(p => p.number === selected) ?? player;
    if (!chosen.onCourt || chosen.disqualified) { setNotice('Select an eligible player who is on court'); return; }
    const playerStats = { ...chosen.stats };
    const statDeltas: Record<string, number> = stat ? { [stat]: 1 } : {};
    if (stat === 'FGM') statDeltas.FGA = 1;
    if (stat === '3PM') { statDeltas.FGA = 1; statDeltas.FGM = 1; statDeltas['3PA'] = 1; }
    if (stat === '3PA') statDeltas.FGA = 1;
    if (stat === 'FTM') statDeltas.FTA = 1;
    if (points) statDeltas.PTS = points;
    for (const [key, delta] of Object.entries(statDeltas)) playerStats[key] = (playerStats[key] ?? 0) + delta;
    setTeams(current => ({ ...current, [activeTeam]: current[activeTeam].map(p => p.number === chosen.number ? { ...p, stats: playerStats } : p) }));
    setScore(current => ({ ...current, [activeTeam]: current[activeTeam] + points }));
    setEvents(current => [{ id: Date.now(), time: displayTime, name: chosen.name, number: chosen.number, action, side: activeTeam, points, playerName: chosen.name, stat, statDeltas, ...((stat === 'FTM' || stat === 'FTA') && pendingFreeThrows ? { freeThrowsBefore: { ...pendingFreeThrows } } : {}) }, ...current]);
    if (points && shouldStopClockForDeadBall()) setClockRunning(false);
    if ((stat === 'FTM' || stat === 'FTA') && pendingFreeThrows?.team === activeTeam) {
      if (pendingFreeThrows.remaining > 1) setPendingFreeThrows(current => current ? { ...current, remaining: current.remaining - 1 } : null);
      else {
        setPendingFreeThrows(null);
        if (pendingFreeThrows.resumeTeam) {
          setActiveTeam(pendingFreeThrows.resumeTeam);
          setSelected(teams[pendingFreeThrows.resumeTeam].find(p => p.onCourt && !p.disqualified)?.number ?? '');
        }
      }
    }
    setNotice(`${chosen.name} · ${action} recorded`);
    if (stat === 'FGM' || stat === '3PM') {
      if (pendingPass?.team === activeTeam && pendingPass.receiver.number === chosen.number) {
        setAssistPrompt({ passer: pendingPass.passer, shooter: chosen, team: activeTeam });
      }
      setPendingPass(null);
    } else if (stat === 'FGA' || stat === '3PA' || stat === 'FTA' || stat === 'TO' || stat === 'STL') {
      setPendingPass(null);
    }
  }
  function recordPass() {
    const passer = teams[activeTeam].find(p => p.number === selected && p.onCourt);
    const receiver = teams[activeTeam].find(p => p.number === passTarget && p.onCourt);
    if (!passer || !receiver || passer.number === receiver.number) return;
    const pass = { team: activeTeam, passer, receiver };
    setPendingPass(pass);
    setEvents(current => [{ id: Date.now(), time: displayTime, name: passer.name, number: passer.number, action: `Pass to ${receiver.name}`, side: activeTeam, points: 0, pass: { passerNumber: passer.number, receiverNumber: receiver.number } }, ...current]);
    setNotice(`${passer.name} passed to ${receiver.name} · confirm an assist if their next shot is made`);
    setPassOpen(false);
  }
  function validateAssist(credit: boolean) {
    if (credit && assistPrompt) {
      const { passer, shooter, team } = assistPrompt;
      setTeams(current => ({ ...current, [team]: current[team].map(p => p.number === passer.number ? { ...p, stats: { ...p.stats, AST: (p.stats.AST ?? 0) + 1 } } : p) }));
      setEvents(current => [{ id: Date.now(), time: displayTime, name: passer.name, number: passer.number, action: `Assist · ${shooter.name}'s basket`, side: team, points: 0, playerName: passer.name, stat: 'AST', statDeltas: { AST: 1 } }, ...current]);
      setNotice(`Assist credited to ${passer.name} on ${shooter.name}'s basket`);
    } else {
      setNotice('Basket recorded without an assist');
    }
    setAssistPrompt(null);
  }
  function recordFoul() {
    const fouler = teams[activeTeam].find(p => p.number === selected && p.onCourt);
    if (!fouler) return;
    const foulingTeam = activeTeam;
    const opponent: LiveTeam = foulingTeam === 'Warriors' ? 'Falcons' : 'Warriors';
    const isPersonal = foulKind === 'defensive' || foulKind === 'offensive' || foulKind === 'unsportsmanlike';
    const isTeamFoul = foulKind === 'defensive' || foulKind === 'unsportsmanlike';
    const deltas: Record<string, number> = {};
    if (isPersonal) deltas.PF = 1;
    if (foulKind === 'technical') deltas.TECH = 1;
    if (foulKind === 'unsportsmanlike') deltas.UNS = 1;
    const nextStats = { ...fouler.stats };
    for (const [key, value] of Object.entries(deltas)) nextStats[key] = (nextStats[key] ?? 0) + value;
    const nextTeamFouls = teamFouls[foulingTeam] + (isTeamFoul ? 1 : 0);
    const reachedPersonalLimit = isPersonal && nextStats.PF >= rules.playerFoulLimit;
    const reachedEjectionLimit = (nextStats.TECH ?? 0) >= rules.ejectionTechnicalLimit || (nextStats.UNS ?? 0) >= rules.ejectionUnsportsmanlikeLimit || ((nextStats.TECH ?? 0) >= rules.ejectionMixedTechnicalLimit && (nextStats.UNS ?? 0) >= rules.ejectionMixedUnsportsmanlikeLimit);
    const disqualified = reachedPersonalLimit || reachedEjectionLimit;
    setTeams(current => ({ ...current, [foulingTeam]: current[foulingTeam].map(p => p.number === fouler.number ? { ...p, stats: nextStats, ...(disqualified ? { disqualified: true } : {}) } : p) }));
    if (isTeamFoul) setTeamFouls(current => ({ ...current, [foulingTeam]: nextTeamFouls }));
    const award = foulKind === 'technical' ? rules.technicalFreeThrows : isTeamFoul && nextTeamFouls >= rules.teamFoulPenaltyAt ? rules.teamFoulFreeThrows : 0;
    const foulLabel = foulKind === 'defensive' ? 'Defensive personal foul' : foulKind === 'offensive' ? 'Offensive personal foul' : foulKind === 'technical' ? 'Technical foul' : 'Unsportsmanlike foul';
    setEvents(current => [{ id: Date.now(), time: displayTime, name: fouler.name, number: fouler.number, action: `${foulLabel}${award ? ` · ${award} FT awarded to ${opponent}` : ''}${disqualified ? ' · disqualified' : ''}`, side: foulingTeam, points: 0, playerName: fouler.name, stat: Object.keys(deltas)[0], statDeltas: deltas, teamFoul: isTeamFoul, ...(award ? { freeThrowsAwarded: { team: opponent, count: award } } : {}), ...(disqualified ? { disqualification: fouler.number } : {}) }, ...current]);
    if (award > 0) {
      setPendingFreeThrows({ team: opponent, remaining: award, reason: foulLabel, ...(foulKind === 'technical' ? { resumeTeam: technicalResumeTeam } : {}) });
      setActiveTeam(opponent);
      setSelected(teams[opponent].find(p => p.onCourt && !p.disqualified)?.number ?? '');
    }
    if (disqualified) {
      setFoulOutPlayer({ team: foulingTeam, player: { ...fouler, stats: nextStats, disqualified: true }, reason: reachedPersonalLimit ? 'Personal foul limit reached' : 'Ejection threshold reached' });
      setFoulOutReplacement(teams[foulingTeam].find(p => !p.onCourt && !p.disqualified)?.number ?? '');
    }
    setPendingPass(null);
    if (shouldStopClockForDeadBall()) setClockRunning(false);
    setNotice(disqualified ? `${fouler.name} is disqualified under the saved rule set` : award ? `${award} free throw${award === 1 ? '' : 's'} awarded to ${opponent}` : `${foulLabel} recorded`);
    setFoulOpen(false);
  }
  function replaceFouledOutPlayer() {
    if (!foulOutPlayer || !foulOutReplacement) return;
    const { team, player: outgoing } = foulOutPlayer;
    const incoming = teams[team].find(p => p.number === foulOutReplacement && !p.onCourt && !p.disqualified);
    if (!incoming) return;
    setTeams(current => ({ ...current, [team]: current[team].map(p => p.number === outgoing.number ? { ...p, onCourt: false } : p.number === incoming.number ? { ...p, onCourt: true } : p) }));
    setEvents(current => [{ id: Date.now(), time: displayTime, name: `${incoming.name} replaces ${outgoing.name}`, number: incoming.number, action: 'Foul-out substitution', side: team, points: 0, substitution: { outNumber: outgoing.number, inNumber: incoming.number } }, ...current]);
    setFoulOutPlayer(null);
    if (activeTeam === team) setSelected(incoming.number);
  }
  function substitute() {
    if (subOut === subIn) return;
    const outgoing = teams[activeTeam].find(p => p.number === subOut);
    const incoming = teams[activeTeam].find(p => p.number === subIn);
    if (!outgoing?.onCourt || incoming?.onCourt) return;
    setTeams(current => ({ ...current, [activeTeam]: current[activeTeam].map(p => p.number === subOut ? { ...p, onCourt: false } : p.number === subIn ? { ...p, onCourt: true } : p) }));
    setSelected(subIn);
    setEvents(current => [{ id: Date.now(), time: displayTime, name: `${incoming?.name} for ${outgoing.name}`, number: incoming?.number ?? '', action: 'Substitution', side: activeTeam, points: 0, substitution: { outNumber: subOut, inNumber: subIn } }, ...current]);
    setNotice(`${incoming?.name} checks in for ${outgoing.name}`);
    setClockRunning(false);
    setSubOpen(false);
  }
  function undo() {
    const last = events[0];
    if (!last) return;
    if (last.points) setScore(current => ({ ...current, [last.side]: current[last.side] - last.points }));
    if (last.pass) setPendingPass(null);
    if (last.substitution) {
      setTeams(current => ({ ...current, [last.side]: current[last.side].map(p => p.number === last.substitution!.outNumber ? { ...p, onCourt: true } : p.number === last.substitution!.inNumber ? { ...p, onCourt: false } : p) }));
      setSelected(last.substitution.outNumber);
    }
    if (last.action === 'Team timeout') { setTimeouts(current => ({ ...current, [last.side]: current[last.side] + 1 })); setTimeoutRemaining(null); }
    if (last.teamFoul) setTeamFouls(current => ({ ...current, [last.side]: Math.max(0, current[last.side] - 1) }));
    if (last.freeThrowsAwarded) { setPendingFreeThrows(null); setActiveTeam(last.side); setSelected(last.number); }
    if (last.freeThrowsBefore) { setPendingFreeThrows(last.freeThrowsBefore); setActiveTeam(last.side); }
    if (last.disqualification) { setTeams(current => ({ ...current, [last.side]: current[last.side].map(p => p.number === last.disqualification ? { ...p, disqualified: false } : p) })); setFoulOutPlayer(null); }
    if (last.clockChange) { setRemaining(last.clockChange.remaining); setPeriod(last.clockChange.period); setClockRunning(false); }
    if (last.playerName && last.statDeltas) setTeams(current => ({ ...current, [last.side]: current[last.side].map(p => {
      if (p.name !== last.playerName) return p;
      const stats = { ...p.stats };
      for (const [key, delta] of Object.entries(last.statDeltas!)) stats[key] = Math.max(0, (stats[key] ?? 0) - delta);
      return { ...p, stats };
    }) }));
    setEvents(current => current.slice(1));
    setNotice('Last event removed from this local preview.');
  }
  function useTimeout() {
    if (timeoutRemaining !== null) { setNotice('A timeout is already in progress'); return; }
    if (timeouts[activeTeam] <= 0) { setNotice(`${activeTeam} has no timeouts remaining.`); return; }
    setCoachRequestConfirmed(false);
    setTimeoutOpen(true);
  }
  function confirmTimeout() {
    if (rules.headCoachRequestRequired && !coachRequestConfirmed) return;
    if (timeouts[activeTeam] <= 0) { setNotice(`${activeTeam} has no timeouts remaining.`); setTimeoutOpen(false); return; }
    const inFinalWindow = period === 'Q4' && remaining <= rules.fourthQuarterTimeoutRestrictionMinutes * 60;
    if (inFinalWindow && timeouts[activeTeam] > rules.finalTwoMinuteTimeoutMax) {
      setTimeouts(current => ({ ...current, Warriors: Math.min(current.Warriors, rules.finalTwoMinuteTimeoutMax), Falcons: Math.min(current.Falcons, rules.finalTwoMinuteTimeoutMax) }));
      setTimeoutCapApplied(true);
      setEvents(current => [{ id: Date.now(), time: displayTime, name: 'Game officials', number: '', action: `Timeout allotment capped at ${rules.finalTwoMinuteTimeoutMax}`, side: activeTeam, points: 0 }, ...current]);
    }
    setTimeouts(current => ({ ...current, [activeTeam]: current[activeTeam] - 1 }));
    setEvents(current => [{ id: Date.now() + 1, time: displayTime, name: activeTeam, number: '', action: 'Team timeout', side: activeTeam, points: 0 }, ...current]);
    setNotice(`${activeTeam} timeout · ${rules.timeoutDurationSeconds}-second timer started`);
    setTimeoutRemaining(rules.timeoutDurationSeconds);
    setClockRunning(false);
    setTimeoutOpen(false);
  }
  function advancePeriod() {
    const isOT = period.startsWith('OT');
    const next = period === 'Q4' ? 'OT' : isOT ? `OT${Number(period.replace('OT', '') || '1') + 1}` : `Q${Number(period.replace('Q', '')) + 1}`;
    const nextIsOT = next.startsWith('OT');
    const carryFouls = period === 'Q4' && next === 'OT' && rules.carryFourthQuarterFoulsToOvertime;
    setPeriod(next); setRemaining((nextIsOT ? rules.overtimeMinutes : rules.periodLengthMinutes) * 60); setClockRunning(false); setPendingPass(null);
    if (period === 'Q2') setTimeouts({ Warriors: rules.secondHalfTimeouts, Falcons: rules.secondHalfTimeouts });
    if (nextIsOT) setTimeouts({ Warriors: rules.overtimeTimeouts, Falcons: rules.overtimeTimeouts });
    if (next === 'Q4') setTimeoutCapApplied(false);
    if (!carryFouls) setTeamFouls({ Warriors: 0, Falcons: 0 });
    const nextLength = nextIsOT ? rules.overtimeMinutes : rules.periodLengthMinutes;
    setEvents(current => [{ id: Date.now(), time: `${nextLength}:00`, name: 'Game clock', number: '', action: `Start of ${next}`, side: activeTeam, points: 0, clockChange: { remaining, period } }, ...current]);
    setNotice(`Period advanced to ${next}; clock reset to ${nextIsOT ? rules.overtimeMinutes : rules.periodLengthMinutes}:00`);
  }
  function saveClockAdjustment() {
    const [minutes, seconds] = clockInput.split(':').map(Number);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds > 59 || minutes > 99 || !clockReason.trim()) return;
    const value = minutes * 60 + seconds;
    setRemaining(value); setClockRunning(false); setClockOpen(false);
    setEvents(current => [{ id: Date.now(), time: `${clockInput}`, name: 'Game clock', number: '', action: `Clock adjusted · ${clockReason.trim()}`, side: activeTeam, points: 0, clockChange: { remaining, period } }, ...current]);
    setNotice(`Clock adjusted to ${clockInput}`); setClockReason('');
  }
  function switchTeam(team: LiveTeam) {
    if (pendingFreeThrows && team !== pendingFreeThrows.team) { setNotice(`Finish the ${pendingFreeThrows.remaining} free throw${pendingFreeThrows.remaining === 1 ? '' : 's'} first`); return; }
    if (team !== activeTeam) setPendingPass(null);
    setActiveTeam(team); setSelected(teams[team].find(p => p.onCourt && !p.disqualified)!.number);
  }

  return <>
    <PageTitle eyebrow="COURTSIDE · GAME CC-026" title="Live game console" subtitle="Pasig Warriors vs River Falcons · Community Court A" action={<><Link className="button" to="/games/review"><CheckCircle2 size={16}/> Review game</Link><Button><Ellipsis size={17}/></Button></>} />
    <div className="console-status"><span><span className="pulse-dot"/> LIVE · {period}</span><span><WifiOff size={14}/> Demo preview · local state only</span><span className="console-status-right">Assigned scorer: Staff 02 · {clockRunning ? 'Clock running' : 'Clock stopped'}{timeoutRemaining !== null ? ` · Timeout ${Math.floor(timeoutRemaining / 60)}:${String(timeoutRemaining % 60).padStart(2, '0')}` : ''}</span></div>
    <div className="score-console">
      <div className="score-team"><span className="team-mark blue-mark large-mark">PW</span><span className="score-team-name">PASIG WARRIORS</span><strong>{score.Warriors}</strong><div className="score-meta"><span>TEAM FOULS <b>{teamFouls.Warriors}</b></span><span>TIMEOUTS <b>{timeouts.Warriors}</b></span></div></div>
      <div className="game-clock"><div className="clock-period"><button onClick={advancePeriod}>{period} <ChevronDown size={13}/></button><Pill tone="live"><span className="pulse-dot"/> IN PROGRESS</Pill></div><strong>{displayTime}</strong><div className="clock-buttons"><Button variant="primary" disabled={timeoutRemaining !== null} onClick={() => { if (remaining === 0) { setNotice('The period clock is at 00:00. Advance the period to continue.'); return; } setClockRunning(!clockRunning); }}>{clockRunning ? <><Pause size={13}/> Pause</> : <><Play size={13}/> Start clock</>}</Button><Button onClick={() => { setRemaining((period.startsWith('OT') ? rules.overtimeMinutes : rules.periodLengthMinutes) * 60); setClockRunning(false); }}>Reset</Button></div><small>{remaining === 0 ? 'Period ended' : timeoutRemaining !== null ? 'Timeout in progress' : clockRunning ? 'Clock running' : 'Clock stopped'} · {rules.runningClockEnabled ? `running time; stops in final ${rules.clockStopLastMinutes}:00 of configured quarters` : 'stop-clock mode'}</small></div>
      <div className="score-team"><span className="team-mark orange-mark large-mark">RF</span><span className="score-team-name">RIVER FALCONS</span><strong>{score.Falcons}</strong><div className="score-meta"><span>TEAM FOULS <b>{teamFouls.Falcons}</b></span><span>TIMEOUTS <b>{timeouts.Falcons}</b></span></div></div>
    </div>
    <div className="scoring-layout">
      <section className="panel scoring-panel">
        <div className="panel-heading"><div><h2>Record game event</h2><p>Pick a player, then tap the action to add it to the box score.</p></div><div className="team-switch"><button className={activeTeam === 'Warriors' ? 'active' : ''} onClick={() => switchTeam('Warriors')}>Warriors</button><button className={activeTeam === 'Falcons' ? 'active' : ''} onClick={() => switchTeam('Falcons')}>Falcons</button></div></div>
        <div className="on-court-label">ON COURT <span>{onCourt.length} players</span></div>
        <div className="player-chips">{onCourt.map((p, i) => <button key={p.number} className={selected === p.number ? 'selected' : ''} onClick={() => setSelected(p.number)}><Avatar initials={p.name.split(' ').map(n => n[0]).join('')} color={i % 2 ? 'sky' : 'peach'}/><span>{p.name}<small>#{p.number} · {p.position}</small></span></button>)}</div>
        <div className="selected-player"><div><b>#{player.number} {player.name}</b><small>{player.position} · this game</small></div><div>{['PTS','REB','AST','PF'].map(stat => <span key={stat}><b>{player.stats[stat] ?? 0}</b><small>{stat}</small></span>)}</div></div>
        <div className="bench-row"><div className="on-court-label">BENCH <span>{bench.length} available</span></div><div className="player-chips">{bench.map(p => <button key={p.number} onClick={() => { setSubIn(p.number); setSubOut(onCourt[0]?.number ?? ''); setSubOpen(true); }}><Avatar initials={p.name.split(' ').map(n => n[0]).join('')} color="lavender"/><span>{p.name}<small>#{p.number} · {p.position}</small></span></button>)}<button className="sub-action" onClick={() => { setSubOut(onCourt[0]?.number ?? ''); setSubIn(bench[0]?.number ?? ''); setSubOpen(true); }}><ArrowLeftRight size={14}/><span>Substitute<small>Change lineup</small></span></button></div></div>
        <div className="stat-group"><div className="stat-group-label">SHOOTING</div><div className="stat-grid shot-grid"><button onClick={() => record('2PT made', 2, 'FGM')}><b>+2</b><small>2PT made</small></button><button onClick={() => record('2PT missed', 0, 'FGA')}><b>2PT</b><small>missed</small></button><button onClick={() => record('3PT made', 3, '3PM')}><b>+3</b><small>3PT made</small></button><button onClick={() => record('3PT missed', 0, '3PA')}><b>3PT</b><small>missed</small></button><button onClick={() => record('Free throw made', 1, 'FTM')}><b>+1</b><small>FT made</small></button><button onClick={() => record('Free throw missed', 0, 'FTA')}><b>FT</b><small>missed</small></button></div></div>
        {pendingPass && <div className="pending-pass"><span><ArrowLeftRight size={14}/><b>Pass ready for assist check</b><small>{pendingPass.passer.name} → {pendingPass.receiver.name}</small></span><button onClick={() => { setPendingPass(null); setNotice('Pending pass cleared'); }}>Clear</button></div>}
        {pendingFreeThrows && <div className="pending-pass penalty-banner"><span><Flag size={14}/><b>{pendingFreeThrows.remaining} free throw{pendingFreeThrows.remaining === 1 ? '' : 's'} to record</b><small>{pendingFreeThrows.team} shooting · {pendingFreeThrows.reason}</small></span><b>Choose the shooter, then tap FT made/missed</b></div>}
        <div className="stat-group"><div className="stat-group-label">PLAYER STATS</div><div className="stat-grid"><button onClick={() => record('Offensive rebound', 0, 'OREB')}><b>OREB</b><small>Off. rebound</small></button><button onClick={() => record('Defensive rebound', 0, 'DREB')}><b>DREB</b><small>Def. rebound</small></button><button onClick={() => { setPassTarget(onCourt.find(p => p.number !== selected)?.number ?? ''); setPassOpen(true); }}><b>PASS</b><small>To teammate</small></button><button onClick={() => record('Assist', 0, 'AST')}><b>AST</b><small>Assist</small></button><button onClick={() => record('Steal', 0, 'STL')}><b>STL</b><small>Steal</small></button><button onClick={() => record('Block', 0, 'BLK')}><b>BLK</b><small>Block</small></button><button onClick={() => record('Turnover', 0, 'TO')}><b>TO</b><small>Turnover</small></button><button onClick={() => { setFoulKind('defensive'); setTechnicalResumeTeam(activeTeam === 'Warriors' ? 'Falcons' : 'Warriors'); setFoulOpen(true); }}><b>FOUL</b><small>Foul type…</small></button><button onClick={() => { setSubOut(onCourt[0]?.number ?? ''); setSubIn(bench[0]?.number ?? ''); setSubOpen(true); }}><b>SUB</b><small>Substitution</small></button></div></div>
        <div className="scoring-controls"><Button onClick={() => { setClockInput(displayTime); setClockOpen(true); }}><Clock3 size={15}/> Adjust clock</Button><Button onClick={useTimeout}>Team timeout</Button><Button onClick={advancePeriod}>End period <ArrowRight size={13}/></Button></div>
      </section>
      <section className="panel play-panel"><div className="panel-heading"><div><h2>Play-by-play</h2><p>Event log · newest first</p></div><Button onClick={undo}><Undo2 size={15}/> Undo last</Button></div><div className="sync-note"><CheckCircle2 size={15}/><span>{notice}</span><button className="icon-button"><Ellipsis size={17}/></button></div><div className="timeline">{events.map((event, i) => <div key={event.id} className="timeline-event"><span className={`timeline-marker ${event.points ? 'points' : ''}`}>{event.points ? '+' + event.points : '•'}</span><div className="timeline-copy"><b>{event.name} {event.number && <span>#{event.number}</span>}</b><small>{event.action} · {event.side}</small></div><time>{event.time}</time><button className="icon-button" aria-label="Event options"><Ellipsis size={16}/></button>{i === 0 && <span className="new-event">NEW</span>}</div>)}</div><div className="panel-bottom"><Link to="/games/review" className="text-link">Open full box score <ArrowRight size={14}/></Link><span className="muted tiny">Changes are tracked in the game log</span></div></section>
    </div>
    {subOpen && <div className="modal-scrim" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setSubOpen(false); }}><section className="game-modal"><div className="modal-heading"><div><span className="eyebrow">{activeTeam.toUpperCase()} · LINEUP</span><h2>Make a substitution</h2><p>Choose the player checking out and the player entering.</p></div><button className="icon-button" aria-label="Close" onClick={() => setSubOpen(false)}><X size={17}/></button></div><div className="field-grid"><label>Player out<select value={subOut} onChange={e => setSubOut(e.target.value)}>{onCourt.map(p => <option key={p.number} value={p.number}>#{p.number} · {p.name}</option>)}</select></label><label>Player in<select value={subIn} onChange={e => setSubIn(e.target.value)}>{bench.map(p => <option key={p.number} value={p.number}>#{p.number} · {p.name}</option>)}</select></label></div>{!bench.length && <div className="form-error">No bench players are available.</div>}<div className="modal-footer"><Button onClick={() => setSubOpen(false)}>Cancel</Button><Button variant="primary" onClick={substitute}><ArrowLeftRight size={15}/> Confirm substitution</Button></div></section></div>}
    {clockOpen && <div className="modal-scrim" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setClockOpen(false); }}><form className="game-modal" onSubmit={e => { e.preventDefault(); saveClockAdjustment(); }}><div className="modal-heading"><div><span className="eyebrow">GAME CC-026 · {period}</span><h2>Adjust game clock</h2><p>Clock adjustments are added to the game log.</p></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setClockOpen(false)}><X size={17}/></button></div><div className="field-grid"><label>Time remaining<input type="text" value={clockInput} onChange={e => setClockInput(e.target.value)} placeholder="MM:SS" pattern="[0-9]{1,2}:[0-5][0-9]" required/></label><label>Reason<input value={clockReason} onChange={e => setClockReason(e.target.value)} placeholder="e.g. official correction" required/></label></div><div className="modal-footer"><Button onClick={() => setClockOpen(false)}>Cancel</Button><Button type="submit" variant="primary"><Check size={15}/> Save adjustment</Button></div></form></div>}
    {passOpen && <div className="modal-scrim" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setPassOpen(false); }}><section className="game-modal"><div className="modal-heading"><div><span className="eyebrow">{activeTeam.toUpperCase()} · PASS EVENT</span><h2>Record a pass</h2><p>Choose the teammate receiving the pass. A made shot by them will trigger an assist check.</p></div><button className="icon-button" aria-label="Close" onClick={() => setPassOpen(false)}><X size={17}/></button></div><div className="field-grid"><label>Passer<input value={`#${player.number} · ${player.name}`} readOnly/></label><label>Pass to<select value={passTarget} onChange={e => setPassTarget(e.target.value)}>{onCourt.filter(p => p.number !== selected).map(p => <option key={p.number} value={p.number}>#{p.number} · {p.name}</option>)}</select></label></div><div className="modal-footer"><Button onClick={() => setPassOpen(false)}>Cancel</Button><Button variant="primary" onClick={recordPass}><ArrowLeftRight size={15}/> Record pass</Button></div></section></div>}
    {assistPrompt && <div className="modal-scrim assist-scrim"><section className="game-modal assist-modal" role="dialog" aria-modal="true" aria-labelledby="assist-prompt-title"><span className="assist-check-icon"><CheckCircle2 size={20}/></span><span className="eyebrow">ASSIST VALIDATION</span><h2 id="assist-prompt-title">Credit an assist?</h2><p><b>{assistPrompt.passer.name}</b> passed to <b>{assistPrompt.shooter.name}</b>, who just scored. Did that pass directly lead to the basket?</p><div className="modal-footer"><Button onClick={() => validateAssist(false)}>No assist</Button><Button variant="primary" onClick={() => validateAssist(true)}><Check size={15}/> Yes, credit assist</Button></div></section></div>}
    {timeoutOpen && <div className="modal-scrim assist-scrim"><section className="game-modal"><div className="modal-heading"><div><span className="eyebrow">{activeTeam.toUpperCase()} · TIMEOUT</span><h2>Confirm timeout request</h2><p>A timeout lasts {rules.timeoutDurationSeconds} seconds. Available: {timeouts[activeTeam]}.</p></div><button className="icon-button" aria-label="Close" onClick={() => setTimeoutOpen(false)}><X size={17}/></button></div>{rules.headCoachRequestRequired && <label className="coach-confirm"><input type="checkbox" checked={coachRequestConfirmed} onChange={e => setCoachRequestConfirmed(e.target.checked)}/><span>Head Coach requested this timeout at the scorer’s table.</span></label>}<div className="modal-footer"><Button onClick={() => setTimeoutOpen(false)}>Cancel</Button><Button variant="primary" onClick={confirmTimeout} disabled={rules.headCoachRequestRequired && !coachRequestConfirmed}><Clock3 size={15}/> Start timeout</Button></div></section></div>}
    {foulOpen && <div className="modal-scrim assist-scrim"><section className="game-modal"><div className="modal-heading"><div><span className="eyebrow">{activeTeam.toUpperCase()} · FOUL REPORT</span><h2>Record a foul</h2><p>Player #{player.number} · {player.name}. Classify it to apply the configured penalty.</p></div><button className="icon-button" aria-label="Close" onClick={() => setFoulOpen(false)}><X size={17}/></button></div><div className="field-grid"><label>Foul type<select value={foulKind} onChange={e => setFoulKind(e.target.value as typeof foulKind)}><option value="defensive">Defensive personal foul</option><option value="offensive">Offensive personal foul</option><option value="technical">Technical foul</option><option value="unsportsmanlike">Unsportsmanlike foul</option></select></label>{foulKind === 'technical' && <label>Team with possession at interruption<select value={technicalResumeTeam} onChange={e => setTechnicalResumeTeam(e.target.value as LiveTeam)}><option value="Warriors">Warriors</option><option value="Falcons">Falcons</option></select></label>}</div><p className="rule-help">Defensive fouls count toward the quarter’s team-foul penalty. A personal foul at the configured limit disqualifies the player. Technical and unsportsmanlike counts apply the saved ejection thresholds.</p><div className="modal-footer"><Button onClick={() => setFoulOpen(false)}>Cancel</Button><Button variant="primary" onClick={recordFoul}><Flag size={15}/> Record foul</Button></div></section></div>}
    {foulOutPlayer && <div className="modal-scrim assist-scrim"><section className="game-modal"><div className="modal-heading"><div><span className="eyebrow">PLAYER DISQUALIFIED</span><h2>{foulOutPlayer.player.name} must leave the game</h2><p>{foulOutPlayer.reason} · {foulOutPlayer.player.stats.PF ?? 0} personal fouls.</p></div></div>{teams[foulOutPlayer.team].some(p => !p.onCourt && !p.disqualified) ? <div className="field-grid"><label>Substitute<select value={foulOutReplacement} onChange={e => setFoulOutReplacement(e.target.value)}>{teams[foulOutPlayer.team].filter(p => !p.onCourt && !p.disqualified).map(p => <option key={p.number} value={p.number}>#{p.number} · {p.name}</option>)}</select></label></div> : <div className="form-error">No eligible bench player is available.</div>}<div className="modal-footer">{teams[foulOutPlayer.team].some(p => !p.onCourt && !p.disqualified) ? <Button variant="primary" onClick={replaceFouledOutPlayer}><ArrowLeftRight size={15}/> Send in substitute</Button> : <Button variant="primary" onClick={() => { setTeams(current => ({ ...current, [foulOutPlayer.team]: current[foulOutPlayer.team].map(p => p.number === foulOutPlayer.player.number ? { ...p, onCourt: false } : p) })); const next = teams[foulOutPlayer.team].find(p => p.onCourt && p.number !== foulOutPlayer.player.number && !p.disqualified); if (activeTeam === foulOutPlayer.team && next) setSelected(next.number); setFoulOutPlayer(null); }}>Continue with fewer players</Button>}</div></section></div>}
  </>;
}

export type PublicGame={id:string;organization_name:string;current_period:number;clock_ms:number;home_score:number;away_score:number;home_team_name:string;away_team_name:string};

export type PublicEvent={id:string;game_id:string;event_type:string;period:number;clock_ms:number;points:number;team_name:string;player_name:string|null;created_at:string;organization_id:string};

export type AnnouncementRow = { id: string; subject: string; message: string; audience: string; published_at: string | null; created_at: string };

export type StaffRow = { user_id: string; user_role: string; active: boolean; created_at: string };

export type AuditRow = { id: number; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; created_at: string };
