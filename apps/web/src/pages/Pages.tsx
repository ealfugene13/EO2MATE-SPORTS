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

async function getBasketballRuleDefaults(): Promise<BasketballRules> {
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

type Row = { cells: string[]; status?: string };
const defaultScheduleRules: Pick<BasketballRules,'scheduleDays'|'scheduleFrequency'|'scheduleStartDate'|'scheduleEndDate'|'maxGamesPerDay'|'firstGameTime'|'estimatedGameDurationMinutes'|'minutesBetweenGames'> = {
  scheduleDays:'MIXED',scheduleFrequency:'DAILY',scheduleStartDate:'',scheduleEndDate:'',maxGamesPerDay:6,firstGameTime:'09:00',estimatedGameDurationMinutes:150,minutesBetweenGames:30,
};
function normalizeBasketballRules(value:Partial<BasketballRules>):BasketballRules{return {...defaultScheduleRules,...value} as BasketballRules;}
function sameBasketballRules(left:Partial<BasketballRules>|null,right:Partial<BasketballRules>|null):boolean{
  if(!left||!right)return false;
  const normalizedLeft=normalizeBasketballRules(left);const normalizedRight=normalizeBasketballRules(right);
  return (Object.keys(normalizedLeft) as (keyof BasketballRules)[]).every(key=>normalizedLeft[key]===normalizedRight[key]);
}
function getEligibleScheduleDates(rules:BasketballRules):string[]{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(rules.scheduleStartDate)||!/^\d{4}-\d{2}-\d{2}$/.test(rules.scheduleEndDate))return [];
  const start=Date.parse(`${rules.scheduleStartDate}T00:00:00Z`),end=Date.parse(`${rules.scheduleEndDate}T00:00:00Z`);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||end-start>5*366*86400000)return [];
  const step=rules.scheduleFrequency==='EVERY_OTHER_DAY'?2:rules.scheduleFrequency==='EVERY_THIRD_DAY'?3:1;
  const result:string[]=[];let eligibleIndex=0;
  for(let time=start;time<=end;time+=86400000){const day=new Date(time).getUTCDay();const allowed=rules.scheduleDays==='MIXED'||(rules.scheduleDays==='WEEKENDS_ONLY'&&(day===0||day===6))||(rules.scheduleDays==='WEEKDAYS_ONLY'&&day>=1&&day<=5);if(allowed){if(eligibleIndex%step===0)result.push(new Date(time).toISOString().slice(0,10));eligibleIndex++;}}
  return result;
}
function manilaDateKey(value:Date|string):string{
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(value instanceof Date?value:new Date(value));
}
function todayManilaDateKey():string{return manilaDateKey(new Date());}
function requiredGames(teamCount:number,format:string):number{return format==='ROUND_ROBIN_DOUBLE'?teamCount*(teamCount-1):format==='SINGLE_ELIMINATION'?teamCount-1:teamCount*(teamCount-1)/2;}
function assessSchedule(rules:BasketballRules,format:string,teamCount:number):{ok:boolean;message:string;games:number;slots:number;dates:number}{
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
function scheduleTeamCount(format:string,minTeams:number,maxTeams:number):number{
  if(format!=='SINGLE_ELIMINATION')return maxTeams;
  const supported=[2,4,8,16,32,64,128].filter(n=>n>=minTeams&&n<=maxTeams);return supported[supported.length-1]??maxTeams;
}
function buildGameSchedule(matches:{game_id:string|null;home_team_id:string|null;away_team_id:string|null;round_no:number;slot_no:number}[],rules:BasketballRules):{game_id:string;scheduled_at:string}[]{
  const dates=getEligibleScheduleDates(rules);const [hour,minute]=rules.firstGameTime.split(':').map(Number);const firstMinutes=hour*60+minute;const spacing=rules.estimatedGameDurationMinutes+rules.minutesBetweenGames;const dailyCapacity=Math.max(0,Math.floor((24*60-firstMinutes-rules.estimatedGameDurationMinutes)/spacing)+1);const pending=matches.filter(match=>match.game_id&&match.home_team_id&&match.away_team_id).slice().sort((a,b)=>a.round_no-b.round_no||a.slot_no-b.slot_no);const plan:{game_id:string;scheduled_at:string}[]=[];
  for(const date of dates){const usedTeams=new Set<string>();let gamesToday=0;for(let i=0;i<pending.length&&gamesToday<Math.min(rules.maxGamesPerDay,dailyCapacity);){const match=pending[i];if(usedTeams.has(match.home_team_id!)||usedTeams.has(match.away_team_id!)){i++;continue;}const totalMinutes=firstMinutes+gamesToday*spacing;const timeLabel=`${String(Math.floor(totalMinutes/60)).padStart(2,'0')}:${String(totalMinutes%60).padStart(2,'0')}`;plan.push({game_id:match.game_id!,scheduled_at:new Date(`${date}T${timeLabel}:00+08:00`).toISOString()});usedTeams.add(match.home_team_id!);usedTeams.add(match.away_team_id!);pending.splice(i,1);gamesToday++;}}
  return plan;
}
type NumberRuleKey = { [K in keyof BasketballRules]: BasketballRules[K] extends number ? K : never }[keyof BasketballRules];
type BooleanRuleKey = { [K in keyof BasketballRules]: BasketballRules[K] extends boolean ? K : never }[keyof BasketballRules];
const ruleBounds: Record<NumberRuleKey, [number, number]> = {
  periodLengthMinutes: [1, 20], firstHalfTimeouts: [0, 10], secondHalfTimeouts: [0, 10],
  fourthQuarterTimeoutRestrictionMinutes: [0, 10], finalTwoMinuteTimeoutMax: [0, 10],
  timeoutDurationSeconds: [1, 300], playerFoulLimit: [1, 10], teamFoulPenaltyAt: [1, 10],
  teamFoulFreeThrows: [0, 5], technicalFreeThrows: [0, 5], ejectionTechnicalLimit: [1, 10],
  ejectionUnsportsmanlikeLimit: [1, 10], ejectionMixedTechnicalLimit: [1, 10],
  ejectionMixedUnsportsmanlikeLimit: [1, 10], overtimeMinutes: [1, 20], overtimeTimeouts: [0, 10],
  clockStopLastMinutes: [0, 10],
  maxGamesPerDay:[1,64],estimatedGameDurationMinutes:[60,300],minutesBetweenGames:[15,360],
};
const initialEvents = [
  { id: 1, time: '06:42', name: 'Alex Cruz', number: '23', action: '2PT made', side: 'Warriors', points: 2 },
  { id: 2, time: '06:51', name: 'Ben Reyes', number: '08', action: 'Steal', side: 'Warriors', points: 0 },
  { id: 3, time: '07:08', name: 'Marco Yu', number: '17', action: 'Defensive rebound', side: 'Falcons', points: 0 },
  { id: 4, time: '07:23', name: 'Alex Cruz', number: '23', action: '2PT made', side: 'Warriors', points: 2 },
];
const supportedImageTypes = new Set(['image/jpeg','image/png','image/webp','image/gif']);

function PageTitle({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-title"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{subtitle}</p></div>{action && <div className="title-action">{action}</div>}</div>;
}
function Button({ children, variant = 'secondary', onClick, className = '', type = 'button', disabled = false }: { children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost'; onClick?: () => void; className?: string; type?: 'button' | 'submit'; disabled?: boolean }) {
  return <button type={type} className={`button ${variant} ${className}`} onClick={onClick} disabled={disabled}>{children}</button>;
}
function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) { return <span className={`pill ${tone}`}>{children}</span>; }
function Metric({ label, value, note, icon: Icon, tone = 'blue' }: { label: string; value: string; note: string; icon: typeof Activity; tone?: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18}/></div><div className="metric-label">{label}</div><strong>{value}</strong><small>{note}</small></div>;
}
function Panel({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-heading"><h2>{title}</h2>{action}</div>{children}</section>;
}
function Avatar({ initials, color = 'lavender' }: { initials: string; color?: string }) { return <span className={`avatar ${color}`}>{initials}</span>; }

export function Dashboard() {
  type SummaryGame = { id: string; scheduled_at: string | null; status: string; home_score: number; away_score: number; home_team?: { name: string }; away_team?: { name: string }; venue?: { name: string } | null };
  const games = useWorkspaceRows<SummaryGame>('games','id,scheduled_at,status,home_score,away_score,created_at,home_team:teams!games_home_team_id_fkey(name),away_team:teams!games_away_team_id_fkey(name),venue:venues(name)');
  const teams = useWorkspaceRows<{id:string;active:boolean}>('teams','id,active,created_at');
  const players = useWorkspaceRows<{id:string;active:boolean}>('players','id,active,created_at');
  const registrations = useWorkspaceRows<{organization_id:string;pending_count:number;created_at:string}>('registration_queue_counts','organization_id,pending_count,created_at');
  const today = new Date().toLocaleDateString('en-CA');
  const todaysGames = games.rows.filter(game => game.scheduled_at?.slice(0,10) === today);
  const completed = games.rows.filter(game => game.status === 'FINAL').length;
  const live = games.rows.filter(game => game.status === 'LIVE');
  const pending = registrations.rows[0]?.pending_count ?? 0;
  const dataError = games.error || teams.error || players.error || registrations.error;
  return <><PageTitle eyebrow="ORGANIZATION OVERVIEW" title="League dashboard" subtitle="Current schedule and operations from your organization database." action={<Link className="button primary" to="/games/live"><Radio size={16}/> Open live console</Link>}/>
    <DataState loading={games.loading || teams.loading || players.loading || registrations.loading} error={dataError} onRetry={() => { void games.reload(); void teams.reload(); void players.reload(); void registrations.reload(); }}/>
    <div className="metrics-grid"><Metric label="GAMES TODAY" value={String(todaysGames.length).padStart(2,'0')} note={`${live.length} currently live`} icon={CalendarDays} tone="orange"/><Metric label="TEAMS" value={String(teams.rows.filter(row=>row.active).length)} note="Active in this organization" icon={Users} tone="blue"/><Metric label="PLAYERS" value={String(players.rows.filter(row=>row.active).length)} note={`${pending} registrations pending`} icon={UserRound} tone="purple"/><Metric label="GAMES FINAL" value={String(completed)} note="Official final results" icon={Trophy} tone="green"/></div>
    <div className="dashboard-grid"><Panel title="Live games" action={<Link className="text-link" to="/games">Game schedule <ArrowRight size={14}/></Link>}>{live.length ? live.map(game=><div className="live-card" key={game.id}><div className="live-card-top"><Pill tone="live"><span className="pulse-dot"/> LIVE</Pill><span className="muted tiny">{game.id.slice(0,8).toUpperCase()}</span></div><div className="live-match"><div className="score-side"><span>{game.home_team?.name ?? 'Home team'}</span><strong>{game.home_score}</strong></div><span className="score-dash">–</span><div className="score-side right"><span>{game.away_team?.name ?? 'Away team'}</span><strong>{game.away_score}</strong></div></div><div className="live-card-bottom"><span><Wifi size={14}/> Database status</span><Link to="/games/live">Open console <ArrowRight size={14}/></Link></div></div>) : <div className="empty-state">No games are live right now.</div>}{todaysGames.map(game=><div className="game-row" key={game.id}><div className="game-time">{game.scheduled_at ? new Date(game.scheduled_at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}) : 'TBD'}</div><div className="game-teams"><b>{game.home_team?.name} <span>vs</span> {game.away_team?.name}</b><small>{game.venue?.name ?? 'Venue not assigned'}</small></div><Pill>{game.status}</Pill></div>)}</Panel>
      <Panel title="Needs review"><div className="attention-item"><span className="attention-icon orange"><UserRound size={17}/></span><div><b>Player registrations</b><small>{pending} pending eligibility review</small></div><Link to="/registrations"><ArrowRight size={16}/></Link></div><div className="attention-item"><span className="attention-icon purple"><Flag size={17}/></span><div><b>Results</b><small>Review games before finalizing</small></div><Link to="/games/review"><ArrowRight size={16}/></Link></div></Panel></div>
  </>;
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

export function Competition() {
  const [searchParams,setSearchParams] = useSearchParams();
  const requestedCompetitionId = searchParams.get('competition');
  const appliedRequestedCompetitionId=useRef<string|null>(null);
  const [tab,setTab]=useState<'Dashboard'|'Competition list'>('Dashboard');
  const [detailOpen,setDetailOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [saved, setSaved] = useState(false);
  const [rulesNotice, setRulesNotice] = useState('');
  const [reviewRejectOpen,setReviewRejectOpen]=useState(false);
  const [reviewRejectReason,setReviewRejectReason]=useState('');
  const [importSuccess,setImportSuccess]=useState<{assignments:number;teamsCreated:number;playersCreated:number}|null>(null);
  const [rulesError, setRulesError] = useState('');
  const [invalidFields,setInvalidFields]=useState<string[]>([]);
  const focusInvalidFieldRef=useRef<string|null>(null);
  const [rules, setRules] = useState<BasketballRules | null>(null);
  type CompetitionRow = { id: string; league_id:string|null; name: string; format: string; rule_settings: BasketballRules; rule_version: number; season_id:string|null; status:'DRAFT'|'PENDING_REVIEW'|'APPROVED'|'ACTIVE'|'COMPLETED'; min_teams:number;max_teams:number; created_at:string; seasons?:{name:string}|null };
  const competitionsData = useWorkspaceRows<CompetitionRow>('competitions','id,league_id,name,format,rule_settings,rule_version,season_id,status,min_teams,max_teams,created_at,seasons(name)');
  const leaguesData=useWorkspaceRows<{id:string;name:string}>('leagues','id,name,created_at');
  const [leagueId,setLeagueId]=useState('');
  const seasonsData=useWorkspaceRows<{id:string;name:string;active:boolean}>('seasons','id,name,active,created_at');
  const [selectedCompetitionId,setSelectedCompetitionId]=useState('');const [creatingCompetition,setCreatingCompetition]=useState(false);
  const [competitionName, setCompetitionName] = useState('');
  const [seasonName,setSeasonName]=useState('');
  const [competitionFormat, setCompetitionFormat] = useState('ROUND_ROBIN_SINGLE');
  const [minTeams,setMinTeams]=useState(2); const [maxTeams,setMaxTeams]=useState(64);
  const [defaultLoading,setDefaultLoading]=useState(false);
  const [defaultsRetry,setDefaultsRetry]=useState(0);
  const [registeredTeams,setRegisteredTeams]=useState<{team_id:string}[]>([]);
  const [registeredPlayers,setRegisteredPlayers]=useState<{team_id:string;player_id:string}[]>([]);
  const [competitionRosterDetails,setCompetitionRosterDetails]=useState<{team_id:string;player_id:string;jersey_number:number|null;position:string|null;status:string}[]>([]);
  const [selectedTeam,setSelectedTeam]=useState(''); const [selectedPlayer,setSelectedPlayer]=useState('');
  const [selectedPlayers,setSelectedPlayers]=useState<string[]>([]);
  const [removeTeamTarget,setRemoveTeamTarget]=useState<string|null>(null);
  const [registrationNotice,setRegistrationNotice]=useState('');
  type BulkRosterRow={team_name:string;player_name:string;jersey_number:string;position:string};
  const [bulkRows,setBulkRows]=useState<BulkRosterRow[]>([{team_name:'',player_name:'',jersey_number:'',position:''}]); const [bulkBusy,setBulkBusy]=useState(false);
  const [startConfirmation,setStartConfirmation]=useState(false);
  const [fixtureView,setFixtureView]=useState<'Bracket'|'Match list'>('Bracket');
  const [registrationTab,setRegistrationTab]=useState<'Competition details'|'Registration'|'Fixtures & bracket'|'Games'>('Competition details');
  const [competitionGamesTab,setCompetitionGamesTab]=useState<'Summary'|'Game list'|'Calendar'>('Summary');
  const [expandedRoster,setExpandedRoster]=useState<string|null>(null);
  const [csvFileName,setCsvFileName]=useState('');
  const csvInputRef=useRef<HTMLInputElement>(null);
  const [matches,setMatches]=useState<{id:string;round_no:number;slot_no:number;home_team_id:string|null;away_team_id:string|null;game_id?:string|null;status:string}[]>([]);
  type CompetitionGame={id:string;home_score:number;away_score:number;status:string;scheduled_at:string|null;home_team_id?:string|null;away_team_id?:string|null;home_team?:{id:string;name:string}|null;away_team?:{id:string;name:string}|null};
  const [fixtureGames,setFixtureGames]=useState<CompetitionGame[]>([]);
  const teamsData=useWorkspaceRows<{id:string;name:string;active:boolean}>('teams','id,name,active');
  const playersData=useWorkspaceRows<{id:string;first_name:string;last_name:string;active:boolean}>('players','id,first_name,last_name,active');
  const activeCompetition = creatingCompetition?undefined:(selectedCompetitionId?competitionsData.rows.find(row=>row.id===selectedCompetitionId):competitionsData.rows[0]);
  const activeCompetitionIdRef=useRef<string|undefined>(undefined);activeCompetitionIdRef.current=activeCompetition?.id;
  const registrationRequestRef=useRef(0);
  const isReadOnly=!!activeCompetition&&activeCompetition.status!=='DRAFT';
  const leagueName=(id:string|null)=>leaguesData.rows.find(row=>row.id===id)?.name??'Unassigned league';
  const leagueErrorMessage=(error:unknown)=>{
    const message=error instanceof Error?error.message:String(error);
    if(/23502|not.null|league_id.*null|league.*required|select a league/i.test(message))return 'League is required. Select a league before saving the competition.';
    if(/23503|foreign.key|competitions_league_org_fk|league.*organization/i.test(message))return 'The selected league does not belong to your organization or no longer exists. Refresh and select a valid league.';
    if(/23514|check.constraint/i.test(message))return 'The competition failed a database validation. Check the selected league and competition details.';
    if(/approved.*locked|pending.*read.only|submitted.*cannot/i.test(message))return 'This competition is under review or approved and cannot be modified.';
    return message;
  };
  function showFieldValidation(message:string,fieldIds:string[]){setInvalidFields(fieldIds);focusInvalidFieldRef.current=fieldIds[0]??null;setRulesError(message);}
  function clearInvalidField(fieldId:string){setInvalidFields(current=>current.filter(id=>id!==fieldId));if(focusInvalidFieldRef.current===fieldId)focusInvalidFieldRef.current=null;}
  function detailedError(error:unknown,fallback:string){const value=error as {message?:string;details?:string;hint?:string;code?:string};const message=value?.message||String(error)||fallback;const detail=[value?.details,value?.hint,value?.code?`Code: ${value.code}`:''].filter(Boolean).join('\n');const hint=/PGRST202|42883|function .* does not exist|schema cache/i.test(`${message} ${detail}`)?'Apply migration 0005_competition_review_decisions.sql to the connected Supabase project, then refresh.':'';return [message,detail,hint].filter(Boolean).join('\n');}
  useEffect(()=>{if(!rulesError&&focusInvalidFieldRef.current){const fieldId=focusInvalidFieldRef.current;focusInvalidFieldRef.current=null;requestAnimationFrame(()=>{const field=document.getElementById(fieldId) as HTMLElement|null;field?.scrollIntoView({behavior:'smooth',block:'center'});field?.focus();});}},[rulesError]);
  const startNew=()=>{const params=new URLSearchParams(searchParams);params.delete('competition');setSearchParams(params,{replace:true});setCreatingCompetition(true);setDetailOpen(true);setTab('Competition list');setRegistrationTab('Competition details');setSelectedCompetitionId('');setLeagueId(leaguesData.rows.length===1?leaguesData.rows[0].id:'');setCompetitionName('');setSeasonName('');setCompetitionFormat('ROUND_ROBIN_SINGLE');setMinTeams(2);setMaxTeams(64);setRules(null);setRulesError('');setInvalidFields([]);focusInvalidFieldRef.current=null;setRulesNotice('');setSaved(false);setDefaultsRetry(v=>v+1);};
  const openCompetition=(id:string)=>{const params=new URLSearchParams(searchParams);params.set('competition',id);setSearchParams(params,{replace:true});setCreatingCompetition(false);setSelectedCompetitionId(id);setDetailOpen(true);setTab('Competition list');setRegistrationTab('Competition details');setRulesError('');setInvalidFields([]);focusInvalidFieldRef.current=null;setRulesNotice('');setSaved(false);registrationRequestRef.current++;setRegisteredTeams([]);setRegisteredPlayers([]);setCompetitionRosterDetails([]);setMatches([]);setFixtureGames([]);};
  async function transition(status:'PENDING_REVIEW'|'APPROVED'){
    if(!activeCompetition)return;
    if(status==='PENDING_REVIEW'){
      const requiredFields=[...(!leagueId?['competition-league']:[]),...(!competitionName.trim()?['competition-name']:[]),...(!seasonName.trim()?['season-name']:[])];
      if(requiredFields.length){showFieldValidation('Complete the highlighted required fields before submitting for review.',requiredFields);return;}
      if(!leaguesData.rows.some(item=>item.id===leagueId)){showFieldValidation('Select a valid league before submitting this competition for review.',['competition-league']);return;}
      if(!rules){setRulesError('Load and save the game schedule rules before submitting for review.');return;}
      const savedSeasonName=seasonsData.rows.find(item=>item.id===activeCompetition.season_id)?.name??activeCompetition.seasons?.name??'';
      const detailsChanged=activeCompetition.league_id!==leagueId||activeCompetition.name!==competitionName.trim()||activeCompetition.format!==(competitionFormat==='ROUND_ROBIN'?'ROUND_ROBIN_SINGLE':competitionFormat)||activeCompetition.min_teams!==minTeams||activeCompetition.max_teams!==maxTeams||savedSeasonName!==seasonName.trim()||!sameBasketballRules(activeCompetition.rule_settings,rules);
      if(detailsChanged){const changedFields=[...(activeCompetition.league_id!==leagueId?['competition-league']:[]),...(activeCompetition.name!==competitionName.trim()?['competition-name']:[]),...(savedSeasonName!==seasonName.trim()?['season-name']:[]),...(activeCompetition.min_teams!==minTeams?['min-teams']:[]),...(activeCompetition.max_teams!==maxTeams?['max-teams']:[])];showFieldValidation('Save the current competition details and rules before submitting for review.',changedFields.length?changedFields:['schedule-start-date']);return;}
      if(!activeCompetition.league_id){showFieldValidation('Assign a league and save this competition before submitting it for review.',['competition-league']);return;}
      const scheduleCheck=assessSchedule(rules,activeCompetition.format,scheduleTeamCount(activeCompetition.format,minTeams,maxTeams));if(!scheduleCheck.ok){showFieldValidation(scheduleCheck.message,['schedule-start-date','schedule-end-date','max-games-per-day']);return;}
    }
    setBusy(true);setRulesError('');setRulesNotice('');
    try { const {error}=await supabase.rpc('transition_competition_status',{p_competition_id:activeCompetition.id,p_new_status:status});if(error)throw error;await competitionsData.reload(true);if(status==='APPROVED'){setRegistrationTab('Registration');setCompetitionGamesTab('Summary');}setRulesNotice(status==='APPROVED'?'Competition approved and permanently locked. Registration is now open.':'Competition submitted for owner review.'); }
    catch(e){setRulesError(detailedError(e,'Unable to update competition status.'));}
    finally{setBusy(false);}
  }
  async function disapproveCompetition(){
    if(!activeCompetition||activeCompetition.status!=='PENDING_REVIEW'||competitionsData.workspace?.role!=='OWNER')return;
    setBusy(true);setRulesError('');setRulesNotice('');
    try{
      const {error}=await supabase.rpc('return_competition_to_draft',{p_competition_id:activeCompetition.id,p_reason:reviewRejectReason.trim()||null});
      if(error)throw error;
      await competitionsData.reload(true);setReviewRejectOpen(false);setReviewRejectReason('');
      setRulesNotice(`${activeCompetition.name} was disapproved and returned to Draft for changes.`);
    }catch(error){setRulesError(detailedError(error,'Unable to return this competition for changes.'));}
    finally{setBusy(false);}
  }
  useEffect(()=>{if(!creatingCompetition&&!selectedCompetitionId&&competitionsData.rows[0])setSelectedCompetitionId(competitionsData.rows[0].id);},[creatingCompetition,selectedCompetitionId,competitionsData.rows]);
  useEffect(()=>{if(!requestedCompetitionId){appliedRequestedCompetitionId.current=null;return;}if(requestedCompetitionId!==appliedRequestedCompetitionId.current&&competitionsData.rows.some(row=>row.id===requestedCompetitionId)){appliedRequestedCompetitionId.current=requestedCompetitionId;setSelectedCompetitionId(requestedCompetitionId);setCreatingCompetition(false);setDetailOpen(true);setTab('Competition list');setRegistrationTab('Competition details');}},[requestedCompetitionId,competitionsData.rows]);
  useEffect(() => {
    let cancelled = false;
    if (activeCompetition) {
      setLeagueId(activeCompetition.league_id??''); setCompetitionName(activeCompetition.name); setSeasonName(activeCompetition.seasons?.name??'');
      setCompetitionFormat(activeCompetition.format === 'ROUND_ROBIN' ? 'ROUND_ROBIN_SINGLE' : activeCompetition.format);setMinTeams(activeCompetition.min_teams??2);setMaxTeams(activeCompetition.max_teams??64);
      setRules(normalizeBasketballRules(activeCompetition.rule_settings));
    } else if (creatingCompetition || !competitionsData.loading) {
      setRulesError('');setDefaultLoading(true);
      void getBasketballRuleDefaults().then(value => { if (!cancelled) {setRules(value);setRulesError('');} })
        .catch(error => { if (!cancelled) setRulesError(error instanceof Error ? error.message : 'Unable to load database rule defaults.'); })
        .finally(()=>{if(!cancelled)setDefaultLoading(false);});
    }
    return () => { cancelled = true; };
  }, [activeCompetition?.id, creatingCompetition, defaultsRetry]);
  const numberField = (key: NumberRuleKey, label: string) => !rules ? null : <label>{label}<input id={`rule-${key}`} className={invalidFields.includes(`rule-${key}`)?'field-invalid':''} type="number" min={ruleBounds[key][0]} max={ruleBounds[key][1]} value={rules[key]} disabled={isReadOnly} onChange={e => { setRules(current => current ? ({ ...current, [key]: Number(e.target.value) }) : current); clearInvalidField(`rule-${key}`);setRulesError(''); }}/></label>;
  const toggleField = (key: BooleanRuleKey, label: string) => !rules ? null : <label className="rule-toggle"><span>{label}</span><input type="checkbox" checked={rules[key]} disabled={isReadOnly} onChange={e => { setRules(current => current ? ({ ...current, [key]: e.target.checked }) : current); setRulesError(''); }}/></label>;
  async function saveRuleSet() {
    if(isReadOnly){setRulesError('Submitted or approved competitions cannot be edited.');return;}
    if (!rules) { setRulesError('Basketball rules are still unavailable. Click Retry loading defaults, then save again.'); return; }
    setInvalidFields([]);focusInvalidFieldRef.current=null;
    const requiredMissing=[...(!leagueId?['competition-league']:[]),...(!competitionName.trim()?['competition-name']:[]),...(!seasonName.trim()?['season-name']:[]),...(!rules.scheduleStartDate?['schedule-start-date']:[]),...(!rules.scheduleEndDate?['schedule-end-date']:[])];
    if(requiredMissing.length){showFieldValidation('Complete the highlighted required fields before saving.',requiredMissing);setSaved(false);return;}
    const invalid = (Object.entries(ruleBounds) as [NumberRuleKey, [number, number]][]).find(([key, [min, max]]) => !Number.isInteger(rules[key]) || rules[key] < min || rules[key] > max);
    if (invalid) { showFieldValidation(`Check ${invalid[0]}: use a whole number from ${invalid[1][0]} to ${invalid[1][1]}.`,[`rule-${invalid[0]}`]); setSaved(false); return; }
    if (!leaguesData.rows.some(item=>item.id===leagueId)) {showFieldValidation('The selected league is unavailable for this organization. Refresh and select a valid league.',['competition-league']);return;}
    if(!Number.isInteger(minTeams)||!Number.isInteger(maxTeams)||minTeams<2||maxTeams<minTeams||maxTeams>128){showFieldValidation('Team limits must be whole numbers between 2 and 128, with maximum at least minimum.',['min-teams','max-teams']);return;}
    if(competitionFormat==='SINGLE_ELIMINATION' && (minTeams%2!==0||maxTeams%2!==0)){showFieldValidation('Single elimination requires even minimum and maximum team limits.',['min-teams','max-teams']);return;}
    if(competitionFormat==='SINGLE_ELIMINATION' && ![2,4,8,16,32,64,128].some(n=>n>=minTeams&&n<=maxTeams)){showFieldValidation('Single elimination requires at least one supported bracket size (2, 4, 8, 16, 32, 64, 128) within the team limits.',['min-teams','max-teams']);return;}
    const scheduleCheck=assessSchedule(rules,competitionFormat,scheduleTeamCount(competitionFormat,minTeams,maxTeams));if(!scheduleCheck.ok){const scheduleFields=[...(!rules.scheduleStartDate?['schedule-start-date']:[]),...(!rules.scheduleEndDate||rules.scheduleEndDate<rules.scheduleStartDate?['schedule-end-date']:[]),...(!/^([01]\d|2[0-3]):[0-5]\d$/.test(rules.firstGameTime)?['first-game-time']:[]),...(!Number.isInteger(rules.maxGamesPerDay)||rules.maxGamesPerDay<1||rules.maxGamesPerDay>64?['max-games-per-day']:[]),...(!Number.isInteger(rules.estimatedGameDurationMinutes)||rules.estimatedGameDurationMinutes<60||rules.estimatedGameDurationMinutes>300?['estimated-duration']:[]),...(!Number.isInteger(rules.minutesBetweenGames)||rules.minutesBetweenGames<15||rules.minutesBetweenGames>360?['minutes-between-games']:[])];showFieldValidation(scheduleCheck.message,scheduleFields.length?scheduleFields:['schedule-start-date','schedule-end-date','max-games-per-day']);return;}
    setRulesError(''); setRulesNotice(''); setSaved(false); setBusy(true);
    try {
      let seasonId=activeCompetition?.season_id??null;
      if(seasonId)await seasonsData.update(seasonId,{name:seasonName.trim()});else seasonId=await seasonsData.insert({name:seasonName.trim(),active:true});
      if (activeCompetition) {
        const ruleSetChanged=!sameBasketballRules(activeCompetition.rule_settings,rules);
        const { data: updatedCompetition, error: updateError } = await supabase.from('competitions')
          .update({ name: competitionName.trim(), format: competitionFormat, rule_settings: rules, rule_version: activeCompetition.rule_version+(ruleSetChanged?1:0), league_id: leagueId, season_id: seasonId, min_teams: minTeams, max_teams: maxTeams })
          .eq('id', activeCompetition.id)
          .eq('organization_id', competitionsData.workspace?.id)
          .select('id,status,name')
          .maybeSingle();
        if (updateError) throw updateError;
        if (!updatedCompetition) throw new Error('No competition was updated. Refresh the page and confirm you still have edit access.');
        await competitionsData.reload(true);
      }
      else {const id=await competitionsData.insert({ name: competitionName.trim(), format: competitionFormat, rule_settings: rules, rule_version: 1,league_id:leagueId,season_id:seasonId,min_teams:minTeams,max_teams:maxTeams });setSelectedCompetitionId(id);setCreatingCompetition(false);await competitionsData.reload(true);}
      setSaved(true);setDetailOpen(true);setRulesNotice(activeCompetition
        ? `Rules and details saved for ${competitionName.trim()}. Status: ${activeCompetition.status.replaceAll('_', ' ')}. Saving rules keeps the competition in Draft; submit it for review when ready.`
        : `${competitionName.trim()} was created successfully. Status: Draft. Submit it for review when the competition details and rules are ready.`);
    } catch (e) { setRulesError(leagueErrorMessage(e)); }
    finally { setBusy(false); }
  }
  async function saveMyDefaults() {
    if (!rules) { setRulesError('Load the basketball rule defaults from the database before saving.'); return; }
    setRulesError(''); setRulesNotice('');
    const { error } = await supabase.rpc('save_my_basketball_rule_settings', { p_rule_settings: rules });
    if (error) setRulesError(error.message);
    else setRulesNotice('Your personal defaults were saved. New competitions will start with these values.');
  }
  async function restoreSharedDefaults() {
    setRulesError(''); setRulesNotice('');
    const { data, error } = await supabase.rpc('restore_my_basketball_rule_settings');
    if (error) { setRulesError(error.message); return; }
    setRules(normalizeBasketballRules(data as Partial<BasketballRules>));
    setRulesNotice('Your personal defaults were removed and restored from the shared database defaults. The current competition changes only if you click Save rule set.');
  }
  async function reloadRegistrations(){
    if(!activeCompetition)return;
    const competitionId=activeCompetition.id;const requestId=++registrationRequestRef.current;
    const [t,p,m,games]=await Promise.all([
      supabase.from('competition_teams').select('team_id').eq('competition_id',competitionId),
      supabase.from('competition_players').select('team_id,player_id').eq('competition_id',competitionId),
      supabase.from('competition_matches').select('id,round_no,slot_no,home_team_id,away_team_id,game_id,status').eq('competition_id',competitionId).order('round_no').order('slot_no'),
      supabase.from('games').select('id,home_team_id,away_team_id,home_score,away_score,status,scheduled_at,home_team:teams!games_home_team_id_fkey(id,name),away_team:teams!games_away_team_id_fkey(id,name)').eq('competition_id',competitionId).order('scheduled_at',{ascending:true,nullsFirst:false}),
    ]);
    if(requestId!==registrationRequestRef.current||activeCompetitionIdRef.current!==competitionId)return;
    if(t.error||p.error||m.error||games.error){setRulesError(t.error?.message||p.error?.message||m.error?.message||games.error?.message||'Cannot load registrations');return;}
    setRegisteredTeams(t.data??[]);setRegisteredPlayers(p.data??[]);setMatches(m.data??[]);setFixtureGames((games.data??[]).map(game=>{const match=(m.data??[]).find(item=>item.game_id===game.id);const homeRelation=Array.isArray(game.home_team)?game.home_team[0]??null:game.home_team??null;const awayRelation=Array.isArray(game.away_team)?game.away_team[0]??null:game.away_team??null;const homeId=game.home_team_id??match?.home_team_id??homeRelation?.id??null;const awayId=game.away_team_id??match?.away_team_id??awayRelation?.id??null;return {...game,home_team:homeRelation??(homeId?teamsData.rows.find(team=>team.id===homeId)??null:null),away_team:awayRelation??(awayId?teamsData.rows.find(team=>team.id===awayId)??null:null)};}));
    const rosterIds=(p.data??[]).map(row=>row.player_id);
    if(rosterIds.length){const rosterResponse=await supabase.from('rosters').select('team_id,player_id,jersey_number,position,status').eq('season_id',activeCompetition.season_id).in('player_id',rosterIds);if(requestId!==registrationRequestRef.current||activeCompetitionIdRef.current!==competitionId)return;if(rosterResponse.error)setRulesError(rosterResponse.error.message);else setCompetitionRosterDetails((rosterResponse.data??[]).filter(row=>(p.data??[]).some(cp=>cp.team_id===row.team_id&&cp.player_id===row.player_id)));}
    else setCompetitionRosterDetails([]);
  }
  useEffect(()=>{if(activeCompetition?.id&&detailOpen){void reloadRegistrations();return ()=>{registrationRequestRef.current++;};}},[activeCompetition?.id,detailOpen]);
  async function registerTeam(teamId:string){
    if(!activeCompetition)return;
    const {error}=await supabase.rpc('register_competition_team',{p_competition_id:activeCompetition.id,p_team_id:teamId});
    if(error)throw error;
  }
  async function registerPlayer(teamId:string,playerId:string){
    if(!activeCompetition)return;
    const {error}=await supabase.rpc('register_competition_player',{p_competition_id:activeCompetition.id,p_team_id:teamId,p_player_id:playerId});
    if(error)throw error;
  }
  async function assignSelectedPlayers(){
    if(!activeCompetition||!selectedTeam||selectedPlayers.length===0)return;
    setBusy(true);setRulesError('');
    try{
      const {data,error}=await supabase.rpc('bulk_assign_competition_players',{p_competition_id:activeCompetition.id,p_team_id:selectedTeam,p_player_ids:selectedPlayers});
      if(error)throw error;
      setRegistrationNotice(`${data??selectedPlayers.length} player(s) assigned to the selected team.`);
      setSelectedPlayers([]);await reloadRegistrations();
    }catch(e){setRulesError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  async function removeRegisteredTeam(){
    if(!activeCompetition||!removeTeamTarget)return;
    setBusy(true);setRulesError('');
    try{
      const {error}=await supabase.rpc('remove_competition_team',{p_competition_id:activeCompetition.id,p_team_id:removeTeamTarget});
      if(error)throw error;
      setRegistrationNotice('Team removed from this competition. Master team and player records were preserved.');
      if(selectedTeam===removeTeamTarget){setSelectedTeam('');setSelectedPlayers([]);}
      setRemoveTeamTarget(null);await reloadRegistrations();
    }catch(e){setRemoveTeamTarget(null);setRulesError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  function describeBulkImportError(error:unknown):{reason:string;details:string;resolution:string;code:string}{
    const e=error as {message?:string;details?:string;hint?:string;code?:string}|null;
    const message=e?.message|| (error instanceof Error?error.message:'Unexpected error during roster import.');
    const details=e?.details||'';
    const hint=e?.hint||'';
    const code=e?.code||'';
    const combined=[message,details,hint,code].join(' ');
    if(/PGRST202|42883|could not find the function|function .* does not exist|schema cache/i.test(combined))return {reason:'The bulk roster import database function is unavailable.',details:message,resolution:'Apply migration 0017_competition_bulk_create.sql to the connected Supabase project. Then refresh the page and retry.',code};
    if(/42501|permission denied|not authorized|row.level security|policy/i.test(combined))return {reason:'Your account does not have permission to import this roster.',details:message,resolution:'Confirm you are an organization Owner or Admin, and verify the database function grants and organization access.',code};
    if(/CSV row|CSV line|CSV must|invalid team|invalid player|duplicate|already assigned|exceeds competition/i.test(combined))return {reason:message,details:details||'The CSV failed a roster validation check.',resolution:'Correct the indicated row or competition settings and retry. No records should be committed when the database transaction fails.',code};
    if(/23502|23503|23505|23514|constraint|null value|foreign key/i.test(combined))return {reason:'The database rejected a team, player, or competition record.',details:message+(details?' — '+details:''),resolution:'Check the database constraint and confirm migrations 0017 and 0018 are deployed. Share the error code with the administrator.',code};
    if(/fetch|network|timeout|Failed to fetch/i.test(combined))return {reason:'Could not reach the database service.',details:message,resolution:'Check your connection and Supabase service availability, then retry.',code};
    return {reason:message,details:details||hint||'The database did not provide additional diagnostic details.',resolution:'Verify migrations 0017 and 0018, your organization permissions, and the Supabase function logs. Copy the diagnostic details for investigation.',code};
  }
  const [importFailure,setImportFailure]=useState<{reason:string;details:string;resolution:string;code:string}|null>(null);
  function parseBulkCsvLine(line:string){const fields:string[]=[];let field='';let quoted=false;for(let i=0;i<line.length;i++){const char=line[i];if(char==='"'){if(quoted&&line[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(char===','&&!quoted){fields.push(field.trim());field='';}else field+=char;}if(quoted)throw new Error('CSV contains an unmatched quote.');fields.push(field.trim());return fields;}
  async function loadBulkCsv(file:File){
    setCsvFileName(file.name);setRulesError('');setImportFailure(null);
    try{
      const lines=(await file.text()).replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(line=>line.trim());
      const parsed=lines.map((line,index)=>{try{return parseBulkCsvLine(line);}catch{throw new Error(`CSV line ${index+1}: invalid quoting.`);}});
      const header=['team_name','player_name','jersey_number','position'];
      if(parsed[0]?.map(value=>value.toLowerCase()).join(',')!==header.join(','))throw new Error(`CSV header must be: ${header.join(',')}`);
      const rows=parsed.slice(1).map((row,index)=>{if(row.length!==4)throw new Error(`CSV line ${index+2}: expected four columns.`);return {team_name:row[0],player_name:row[1],jersey_number:row[2],position:row[3].toUpperCase()};}).filter(row=>Object.values(row).some(value=>value.trim()));
      setBulkRows(rows.length?rows:[{team_name:'',player_name:'',jersey_number:'',position:''}]);
    }catch(error){setBulkRows([{team_name:'',player_name:'',jersey_number:'',position:''}]);setRulesError(error instanceof Error?error.message:'Unable to read the selected CSV file.');}
  }
  async function bulkRegister(){
    if(!activeCompetition)return;
    setBulkBusy(true);setRulesError('');setImportFailure(null);setImportSuccess(null);setRulesNotice('');
    try{
      const rows=bulkRows.filter(row=>Object.values(row).some(value=>value.trim()));
      if(!rows.length)throw new Error('Add or upload at least one player row before importing.');
      if(rows.length>2000)throw new Error('Import a maximum of 2,000 rows at a time.');
      const usedJerseys=new Set<string>();const usedPlayers=new Set<string>();
      const payload=rows.map((row,index)=>{
        const line=index+1;const team_name=row.team_name.trim();const player_name=row.player_name.trim();const jersey=row.jersey_number.trim();const position=row.position.trim().toUpperCase();
        if(!team_name||!player_name||!jersey||!position)throw new Error(`CSV row ${line}: all four fields are required.`);
        if(!/^(0|[1-9][0-9]?)$/.test(jersey))throw new Error(`CSV row ${line}: jersey number must be 0–99.`);
        if(!['PG','SG','SF','PF','C'].includes(position))throw new Error(`CSV row ${line}: position must be PG, SG, SF, PF, or C.`);
        const jerseyKey=`${team_name.toLowerCase()}|${jersey}`;const playerKey=`${team_name.toLowerCase()}|${player_name.toLowerCase()}`;
        if(usedJerseys.has(jerseyKey))throw new Error(`CSV row ${line}: jersey #${jersey} is duplicated for ${team_name}.`);
        if(usedPlayers.has(playerKey))throw new Error(`CSV row ${line}: player ${player_name} appears twice for ${team_name}.`);
        usedJerseys.add(jerseyKey);usedPlayers.add(playerKey);
        return {team_name,player_name,jersey_number:Number(jersey),position};
      });
      const {data,error}=await supabase.rpc('bulk_import_competition_roster',{p_competition_id:activeCompetition.id,p_rows:payload});
      if(error)throw error;
      await Promise.all([reloadRegistrations(),teamsData.reload(),playersData.reload()]);
      const result=data as {teams_created?:number;players_created?:number;assignments?:number}|null;
      setImportSuccess({assignments:result?.assignments??rows.length,teamsCreated:result?.teams_created??0,playersCreated:result?.players_created??0});
      setBulkRows([{team_name:'',player_name:'',jersey_number:'',position:''}]);setCsvFileName('');
    }catch(e){setImportFailure(describeBulkImportError(e));}
    finally{setBulkBusy(false);}
  }
  async function applyScheduleToGames(competitionId=activeCompetition?.id){
    if(!competitionId||!rules||!activeCompetition)throw new Error('Competition schedule rules are unavailable.');
    const check=assessSchedule(rules,activeCompetition.format,registeredTeams.length);if(!check.ok)throw new Error(check.message);
    const {data:fixtures,error:fixtureError}=await supabase.from('competition_matches').select('game_id,home_team_id,away_team_id,round_no,slot_no').eq('competition_id',competitionId).order('round_no').order('slot_no');
    if(fixtureError)throw fixtureError;
    const plan=buildGameSchedule(fixtures??[],rules);if(!plan.length)throw new Error('No assigned matchups are ready to schedule. Confirm the competition generated fixtures with teams.');
    const {data,error}=await supabase.rpc('apply_competition_game_schedule',{p_competition_id:competitionId,p_schedule:plan});if(error)throw error;
    return Number(data??plan.length);
  }
  async function scheduleGamesNow(){setBusy(true);setRulesError('');try{const count=await applyScheduleToGames();await reloadRegistrations();setRulesNotice(`${count} game dates assigned from the saved schedule rules.`);}catch(error){setRulesError(error instanceof Error?error.message:'Unable to apply the saved game schedule.');}finally{setBusy(false);}}
  async function startCompetition(){
    if(!activeCompetition)return;
    const scheduleCheck=rules?assessSchedule(rules,activeCompetition.format,registeredTeams.length):{ok:false,message:'Load the competition rules before starting.'};if(!scheduleCheck.ok){setRulesError(scheduleCheck.message);return;}
    setStartConfirmation(false);setBusy(true);setRulesError('');setRulesNotice('');let competitionStarted=false;
    try{const competitionId=activeCompetition.id;const {data,error}=await supabase.rpc('start_sports_competition',{p_competition_id:competitionId});if(error)throw error;competitionStarted=true;await Promise.all([competitionsData.reload(true),reloadRegistrations()]);const {error:randomizeError}=await supabase.rpc('randomize_competition_fixtures',{p_competition_id:competitionId});if(randomizeError)throw randomizeError;await Promise.all([competitionsData.reload(true),reloadRegistrations()]);const scheduled=await applyScheduleToGames(competitionId);await Promise.all([competitionsData.reload(true),reloadRegistrations()]);setRegistrationTab('Fixtures & bracket');setFixtureView(activeCompetition.format==='SINGLE_ELIMINATION'?'Bracket':'Match list');setRulesNotice(`Competition started; ${data} games generated and ${scheduled} match dates assigned.`);}
    catch(e){if(competitionStarted){await Promise.all([competitionsData.reload(true),reloadRegistrations()]);setRegistrationTab('Fixtures & bracket');setFixtureView(activeCompetition.format==='SINGLE_ELIMINATION'?'Bracket':'Match list');}setRulesError(detailedError(e,'Unable to start competition.'));}
    finally{setBusy(false);}
  }
  const bracketCountInvalid=!!activeCompetition && activeCompetition.format==='SINGLE_ELIMINATION' && (registeredTeams.length<2 || (registeredTeams.length & (registeredTeams.length-1))!==0);
  const bracketTargetLow=registeredTeams.length>=2 ? 2**Math.floor(Math.log2(registeredTeams.length)) : 2;
  const bracketTargetHigh=registeredTeams.length>=2 ? 2**Math.ceil(Math.log2(registeredTeams.length)) : 2;
  const bracketCountMessage=bracketCountInvalid ? `Registered: ${registeredTeams.length}. This single-elimination scheduler does not support byes. ${bracketTargetLow===bracketTargetHigh?`Register ${bracketTargetHigh} teams.`:`Use ${bracketTargetLow} teams (remove ${registeredTeams.length-bracketTargetLow}) or ${bracketTargetHigh} teams (add ${bracketTargetHigh-registeredTeams.length}).`} Team registrations can be changed while APPROVED; approved rules cannot be edited.` : '';
  const teamLimitInvalid=!!activeCompetition&&(registeredTeams.length<activeCompetition.min_teams||registeredTeams.length>activeCompetition.max_teams);
  const startScheduleCheck=activeCompetition&&rules?assessSchedule(rules,activeCompetition.format,registeredTeams.length):null;
  const startOwnerOnly=competitionsData.workspace?.role!=='OWNER';
  const startBlockedReasons=[...(teamLimitInvalid&&activeCompetition?[`Team count must be between ${activeCompetition.min_teams} and ${activeCompetition.max_teams}.`]:[]),...(bracketCountInvalid?[bracketCountMessage]:[]),...(startScheduleCheck&&!startScheduleCheck.ok?[startScheduleCheck.message]:[]),...(startOwnerOnly?['Only the organization OWNER can start this competition.']:[])];
  const total=competitionsData.rows.length;
  const draftCount=competitionsData.rows.filter(row=>row.status==='DRAFT').length;
  const reviewCount=competitionsData.rows.filter(row=>row.status==='PENDING_REVIEW').length;
  const approvedCount=competitionsData.rows.filter(row=>row.status==='APPROVED').length;
  const listing=(rows:CompetitionRow[])=><div className="table-wrap"><table><thead><tr><th>COMPETITION</th><th>LEAGUE</th><th>SEASON</th><th>FORMAT</th><th>STATUS</th><th>RULES</th></tr></thead><tbody>{rows.map(item=><tr key={item.id}><td><button className="text-link" onClick={()=>openCompetition(item.id)}><b>{item.name}</b> <ArrowRight size={13}/></button></td><td>{leagueName(item.league_id)}</td><td>{item.seasons?.name??'—'}</td><td>{item.format.replaceAll('_',' ')}</td><td><Pill tone={item.status==='APPROVED'?'soft-green':item.status==='PENDING_REVIEW'?'soft-orange':'neutral'}>{item.status.replaceAll('_',' ')}</Pill></td><td><Button onClick={()=>openCompetition(item.id)}>View rules</Button></td></tr>)}</tbody></table>{rows.length===0&&<div className="empty-state">No competitions found. Create a competition to begin.</div>}</div>;
  const pageTitle = tab === 'Competition list' && detailOpen
    ? creatingCompetition ? 'Create competition' : activeCompetition?.name ?? 'Loading competition'
    : 'Competition';
  return <><style>{`.field-invalid{border-color:#dc2626!important;box-shadow:0 0 0 3px rgba(220,38,38,.14)!important}label:has(.field-invalid){color:#b91c1c}`}</style><PageTitle eyebrow="COMPETITION MANAGEMENT" title={pageTitle} subtitle="Review competitions, inspect applied basketball rules, and lock approved competitions." action={<Button variant="primary" onClick={startNew}><Plus size={15}/> Create competition</Button>}/>
    <div className="tab-row">{(['Dashboard','Competition list'] as const).map(value=><button key={value} className={tab===value?'selected':''} onClick={()=>{setTab(value);setDetailOpen(false);}}>{value}{value==='Competition list'&&<span>{total}</span>}</button>)}</div>
    <DataState loading={competitionsData.loading||seasonsData.loading||leaguesData.loading} error={competitionsData.error||seasonsData.error||leaguesData.error} onRetry={() => {void competitionsData.reload();void seasonsData.reload();void leaguesData.reload();}}/>
    {tab==='Dashboard'&&<><div className="metrics-grid"><Metric label="TOTAL COMPETITIONS" value={String(total)} note="Current organization" icon={Trophy}/><Metric label="DRAFT" value={String(draftCount)} note="Editable" icon={Clock3} tone="blue"/><Metric label="PENDING REVIEW" value={String(reviewCount)} note="Awaiting owner approval" icon={ShieldCheck} tone="orange"/><Metric label="APPROVED" value={String(approvedCount)} note="Rules locked" icon={CheckCircle2} tone="green"/></div><Panel title="Recent competitions" action={<button className="text-link" onClick={()=>setTab('Competition list')}>View all <ArrowRight size={14}/></button>}>{listing(competitionsData.rows.slice(0,5))}</Panel></>}
    {tab==='Competition list'&&!detailOpen&&<Panel title="Competitions in your organization">{listing(competitionsData.rows)}</Panel>}
    {tab==='Competition list'&&detailOpen&&<><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:18,flexWrap:'wrap',padding:'16px 18px',margin:'8px 0 14px',background:'#fff',border:'1px solid #dbe3ee',borderRadius:12}}>
      <div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}><Button onClick={()=>{setDetailOpen(false);setCreatingCompetition(false);}}><ArrowRight size={14}/> Back to list</Button><div><div className="muted tiny" style={{fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',marginBottom:5}}>Competition status</div><div style={{display:'flex',alignItems:'center',gap:9}}><Pill tone={['APPROVED','ACTIVE','COMPLETED'].includes(activeCompetition?.status??'')?'soft-green':activeCompetition?.status==='PENDING_REVIEW'?'soft-orange':'neutral'}>{creatingCompetition?'NEW · DRAFT':activeCompetition?.status?.replaceAll('_',' ')??'Loading'}</Pill><span className="muted tiny">{activeCompetition?.status==='APPROVED'?'Approved · rules locked':activeCompetition?.status==='PENDING_REVIEW'?'Awaiting owner review':'Save details, then submit for review'}</span></div></div></div>
      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}><span className="muted tiny" style={{fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',marginRight:4}}>Actions</span>{registrationTab==='Competition details'&&(!isReadOnly||creatingCompetition)&&<Button variant="primary" onClick={()=>void saveRuleSet()} disabled={busy}><Check size={15}/>{busy?'Saving…':'Save rules'}</Button>}{activeCompetition?.status==='DRAFT'&&<Button disabled={busy} onClick={()=>void transition('PENDING_REVIEW')}><ShieldCheck size={15}/>{busy?'Updating…':'Submit for review'}</Button>}{activeCompetition?.status==='PENDING_REVIEW'&&competitionsData.workspace?.role==='OWNER'&&<><Button disabled={busy} onClick={()=>{setReviewRejectReason('');setReviewRejectOpen(true);}}><X size={15}/>Disapprove</Button><Button variant="primary" disabled={busy} onClick={()=>void transition('APPROVED')}><Check size={15}/>{busy?'Updating…':'Approve & lock'}</Button></>}</div>
    </div>
    {activeCompetition&&<div className="tab-row">{(['Competition details','Registration','Fixtures & bracket','Games'] as const).map(value=><button key={value} className={registrationTab===value?'selected':''} onClick={()=>{setRegistrationTab(value);if(value==='Games')setCompetitionGamesTab('Summary');}}>{(value==='Competition details'&&['APPROVED','ACTIVE','COMPLETED'].includes(activeCompetition.status))||(value==='Registration'&&['ACTIVE','COMPLETED'].includes(activeCompetition.status))?<><Lock size={13} aria-label="Locked"/> {value}</>:value}{value==='Games'&&<span>{fixtureGames.length}</span>}</button>)}</div>}
    {isReadOnly&&registrationTab==='Competition details'&&<div className="callout" style={{display:'flex',alignItems:'center',gap:8}}><Lock size={15}/>{activeCompetition?.status==='APPROVED'?'Approved competition: rules are locked; registration is open until the competition starts.':activeCompetition?.status==='ACTIVE'?'Competition started: details, rules, and registration are locked.':activeCompetition?.status==='COMPLETED'?'Competition completed: details, rules, and registration remain locked.':'Pending owner review: details and applied rules are read-only.'}</div>}
    {saved&&registrationTab==='Competition details'&&<div className="success-banner"><CheckCircle2 size={17}/> Competition and rules saved to your organization database.</div>}

    <style>{`.sr-bracket-scroll{overflow-x:auto;padding:18px 12px 28px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px}.sr-bracket-grid{display:grid;gap:34px;min-width:max-content;align-items:stretch}.sr-bracket-round{display:flex;flex-direction:column;min-width:210px}.sr-bracket-title{text-align:center;font-size:13px;font-weight:800;color:#334155;margin-bottom:18px}.sr-bracket-stack{display:flex;flex:1;flex-direction:column;justify-content:space-around;gap:18px}.sr-bracket-match{position:relative;background:white;border:1px solid #cbd5e1;border-radius:11px;padding:10px;box-shadow:0 3px 12px rgba(15,23,42,.06)}.sr-bracket-match:not(:last-child)::after{content:'';position:absolute;left:100%;top:50%;width:34px;border-top:2px solid #cbd5e1}.sr-bracket-match-label{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}.sr-bracket-side{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:7px 5px;font-size:12px;border-top:1px solid #f1f5f9}.sr-bracket-side span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px}.sr-bracket-side b{font-variant-numeric:tabular-nums}.sr-bracket-final{font-size:10px;font-weight:700;color:#15803d;text-align:right;margin-top:4px}`}</style>
    <style>{`.sr-error-overlay{position:fixed;inset:0;background:rgba(12,19,35,.70);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px)}.sr-error-dialog{width:min(100%,590px);max-height:85vh;overflow:auto;background:#fff;color:#172033;border:1px solid #fecaca;border-top:6px solid #dc2626;border-radius:16px;box-shadow:0 25px 85px rgba(0,0,0,.38);padding:24px}.sr-error-dialog-head{display:flex;justify-content:space-between;align-items:center;gap:14px}.sr-error-dialog-head button{border:0;background:transparent;cursor:pointer;color:#64748b}.sr-error-heading{display:flex;align-items:center;gap:12px;color:#991b1b;font-size:19px}.sr-error-symbol{width:38px;height:38px;display:grid;place-items:center;border-radius:50%;background:#fee2e2;color:#b91c1c;font-size:24px;font-weight:800}.sr-error-reason{margin-top:18px;font-weight:650;line-height:1.55;overflow-wrap:anywhere}.sr-error-label{font-size:11px;font-weight:800;letter-spacing:.07em;color:#7f1d1d;margin:16px 0 5px}.sr-error-detail{white-space:pre-wrap;overflow-wrap:anywhere;background:#fff7f7;border:1px solid #fecaca;border-radius:9px;padding:12px;font-size:13px;line-height:1.55}.sr-error-next{background:#f8fafc;border-radius:9px;padding:12px;line-height:1.55;font-size:13px}.sr-error-dialog-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px;flex-wrap:wrap}.sr-error-code{font-size:12px;color:#64748b;margin-top:8px}`}</style>
    {startConfirmation&&activeCompetition&&<div className="sr-error-overlay" role="presentation" onClick={()=>setStartConfirmation(false)}><div className="sr-error-dialog" role="alertdialog" aria-modal="true" aria-labelledby="start-confirm-title" style={{borderTopColor:'#f97316'}} onClick={e=>e.stopPropagation()}><div className="sr-error-heading" style={{color:'#9a3412'}}><AlertTriangle size={25}/><strong id="start-confirm-title">Start this competition?</strong></div><p className="sr-error-reason">{activeCompetition.name}</p><p>This will lock registration, generate the official {activeCompetition.format.replaceAll('_',' ').toLowerCase()} schedule, and change the competition to ACTIVE. You cannot undo this from the Competition page.</p><p><strong>{registeredTeams.length} registered teams</strong> · {registeredPlayers.length} assigned players</p><div className="sr-error-dialog-actions"><Button onClick={()=>setStartConfirmation(false)}>Cancel</Button><Button variant="primary" disabled={busy} onClick={()=>void startCompetition()}>Confirm & start competition</Button></div></div></div>}
    {reviewRejectOpen&&activeCompetition&&<div className="sr-error-overlay" role="presentation" onClick={()=>{if(!busy)setReviewRejectOpen(false);}}><div className="sr-error-dialog" role="alertdialog" aria-modal="true" aria-labelledby="review-reject-title" style={{borderTopColor:'#dc2626'}} onClick={e=>e.stopPropagation()}><div className="sr-error-heading"><span className="sr-error-symbol">!</span><strong id="review-reject-title">Disapprove competition?</strong></div><p className="sr-error-reason">{activeCompetition.name} will return to Draft so the organizer can make changes and resubmit it.</p><label style={{display:'grid',gap:7,marginTop:16}}>Review note <textarea rows={3} maxLength={1000} value={reviewRejectReason} onChange={e=>setReviewRejectReason(e.target.value)} placeholder="Optional: explain what needs to change"/></label><div className="sr-error-dialog-actions"><Button onClick={()=>setReviewRejectOpen(false)} disabled={busy}>Cancel</Button><Button variant="primary" onClick={()=>void disapproveCompetition()} disabled={busy}>{busy?'Saving…':'Disapprove & return to Draft'}</Button></div></div></div>}
    {rulesNotice&&<div className="sr-error-overlay" role="presentation" onClick={()=>setRulesNotice('')}><div className="sr-error-dialog" role="dialog" aria-modal="true" aria-labelledby="competition-success-title" style={{borderTopColor:'#16a34a',borderColor:'#bbf7d0'}} onClick={e=>e.stopPropagation()}><div className="sr-error-heading" style={{color:'#166534'}}><CheckCircle2 size={28}/><strong id="competition-success-title">Action successful</strong></div><p className="sr-error-reason">{rulesNotice}</p><div className="sr-error-dialog-actions"><Button variant="primary" onClick={()=>setRulesNotice('')}>Done</Button></div></div></div>}
    {removeTeamTarget&&<div className="sr-error-overlay" role="presentation" onClick={()=>setRemoveTeamTarget(null)}><div className="sr-error-dialog" role="alertdialog" aria-modal="true" aria-labelledby="sr-remove-title" onClick={e=>e.stopPropagation()}><div className="sr-error-heading"><span className="sr-error-symbol">!</span><strong id="sr-remove-title">Remove team from competition?</strong></div><p className="sr-error-reason">{teamsData.rows.find(t=>t.id===removeTeamTarget)?.name??'Selected team'}</p><p>This will remove the team and its {registeredPlayers.filter(p=>p.team_id===removeTeamTarget).length} player assignment(s) from this competition. Master Team and Player records will not be deleted.</p><div className="sr-error-dialog-actions"><Button onClick={()=>setRemoveTeamTarget(null)} disabled={busy}>Cancel</Button><Button variant="primary" disabled={busy} onClick={()=>void removeRegisteredTeam()}>{busy?'Removing…':'Confirm remove'}</Button></div></div></div>}
    {registrationNotice&&<div className="sr-error-overlay" role="presentation" onClick={()=>setRegistrationNotice('')}><div role="dialog" aria-modal="true" className="sr-error-dialog" style={{borderTopColor:'#16a34a',borderColor:'#bbf7d0'}} onClick={e=>e.stopPropagation()}><div className="sr-error-heading" style={{color:'#166534'}}><CheckCircle2 size={26}/> <strong>Action successful</strong></div><p>{registrationNotice}</p><div className="sr-error-dialog-actions"><Button variant="primary" onClick={()=>setRegistrationNotice('')}>Done</Button></div></div></div>}
    {importSuccess && <div className="sr-error-overlay" role="presentation" onClick={()=>setImportSuccess(null)}>
      <div role="dialog" aria-modal="true" aria-labelledby="sr-success-title" onClick={event=>event.stopPropagation()} style={{width:'min(100%,520px)',background:'#fff',border:'1px solid #bbf7d0',borderTop:'6px solid #16a34a',borderRadius:16,boxShadow:'0 25px 85px rgba(0,0,0,.38)',padding:24,color:'#14532d'}}>
        <div className="sr-error-dialog-head"><div className="sr-error-heading" style={{color:'#166534'}}><span className="sr-error-symbol" style={{background:'#dcfce7',color:'#15803d'}}>✓</span><strong id="sr-success-title">Bulk import successful</strong></div><button type="button" aria-label="Close success popup" onClick={()=>setImportSuccess(null)}><X size={20}/></button></div>
        <p style={{color:'#334155',marginTop:18}}>The competition roster was imported successfully.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:10,marginTop:18}}>
          {([{label:'Assignments',value:importSuccess.assignments},{label:'Teams created',value:importSuccess.teamsCreated},{label:'Players created',value:importSuccess.playersCreated}]).map(item=><div key={item.label} style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:12,textAlign:'center'}}><strong style={{fontSize:25,display:'block'}}>{item.value}</strong><small style={{color:'#166534'}}>{item.label}</small></div>)}
        </div>
        <p style={{fontSize:12,color:'#64748b',marginTop:14}}>Existing matching records are reused; created counts may be zero on repeat imports.</p>
        <div className="sr-error-dialog-actions"><Button variant="primary" onClick={()=>setImportSuccess(null)}>Done</Button></div>
      </div>
    </div>}
    {(rulesError||importFailure) && <div className="sr-error-overlay" role="presentation" onClick={()=>{setRulesError('');setImportFailure(null);}}>
      <div className="sr-error-dialog" role="alertdialog" aria-modal="true" aria-labelledby="sr-error-title" aria-describedby="sr-error-message" onClick={event=>event.stopPropagation()}>
        <div className="sr-error-dialog-head"><div className="sr-error-heading"><span className="sr-error-symbol" aria-hidden="true">!</span><strong id="sr-error-title">{importFailure?'Bulk import failed':'Action failed'}</strong></div><button type="button" aria-label="Close error" onClick={()=>{setRulesError('');setImportFailure(null);}}><X size={20}/></button></div>
        <div id="sr-error-message" className="sr-error-reason">{importFailure?.reason||rulesError}</div>
        {importFailure&&<><div className="sr-error-label">TECHNICAL DETAILS</div><div className="sr-error-detail">{importFailure.details}</div>{importFailure.code&&<div className="sr-error-code">Database error code: {importFailure.code}</div>}<div className="sr-error-label">WHAT TO DO NEXT</div><div className="sr-error-next">{importFailure.resolution}</div></>}
        <div className="sr-error-dialog-actions">{importFailure&&<Button onClick={()=>{const content=[importFailure.reason,importFailure.details,importFailure.code,importFailure.resolution].filter(Boolean).join('\n');void navigator.clipboard.writeText(content).catch(()=>{});}}>Copy error details</Button>}<Button variant="primary" onClick={()=>{setRulesError('');setImportFailure(null);}}>Close</Button></div>
      </div>
    </div>}
    <fieldset hidden={registrationTab!=='Competition details'} disabled={isReadOnly} style={{border:0,padding:0,margin:0,minWidth:0}}><div className="form-layout"><div className="form-main">
      <Panel title={creatingCompetition?"Create new competition":"Competition details"}><div className="field-grid">{creatingCompetition&&<div className="span-2 callout">Creating a new competition. Choose a league, enter the competition and season names, then click Save rule set. Validation errors appear in a popup.</div>}{!leaguesData.loading&&leaguesData.rows.length===0&&<div className="span-2 form-error">No league exists for this organization. Create a league before creating a competition.</div>}<label className="span-2">League *<select id="competition-league" className={invalidFields.includes('competition-league')?'field-invalid':''} value={leagueId} disabled={isReadOnly} onChange={e=>{setLeagueId(e.target.value);clearInvalidField('competition-league');setRulesError('');}} required><option value="">Select a league (required)</option>{leaguesData.rows.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Competition name<input id="competition-name" className={invalidFields.includes('competition-name')?'field-invalid':''} required value={competitionName} onChange={e=>{setCompetitionName(e.target.value);clearInvalidField('competition-name');}} placeholder="e.g. Community Cup 2026"/></label><label>Season name<input id="season-name" className={invalidFields.includes('season-name')?'field-invalid':''} required value={seasonName} onChange={e=>{setSeasonName(e.target.value);clearInvalidField('season-name');}} placeholder="e.g. 2026 Season"/></label><label>Competition format<select value={competitionFormat} onChange={e=>setCompetitionFormat(e.target.value)}><option value="ROUND_ROBIN_SINGLE">Round robin · single</option><option value="ROUND_ROBIN_DOUBLE">Round robin · double</option><option value="SINGLE_ELIMINATION">Bracket · single elimination</option></select></label><label>Minimum teams<input id="min-teams" className={invalidFields.includes('min-teams')?'field-invalid':''} type="number" min={2} max={128} value={minTeams} onChange={e=>{setMinTeams(Number(e.target.value));clearInvalidField('min-teams');clearInvalidField('max-teams');}}/></label><label>Maximum teams<input id="max-teams" className={invalidFields.includes('max-teams')?'field-invalid':''} type="number" min={2} max={128} value={maxTeams} onChange={e=>{setMaxTeams(Number(e.target.value));clearInvalidField('min-teams');clearInvalidField('max-teams');}}/></label>{competitionFormat==='SINGLE_ELIMINATION'&&<div className="span-2 callout">Bracket rules: minimum and maximum must be even. Without byes, the actual registered team count must be 2, 4, 8, 16, 32, 64 or 128. Invalid counts cannot start the competition.</div>}<label>Saved rule version<input readOnly value={activeCompetition ? `v${activeCompetition.rule_version}` : 'New rule set'}/><small className="muted">Identifies the saved basketball rule revision. It increments when rules change and is used to track the rules applied to this competition.</small></label></div></Panel>
      {!rules&&<div className="empty-state">{defaultLoading?'Loading rule defaults from the database…':<><p>Rule defaults unavailable. {rulesError||'Try again.'}</p><Button onClick={()=>setDefaultsRetry(value=>value+1)}>Retry loading defaults</Button></>}</div>}
      {rules&&<><Panel title="Game format"><div className="field-grid"><label>Format<input value="5 on 5 basketball" readOnly/></label>{numberField('periodLengthMinutes','Quarter length (minutes)')}{numberField('overtimeMinutes','Overtime length (minutes)')}</div></Panel>
      <Panel title="Game schedule"><div className="field-grid"><label>Game days<select value={rules.scheduleDays} onChange={e=>{setRules(current=>current?{...current,scheduleDays:e.target.value as BasketballRules['scheduleDays']}:current);setSaved(false);}}><option value="WEEKENDS_ONLY">Weekends only</option><option value="WEEKDAYS_ONLY">Weekdays only</option><option value="MIXED">Weekdays and weekends</option></select></label><label>Frequency<select value={rules.scheduleFrequency} onChange={e=>{setRules(current=>current?{...current,scheduleFrequency:e.target.value as BasketballRules['scheduleFrequency']}:current);setSaved(false);}}><option value="DAILY">Daily · each eligible day</option><option value="EVERY_OTHER_DAY">Every other eligible day</option><option value="EVERY_THIRD_DAY">Every third eligible day</option></select></label><label>Target start date<input id="schedule-start-date" className={invalidFields.includes('schedule-start-date')?'field-invalid':''} type="date" required value={rules.scheduleStartDate} onChange={e=>{setRules(current=>current?{...current,scheduleStartDate:e.target.value}:current);clearInvalidField('schedule-start-date');setSaved(false);}}/></label><label>Target end date<input id="schedule-end-date" className={invalidFields.includes('schedule-end-date')?'field-invalid':''} type="date" required value={rules.scheduleEndDate} min={rules.scheduleStartDate||undefined} onChange={e=>{setRules(current=>current?{...current,scheduleEndDate:e.target.value}:current);clearInvalidField('schedule-end-date');setSaved(false);}}/></label><label>Maximum games per day<input id="max-games-per-day" className={invalidFields.includes('max-games-per-day')?'field-invalid':''} type="number" min="1" max="64" value={rules.maxGamesPerDay} onChange={e=>{setRules(current=>current?{...current,maxGamesPerDay:Number(e.target.value)}:current);clearInvalidField('max-games-per-day');setSaved(false);}}/></label><label>First tip-off<input id="first-game-time" className={invalidFields.includes('first-game-time')?'field-invalid':''} type="time" required value={rules.firstGameTime} onChange={e=>{setRules(current=>current?{...current,firstGameTime:e.target.value}:current);clearInvalidField('first-game-time');setSaved(false);}}/></label><label>Estimated game duration (minutes)<input id="estimated-duration" className={invalidFields.includes('estimated-duration')?'field-invalid':''} type="number" min="60" max="300" step="15" value={rules.estimatedGameDurationMinutes} onChange={e=>{setRules(current=>current?{...current,estimatedGameDurationMinutes:Number(e.target.value)}:current);clearInvalidField('estimated-duration');setSaved(false);}}/></label><label>Rest after each game (minutes)<input id="minutes-between-games" className={invalidFields.includes('minutes-between-games')?'field-invalid':''} type="number" min="15" max="360" step="15" value={rules.minutesBetweenGames} onChange={e=>{setRules(current=>current?{...current,minutesBetweenGames:Number(e.target.value)}:current);clearInvalidField('minutes-between-games');setSaved(false);}}/></label></div><div className={assessSchedule(rules,competitionFormat,scheduleTeamCount(competitionFormat,minTeams,maxTeams)).ok?'success-banner':'form-error'} style={{marginTop:14}}>{assessSchedule(rules,competitionFormat,scheduleTeamCount(competitionFormat,minTeams,maxTeams)).message} The preview uses a maximum of {scheduleTeamCount(competitionFormat,minTeams,maxTeams)} teams; actual team count is checked again before start.</div><p className="rule-help">The rest interval starts after the estimated game duration. Example: a 2:00 PM tip-off, 150-minute game, and 30-minute rest schedules the next game at 4:30 PM. A team is scheduled at most once per day.</p></Panel>
      <Panel title="Timeout rules"><div className="field-grid">{numberField('firstHalfTimeouts','Timeouts · first half (Q1–Q2)')}{numberField('secondHalfTimeouts','Timeouts · second half (Q3–Q4)')}{numberField('fourthQuarterTimeoutRestrictionMinutes','Q4 timeout restriction window (minutes)')}{numberField('finalTwoMinuteTimeoutMax','Maximum remaining in Q4 restriction window')}{numberField('timeoutDurationSeconds','Timeout duration (seconds)')}{toggleField('headCoachRequestRequired','Require Head Coach request at scorer’s table')}</div></Panel>
      <Panel title="Fouls and ejections"><div className="field-grid">{numberField('playerFoulLimit','Personal fouls before disqualification')}{numberField('teamFoulPenaltyAt','Team foul penalty starts at foul number')}{numberField('teamFoulFreeThrows','Free throws for each defensive team foul at penalty')}{numberField('technicalFreeThrows','Free throws for a technical foul')}{numberField('ejectionTechnicalLimit','Ejection at technical fouls')}{numberField('ejectionUnsportsmanlikeLimit','Ejection at unsportsmanlike fouls')}{numberField('ejectionMixedTechnicalLimit','Mixed ejection · technical fouls')}{numberField('ejectionMixedUnsportsmanlikeLimit','Mixed ejection · unsportsmanlike fouls')}</div></Panel>
      <Panel title="Overtime and game clock"><div className="field-grid">{numberField('overtimeTimeouts','Timeouts per team · each overtime')}{numberField('clockStopLastMinutes','Clock stops during final minutes')}{toggleField('carryFourthQuarterFoulsToOvertime','Carry Q4 team fouls into first overtime')}{toggleField('runningClockEnabled','Use running time')}{toggleField('clockStopInSecondQuarter','Stop clock in final minutes of Q2')}{toggleField('clockStopInFourthQuarter','Stop clock in final minutes of Q4')}</div><p className="rule-help">These values are saved with the competition and copied into each new game's rule snapshot.</p></Panel></>}
      <Panel title="Standings tie-breakers"><div className="rule-list"><div><span className="drag">1</span><b>Wins</b><Pill tone="neutral">1st</Pill></div><div><span className="drag">2</span><b>Head-to-head result</b><Pill tone="neutral">2nd</Pill></div><div><span className="drag">3</span><b>Point difference</b><Pill tone="neutral">3rd</Pill></div></div><small className="muted">Default tie-break order for this competition.</small></Panel>
    </div><aside className="side-summary"><Panel title="Saved parameters"><div className="version-card"><span className="version-icon"><Sparkles size={17}/></span><b>Basketball · Custom rules</b><Pill tone="soft-blue">{activeCompetition ? `VERSION ${activeCompetition.rule_version}` : 'DATABASE DEFAULTS'}</Pill><small>Shared defaults and personal overrides are stored in Supabase.</small></div><div className="note-box"><CircleHelp size={16}/><span>New competitions use your personal defaults when saved, otherwise the shared database defaults.</span></div><div className="table-actions"><Button onClick={()=>void saveMyDefaults()} disabled={!rules}>Save as my defaults</Button><Button onClick={()=>void restoreSharedDefaults()} disabled={!rules}>Restore shared defaults</Button></div><button className="text-link full-link" onClick={() => { setRulesError(''); setRules(activeCompetition?.rule_settings ?? null); if (!activeCompetition) setDefaultsRetry(value=>value+1); setSaved(false); }}>Reload saved rules <ArrowRight size={14}/></button></Panel></aside></div></fieldset>{activeCompetition&&registrationTab!=='Competition details'&&<section className="sports-registration" style={{marginTop:20,display:'grid',gap:16}}>
        <style>{`.sports-registration .sr-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:20px;min-width:0}.sports-registration .sr-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.sports-registration .sr-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.sports-registration .sr-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.sports-registration .sr-box{border:1px solid #e2e8f0;border-radius:12px;padding:16px;display:grid;gap:10px;min-width:0}.sports-registration .sr-muted{font-size:12px;color:#64748b}.sports-registration .sr-tabs{display:flex;gap:8px;flex-wrap:wrap}.sports-registration .sr-tabs button{display:inline-flex;align-items:center;gap:7px;border:1px solid #e2e8f0;border-radius:9px;padding:9px 13px;background:white;cursor:pointer}.sports-registration .sr-tabs button[aria-selected=true]{border-color:#f97316;background:#fff7ed;color:#c2410c;font-weight:700}.sports-registration .sr-csv{width:100%;min-height:108px;resize:vertical;box-sizing:border-box;font-family:monospace}.sports-registration .sr-roster{width:100%;border-collapse:collapse}.sports-registration .sr-roster td,.sports-registration .sr-roster th{padding:11px;text-align:left;border-bottom:1px solid #e2e8f0}.sports-registration .sr-import-table{min-width:680px}.sports-registration .sr-import-table td,.sports-registration .sr-import-table th{padding:8px}.sports-registration .sr-import-table input,.sports-registration .sr-import-table select{width:100%;min-width:90px;box-sizing:border-box;padding:8px 9px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;font:inherit;font-size:13px}.sports-registration .sr-import-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.sports-registration .sr-compact-action{min-height:30px!important;padding:5px 9px!important;font-size:12px!important}.sports-registration .sr-row-remove{min-height:28px!important;padding:5px 8px!important;font-size:11px!important}.sports-registration .sr-bar{height:9px;background:#e2e8f0;border-radius:20px;overflow:hidden}.sports-registration .sr-bar span{display:block;height:100%;background:#f97316}.sports-registration .sr-button{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:10px 12px;cursor:pointer}.sports-registration .sr-button:disabled{opacity:.45;cursor:not-allowed}.sports-registration .sr-file{display:block;max-width:100%;font-size:12px}.sports-registration .sr-notice{background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px;color:#9a3412;font-size:12px}@media(max-width:800px){.sports-registration .sr-grid,.sports-registration .sr-actions{grid-template-columns:1fr}}`}</style>
        {registrationTab==='Registration'&&<div className="sr-card">
          <div className="sr-head"><div><div className="sr-muted" style={{fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',color:'#c2410c'}}>Step 1 · Roster import</div><h3 style={{margin:'4px 0 5px'}}>Add teams and players</h3><div className="sr-muted">Upload a CSV or edit roster rows directly. Missing teams and players are created automatically; existing records are reused.</div></div><Pill tone={activeCompetition.status==='APPROVED'?'soft-green':'neutral'}>{activeCompetition.status==='APPROVED'?'READY':'LOCKED'}</Pill></div>
          <div className="sr-import-toolbar" style={{marginTop:16}}>
            <input ref={csvInputRef} aria-label="Choose team and player CSV" type="file" accept=".csv,text/csv" hidden disabled={activeCompetition.status!=='APPROVED'} onChange={e=>{const file=e.target.files?.[0];if(file)void loadBulkCsv(file);e.currentTarget.value='';}}/>
            <Button className="sr-compact-action" disabled={activeCompetition.status!=='APPROVED'} onClick={()=>csvInputRef.current?.click()}><Upload size={14}/>Upload CSV</Button>
            {csvFileName&&<span className="sr-muted" title={csvFileName}>{csvFileName}</span>}
            <span className="sr-muted">Columns: team, player, jersey #, position</span>
            <Button className="sr-compact-action" onClick={()=>{const content='team_name,player_name,jersey_number,position\nNorth Falcons,Alex Cruz,7,PG\nNorth Falcons,John Reyes,12,SG\n';const blob=new Blob([content],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='competition_registration_template.csv';a.click();URL.revokeObjectURL(url);}}><Download size={14}/>Template</Button>
            <Button className="sr-compact-action" disabled={activeCompetition.status!=='APPROVED'} onClick={()=>setBulkRows(rows=>[...rows,{team_name:'',player_name:'',jersey_number:'',position:''}])}><Plus size={14}/>Add row</Button>
          </div>
          <div className="table-wrap" style={{marginTop:10}}><table className="sr-roster sr-import-table"><thead><tr><th>TEAM NAME</th><th>PLAYER NAME</th><th>JERSEY #</th><th>POSITION</th><th aria-label="Row actions"/></tr></thead><tbody>{bulkRows.map((row,index)=><tr key={index}>
            <td><input aria-label={`Row ${index+1} team name`} value={row.team_name} disabled={activeCompetition.status!=='APPROVED'} onChange={e=>setBulkRows(rows=>rows.map((item,i)=>i===index?{...item,team_name:e.target.value}:item))}/></td>
            <td><input aria-label={`Row ${index+1} player name`} value={row.player_name} disabled={activeCompetition.status!=='APPROVED'} onChange={e=>setBulkRows(rows=>rows.map((item,i)=>i===index?{...item,player_name:e.target.value}:item))}/></td>
            <td><input aria-label={`Row ${index+1} jersey number`} type="number" min="0" max="99" value={row.jersey_number} disabled={activeCompetition.status!=='APPROVED'} onChange={e=>setBulkRows(rows=>rows.map((item,i)=>i===index?{...item,jersey_number:e.target.value}:item))}/></td>
            <td><select aria-label={`Row ${index+1} position`} value={row.position} disabled={activeCompetition.status!=='APPROVED'} onChange={e=>setBulkRows(rows=>rows.map((item,i)=>i===index?{...item,position:e.target.value}:item))}><option value="">Select</option>{['PG','SG','SF','PF','C'].map(position=><option key={position} value={position}>{position}</option>)}</select></td>
            <td><button type="button" className="sr-button sr-row-remove" aria-label={`Remove row ${index+1}`} disabled={activeCompetition.status!=='APPROVED'||bulkBusy} onClick={()=>setBulkRows(rows=>rows.length===1?[{team_name:'',player_name:'',jersey_number:'',position:''}]:rows.filter((_,i)=>i!==index))}>Remove</button></td>
          </tr>)}</tbody></table></div>
          <div className="sr-head" style={{marginTop:12}}><div className="sr-muted">{bulkRows.filter(row=>Object.values(row).some(value=>value.trim())).length} rows ready to validate</div><div className="sr-import-toolbar"><Button className="sr-compact-action" disabled={activeCompetition.status!=='APPROVED'||bulkBusy||!bulkRows.some(row=>Object.values(row).some(value=>value.trim()))} onClick={()=>void bulkRegister()}><Upload size={14}/>{bulkBusy?'Importing…':'Validate & import'}</Button></div></div>
          <div className="sr-muted" style={{marginTop:8}}>Jersey number (0–99) and position are required. Logos and player photos can be added in Team and Player management.</div>
        </div>}
        {registrationTab==='Registration'&&<div className="sr-card">
          <div className="sr-head"><div><h3 style={{margin:'0 0 5px'}}>Teams, players & fixtures</h3><div className="sr-muted">Register participants, validate eligibility and review generated matches.</div></div><Pill tone={activeCompetition.status==='APPROVED'?'soft-green':'neutral'}>{activeCompetition.status.replaceAll('_',' ')}</Pill></div>
          <div className="sr-grid" style={{marginTop:16}}>
            <div className="sr-box"><div className="sr-muted">REGISTERED TEAMS</div><strong style={{fontSize:25}}>{registeredTeams.length} <span className="sr-muted">/ {activeCompetition.min_teams} minimum</span></strong><div className="sr-bar"><span style={{width:`${Math.min(100,registeredTeams.length/Math.max(1,activeCompetition.min_teams)*100)}%`}}/></div></div>
            <div className="sr-box"><div className="sr-muted">ASSIGNED PLAYERS</div><strong style={{fontSize:25}}>{registeredPlayers.length}</strong><span className="sr-muted">Across registered teams</span></div>
            <div className="sr-box"><div className="sr-muted">GENERATED MATCHES</div><strong style={{fontSize:25}}>{matches.length}</strong><span className="sr-muted">Fixtures and championship progression</span></div>
          </div>
          <div className="sr-notice" style={{marginTop:14}}>{activeCompetition.status==='APPROVED' ? `Registration is open. Required: ${activeCompetition.min_teams}–${activeCompetition.max_teams} teams. Rules are locked. Start competition after registration is complete.` : 'Registration is locked after the competition starts. Existing rosters and fixtures are available to view.'}</div>
        </div>}
        {registrationTab==='Registration'&&activeCompetition.status!=='APPROVED'&&activeCompetition.status!=='ACTIVE'&&activeCompetition.status!=='COMPLETED'&&<div className="sr-card"><div className="sr-notice">Registration is closed while this competition is {activeCompetition.status.replaceAll('_',' ').toLowerCase()}. It opens after owner approval.</div></div>}
        <div className="sr-card">
          {registrationTab==='Registration' && <div style={{marginTop:18,display:'grid',gap:16}}>
            {activeCompetition.status==='APPROVED' && <div className="sr-actions">
              <div className="sr-box"><strong>Register an existing team</strong><div className="sr-muted">Choose a team from your organization.</div><label>Team<select value={selectedTeam} onChange={e=>setSelectedTeam(e.target.value)}><option value="">Choose team</option>{teamsData.rows.filter(x=>x.active).map(t=><option key={t.id} value={t.id}>{t.name} ({competitionRosterDetails.filter(r=>r.team_id===t.id&&r.status==='ACTIVE').length} active)</option>)}</select></label><Button variant="primary" onClick={()=>void registerTeam(selectedTeam).then(()=>reloadRegistrations()).catch(e=>setRulesError(String(e)))} disabled={!selectedTeam||busy}>Register team</Button></div>
              <div className="sr-box"><strong>Assign existing players</strong><div className="sr-muted">Choose a registered team, then select multiple players. Players already on another team in this competition cannot be selected.</div><label>Registered team<select value={selectedTeam} onChange={e=>{setSelectedTeam(e.target.value);setSelectedPlayers([]);}}><option value="">Choose registered team</option>{registeredTeams.map(t=><option key={t.team_id} value={t.team_id}>{teamsData.rows.find(x=>x.id===t.team_id)?.name??'Unknown team'} ({registeredPlayers.filter(r=>r.team_id===t.team_id).length} players)</option>)}</select></label><label>Players ({selectedPlayers.length} selected)</label><div style={{border:'1px solid #dbe3ee',borderRadius:9,maxHeight:190,overflowY:'auto',padding:9,margin:'8px 0'}}>{!selectedTeam?<span className="sr-muted">Select a registered team first.</span>:playersData.rows.filter(p=>p.active&&!registeredPlayers.some(r=>r.player_id===p.id)).length===0?<span className="sr-muted">No unassigned players available.</span>:playersData.rows.filter(p=>p.active&&!registeredPlayers.some(r=>r.player_id===p.id)).map(p=><label key={p.id} style={{display:'flex',gap:9,alignItems:'center',padding:'5px 2px',cursor:'pointer'}}><input type="checkbox" checked={selectedPlayers.includes(p.id)} onChange={e=>setSelectedPlayers(current=>e.target.checked?[...current,p.id]:current.filter(id=>id!==p.id))}/>{p.first_name} {p.last_name}</label>)}</div><Button onClick={()=>void assignSelectedPlayers()} disabled={!selectedTeam||selectedPlayers.length===0||busy}>Assign {selectedPlayers.length||''} player{selectedPlayers.length===1?'':'s'}</Button></div>
            </div>}
            <div className="sr-card" style={{padding:16,background:'#fbfdff'}}><div className="sr-head" style={{marginBottom:10}}><div><h4 style={{margin:'0 0 4px'}}>Registered team rosters</h4><div className="sr-muted">Open a team to review its players, jersey numbers, and positions.</div></div><Pill>{registeredTeams.length} teams</Pill></div><div className="table-wrap"><table className="sr-roster"><thead><tr><th>TEAM</th><th>PLAYERS</th><th>ROSTER</th><th>ACTIONS</th></tr></thead><tbody>{registeredTeams.length===0?<tr><td colSpan={4} className="sr-muted">No teams registered yet. Add a team or use the table above.</td></tr>:registeredTeams.map(t=>{const teamName=teamsData.rows.find(x=>x.id===t.team_id)?.name??'Unknown team';const teamPlayers=registeredPlayers.filter(x=>x.team_id===t.team_id);const expanded=expandedRoster===t.team_id;return <tr key={t.team_id}><td><strong>{teamName}</strong></td><td><Pill>{teamPlayers.length} players</Pill></td><td><button type="button" className="sr-button" aria-expanded={expanded} onClick={()=>setExpandedRoster(current=>current===t.team_id?null:t.team_id)}>{expanded?'Hide players':'View players'} <ChevronDown size={14} style={{transform:expanded?'rotate(180deg)':undefined,transition:'transform .15s'}}/></button>{expanded&&<div style={{marginTop:12,padding:12,border:'1px solid #dbe3ee',borderRadius:10,background:'#f8fafc',minWidth:450}}><div className="sr-head" style={{marginBottom:8}}><strong>{teamName} roster</strong><span className="sr-muted">{teamPlayers.length} assigned</span></div>{teamPlayers.length?<div style={{overflowX:'auto'}}><table className="sr-roster" style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:8}}><thead><tr><th>PLAYER</th><th>JERSEY</th><th>POSITION</th><th>STATUS</th></tr></thead><tbody>{teamPlayers.map(player=>{const profile=playersData.rows.find(p=>p.id===player.player_id);const detail=competitionRosterDetails.find(r=>r.team_id===player.team_id&&r.player_id===player.player_id);return <tr key={player.player_id}><td><span style={{display:'inline-flex',alignItems:'center',gap:9}}><span className="avatar lavender" style={{width:30,height:30,fontSize:11}}>{profile?`${profile.first_name[0]??''}${profile.last_name[0]??''}`:'?'}</span><strong>{profile?`${profile.first_name} ${profile.last_name}`:'Unknown player'}</strong></span></td><td><Pill>#{detail?.jersey_number??'—'}</Pill></td><td>{detail?.position??'—'}</td><td><Pill tone={detail?.status==='ACTIVE'?'soft-green':'neutral'}>{detail?.status??'Not on season roster'}</Pill></td></tr>;})}</tbody></table></div>:<div className="empty-state">No players are assigned to this team yet.</div>}</div>}</td><td><button type="button" className="sr-button" style={{color:'#b91c1c',borderColor:'#fecaca'}} disabled={busy||activeCompetition?.status!=='APPROVED'} onClick={()=>setRemoveTeamTarget(t.team_id)}>Remove</button></td></tr>})}</tbody></table></div></div>
          </div>}
          {registrationTab==='Fixtures & bracket' && <div style={{marginTop:18}}>{matches.length===0?<div className="sr-notice">No fixtures yet. Register eligible teams and start the competition to generate matches.</div>:<><div className="sr-head" style={{marginBottom:16}}><div><h4 style={{margin:'0 0 5px'}}>Competition fixtures</h4><div className="sr-muted">Matchups and results are read from Supabase. Future-round participants appear when assigned.</div></div><div style={{display:'flex',gap:8}}><Button onClick={()=>void reloadRegistrations()}>Refresh</Button><Button variant={fixtureView==='Bracket'?'primary':undefined} onClick={()=>setFixtureView('Bracket')}>Bracket view</Button><Button variant={fixtureView==='Match list'?'primary':undefined} onClick={()=>setFixtureView('Match list')}>Match list</Button></div></div>{fixtureView==='Bracket'&&activeCompetition.format==='SINGLE_ELIMINATION'?<div className="sr-bracket-scroll"><div className="sr-bracket-grid" style={{gridTemplateColumns:`repeat(${Math.max(...matches.map(m=>m.round_no))},minmax(210px,1fr))`}}>{Array.from({length:Math.max(...matches.map(m=>m.round_no))},(_,index)=>{const round=index+1;const roundMatches=matches.filter(m=>m.round_no===round).sort((a,b)=>a.slot_no-b.slot_no);return <div key={round} className="sr-bracket-round"><div className="sr-bracket-title">{round===Math.max(...matches.map(m=>m.round_no))?'Championship':round===Math.max(...matches.map(m=>m.round_no))-1?'Semifinals':round===1?'Quarterfinals / Round 1':`Round ${round}`}</div><div className="sr-bracket-stack">{roundMatches.map(m=>{const game=fixtureGames.find(g=>g.id===m.game_id);const home=teamsData.rows.find(t=>t.id===m.home_team_id)?.name??'To be decided';const away=teamsData.rows.find(t=>t.id===m.away_team_id)?.name??'To be decided';const finalized=game?.status==='FINAL';return <div key={m.id} className="sr-bracket-match"><div className="sr-bracket-match-label">Match {m.slot_no} · {game?.status??m.status}</div><div className="sr-bracket-side"><span title={home}>{home}</span><b>{game&&m.home_team_id?game.home_score:'—'}</b></div><div className="sr-bracket-side"><span title={away}>{away}</span><b>{game&&m.away_team_id?game.away_score:'—'}</b></div>{finalized&&<div className="sr-bracket-final">Final result</div>}</div>;})}</div></div>;})}</div></div>:fixtureView==='Bracket'?<div className="sr-notice">Graphical elimination brackets apply to Single Elimination. Use Match list for this format.</div>:null}{(fixtureView==='Match list'||activeCompetition.format!=='SINGLE_ELIMINATION')&&<div className="table-wrap"><table className="sr-roster"><thead><tr><th>ROUND</th><th>MATCH</th><th>HOME</th><th>AWAY</th><th>SCORE</th><th>STATUS</th></tr></thead><tbody>{matches.map(m=>{const g=fixtureGames.find(x=>x.id===m.game_id);return <tr key={m.id}><td>{m.round_no}</td><td>{m.slot_no}</td><td>{teamsData.rows.find(t=>t.id===m.home_team_id)?.name??'TBD'}</td><td>{teamsData.rows.find(t=>t.id===m.away_team_id)?.name??'TBD'}</td><td>{g?`${g.home_score}–${g.away_score}`:'—'}</td><td>{g?.status??m.status}</td></tr>;})}</tbody></table></div>}</>}</div>}
          {registrationTab==='Games' && <div style={{marginTop:18,display:'grid',gap:16}}>
            <div className="sr-tabs" role="tablist" aria-label="Competition games views"><button type="button" role="tab" aria-selected={competitionGamesTab==='Summary'} onClick={()=>setCompetitionGamesTab('Summary')}><Activity size={15}/>Summary</button><button type="button" role="tab" aria-selected={competitionGamesTab==='Game list'} onClick={()=>setCompetitionGamesTab('Game list')}><CalendarDays size={15}/>Game list <span style={{marginLeft:2}}>({fixtureGames.length})</span></button><button type="button" role="tab" aria-selected={competitionGamesTab==='Calendar'} onClick={()=>setCompetitionGamesTab('Calendar')}><CalendarDays size={15}/>Calendar</button></div>
            {competitionGamesTab==='Summary'?<>
              <div className="sr-grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))'}}>
                <div className="sr-box"><div className="sr-muted">TOTAL GAMES</div><strong style={{fontSize:25}}>{fixtureGames.length}</strong></div>
                <div className="sr-box"><div className="sr-muted">SCHEDULED</div><strong style={{fontSize:25}}>{fixtureGames.filter(game=>game.status==='SCHEDULED'||game.status==='DRAFT').length}</strong></div>
                <div className="sr-box"><div className="sr-muted">LIVE</div><strong style={{fontSize:25}}>{fixtureGames.filter(game=>game.status==='LIVE').length}</strong></div>
                <div className="sr-box"><div className="sr-muted">FINAL</div><strong style={{fontSize:25}}>{fixtureGames.filter(game=>game.status==='FINAL').length}</strong></div>
              </div>
              <div className="sr-head"><h4 style={{margin:0}}>Next games</h4><div style={{display:'flex',gap:8}}>{activeCompetition.status==='ACTIVE'&&rules?.scheduleStartDate&&fixtureGames.some(game=>!game.scheduled_at)&&<Button onClick={()=>void scheduleGamesNow()} disabled={busy}><CalendarDays size={14}/>Apply schedule</Button>}<Button onClick={()=>void reloadRegistrations()}><RefreshCw size={15}/>Refresh</Button></div></div>
              <div className="table-wrap"><table className="sr-roster"><thead><tr><th>DATE & TIP-OFF</th><th>HOME</th><th>AWAY</th><th>SCORE</th><th>STATUS</th><th></th></tr></thead><tbody>{fixtureGames.slice().sort((a,b)=>(a.scheduled_at??'').localeCompare(b.scheduled_at??'')).slice(0,5).map(game=><tr key={game.id}><td>{game.scheduled_at?new Date(game.scheduled_at).toLocaleString():'Unscheduled'}</td><td><TeamPageLink id={game.home_team?.id} name={game.home_team?.name??'—'}/></td><td><TeamPageLink id={game.away_team?.id} name={game.away_team?.name??'—'}/></td><td>{game.home_score}–{game.away_score}</td><td>{game.status}</td><td><OpenGameLink id={game.id}/></td></tr>)}</tbody></table>{fixtureGames.length===0&&<div className="sr-notice">No games are linked to this competition yet. Start the competition to generate its schedule.</div>}</div>
            </>:competitionGamesTab==='Calendar'?<GamesCalendar games={fixtureGames} compact/>:<>
              <div className="sr-head"><span/><div style={{display:'flex',gap:8}}>{activeCompetition.status==='ACTIVE'&&rules?.scheduleStartDate&&fixtureGames.some(game=>!game.scheduled_at)&&<Button onClick={()=>void scheduleGamesNow()} disabled={busy}><CalendarDays size={14}/>Apply schedule</Button>}<Button onClick={()=>void reloadRegistrations()}><RefreshCw size={15}/>Refresh</Button></div></div>
              <div className="table-wrap"><table className="sr-roster"><thead><tr><th>DATE & TIP-OFF</th><th>HOME</th><th>AWAY</th><th>SCORE</th><th>STATUS</th><th></th></tr></thead><tbody>{fixtureGames.slice().sort((a,b)=>(a.scheduled_at??'').localeCompare(b.scheduled_at??'')).map(game=><tr key={game.id}><td>{game.scheduled_at?new Date(game.scheduled_at).toLocaleString():'Unscheduled'}</td><td><TeamPageLink id={game.home_team?.id} name={game.home_team?.name??'—'}/></td><td><TeamPageLink id={game.away_team?.id} name={game.away_team?.name??'—'}/></td><td>{game.home_score}–{game.away_score}</td><td>{game.status}</td><td><OpenGameLink id={game.id}/></td></tr>)}</tbody></table>{fixtureGames.length===0&&<div className="sr-notice">No games are linked to this competition yet.</div>}</div>
            </>}
          </div>}
        </div>
        {registrationTab==='Registration'&&activeCompetition.status==='APPROVED'&&<div className="sr-card"><div className="sr-head"><div><h4 style={{margin:'0 0 5px'}}>Competition readiness</h4><div className="sr-muted">Minimum {activeCompetition.min_teams}, maximum {activeCompetition.max_teams} teams. Starting generates fixtures and activates the competition.</div></div><Button variant="primary" disabled={busy||teamLimitInvalid||bracketCountInvalid||startOwnerOnly} onClick={()=>setStartConfirmation(true)}><Play size={15}/> Start competition</Button></div>{startBlockedReasons.length>0?<div role="alert" style={{marginTop:14,padding:16,border:'1px solid #fca5a5',borderLeft:'5px solid #dc2626',borderRadius:10,background:'#fff1f2',color:'#991b1b'}}><strong style={{display:'flex',alignItems:'center',gap:8}}><AlertTriangle size={18}/> Competition cannot start yet</strong><ul style={{margin:'10px 0 0',paddingLeft:22,lineHeight:1.65}}>{startBlockedReasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul><div style={{marginTop:8,fontSize:13}}>To use all 10 teams, create a new Round Robin competition and register them there; approved competition rules remain locked.</div></div>:<div style={{marginTop:12,padding:12,border:'1px solid #86efac',borderRadius:10,background:'#f0fdf4',color:'#166534'}}>Team count is eligible. The owner can start the competition and generate fixtures.</div>}</div>}
      </section>}
</>}
  </>;
}

function DataPage({ title, subtitle, action, columns, rows, tabs }: { title: string; subtitle: string; action: string; columns: string[]; rows: Row[]; tabs?: string[] }) {
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

type DirectoryRow = { id: string; name?: string; code?: string | null; first_name?: string; last_name?: string; active?: boolean; photo_path?: string|null; logo_path?: string|null };
type StatEvent={id:string;game_id:string;player_id:string|null;event_type:string;points:number;reversed_event_id:string|null};
function averagePlayerStats(events:StatEvent[],playerId:string){
  const reversed=new Set(events.map(event=>event.reversed_event_id).filter(Boolean));const rows=events.filter(event=>event.player_id===playerId&&event.event_type!=='REVERSAL'&&!reversed.has(event.id));const games=new Set(rows.map(event=>event.game_id)).size;
  const totals={points:0,rebounds:0,assists:0,steals:0,blocks:0,turnovers:0};for(const event of rows){totals.points+=event.points;if(event.event_type.startsWith('REBOUND_'))totals.rebounds++;if(event.event_type==='ASSIST')totals.assists++;if(event.event_type==='STEAL')totals.steals++;if(event.event_type==='BLOCK')totals.blocks++;if(event.event_type==='TURNOVER')totals.turnovers++;}
  return {games,...Object.fromEntries(Object.entries(totals).map(([key,value])=>[key,games?value/games:0]))} as {games:number;points:number;rebounds:number;assists:number;steals:number;blocks:number;turnovers:number};
}
function WorkspaceDirectory({ kind, onTeamSelect, onPlayerSelect, initialTeamId }: { kind: 'teams' | 'players'; onTeamSelect?: (team: DirectoryRow) => void; onPlayerSelect?: (player:DirectoryRow)=>void; initialTeamId?:string|null }) {
  const isTeams = kind === 'teams';
  const title = isTeams ? 'Teams' : 'Players';
  const [open, setOpen] = useState(false); const [saving, setSaving] = useState(false); const [formError, setFormError] = useState('');
  const [busyId,setBusyId]=useState('');const [actionError,setActionError]=useState('');const [logoBusyId,setLogoBusyId]=useState('');
  const data=useWorkspaceRows<DirectoryRow>(kind,isTeams?'id,name,code,logo_path,active,created_at':'id,first_name,last_name,photo_path,active,created_at');
  const appliedInitialTeam=useRef<string|null>(null);
  useEffect(()=>{if(isTeams&&initialTeamId&&initialTeamId!==appliedInitialTeam.current&&!data.loading){const row=data.rows.find(item=>item.id===initialTeamId);if(row){appliedInitialTeam.current=initialTeamId;onTeamSelect?.(row);}}},[isTeams,initialTeamId,data.loading,data.rows,onTeamSelect]);
  type RosterDirectoryRow={id:string;team_id:string;player_id:string;season_id:string;jersey_number:number|null;position:string|null;status:string;players?:{first_name:string;last_name:string}|null;seasons?:{name:string}|null;teams?:{name:string}|null};
  const rosterData=useWorkspaceRows<RosterDirectoryRow>('rosters','id,team_id,player_id,season_id,jersey_number,position,status,created_at,players(first_name,last_name),seasons(name),teams(name)');
  const statsData=useWorkspaceRows<StatEvent>('game_events','id,game_id,player_id,event_type,points,reversed_event_id,created_at');
  const [photoUrls,setPhotoUrls]=useState<Record<string,string>>({});
  useEffect(()=>{let cancelled=false;const withPhotos=data.rows.filter(row=>isTeams?row.logo_path:row.photo_path);void Promise.all(withPhotos.map(async row=>{const path=isTeams?row.logo_path!:row.photo_path!;const bucket=isTeams?'team-logos':'player-photos';const {data:photo}=await supabase.storage.from(bucket).createSignedUrl(path,3600);return photo?.signedUrl?([row.id,photo.signedUrl] as const):null;})).then(items=>{if(!cancelled)setPhotoUrls(Object.fromEntries(items.filter((item):item is readonly [string,string]=>Boolean(item))));});return()=>{cancelled=true;};},[data.rows,isTeams]);
  const playersData=useWorkspaceRows<{id:string;first_name:string;last_name:string;active:boolean}>('players','id,first_name,last_name,active,created_at');
  const seasonsData=useWorkspaceRows<{id:string;name:string;active:boolean}>('seasons','id,name,active,created_at');
  const [rosterTeamId,setRosterTeamId]=useState('');const [rosterSeasonId,setRosterSeasonId]=useState('');const [rosterPlayerId,setRosterPlayerId]=useState('');const [rosterError,setRosterError]=useState('');const [rosterSaving,setRosterSaving]=useState(false);
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
        <div className="table-wrap"><table><thead><tr><th>PLAYER</th><th>TEAM</th><th>SEASON</th><th>JERSEY</th><th>POSITION</th><th>STATUS</th><th /></tr></thead>
          <tbody>{rosterData.rows.map(row => <tr key={row.id}><td>{row.players ? `${row.players.first_name} ${row.players.last_name}` : 'Player'}</td><td>{data.rows.find(team => team.id === row.team_id)?.name ?? row.team_id.slice(0, 8)}</td><td>{row.seasons?.name ?? '—'}</td><td>{row.jersey_number ?? '—'}</td><td>{row.position ?? '—'}</td><td>{row.status}</td><td><Button onClick={async () => { try { await rosterData.update(row.id, { status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }); } catch (e) { setRosterError(e instanceof Error ? e.message : 'Unable to update roster status.'); } }}>{row.status === 'ACTIVE' ? 'Remove' : 'Reactivate'}</Button></td></tr>)}</tbody>
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

// Team and Player master-data CSV imports. Competition CSV remains a separate workflow.
function MasterBulkImport({kind,onImported}:{kind:'teams'|'players';onImported:()=>void}) {
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

export function Teams() {
  const [searchParams,setSearchParams]=useSearchParams();const initialTeamId=searchParams.get('team');
  const [tab,setTab]=useState<'Summary'|'Team list'>(()=>initialTeamId?'Team list':'Summary');const [selectedTeam,setSelectedTeam]=useState<DirectoryRow|null>(null);const [refreshKey,setRefreshKey]=useState(0);
  const openTeam=(team:DirectoryRow|null)=>{setSelectedTeam(team);if(team){setTab('Team list');const next=new URLSearchParams(searchParams);next.delete('team');setSearchParams(next,{replace:true});}};
  return <><PageTitle eyebrow="TEAM MANAGEMENT" title="Team" subtitle="Team overview, standings, and roster details for your organization."/><div className="tab-row">{(['Summary','Team list'] as const).map(value=><button key={value} className={tab===value?'selected':''} onClick={()=>{setTab(value);setSelectedTeam(null);}}>{value}</button>)}</div>{tab==='Summary'?<TeamSummary/>:selectedTeam?<TeamDetails team={selectedTeam} onBack={()=>setSelectedTeam(null)}/>:<><MasterBulkImport kind="teams" onImported={()=>setRefreshKey(value=>value+1)}/><BulkTeamLogoUpload onUploaded={()=>setRefreshKey(value=>value+1)}/><WorkspaceDirectory key={refreshKey} kind="teams" onTeamSelect={openTeam} initialTeamId={initialTeamId}/></>}</>;
}
export function Players() {
  const [tab,setTab]=useState<'Summary'|'Player list'>('Summary');const [selectedPlayer,setSelectedPlayer]=useState<DirectoryRow|null>(null);const [refreshKey,setRefreshKey]=useState(0);
  return <><PageTitle eyebrow="PLAYER MANAGEMENT" title="Player" subtitle="Player overview, scoring leaderboard, and player directory."/><div className="tab-row">{(['Summary','Player list'] as const).map(value=><button key={value} className={tab===value?'selected':''} onClick={()=>{setTab(value);setSelectedPlayer(null);}}>{value}</button>)}</div>{tab==='Summary'?<PlayerSummary/>:selectedPlayer?<PlayerDetails key={selectedPlayer.id} player={selectedPlayer} onBack={()=>setSelectedPlayer(null)}/>:<><MasterBulkImport kind="players" onImported={()=>setRefreshKey(value=>value+1)}/><BulkPlayerPhotoUpload onUploaded={()=>setRefreshKey(value=>value+1)}/><WorkspaceDirectory key={refreshKey} kind="players" onPlayerSelect={setSelectedPlayer}/></>}</>;
}

function TeamSummary() {
  type Team={id:string;name:string;active:boolean};type Game={home_team_id:string;away_team_id:string;home_score:number;away_score:number;status:string};
  const teams=useWorkspaceRows<Team>('teams','id,name,active,created_at');const games=useWorkspaceRows<Game>('games','home_team_id,away_team_id,home_score,away_score,status,created_at');
  const finalGames=games.rows.filter(game=>game.status==='FINAL');
  const standings=teams.rows.map(team=>{const stat={played:0,wins:0,losses:0,pointsFor:0,pointsAgainst:0};for(const game of finalGames){if(game.home_team_id!==team.id&&game.away_team_id!==team.id)continue;const home=game.home_team_id===team.id;const scored=home?game.home_score:game.away_score;const allowed=home?game.away_score:game.home_score;stat.played++;stat.pointsFor+=scored;stat.pointsAgainst+=allowed;if(scored>allowed)stat.wins++;else stat.losses++;}return {...team,...stat};}).sort((a,b)=>b.wins-a.wins||(b.pointsFor-b.pointsAgainst)-(a.pointsFor-a.pointsAgainst));
  return <><DataState loading={teams.loading||games.loading} error={teams.error||games.error} onRetry={()=>{void teams.reload();void games.reload();}}/><div className="metrics-grid"><Metric label="TEAMS" value={String(teams.rows.filter(team=>team.active).length)} note="Active teams" icon={Users}/><Metric label="GAMES PLAYED" value={String(finalGames.length)} note="Final results" icon={Activity} tone="orange"/><Metric label="UPCOMING" value={String(games.rows.filter(game=>game.status==='SCHEDULED').length)} note="Scheduled games" icon={CalendarDays} tone="purple"/><Metric label="TOTAL TEAMS" value={String(teams.rows.length)} note="Active and inactive" icon={Trophy} tone="green"/></div><Panel title="Team standings"><div className="table-wrap"><table><thead><tr><th>RANK</th><th>TEAM</th><th>GP</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>DIFF</th></tr></thead><tbody>{standings.map((team,index)=><tr key={team.id}><td>{index+1}</td><td>{team.name}</td><td>{team.played}</td><td>{team.wins}</td><td>{team.losses}</td><td>{team.pointsFor}</td><td>{team.pointsAgainst}</td><td>{team.pointsFor-team.pointsAgainst}</td></tr>)}</tbody></table>{!teams.loading&&!standings.length&&<div className="empty-state">Add teams to see the league standings.</div>}</div></Panel></>;
}

function TeamDetails({team,onBack}:{team:DirectoryRow;onBack:()=>void}) {
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

function PlayerSummary() {
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

function PlayerDetails({player,onBack}:{player:DirectoryRow;onBack:()=>void}) {
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

function BulkPlayerPhotoUpload({onUploaded}:{onUploaded:()=>void}) {
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

function BulkTeamLogoUpload({onUploaded}:{onUploaded:()=>void}) {
  type TeamOption={id:string;name:string;logo_path:string|null};type Assignment={file:File;teamId:string};
  const teams=useWorkspaceRows<TeamOption>('teams','id,name,logo_path,created_at');const [assignments,setAssignments]=useState<Assignment[]>([]);const [saving,setSaving]=useState(false);const [progress,setProgress]=useState('');const [error,setError]=useState('');const [notice,setNotice]=useState('');const [inputKey,setInputKey]=useState(0);
  function normalized(value:string){return value.toLowerCase().replace(/\.[^.]+$/,'').replace(/[^a-z0-9]/g,'');}
  function chooseFiles(files:FileList|null){const selected=Array.from(files??[]);setAssignments(selected.map(file=>{const key=normalized(file.name);const match=teams.rows.find(team=>key.includes(normalized(team.name)));return {file,teamId:match?.id??''};}));setError('');setNotice('');}
  const assigned=assignments.map(row=>row.teamId).filter(Boolean);const duplicate=assigned.some((id,index)=>assigned.indexOf(id)!==index);const invalid=assignments.some(row=>!supportedImageTypes.has(row.file.type)||row.file.size>5*1024*1024);
  async function upload(){setSaving(true);setProgress('');setError('');setNotice('');let uploaded=0;try{const workspace=await getWorkspace();for(let index=0;index<assignments.length;index++){const {file,teamId}=assignments[index];const team=teams.rows.find(row=>row.id===teamId);if(!team)throw new Error(`Choose a team for ${file.name}.`);if(!supportedImageTypes.has(file.type)||file.size>5*1024*1024)throw new Error(`${file.name} must be a JPG, PNG, WebP, or GIF smaller than 5 MB.`);setProgress(`Uploading ${index+1} of ${assignments.length}…`);const safeName=file.name.toLowerCase().replace(/[^a-z0-9._-]/g,'-');const path=`${workspace.id}/${team.id}/${crypto.randomUUID()}-${safeName}`;const {error:uploadError}=await supabase.storage.from('team-logos').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});if(uploadError)throw uploadError;const {error:updateError}=await supabase.from('teams').update({logo_path:path}).eq('id',team.id).eq('organization_id',workspace.id);if(updateError){await supabase.storage.from('team-logos').remove([path]);throw updateError;}if(team.logo_path?.startsWith(`${workspace.id}/`))await supabase.storage.from('team-logos').remove([team.logo_path]);uploaded++;}setNotice(`${uploaded} team logo${uploaded===1?'':'s'} uploaded and assigned.`);setAssignments([]);setInputKey(value=>value+1);}catch(e){const message=e instanceof Error?e.message:'Unable to upload team logos.';setError(uploaded?`${uploaded} logo${uploaded===1?' was':'s were'} saved before the next upload failed: ${message}`:message);}finally{if(uploaded>0)onUploaded();setSaving(false);setProgress('');}}
  return <Panel title="Bulk team logo upload" action={<ImagePlus size={17}/>}><p className="muted">Choose multiple images, then assign each one to a team. Matching filenames are suggested automatically.</p><label className="button secondary" style={{display:'inline-flex',width:'fit-content',cursor:teams.loading?'not-allowed':'pointer',opacity:teams.loading ? .6 : 1}}><Upload size={15}/>Choose images<input key={inputKey} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden disabled={teams.loading||teams.rows.length===0} onChange={event=>chooseFiles(event.target.files)}/></label>{teams.loading&&<div className="rule-help">Loading teams…</div>}{teams.error&&<div className="form-error">{teams.error}</div>}{!teams.loading&&!teams.error&&!teams.rows.length&&<div className="rule-help">Create a team before uploading its logo.</div>}{assignments.length>0&&<div className="table-wrap" style={{marginTop:12}}><table><thead><tr><th>IMAGE FILE</th><th>TEAM</th><th>SIZE</th></tr></thead><tbody>{assignments.map((row,index)=><tr key={`${row.file.name}-${index}`}><td>{row.file.name}</td><td><select aria-label={`Assign ${row.file.name} to team`} value={row.teamId} onChange={event=>setAssignments(current=>current.map((item,rowIndex)=>rowIndex===index?{...item,teamId:event.target.value}:item))}><option value="">Choose team</option>{teams.rows.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></td><td>{(row.file.size/1024).toFixed(0)} KB</td></tr>)}</tbody></table></div>}{duplicate&&<div className="form-error">Choose a different team for each image.</div>}{invalid&&<div className="form-error">Images must be supported and under 5 MB each.</div>}{error&&<div className="form-error" role="alert">{error}</div>}{notice&&<div className="success-banner"><CheckCircle2 size={17}/>{notice}</div>}{progress&&<div className="rule-help">{progress}</div>}{assignments.length>0&&<div className="form-footer"><span className="muted">Team logos · maximum 5 MB each</span><Button variant="primary" onClick={()=>void upload()} disabled={saving||duplicate||invalid||assignments.some(row=>!row.teamId)||teams.loading}>{saving?'Uploading…':'Upload and assign'}</Button></div>}</Panel>;
}
type RegistrationRow = { id: string; status: 'PENDING' | 'APPROVED' | 'RETURNED'; submitted_at: string; review_note?: string | null; players?: { first_name: string; last_name: string } | null; teams?: { name: string } | null };
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
export function Games() {
  const [tab,setTab]=useState<'Summary'|'Game list'>('Summary');
  type SummaryGame={id:string;status:string;scheduled_at:string|null;home_score:number;away_score:number;home_team?:{id:string;name:string};away_team?:{id:string;name:string}};
  const games=useWorkspaceRows<SummaryGame>('games','id,status,scheduled_at,home_score,away_score,created_at,home_team:teams!games_home_team_id_fkey(id,name),away_team:teams!games_away_team_id_fkey(id,name)');
  const live=games.rows.filter(game=>game.status==='LIVE');const scheduled=games.rows.filter(game=>game.status==='SCHEDULED');const finals=games.rows.filter(game=>game.status==='FINAL');
  return <><PageTitle eyebrow="GAME DAY" title="Games" subtitle="Game schedule, live matches, and finalized results." action={<Link className="button primary" to="/games/live"><Radio size={16}/>Live scoring</Link>}/><div className="tab-row">{(['Summary','Game list'] as const).map(value=><button key={value} className={tab===value?'selected':''} onClick={()=>setTab(value)}>{value}{value==='Game list'&&<span>{games.rows.length}</span>}</button>)}</div>{tab==='Summary'?<><DataState loading={games.loading} error={games.error} onRetry={()=>void games.reload()}/><div className="metrics-grid"><Metric label="LIVE NOW" value={String(live.length)} note="In progress" icon={Radio} tone="orange"/><Metric label="SCHEDULED" value={String(scheduled.length)} note="Upcoming games" icon={CalendarDays} tone="blue"/><Metric label="FINAL" value={String(finals.length)} note="Officially finalized" icon={CheckCircle2} tone="green"/><Metric label="ALL GAMES" value={String(games.rows.length)} note="Current organization" icon={Activity} tone="purple"/></div><div className="dashboard-grid"><Panel title="Next games" action={<button className="text-link" onClick={()=>setTab('Game list')}>Full game list <ArrowRight size={14}/></button>}><div className="table-wrap"><table><thead><tr><th>DATE</th><th>MATCHUP</th><th>SCORE</th><th>STATUS</th><th></th></tr></thead><tbody>{games.rows.slice().sort((a,b)=>(a.scheduled_at??'').localeCompare(b.scheduled_at??'')).slice(0,8).map(game=><tr key={game.id}><td>{game.scheduled_at?new Date(game.scheduled_at).toLocaleString():'—'}</td><td><TeamPageLink id={game.home_team?.id} name={game.home_team?.name??'Home'}/> vs <TeamPageLink id={game.away_team?.id} name={game.away_team?.name??'Away'}/></td><td>{game.home_score} – {game.away_score}</td><td><Pill tone={game.status==='LIVE'?'live':game.status==='FINAL'?'soft-green':'neutral'}>{game.status}</Pill></td><td><OpenGameLink id={game.id}/></td></tr>)}</tbody></table>{!games.loading&&!games.rows.length&&<div className="empty-state">Schedule the first matchup to start the league.</div>}</div></Panel><Panel title="Game actions"><div className="review-checks"><Link to="/games/live">Open live scoring <ArrowRight size={14}/></Link><Link to="/games/review">Review and finalize results <ArrowRight size={14}/></Link><Link to="/standings">View standings <ArrowRight size={14}/></Link><Link to="/reports">Reports & analytics <ArrowRight size={14}/></Link><Link to="/public/live">Public scoreboard <ArrowRight size={14}/></Link></div></Panel></div></>:<GameScheduleList/>}</>;
}

type CalendarGame={id:string;scheduled_at:string|null;status:string;home_score:number;away_score:number;home_team?:{id?:string;name:string}|null;away_team?:{id?:string;name:string}|null;venue?:{name:string}|null};
function TeamPageLink({id,name}:{id?:string|null;name:string}){return id?<Link className="text-link" to={`/teams?team=${encodeURIComponent(id)}`}>{name}</Link>:<span>{name}</span>;}
function OpenGameLink({id}:{id:string}){return <Link className="button secondary" style={{padding:'6px 9px',fontSize:12}} to={`/games/live?game=${encodeURIComponent(id)}`}><Play size={13}/>Open game</Link>;}
function GamesCalendar({games,compact=false}:{games:CalendarGame[];compact?:boolean}){
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
  const chooseCell=(cell:{dateKey:string;inMonth:boolean})=>{setSelectedDate(cell.dateKey);if(!cell.inMonth){const date=new Date(`${cell.dateKey}T12:00:00`);setMonth(new Date(date.getFullYear(),date.getMonth(),1));}};
  const today=()=>{const key=todayManilaDateKey();setSelectedDate(key);setMonth(new Date(`${key}T12:00:00`));};
  return <>
    <div className="sr-head" style={{padding:compact?'0':'10px 0'}}><div><strong>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',weekday:'short',month:'short',day:'numeric',year:'numeric'})}</strong><div className="muted tiny">{selectedGames.length} games on this day · {games.length} scheduled total</div></div><Button variant="secondary" onClick={()=>setCalendarOpen(true)}><CalendarDays size={15}/>Choose date</Button></div>
    {calendarOpen&&<div role="presentation" onClick={()=>setCalendarOpen(false)} style={{position:'fixed',inset:0,zIndex:10000,background:'rgba(15,23,42,.48)',display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(2px)'}}><section role="dialog" aria-modal="true" aria-label="Choose game date" onClick={event=>event.stopPropagation()} style={{width:'min(760px,100%)',maxHeight:'90vh',overflowY:'auto',background:'#fff',border:'1px solid #dbe3ee',borderRadius:16,boxShadow:'0 24px 70px rgba(15,23,42,.28)',padding:compact?16:22,display:'grid',gap:14}}>
      <div className="sr-head"><div><div className="eyebrow">GAME CALENDAR</div><h3 style={{margin:'3px 0'}}>{monthLabel}</h3><div className="muted tiny">Select a date to see its games. Numbers show games scheduled that day.</div></div><div style={{display:'flex',gap:7,alignItems:'center'}}><Button onClick={today}>Today</Button><Button aria-label="Previous month" onClick={()=>shiftMonth(-1)}><ArrowRight size={15} style={{transform:'rotate(180deg)'}}/></Button><Button aria-label="Next month" onClick={()=>shiftMonth(1)}><ArrowRight size={15}/></Button><button type="button" className="icon-button" aria-label="Close calendar" onClick={()=>setCalendarOpen(false)}><X size={18}/></button></div></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:5}}>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day=><div key={day} style={{padding:'7px 3px',textAlign:'center',fontSize:11,fontWeight:800,color:'#64748b'}}>{day}</div>)}{cells.map(cell=>{const count=(gamesByDate.get(cell.dateKey)??[]).length;const selected=cell.dateKey===selectedDate;const isToday=cell.dateKey===todayManilaDateKey();return <button key={cell.dateKey} type="button" onClick={()=>chooseCell(cell)} aria-pressed={selected} aria-label={`${cell.dateKey}${count?`, ${count} games`:''}`} style={{minHeight:56,padding:'6px 7px',textAlign:'left',borderRadius:9,border:selected?'2px solid #f97316':isToday?'1px solid #fdba74':'1px solid #e2e8f0',background:selected?'#fff7ed':'#fff',color:cell.inMonth?'#172033':'#94a3b8',cursor:'pointer'}}><span style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontWeight:selected?800:600,fontSize:13}}>{cell.day}{count>0&&<span style={{minWidth:20,height:20,padding:'0 4px',borderRadius:999,background:'#ffedd5',color:'#c2410c',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800}}>{count}</span>}</span>{isToday&&<small style={{display:'block',fontSize:9,color:'#c2410c',marginTop:4}}>Today</small>}</button>;})}</div>
      <div style={{borderTop:'1px solid #e2e8f0',paddingTop:12}}><div className="sr-head" style={{marginBottom:8}}><strong>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',weekday:'long',month:'long',day:'numeric',year:'numeric'})}</strong><Pill>{selectedGames.length} games</Pill></div>{selectedGames.length?<div className="table-wrap"><table><thead><tr><th>TIP-OFF</th><th>MATCHUP</th><th>VENUE</th><th>SCORE</th><th>STATUS</th><th></th></tr></thead><tbody>{selectedGames.map(game=><tr key={game.id}><td>{new Date(game.scheduled_at!).toLocaleTimeString('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit'})}</td><td><TeamPageLink id={game.home_team?.id} name={game.home_team?.name??'Home team'}/> <span className="muted">vs</span> <TeamPageLink id={game.away_team?.id} name={game.away_team?.name??'Away team'}/></td><td>{game.venue?.name??'—'}</td><td>{game.home_score}–{game.away_score}</td><td><Pill tone={game.status==='LIVE'?'live':game.status==='FINAL'?'soft-green':'neutral'}>{game.status}</Pill></td><td><OpenGameLink id={game.id}/></td></tr>)}</tbody></table></div>:<div className="empty-state">No games are scheduled for this date.</div>}</div>
      <div style={{display:'flex',justifyContent:'flex-end'}}><Button variant="primary" onClick={()=>setCalendarOpen(false)}>Done</Button></div>
    </section></div>}
  </>;
}
function GameScheduleList() {
  const [scheduleOpen,setScheduleOpen]=useState(false);
  const [saved,setSaved]=useState(false);
  const [scheduleView,setScheduleView]=useState<'List'|'Calendar'>('List');
  type TeamChoice = { id: string; name: string };
  type VenueChoice = { id: string; name: string };
  type CompetitionChoice = { id: string; name: string; league_id: string | null; season_id: string | null };
  type LeagueChoice = { id: string; name: string };
  type GameRow = { id: string; competition_id: string | null; scheduled_at: string | null; status: string; home_score: number; away_score: number; home_team?: TeamChoice; away_team?: TeamChoice; venue?: VenueChoice | null };
  const gamesData = useWorkspaceRows<GameRow>('games','id,competition_id,scheduled_at,status,home_score,away_score,created_at,home_team:teams!games_home_team_id_fkey(id,name),away_team:teams!games_away_team_id_fkey(id,name),venue:venues(id,name)');
  const teamsData = useWorkspaceRows<TeamChoice>('teams','id,name,created_at');
  const venuesData = useWorkspaceRows<VenueChoice>('venues','id,name,created_at');
  const competitionsData = useWorkspaceRows<CompetitionChoice>('competitions','id,name,league_id,season_id,created_at');
  const leaguesData = useWorkspaceRows<LeagueChoice>('leagues','id,name,created_at');
  const matchups = gamesData.rows;
  const [statusFilter,setStatusFilter]=useState('ALL');const [venueFilter,setVenueFilter]=useState('ALL');
  const [leagueFilter,setLeagueFilter]=useState('ALL');const [competitionFilter,setCompetitionFilter]=useState('ALL');
  const [competitionId,setCompetitionId]=useState('');
  const availableCompetitions=competitionsData.rows.filter(competition=>leagueFilter==='ALL'||competition.league_id===leagueFilter);
  const visibleMatchups=matchups.filter(game=>{
    const competition=competitionsData.rows.find(item=>item.id===game.competition_id);
    return (statusFilter==='ALL'||game.status===statusFilter)
      &&(venueFilter==='ALL'||game.venue?.id===venueFilter)
      &&(leagueFilter==='ALL'||competition?.league_id===leagueFilter)
      &&(competitionFilter==='ALL'||game.competition_id===competitionFilter);
  });
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
    <Panel title="Organization schedule" action={<div style={{display:'flex',gap:8,alignItems:'center'}}><span className="muted tiny">{visibleMatchups.length} shown</span><Button variant={scheduleView==='List'?'primary':undefined} onClick={()=>setScheduleView('List')}><Activity size={14}/>List</Button><Button variant={scheduleView==='Calendar'?'primary':undefined} onClick={()=>setScheduleView('Calendar')}><CalendarDays size={14}/>Calendar</Button></div>}>
      {scheduleView==='Calendar'?<GamesCalendar games={visibleMatchups}/>:<div className="table-wrap"><table><thead><tr><th>DATE & TIP-OFF</th><th>MATCHUP</th><th>LEAGUE</th><th>COMPETITION</th><th>VENUE</th><th>SCORE</th><th>STATUS</th><th></th></tr></thead><tbody>{visibleMatchups.map(game=>{const competition=competitionsData.rows.find(item=>item.id===game.competition_id);const league=leaguesData.rows.find(item=>item.id===competition?.league_id);return <tr key={game.id}><td>{game.scheduled_at ? new Date(game.scheduled_at).toLocaleString() : 'Unscheduled'}</td><td><div className="matchup-cell"><TeamPageLink id={game.home_team?.id} name={game.home_team?.name ?? 'Home team'}/><span className="muted">vs</span><TeamPageLink id={game.away_team?.id} name={game.away_team?.name ?? 'Away team'}/></div></td><td>{league?.name??'—'}</td><td>{competition?.name??'—'}</td><td>{game.venue?.name ?? '—'}</td><td>{game.home_score} – {game.away_score}</td><td><Pill tone={game.status==='LIVE'?'live':game.status==='FINAL'?'soft-green':'neutral'}>{game.status}</Pill></td><td><OpenGameLink id={game.id}/></td></tr>;})}</tbody></table>{!gamesData.loading && visibleMatchups.length === 0 && <div className="empty-state">No games match these filters.</div>}</div>}
    </Panel>
    <div className="schedule-notes"><span><CheckCircle2 size={15}/> Schedule changes are saved in Supabase</span><Link to="/games/review">Open result review <ArrowRight size={14}/></Link></div>
    {scheduleOpen && <div className="modal-scrim" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setScheduleOpen(false);}}><form className="schedule-modal" onSubmit={createMatchup}><div className="modal-heading"><div><span className="eyebrow">GAME SCHEDULING</span><h2>Schedule a matchup</h2><p>Choose a competition, teams, venue, date, and tip-off time.</p></div><button type="button" className="icon-button" onClick={()=>setScheduleOpen(false)}>×</button></div><div className="field-grid"><label className="span-2">Competition<select value={competitionId} onChange={e=>setCompetitionId(e.target.value)}><option value="">No competition</option>{competitionsData.rows.map(competition=><option key={competition.id} value={competition.id}>{leaguesData.rows.find(league=>league.id===competition.league_id)?.name ? `${leaguesData.rows.find(league=>league.id===competition.league_id)?.name} · ` : ''}{competition.name}</option>)}</select></label><label>Home team<select value={home} onChange={e=>setHome(e.target.value)} required>{teamsData.rows.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Away team<select value={away} onChange={e=>setAway(e.target.value)} required>{teamsData.rows.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Date<input name="date" type="date" required/></label><label>Tip-off time<input name="time" type="time" required/></label><label className="span-2">Venue<select name="venue"><option value="">No venue selected</option>{venuesData.rows.map(venue=><option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label></div>{(!teamsData.rows.length || home===away) && <div className="form-error">Add at least two different teams before scheduling.</div>}{saveError && <div className="form-error">{saveError}</div>}<div className="modal-footer"><Button onClick={()=>setScheduleOpen(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={saving || teamsData.rows.length < 2}>{saving ? 'Saving…' : <><CalendarDays size={15}/> Save matchup</>}</Button></div></form></div>}
  </>;
}

type LiveTeam = 'Warriors' | 'Falcons';
type LivePlayer = { name: string; number: string; position: string; onCourt: boolean; disqualified?: boolean; stats: Record<string, number> };
type PendingPass = { team: LiveTeam; passer: LivePlayer; receiver: LivePlayer };
type PendingFreeThrows = { team: LiveTeam; remaining: number; reason: string; resumeTeam?: LiveTeam };
type LiveEvent = { id: number; time: string; name: string; number: string; action: string; side: LiveTeam; points: number; playerName?: string; stat?: string; statDeltas?: Record<string, number>; substitution?: { outNumber: string; inNumber: string }; clockChange?: { remaining: number; period: string }; pass?: { passerNumber: string; receiverNumber: string }; teamFoul?: boolean; freeThrowsAwarded?: { team: LiveTeam; count: number }; freeThrowsBefore?: PendingFreeThrows; disqualification?: string };
const startingPlayers: Record<LiveTeam, LivePlayer[]> = {
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

function LiveGamePrototype() {
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

export function LiveGame() {
  const [searchParams]=useSearchParams();const requestedGameId=searchParams.get('game');
  type LiveDbGame={id:string;status:string;scheduled_at:string|null;home_score:number;away_score:number;current_period:number;clock_ms:number;home_team_id:string;away_team_id:string;home_team?:{name:string};away_team?:{name:string}};
  type RosterPlayer={id:string;team_id:string;player_id:string;jersey_number:number|null;position:string|null;status:string;players?:{first_name:string;last_name:string}|null};
  type DbEvent={id:string;game_id:string;team_id:string;player_id:string|null;event_type:string;period:number;clock_ms:number;points:number;created_at:string};
  const games=useWorkspaceRows<LiveDbGame>('games','id,status,scheduled_at,home_score,away_score,current_period,clock_ms,home_team_id,away_team_id,created_at,home_team:teams!games_home_team_id_fkey(name),away_team:teams!games_away_team_id_fkey(name)');
  const roster=useWorkspaceRows<RosterPlayer>('rosters','id,team_id,player_id,jersey_number,position,status,created_at,players(first_name,last_name)');
  const events=useWorkspaceRows<DbEvent>('game_events','id,game_id,team_id,player_id,event_type,period,clock_ms,points,created_at');
  const [gameId,setGameId]=useState('');const [teamId,setTeamId]=useState('');const [playerId,setPlayerId]=useState('');const [eventType,setEventType]=useState('2PT_MADE');const [period,setPeriod]=useState(1);const [clockText,setClockText]=useState('10:00');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const playableGames=games.rows.filter(row=>row.status!=='DRAFT');
  useEffect(()=>{if(requestedGameId&&playableGames.some(row=>row.id===requestedGameId)){setGameId(requestedGameId);return;}if(!gameId){const preferred=playableGames.find(row=>row.status==='LIVE')??playableGames.find(row=>row.status==='SCHEDULED')??playableGames[0];if(preferred)setGameId(preferred.id);}},[requestedGameId,gameId,playableGames]);
  const [clockNow,setClockNow]=useState(()=>Date.now());useEffect(()=>{const timer=window.setInterval(()=>setClockNow(Date.now()),15000);return()=>window.clearInterval(timer);},[]);const game=playableGames.find(row=>row.id===gameId);const gameDateLocked=!!game&&game.status==='SCHEDULED'&&(!game.scheduled_at||clockNow<new Date(game.scheduled_at).getTime());const selectedTeam=game&&(teamId===game.away_team_id?game.away_team_id:game.home_team_id);const selectedRoster=roster.rows.filter(row=>row.team_id===selectedTeam&&row.status==='ACTIVE');const gameEvents=events.rows.filter(row=>row.game_id===gameId).slice(0,20);
  useEffect(()=>{if(game&&!teamId)setTeamId(game.home_team_id);if(selectedRoster.length&&!selectedRoster.some(row=>row.player_id===playerId))setPlayerId(selectedRoster[0].player_id);},[game?.id,game?.home_team_id,selectedRoster,playerId,teamId]);
  useEffect(()=>{if(game){setPeriod(game.current_period);setClockText(`${Math.floor(game.clock_ms/60000)}:${String(Math.floor(game.clock_ms/1000)%60).padStart(2,'0')}`);}},[game?.id,game?.current_period,game?.clock_ms]);
  async function startGame(){if(!game)return;if(game.status!=='SCHEDULED'){setError('Only scheduled games can be started.');return;}if(!game.scheduled_at||Date.now()<new Date(game.scheduled_at).getTime()){setError(game.scheduled_at?`This game is locked until ${new Date(game.scheduled_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'} )}.`:'Set a schedule date and time before starting this game.');return;}setBusy(true);setError('');const {error:updateError}=await supabase.from('games').update({status:'LIVE'}).eq('id',game.id);if(updateError)setError(updateError.message);else{setNotice('Game is live.');await games.reload();}setBusy(false);}
  async function saveClock(){if(!game)return;const match=clockText.match(/^(\d{1,2}):([0-5]\d)$/);if(!match||period<1||period>20){setError('Enter a period from 1 to 20 and clock time in MM:SS.');return;}setBusy(true);setError('');const clock_ms=(Number(match[1])*60+Number(match[2]))*1000;const {error:updateError}=await supabase.from('games').update({current_period:period,clock_ms}).eq('id',game.id);if(updateError)setError(updateError.message);else{setNotice('Period and clock saved.');await games.reload();}setBusy(false);}
  async function recordEvent(){if(!game||!games.workspace||!selectedTeam)return;setBusy(true);setError('');setNotice('');try{await api('/api/game-events',{method:'POST',body:JSON.stringify({game_id:game.id,organization_id:games.workspace.id,team_id:selectedTeam,player_id:playerId||null,event_type:eventType,period:game.current_period,clock_ms:game.clock_ms})});setNotice('Event saved to the game log.');await Promise.all([games.reload(),events.reload()]);}catch(e){setError(e instanceof Error?e.message:'Unable to save game event.');}finally{setBusy(false);}}
  const liveError=games.error||roster.error||events.error;
  return <><PageTitle eyebrow="GAME DAY OPERATIONS" title="Live scoring" subtitle="Game events and score changes are saved through the authenticated sports API." action={<Button onClick={()=>{void games.reload();void events.reload();}}><Activity size={15}/>Refresh</Button>}/><DataState loading={games.loading||roster.loading||events.loading} error={liveError} onRetry={()=>{void games.reload();void roster.reload();void events.reload();}}/>{error&&<div className="form-error" role="alert">{error}</div>}{notice&&<div className="success-banner"><CheckCircle2 size={17}/>{notice}</div>}{playableGames.length>0&&<label className="game-select-label">Game<select value={gameId} onChange={e=>{setGameId(e.target.value);setTeamId('');setPlayerId('');}}>{playableGames.map(row=><option key={row.id} value={row.id}>{row.home_team?.name??'Home'} vs {row.away_team?.name??'Away'} · {row.status}</option>)}</select></label>}{game&&<><div className="review-score"><div><span>{game.home_team?.name??'Home team'}</span><strong>{game.home_score}</strong></div><Pill tone={game.status==='LIVE'?'live':game.status==='FINAL'?'soft-green':'soft-orange'}>{game.status}</Pill><div><span>{game.away_team?.name??'Away team'}</span><strong>{game.away_score}</strong></div></div>{game.status==='SCHEDULED'&&<><Button variant="primary" onClick={()=>void startGame()} disabled={busy||gameDateLocked}><Play size={15}/>Start game</Button>{gameDateLocked&&<div className="callout" role="status">{game.scheduled_at?`This game is locked until ${new Date(game.scheduled_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}. It can start at that time or later.`:'This game is locked until a schedule date is assigned.'}</div>}</>}<div className="form-layout"><div className="form-main"><Panel title="Game clock"><div className="field-grid"><label>Period<input type="number" min="1" max="20" value={period} onChange={e=>setPeriod(Number(e.target.value))}/></label><label>Time remaining<input value={clockText} onChange={e=>setClockText(e.target.value)} placeholder="MM:SS" pattern="[0-9]{1,2}:[0-5][0-9]"/></label></div><div className="form-footer"><span className="muted">Events use the saved period and time.</span><Button onClick={()=>void saveClock()} disabled={busy||game.status==='FINAL'||gameDateLocked}>Save clock</Button></div></Panel><Panel title="Record event"><div className="field-grid"><label>Team<select value={teamId||game.home_team_id} onChange={e=>{setTeamId(e.target.value);setPlayerId('');}}><option value={game.home_team_id}>{game.home_team?.name??'Home team'}</option><option value={game.away_team_id}>{game.away_team?.name??'Away team'}</option></select></label><label>Player<select value={playerId} onChange={e=>setPlayerId(e.target.value)}><option value="">Team event</option>{selectedRoster.map(row=><option key={row.player_id} value={row.player_id}>{row.players?`${row.players.first_name} ${row.players.last_name}`:'Player'}{row.jersey_number===null?'':` · #${row.jersey_number}`}</option>)}</select></label><label>Event<select value={eventType} onChange={e=>setEventType(e.target.value)}>{[['FT_MADE','Free throw made'],['2PT_MADE','2 point made'],['3PT_MADE','3 point made'],['REBOUND_OFF','Offensive rebound'],['REBOUND_DEF','Defensive rebound'],['ASSIST','Assist'],['STEAL','Steal'],['BLOCK','Block'],['TURNOVER','Turnover'],['FOUL','Foul'],['TIMEOUT','Timeout']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div><div className="form-footer"><span className="muted">Period {game.current_period} · {Math.floor(game.clock_ms/60000)}:{String(Math.floor(game.clock_ms/1000)%60).padStart(2,'0')}</span><Button variant="primary" onClick={()=>void recordEvent()} disabled={busy||game.status!=='LIVE'}>{busy?'Saving…':'Save event'}</Button></div>{game.status!=='LIVE'&&<div className="rule-help">Start the scheduled game before recording events.</div>}</Panel></div><aside className="side-summary"><Panel title="Recent play-by-play"><div className="table-wrap"><table><thead><tr><th>EVENT</th><th>POINTS</th></tr></thead><tbody>{gameEvents.map(row=><tr key={row.id}><td>{row.event_type.replaceAll('_',' ')}</td><td>{row.points}</td></tr>)}</tbody></table>{!gameEvents.length&&<div className="empty-state">No events recorded yet.</div>}</div></Panel></aside></div></>}{!games.loading&&!game&&<div className="empty-state">No playable game is ready. TBD bracket rounds become available as earlier games are finalized.</div>}</>;
}

export function GameReview() {
  type ReviewGame={id:string;status:string;home_score:number;away_score:number;home_team?:{name:string};away_team?:{name:string};scheduled_at:string|null};
  type ReviewEvent={id:string;game_id:string;player_id:string|null;event_type:string;points:number;reversed_event_id:string|null};
  const games=useWorkspaceRows<ReviewGame>('games','id,status,home_score,away_score,scheduled_at,created_at,home_team:teams!games_home_team_id_fkey(name),away_team:teams!games_away_team_id_fkey(name)');
  const events=useWorkspaceRows<ReviewEvent>('game_events','id,game_id,player_id,event_type,points,reversed_event_id,created_at');
  const [gameId,setGameId]=useState('');const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const reviewableGames=games.rows.filter(row=>row.status!=='DRAFT');
  useEffect(()=>{if(!gameId&&reviewableGames[0])setGameId(reviewableGames[0].id);},[gameId,reviewableGames]);
  const game=reviewableGames.find(row=>row.id===gameId);const gameEvents=events.rows.filter(row=>row.game_id===gameId);const reversed=new Set(gameEvents.map(row=>row.reversed_event_id).filter(Boolean));const activeEvents=gameEvents.filter(row=>row.event_type!=='REVERSAL'&&!reversed.has(row.id));
  async function finalize(){if(!game)return;setSaving(true);setError('');setNotice('');const {error:rpcError}=await supabase.rpc('finalize_game',{p_game_id:game.id});if(rpcError)setError(rpcError.message);else{setNotice('Official result finalized and added to the audit log.');await games.reload();}setSaving(false);}
  const canFinalize=game?.status==='LIVE';
  return <><PageTitle eyebrow="RESULT REVIEW" title="Review & finalize" subtitle="Review a saved game before confirming its official result." action={<Button variant="primary" onClick={()=>void finalize()} disabled={!canFinalize||saving}><ShieldCheck size={16}/>{saving?'Finalizing…':'Finalize result'}</Button>}/><DataState loading={games.loading||events.loading} error={games.error||events.error} onRetry={()=>{void games.reload();void events.reload();}}/>{reviewableGames.length>0&&<label className="game-select-label">Game<select value={gameId} onChange={e=>setGameId(e.target.value)}>{reviewableGames.map(row=><option key={row.id} value={row.id}>{row.home_team?.name??'Home'} vs {row.away_team?.name??'Away'} · {row.status} · {row.id.slice(0,8)}</option>)}</select></label>}{error&&<div className="form-error">{error}</div>}{notice&&<div className="success-banner"><CheckCircle2 size={17}/>{notice}</div>}{game&&<><div className="review-score"><div><span>{game.home_team?.name??'Home team'}</span><strong>{game.home_score}</strong></div><Pill tone={game.status==='FINAL'?'soft-green':'soft-orange'}>{game.status}</Pill><div><span>{game.away_team?.name??'Away team'}</span><strong>{game.away_score}</strong></div></div><div className="metrics-grid compact"><Metric label="EVENTS" value={String(activeEvents.length)} note="Saved, non-reversed events" icon={Activity}/><Metric label="GAME STATUS" value={game.status} note="Database status" icon={Wifi}/><Metric label="SCORE CHECK" value={game.home_score>=0&&game.away_score>=0?'Passed':'Review'} note="Non-negative totals" icon={CheckCircle2} tone="green"/><Metric label="SCHEDULED" value={game.scheduled_at?new Date(game.scheduled_at).toLocaleDateString():'—'} note="Organization time" icon={CalendarDays} tone="purple"/></div><Panel title="Scoring events"><div className="table-wrap"><table><thead><tr><th>PLAYER ID</th><th>EVENT</th><th>POINTS</th></tr></thead><tbody>{activeEvents.slice().reverse().map(event=><tr key={event.id}><td>{event.player_id?event.player_id.slice(0,8):'Team event'}</td><td>{event.event_type.replaceAll('_',' ')}</td><td>{event.points}</td></tr>)}</tbody></table>{!activeEvents.length&&<div className="empty-state">No scoring events are recorded for this game.</div>}</div><div className="review-checks"><span><CheckCircle2 size={15}/> Score loaded from database</span><span><CheckCircle2 size={15}/> Reversed events excluded</span><span><CheckCircle2 size={15}/> Finalization is audited</span></div></Panel></>}{!games.loading&&!game&&<div className="empty-state">No games are available for review.</div>}</>;
}

export function Standings() {
  type StandingGame={id:string;home_team_id:string;away_team_id:string;home_score:number;away_score:number;status:string};
  const games=useWorkspaceRows<StandingGame>('games','id,home_team_id,away_team_id,home_score,away_score,status,created_at');
  const teams=useWorkspaceRows<{id:string;name:string;active:boolean}>('teams','id,name,active,created_at');
  const completed=games.rows.filter(game=>game.status==='FINAL');
  const rows=teams.rows.filter(team=>team.active).map(team=>{const stats={gp:0,w:0,l:0,pf:0,pa:0};completed.filter(g=>g.home_team_id===team.id||g.away_team_id===team.id).forEach(g=>{const home=g.home_team_id===team.id;const scored=home?g.home_score:g.away_score;const against=home?g.away_score:g.home_score;stats.gp++;stats.pf+=scored;stats.pa+=against;if(scored>against)stats.w++;else stats.l++;});return {...team,...stats,diff:stats.pf-stats.pa};}).sort((a,b)=>{if(a.w!==b.w)return b.w-a.w;const meetings=completed.filter(game=>(game.home_team_id===a.id&&game.away_team_id===b.id)||(game.home_team_id===b.id&&game.away_team_id===a.id));const aHead=meetings.reduce((sum,game)=>sum+(game.home_team_id===a.id?Number(game.home_score>game.away_score):Number(game.away_score>game.home_score)),0);const bHead=meetings.reduce((sum,game)=>sum+(game.home_team_id===b.id?Number(game.home_score>game.away_score):Number(game.away_score>game.home_score)),0);return bHead-aHead||b.diff-a.diff||b.pf-a.pf;});
  return <><PageTitle title="Standings" subtitle="Calculated from finalized games in your organization." action={<Button><Download size={15}/> Export</Button>}/><DataState loading={games.loading||teams.loading} error={games.error||teams.error} onRetry={()=>{void games.reload();void teams.reload();}}/><div className="callout"><Trophy size={18}/><span>Current organization · all finalized games</span></div><Panel title="League table"><div className="table-wrap"><table><thead><tr><th>RANK</th><th>TEAM</th><th>GP</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>DIFF</th><th>PTS</th></tr></thead><tbody>{rows.map((team,index)=><tr key={team.id}><td><span className={`rank ${index<2?'top':''}`}>{String(index+1).padStart(2,'0')}</span></td><td><span className="table-team">{team.name}</span></td><td>{team.gp}</td><td>{team.w}</td><td>{team.l}</td><td>{team.pf}</td><td>{team.pa}</td><td className={team.diff>=0?'positive':'negative'}>{team.diff>0?'+':''}{team.diff}</td><td><b>{team.w*2}</b></td></tr>)}</tbody></table>{!games.loading&&!rows.length&&<div className="empty-state">Add teams and finalize games to calculate standings.</div>}</div></Panel></>;
}

type PublicGame={id:string;organization_name:string;current_period:number;clock_ms:number;home_score:number;away_score:number;home_team_name:string;away_team_name:string};
type PublicEvent={id:string;game_id:string;event_type:string;period:number;clock_ms:number;points:number;team_name:string;player_name:string|null;created_at:string;organization_id:string};
export function PublicLive() {
  const [games,setGames]=useState<PublicGame[]>([]);const [events,setEvents]=useState<PublicEvent[]>([]);const [gameId,setGameId]=useState('');const [tab,setTab]=useState<'Play-by-play'|'Box score'|'Team stats'>('Play-by-play');const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [updated,setUpdated]=useState<Date|null>(null);
  useEffect(()=>{let active=true;const load=async()=>{try{const workspace=await getWorkspace();const [gameResult,eventResult]=await Promise.all([supabase.from('public_live_games').select('*').eq('organization_id',workspace.id),supabase.from('public_live_events').select('*').eq('organization_id',workspace.id).order('created_at',{ascending:false}).limit(100)]);if(gameResult.error)throw gameResult.error;if(eventResult.error)throw eventResult.error;if(!active)return;const found=(gameResult.data??[]) as PublicGame[];setGames(found);setEvents((eventResult.data??[]) as PublicEvent[]);setGameId(current=>found.some(row=>row.id===current)?current:found[0]?.id??'');setUpdated(new Date());setError('');}catch(e){if(active)setError(e instanceof Error?e.message:'Public scoreboard is unavailable.');}finally{if(active)setLoading(false);}};void load();const timer=window.setInterval(()=>void load(),10000);return()=>{active=false;window.clearInterval(timer);};},[]);
  const game=games.find(row=>row.id===gameId);const gameEvents=events.filter(row=>row.game_id===gameId);const clock=game?`${Math.floor(game.clock_ms/60000)}:${String(Math.floor(game.clock_ms/1000)%60).padStart(2,'0')}`:'—';
  return <><PageTitle eyebrow="PUBLIC SCOREBOARD" title={game?.organization_name??'Live game'} subtitle="Read-only live scores. Player names appear only when public name consent is approved." action={<Pill tone="soft-green">PUBLIC VIEW</Pill>}/>{loading&&<div className="empty-state">Loading public scores…</div>}{error&&<div className="form-error" role="alert">{error}</div>}{games.length>1&&<label className="game-select-label">Live game<select value={gameId} onChange={e=>setGameId(e.target.value)}>{games.map(row=><option key={row.id} value={row.id}>{row.home_team_name} vs {row.away_team_name}</option>)}</select></label>}{game&&<div className="public-score"><div className="public-score-head"><Pill tone="live"><span className="pulse-dot"/> LIVE</Pill><span>Period {game.current_period} · {clock} remaining</span><span className="muted">{updated?`Updated ${updated.toLocaleTimeString()}`:''}</span></div><div className="public-match"><div><span className="team-mark blue-mark large-mark">{game.home_team_name.slice(0,2).toUpperCase()}</span><h2>{game.home_team_name}</h2><strong>{game.home_score}</strong></div><span className="versus">—</span><div><span className="team-mark orange-mark large-mark">{game.away_team_name.slice(0,2).toUpperCase()}</span><h2>{game.away_team_name}</h2><strong>{game.away_score}</strong></div></div><div className="public-tabs">{(['Play-by-play','Box score','Team stats'] as const).map(value=><button key={value} className={tab===value?'selected':''} onClick={()=>setTab(value)}>{value}</button>)}</div>{tab==='Play-by-play'&&gameEvents.map(row=><div className="public-play" key={row.id}><span>{row.period} · {Math.floor(row.clock_ms/60000)}:{String(Math.floor(row.clock_ms/1000)%60).padStart(2,'0')}</span><b>{row.player_name??row.team_name}</b><span>{row.event_type.replaceAll('_',' ')}</span><span className={row.points?'positive':''}>{row.points?`+${row.points}`:'—'}</span></div>)}{tab==='Box score'&&<div className="empty-state">Player box score totals will appear from recorded events.</div>}{tab==='Team stats'&&<div className="public-play"><b>{game.home_team_name}</b><span>{game.home_score} points</span><span>vs</span><b>{game.away_team_name}</b><span>{game.away_score} points</span></div>}{tab==='Play-by-play'&&!gameEvents.length&&<div className="empty-state">No public game events yet.</div>}</div>}{!loading&&!error&&!game&&<div className="empty-state">No public live game is available. The organization must enable its public portal.</div>}<div className="privacy-foot"><ShieldCheck size={16}/> The public feed excludes registration records, guardian details, and names without approved consent.</div></>;
}

type AnnouncementRow = { id: string; subject: string; message: string; audience: string; published_at: string | null; created_at: string };
export function Announcements() {
  const data=useWorkspaceRows<AnnouncementRow>('announcements','id,subject,message,audience,published_at,created_at');
  const [subject,setSubject]=useState('');const [message,setMessage]=useState('');const [audience,setAudience]=useState('STAFF');const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  async function publish(){setError('');setNotice('');if(!subject.trim()||!message.trim()){setError('Enter a subject and message.');return;}setSaving(true);try{const {data:userData,error:userError}=await supabase.auth.getUser();if(userError||!userData.user)throw new Error('Sign in before publishing an announcement.');await data.insert({author_id:userData.user.id,audience,subject:subject.trim(),message:message.trim(),published_at:new Date().toISOString()});setSubject('');setMessage('');setNotice('Announcement saved to the organization. No email or push message was sent.');}catch(e){setError(e instanceof Error?e.message:'Unable to save announcement.');}finally{setSaving(false);}}
  return <><PageTitle title="Announcements" subtitle="Publish organization updates and review previously saved announcements." action={<Button variant="primary" onClick={()=>void publish()} disabled={saving}>{saving?'Saving…':'Publish announcement'}</Button>}/><DataState loading={data.loading} error={data.error} onRetry={()=>void data.reload()}/>{error&&<div className="form-error" role="alert">{error}</div>}{notice&&<div className="success-banner"><CheckCircle2 size={17}/>{notice}</div>}<div className="form-layout"><div className="form-main"><Panel title="Compose update"><div className="field-grid"><label>Audience<select value={audience} onChange={e=>setAudience(e.target.value)}><option value="STAFF">All league staff</option><option value="TEAM_MANAGERS">Team managers</option><option value="PUBLIC">Public followers</option></select></label><label className="span-2">Subject<input value={subject} onChange={e=>setSubject(e.target.value)} maxLength={180}/></label><label className="span-2">Message<textarea rows={6} value={message} onChange={e=>setMessage(e.target.value)} maxLength={10000}/></label></div><div className="form-footer"><span className="muted">Publishing stores the update for this organization.</span><Button variant="primary" onClick={()=>void publish()} disabled={saving}>{saving?'Saving…':'Publish update'}</Button></div></Panel></div><aside className="side-summary"><Panel title="Recent announcements">{data.rows.slice(0,5).map(item=><div className="report-row" key={item.id}><div><b>{item.subject}</b><small>{item.audience.replaceAll('_',' ')} · {new Date(item.published_at||item.created_at).toLocaleString()}</small><p>{item.message}</p></div></div>)}{!data.loading&&!data.rows.length&&<div className="empty-state">No announcements yet.</div>}</Panel></aside></div></>;
}

type StaffRow = { user_id: string; user_role: string; active: boolean; created_at: string };
type AuditRow = { id: number; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; created_at: string };
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

export function Reports() {
  type ReportGame={id:string;scheduled_at:string|null;home_score:number;away_score:number;status:string;home_team_id:string;away_team_id:string};
  type ReportEvent={id:string;game_id:string;event_type:string;points:number;reversed_event_id:string|null};
  const games=useWorkspaceRows<ReportGame>('games','id,scheduled_at,home_score,away_score,status,home_team_id,away_team_id,created_at');
  const events=useWorkspaceRows<ReportEvent>('game_events','game_id,event_type,points,reversed_event_id,created_at');
  const [error,setError]=useState('');
  const finals=games.rows.filter(game=>game.status==='FINAL');const reversedEvents=new Set(events.rows.map(event=>event.reversed_event_id).filter(Boolean));const validEvents=events.rows.filter(event=>event.event_type!=='REVERSAL'&&!reversedEvents.has(event.id)&&finals.some(game=>game.id===event.game_id));
  const avgPoints=finals.length?finals.reduce((sum,game)=>sum+game.home_score+game.away_score,0)/(finals.length*2):0;
  const average=(type:string)=>finals.length?validEvents.filter(event=>event.event_type===type).length/finals.length:0;
  function exportResults(){try{const lines=[['game_id','scheduled_at','home_score','away_score','status'],...finals.map(game=>[game.id,game.scheduled_at??'',game.home_score,game.away_score,game.status])];const csv=lines.map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(',')).join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const link=document.createElement('a');link.href=url;link.download='eo2mate-final-game-results.csv';link.click();URL.revokeObjectURL(url);setError('');}catch(e){setError(e instanceof Error?e.message:'Unable to export results.');}}
  return <><PageTitle title="Reports & analytics" subtitle="Official game totals and event summaries from the active organization." action={<Button variant="primary" onClick={exportResults}><Download size={16}/> Export final results</Button>}/><DataState loading={games.loading||events.loading} error={games.error||events.error} onRetry={()=>{void games.reload();void events.reload();}}/>{error&&<div className="form-error">{error}</div>}<div className="report-filters"><Pill tone="neutral">{finals.length} finalized games</Pill><span className="muted">Calculated from saved results and events</span></div><div className="metrics-grid"><Metric label="AVG TEAM POINTS" value={avgPoints.toFixed(1)} note="Per finalized game" icon={Activity} tone="orange"/><Metric label="AVG REBOUNDS" value={((average('REBOUND_OFF')+average('REBOUND_DEF'))).toFixed(1)} note="Per game" icon={Users} tone="blue"/><Metric label="AVG ASSISTS" value={average('ASSIST').toFixed(1)} note="Per finalized game" icon={Award} tone="purple"/><Metric label="AVG TURNOVERS" value={average('TURNOVER').toFixed(1)} note="Per finalized game" icon={Flag} tone="green"/></div><div className="dashboard-grid"><Panel title="Finalized score results"><div className="table-wrap"><table><thead><tr><th>DATE</th><th>GAME ID</th><th>SCORE</th><th>STATUS</th></tr></thead><tbody>{finals.map(game=><tr key={game.id}><td>{game.scheduled_at?new Date(game.scheduled_at).toLocaleDateString():'—'}</td><td><code>{game.id.slice(0,8)}</code></td><td>{game.home_score} – {game.away_score}</td><td><Pill tone="soft-green">FINAL</Pill></td></tr>)}</tbody></table>{!finals.length&&<div className="empty-state">Finalized games will appear here.</div>}</div></Panel><Panel title="Event totals">{[['2PT made','2PT_MADE'],['3PT made','3PT_MADE'],['Free throws made','FT_MADE'],['Assists','ASSIST'],['Rebounds','REBOUND_OFF'],['Turnovers','TURNOVER']].map(([label,type])=><div className="report-row" key={type}><div><b>{label}</b></div><strong>{validEvents.filter(event=>event.event_type===type).length}</strong></div>)}</Panel></div></>;
}

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

export function Setup() {
  const [tab,setTab]=useState(()=>new URLSearchParams(window.location.search).get('tab')==='league'?'League & rules':'Organization');const tabs=['Organization','League & rules','Workflow','Registrations','Staff & access','Announcements','Settings'];
  return <><PageTitle eyebrow="ADMINISTRATION" title="Setup" subtitle="Organization, league rules, review, registration, and access controls."/><div className="tab-row">{tabs.map(value=><button key={value} className={tab===value?'selected':''} onClick={()=>setTab(value)}>{value}</button>)}</div>{tab==='Organization'?<GenericPage name="Organization setup"/>:tab==='League & rules'?<Competition/>:tab==='Workflow'?<LeagueWorkflow/>:tab==='Registrations'?<Registrations/>:tab==='Staff & access'?<Access/>:tab==='Announcements'?<Announcements/>:<GenericPage name="Workspace settings"/>}</>;
}

export function GenericPage({ name }: { name: string }) {
  const [orgId,setOrgId]=useState('');const [orgName,setOrgName]=useState('');const [timezone,setTimezone]=useState('Asia/Manila');const [privacyContact,setPrivacyContact]=useState('');const [publicPortal,setPublicPortal]=useState(false);const [canCreate,setCanCreate]=useState(false);const [busy,setBusy]=useState(true);const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [saved,setSaved]=useState(false);
  const load=async()=>{setBusy(true);setError('');setCanCreate(false);try{const workspace=await getWorkspace();const {data,error:queryError}=await supabase.from('organizations').select('id,name,timezone,privacy_contact,public_portal_enabled').eq('id',workspace.id).single();if(queryError)throw queryError;setOrgId(data.id);setOrgName(data.name);setTimezone(data.timezone||'Asia/Manila');setPrivacyContact(data.privacy_contact||'');setPublicPortal(Boolean(data.public_portal_enabled));}catch(e){const message=e instanceof Error?e.message:'Unable to load organization settings.';setError(message);setCanCreate(message.includes('not assigned to an active sports organization'));}finally{setBusy(false);}};
  useEffect(()=>{void load();},[]);
  async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();setSaving(true);setError('');setSaved(false);try{if(!orgId){const slug=orgName.trim().toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+crypto.randomUUID().slice(0,8);const {data,error:rpcError}=await supabase.rpc('create_organization',{p_name:orgName.trim(),p_slug:slug});if(rpcError)throw rpcError;setOrgId(data.id);}else{const {error:updateError}=await supabase.from('organizations').update({name:orgName.trim(),timezone,privacy_contact:privacyContact.trim()||null,public_portal_enabled:publicPortal}).eq('id',orgId);if(updateError)throw updateError;}setSaved(true);if(!orgId)await load();}catch(e){setError(e instanceof Error?e.message:'Unable to save organization settings.');}finally{setSaving(false);}}
  return <><PageTitle eyebrow="WORKSPACE" title={name} subtitle="Manage organization details and public portal visibility."/><DataState loading={busy} error={error&&!canCreate?error:''} onRetry={()=>void load()}/>{error&&canCreate&&<div className="callout">No organization is assigned to this account yet. Create one to start your league workspace.</div>}{saved&&<div className="success-banner"><CheckCircle2 size={17}/>{orgId?'Organization settings saved.':'Organization created.'}</div>}{!busy&&<form onSubmit={save}><Panel title={orgId?'Organization profile':'Create your organization'}><div className="field-grid"><label>Organization name<input value={orgName} onChange={e=>setOrgName(e.target.value)} required maxLength={120}/></label>{orgId&&<><label>Timezone<select value={timezone} onChange={e=>setTimezone(e.target.value)}><option>Asia/Manila</option><option>UTC</option><option>Asia/Singapore</option><option>America/Los_Angeles</option></select></label><label>Privacy contact<input type="email" value={privacyContact} onChange={e=>setPrivacyContact(e.target.value)} placeholder="privacy@yourleague.ph"/></label><label>Public portal<select value={String(publicPortal)} onChange={e=>setPublicPortal(e.target.value==='true')}><option value="false">Private until approved</option><option value="true">Public</option></select></label></>}</div><div className="form-footer"><span className="muted">Sports data remains separate from EO2MATE selling data.</span><Button type="submit" variant="primary" disabled={saving}>{saving?'Saving…':orgId?'Save changes':'Create organization'}</Button></div>{error&&!canCreate&&<div className="form-error" role="alert">{error}</div>}</Panel></form>}</>;
}
