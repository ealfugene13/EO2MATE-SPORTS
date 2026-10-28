import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, ArrowDownToLine, ArrowRight, Award, CalendarDays, Check, CheckCircle2,
  ChevronDown, CircleHelp, Clock3, Download, Ellipsis, Filter, Flag, Plus, Radio,
  Search, ShieldCheck, Sparkles, Trophy, Undo2, Users, UserRound, Wifi, WifiOff,
  ArrowLeftRight, Pause, Play, X,
} from 'lucide-react';
import type { BasketballRules } from '../lib/basketballRules';
import { DataState, useWorkspaceRows } from '../lib/workspaceData';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { getWorkspace } from '../lib/workspaceData';

async function getBasketballRuleDefaults(): Promise<BasketballRules> {
  const { data, error } = await supabase.rpc('get_basketball_rule_defaults');
  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('Basketball rule defaults are missing in the database. Apply migration 0004.');
  return data as BasketballRules;
}

type Row = { cells: string[]; status?: string };
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
};
const initialEvents = [
  { id: 1, time: '06:42', name: 'Alex Cruz', number: '23', action: '2PT made', side: 'Warriors', points: 2 },
  { id: 2, time: '06:51', name: 'Ben Reyes', number: '08', action: 'Steal', side: 'Warriors', points: 0 },
  { id: 3, time: '07:08', name: 'Marco Yu', number: '17', action: 'Defensive rebound', side: 'Falcons', points: 0 },
  { id: 4, time: '07:23', name: 'Alex Cruz', number: '23', action: '2PT made', side: 'Warriors', points: 2 },
];

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
    <div className="metrics-grid"><Metric label="GAMES TODAY" value={String(todaysGames.length).padStart(2,'0')} note={`${live.length} currently live`} icon={CalendarDays} tone="orange"/><Metric label="TEAMS" value={String(teams.rows.filter(row=>row.active).length)} note="Active in this organization" icon={Users} tone="blue"/><Metric label="PLAYERS" value={String(players.rows.filter(row=>row.active).length)} note={`${pending} registrations pending`} icon={UserRound} tone="purple"/><Metric label="GAMES COMPLETED" value={String(completed)} note="Finalized results" icon={Trophy} tone="green"/></div>
    <div className="dashboard-grid"><Panel title="Live games" action={<Link className="text-link" to="/games">Game schedule <ArrowRight size={14}/></Link>}>{live.length ? live.map(game=><div className="live-card" key={game.id}><div className="live-card-top"><Pill tone="live"><span className="pulse-dot"/> LIVE</Pill><span className="muted tiny">{game.id.slice(0,8).toUpperCase()}</span></div><div className="live-match"><div className="score-side"><span>{game.home_team?.name ?? 'Home team'}</span><strong>{game.home_score}</strong></div><span className="score-dash">–</span><div className="score-side right"><span>{game.away_team?.name ?? 'Away team'}</span><strong>{game.away_score}</strong></div></div><div className="live-card-bottom"><span><Wifi size={14}/> Database status</span><Link to="/games/live">Open console <ArrowRight size={14}/></Link></div></div>) : <div className="empty-state">No games are live right now.</div>}{todaysGames.map(game=><div className="game-row" key={game.id}><div className="game-time">{game.scheduled_at ? new Date(game.scheduled_at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}) : 'TBD'}</div><div className="game-teams"><b>{game.home_team?.name} <span>vs</span> {game.away_team?.name}</b><small>{game.venue?.name ?? 'Venue not assigned'}</small></div><Pill>{game.status}</Pill></div>)}</Panel>
      <Panel title="Needs review"><div className="attention-item"><span className="attention-icon orange"><UserRound size={17}/></span><div><b>Player registrations</b><small>{pending} pending eligibility review</small></div><Link to="/registrations"><ArrowRight size={16}/></Link></div><div className="attention-item"><span className="attention-icon purple"><Flag size={17}/></span><div><b>Results</b><small>Review games before finalizing</small></div><Link to="/games/review"><ArrowRight size={16}/></Link></div></Panel></div>
  </>;
}

export function Competition() {
  const [saved, setSaved] = useState(false);
  const [rulesError, setRulesError] = useState('');
  const [rules, setRules] = useState<BasketballRules | null>(null);
  type CompetitionRow = { id: string; name: string; format: string; rule_settings: BasketballRules; rule_version: number; season_id:string|null; seasons?:{name:string}|null };
  const competitionsData = useWorkspaceRows<CompetitionRow>('competitions','id,name,format,rule_settings,rule_version,season_id,created_at,seasons(name)');
  const seasonsData=useWorkspaceRows<{id:string;name:string;active:boolean}>('seasons','id,name,active,created_at');
  const [selectedCompetitionId,setSelectedCompetitionId]=useState('');const [creatingCompetition,setCreatingCompetition]=useState(false);
  const [competitionName, setCompetitionName] = useState('');
  const [seasonName,setSeasonName]=useState('');
  const [competitionFormat, setCompetitionFormat] = useState('ROUND_ROBIN_SINGLE');
  const activeCompetition = creatingCompetition?undefined:(competitionsData.rows.find(row=>row.id===selectedCompetitionId)??competitionsData.rows[0]);
  useEffect(()=>{if(!selectedCompetitionId&&competitionsData.rows[0])setSelectedCompetitionId(competitionsData.rows[0].id);},[selectedCompetitionId,competitionsData.rows]);
  useEffect(() => {
    let cancelled = false;
    if (activeCompetition) {
      setCompetitionName(activeCompetition.name); setSeasonName(activeCompetition.seasons?.name??'');
      setCompetitionFormat(activeCompetition.format === 'ROUND_ROBIN' ? 'ROUND_ROBIN_SINGLE' : activeCompetition.format);
      setRules(activeCompetition.rule_settings);
    } else if (!competitionsData.loading) {
      setRules(null);
      void getBasketballRuleDefaults().then(value => { if (!cancelled) setRules(value); })
        .catch(error => { if (!cancelled) setRulesError(error instanceof Error ? error.message : 'Unable to load database rule defaults.'); });
    }
    return () => { cancelled = true; };
  }, [activeCompetition?.id, competitionsData.loading, creatingCompetition]);
  const numberField = (key: NumberRuleKey, label: string) => !rules ? null : <label>{label}<input type="number" min={ruleBounds[key][0]} max={ruleBounds[key][1]} value={rules[key]} onChange={e => { setRules(current => current ? ({ ...current, [key]: Number(e.target.value) }) : current); setRulesError(''); }}/></label>;
  const toggleField = (key: BooleanRuleKey, label: string) => !rules ? null : <label className="rule-toggle"><span>{label}</span><input type="checkbox" checked={rules[key]} onChange={e => { setRules(current => current ? ({ ...current, [key]: e.target.checked }) : current); setRulesError(''); }}/></label>;
  async function saveRuleSet() {
    if (!rules) { setRulesError('Load the basketball rule defaults from the database before saving.'); return; }
    const invalid = (Object.entries(ruleBounds) as [NumberRuleKey, [number, number]][]).find(([key, [min, max]]) => !Number.isInteger(rules[key]) || rules[key] < min || rules[key] > max);
    if (invalid) { setRulesError(`Check ${invalid[0]}: use a whole number from ${invalid[1][0]} to ${invalid[1][1]}.`); setSaved(false); return; }
    if (!competitionName.trim()||!seasonName.trim()) { setRulesError('Enter both a competition name and season name before saving.'); return; }
    setRulesError(''); setSaved(false);
    try {
      let seasonId=activeCompetition?.season_id??null;
      if(seasonId)await seasonsData.update(seasonId,{name:seasonName.trim()});else seasonId=await seasonsData.insert({name:seasonName.trim(),active:true});
      if (activeCompetition) await competitionsData.update(activeCompetition.id, { name: competitionName.trim(), format: competitionFormat, rule_settings: rules,season_id:seasonId });
      else {const id=await competitionsData.insert({ name: competitionName.trim(), format: competitionFormat, rule_settings: rules, rule_version: 1,season_id:seasonId });setSelectedCompetitionId(id);setCreatingCompetition(false);}
      setSaved(true);
    } catch (e) { setRulesError(e instanceof Error ? e.message : 'Unable to save the competition rule set.'); }
  }
  return <><PageTitle eyebrow="LEAGUE SETUP" title="Competition & rules" subtitle="Choose single or double round robin, or a single-elimination bracket. Basketball rule defaults come from the database." action={<div className="table-actions"><Button onClick={()=>{setCreatingCompetition(true);setCompetitionName('');setSeasonName('');setCompetitionFormat('ROUND_ROBIN_SINGLE');setRules(null);setRulesError('');setSaved(false);}}><Plus size={15}/>New competition</Button><Button variant="primary" onClick={()=>void saveRuleSet()} disabled={competitionsData.loading||seasonsData.loading||!rules}><Check size={16}/> Save rule set</Button></div>} />
    <DataState loading={competitionsData.loading||seasonsData.loading} error={competitionsData.error||seasonsData.error} onRetry={() => {void competitionsData.reload();void seasonsData.reload();}}/>
    {saved && <div className="success-banner"><CheckCircle2 size={17}/> Competition and rules saved to your organization database.</div>}
    {rulesError && <div className="form-error rule-error">{rulesError}</div>}
    <div className="form-layout"><div className="form-main">
      <Panel title="Competition details"><div className="field-grid">{competitionsData.rows.length>0&&!creatingCompetition&&<label className="span-2">Competition<select value={activeCompetition?.id??''} onChange={e=>{setSelectedCompetitionId(e.target.value);setCreatingCompetition(false);}}>{competitionsData.rows.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}<label>Competition name<input value={competitionName} onChange={e=>setCompetitionName(e.target.value)} placeholder="e.g. Community Cup 2026"/></label><label>Season name<input value={seasonName} onChange={e=>setSeasonName(e.target.value)} placeholder="e.g. 2026 Season"/></label><label>Competition format<select value={competitionFormat} onChange={e=>setCompetitionFormat(e.target.value)}><option value="ROUND_ROBIN_SINGLE">Round robin · single</option><option value="ROUND_ROBIN_DOUBLE">Round robin · double</option><option value="SINGLE_ELIMINATION">Bracket · single elimination</option></select></label><label>Saved version<input readOnly value={activeCompetition ? `v${activeCompetition.rule_version}` : 'New rule set'}/></label></div></Panel>
      {!rules&&<div className="empty-state">Loading rule defaults from the database…</div>}
      {rules&&<><Panel title="Game format"><div className="field-grid"><label>Format<input value="5 on 5 basketball" readOnly/></label>{numberField('periodLengthMinutes','Quarter length (minutes)')}{numberField('overtimeMinutes','Overtime length (minutes)')}</div></Panel>
      <Panel title="Timeout rules"><div className="field-grid">{numberField('firstHalfTimeouts','Timeouts · first half (Q1–Q2)')}{numberField('secondHalfTimeouts','Timeouts · second half (Q3–Q4)')}{numberField('fourthQuarterTimeoutRestrictionMinutes','Q4 timeout restriction window (minutes)')}{numberField('finalTwoMinuteTimeoutMax','Maximum remaining in Q4 restriction window')}{numberField('timeoutDurationSeconds','Timeout duration (seconds)')}{toggleField('headCoachRequestRequired','Require Head Coach request at scorer’s table')}</div></Panel>
      <Panel title="Fouls and ejections"><div className="field-grid">{numberField('playerFoulLimit','Personal fouls before disqualification')}{numberField('teamFoulPenaltyAt','Team foul penalty starts at foul number')}{numberField('teamFoulFreeThrows','Free throws for each defensive team foul at penalty')}{numberField('technicalFreeThrows','Free throws for a technical foul')}{numberField('ejectionTechnicalLimit','Ejection at technical fouls')}{numberField('ejectionUnsportsmanlikeLimit','Ejection at unsportsmanlike fouls')}{numberField('ejectionMixedTechnicalLimit','Mixed ejection · technical fouls')}{numberField('ejectionMixedUnsportsmanlikeLimit','Mixed ejection · unsportsmanlike fouls')}</div></Panel>
      <Panel title="Overtime and game clock"><div className="field-grid">{numberField('overtimeTimeouts','Timeouts per team · each overtime')}{numberField('clockStopLastMinutes','Clock stops during final minutes')}{toggleField('carryFourthQuarterFoulsToOvertime','Carry Q4 team fouls into first overtime')}{toggleField('runningClockEnabled','Use running time')}{toggleField('clockStopInSecondQuarter','Stop clock in final minutes of Q2')}{toggleField('clockStopInFourthQuarter','Stop clock in final minutes of Q4')}</div><p className="rule-help">These values are saved with the competition and copied into each new game's rule snapshot.</p></Panel></>}
      <Panel title="Standings tie-breakers"><div className="rule-list"><div><span className="drag">1</span><b>Wins</b><Pill tone="neutral">1st</Pill></div><div><span className="drag">2</span><b>Head-to-head result</b><Pill tone="neutral">2nd</Pill></div><div><span className="drag">3</span><b>Point difference</b><Pill tone="neutral">3rd</Pill></div></div><small className="muted">Default tie-break order for this competition.</small></Panel>
    </div><aside className="side-summary"><Panel title="Saved parameters"><div className="version-card"><span className="version-icon"><Sparkles size={17}/></span><b>Basketball · Custom rules</b><Pill tone="soft-blue">{activeCompetition ? `VERSION ${activeCompetition.rule_version}` : 'DATABASE DEFAULTS'}</Pill><small>Rule defaults and competition settings are stored in Supabase.</small></div><div className="note-box"><CircleHelp size={16}/><span>New games copy the saved competition rules into a database snapshot.</span></div><button className="text-link full-link" onClick={() => { setRulesError(''); setRules(activeCompetition?.rule_settings ?? null); if (!activeCompetition) void getBasketballRuleDefaults().then(setRules).catch(error => setRulesError(error instanceof Error ? error.message : 'Unable to load database rule defaults.')); setSaved(false); }}>Reload saved rules <ArrowRight size={14}/></button></Panel></aside></div>
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

type DirectoryRow = { id: string; name?: string; code?: string | null; first_name?: string; last_name?: string; active?: boolean };
function WorkspaceDirectory({ kind }: { kind: 'teams' | 'players' }) {
  const isTeams = kind === 'teams';
  const title = isTeams ? 'Teams' : 'Players';
  const [open, setOpen] = useState(false); const [saving, setSaving] = useState(false); const [formError, setFormError] = useState('');
  const [busyId,setBusyId]=useState('');const [actionError,setActionError]=useState('');
  const data=useWorkspaceRows<DirectoryRow>(kind,isTeams?'id,name,code,active,created_at':'id,first_name,last_name,active,created_at');
  type RosterDirectoryRow={id:string;team_id:string;player_id:string;season_id:string;jersey_number:number|null;position:string|null;status:string;players?:{first_name:string;last_name:string}|null;seasons?:{name:string}|null};
  const rosterData=useWorkspaceRows<RosterDirectoryRow>('rosters','id,team_id,player_id,season_id,jersey_number,position,status,created_at,players(first_name,last_name),seasons(name)');
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
  return <><PageTitle title={title} subtitle={isTeams ? 'Manage teams in your active sports organization.' : 'Maintain player profiles within your organization.'} action={<Button variant="primary" onClick={() => { setOpen(true); setFormError(''); }}><Plus size={16}/>{isTeams ? 'Add team' : 'Register player'}</Button>}/>
    <DataState loading={data.loading} error={data.error} onRetry={() => void data.reload()}/>{actionError&&<div className="form-error">{actionError}</div>}
    {!data.loading && !data.error && <Panel title={`${title} directory`} action={<span className="muted tiny">{data.rows.length} records</span>}><div className="table-wrap"><table><thead><tr>{isTeams ? <><th>TEAM</th><th>CODE</th><th>STATUS</th></> : <><th>PLAYER</th><th>STATUS</th></>}<th>ACTION</th></tr></thead><tbody>{data.rows.map(row => <tr key={row.id}>{isTeams ? <><td><b>{row.name}</b></td><td>{row.code || '—'}</td><td><Pill tone={row.active ? 'soft-green' : 'neutral'}>{row.active ? 'ACTIVE' : 'INACTIVE'}</Pill></td></> : <><td><b>{row.first_name} {row.last_name}</b></td><td><Pill tone={row.active ? 'soft-green' : 'neutral'}>{row.active ? 'ACTIVE' : 'INACTIVE'}</Pill></td></>}<td className="table-actions">{isTeams&&<Button onClick={()=>{setRosterTeamId(row.id);setRosterError('');}}>Manage roster</Button>}<Button disabled={busyId===row.id} onClick={async()=>{setBusyId(row.id);setActionError('');try{await data.update(row.id,{active:!row.active});}catch(e){setActionError(e instanceof Error?e.message:'Unable to change status.');}finally{setBusyId('');}}}>{row.active?'Deactivate':'Reactivate'}</Button></td></tr>)}</tbody></table>{data.rows.length === 0 && <div className="empty-state">No {title.toLowerCase()} yet. Add the first record to begin.</div>}</div></Panel>}
    {isTeams&&<Panel title="Active roster assignments"><div className="table-wrap"><table><thead><tr><th>PLAYER</th><th>TEAM</th><th>SEASON</th><th>JERSEY</th><th>POSITION</th><th>STATUS</th><th/></tr></thead><tbody>{rosterData.rows.map(row=><tr key={row.id}><td>{row.players?`${row.players.first_name} ${row.players.last_name}`:'Player'}</td><td>{data.rows.find(team=>team.id===row.team_id)?.name??row.team_id.slice(0,8)}</td><td>{row.seasons?.name??'—'}</td><td>{row.jersey_number??'—'}</td><td>{row.position??'—'}</td><td>{row.status}</td><td><Button onClick={async()=>{try{await rosterData.update(row.id,{status:row.status==='ACTIVE'?'INACTIVE':'ACTIVE'});}catch(e){setRosterError(e instanceof Error?e.message:'Unable to update roster status.');}}}>{row.status==='ACTIVE'?'Remove':'Reactivate'}</Button></td></tr>)}</tbody></table>{!rosterData.rows.length&&<div className="empty-state">No roster assignments yet.</div>}</div></Panel>}
    {open && <div className="modal-scrim" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}><form className="schedule-modal" onSubmit={submit}><div className="modal-heading"><div><span className="eyebrow">ORGANIZATION DATA</span><h2>{isTeams ? 'Add a team' : 'Register a player'}</h2><p>This record is scoped to your active organization.</p></div><button type="button" className="icon-button" onClick={() => setOpen(false)}>×</button></div><div className="field-grid">{isTeams ? <><label>Team name<input name="name" required maxLength={120}/></label><label>Team code<input name="code" maxLength={12}/></label></> : <><label>First name<input name="first_name" required maxLength={100}/></label><label>Last name<input name="last_name" required maxLength={100}/></label></>}</div>{formError && <div className="form-error" role="alert">{formError}</div>}<div className="modal-footer"><Button onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save record'}</Button></div></form></div>}
    {isTeams&&rosterTeamId&&<div className="modal-scrim"><form className="schedule-modal" onSubmit={async event=>{event.preventDefault();setRosterSaving(true);setRosterError('');const form=new FormData(event.currentTarget);try{await rosterData.insert({team_id:rosterTeamId,player_id:rosterPlayerId,season_id:rosterSeasonId,jersey_number:Number(form.get('jersey_number'))||null,position:String(form.get('position')||'')||null,status:'ACTIVE'});setRosterTeamId('');}catch(e){setRosterError(e instanceof Error?e.message:'Unable to assign player to this roster.');}finally{setRosterSaving(false);}}}><div className="modal-heading"><div><span className="eyebrow">TEAM ROSTER</span><h2>Manage roster</h2><p>{data.rows.find(team=>team.id===rosterTeamId)?.name}</p></div><button type="button" className="icon-button" onClick={()=>setRosterTeamId('')}>×</button></div><div className="field-grid"><label>Season<select value={rosterSeasonId} onChange={e=>setRosterSeasonId(e.target.value)} required><option value="">Choose season</option>{seasonsData.rows.map(season=><option key={season.id} value={season.id}>{season.name}</option>)}</select></label><label>Player<select value={rosterPlayerId} onChange={e=>setRosterPlayerId(e.target.value)} required><option value="">Choose player</option>{playersData.rows.filter(player=>player.active&&!rosterData.rows.some(row=>row.season_id===rosterSeasonId&&row.team_id===rosterTeamId&&row.player_id===player.id)).map(player=><option key={player.id} value={player.id}>{player.first_name} {player.last_name}</option>)}</select></label><label>Jersey number<input name="jersey_number" type="number" min="0" max="99"/></label><label>Position<input name="position" maxLength={30}/></label></div>{rosterError&&<div className="form-error">{rosterError}</div>}<div className="modal-footer"><Button onClick={()=>setRosterTeamId('')}>Close</Button><Button type="submit" variant="primary" disabled={rosterSaving||!rosterSeasonId||!rosterPlayerId}>{rosterSaving?'Saving…':'Add to roster'}</Button></div></form></div>}
  </>;
}
export function Teams() { return <WorkspaceDirectory kind="teams"/>; }
export function Players() { return <WorkspaceDirectory kind="players"/>; }
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
  const [scheduleOpen,setScheduleOpen]=useState(false);
  const [saved,setSaved]=useState(false);
  type TeamChoice = { id: string; name: string };
  type VenueChoice = { id: string; name: string };
  type CompetitionChoice = { id: string; name: string };
  type GameRow = { id: string; scheduled_at: string | null; status: string; home_score: number; away_score: number; home_team?: TeamChoice; away_team?: TeamChoice; venue?: VenueChoice | null };
  const gamesData = useWorkspaceRows<GameRow>('games','id,scheduled_at,status,home_score,away_score,created_at,home_team:teams!games_home_team_id_fkey(id,name),away_team:teams!games_away_team_id_fkey(id,name),venue:venues(id,name)');
  const teamsData = useWorkspaceRows<TeamChoice>('teams','id,name,created_at');
  const venuesData = useWorkspaceRows<VenueChoice>('venues','id,name,created_at');
  const competitionsData = useWorkspaceRows<CompetitionChoice>('competitions','id,name,created_at');
  const matchups = gamesData.rows;
  const [statusFilter,setStatusFilter]=useState('ALL');const [venueFilter,setVenueFilter]=useState('ALL');
  const [competitionId,setCompetitionId]=useState('');
  const visibleMatchups=matchups.filter(game=>(statusFilter==='ALL'||game.status===statusFilter)&&(venueFilter==='ALL'||game.venue?.id===venueFilter));
  const [home,setHome]=useState(''); const [away,setAway]=useState('');
  const [saveError,setSaveError]=useState(''); const [saving,setSaving]=useState(false);
  useEffect(() => { if (!home && teamsData.rows[0]) setHome(teamsData.rows[0].id); if (!away && teamsData.rows[1]) setAway(teamsData.rows[1].id); }, [home,away,teamsData.rows]);
  async function createMatchup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const date = String(form.get('date')); const time = String(form.get('time'));
    if (!home || !away || home === away) return;
    setSaving(true); setSaveError('');
    try { await gamesData.insert({ home_team_id: home, away_team_id: away, venue_id: String(form.get('venue') || '') || null, competition_id: competitionId||null, scheduled_at: new Date(`${date}T${time}:00+08:00`).toISOString(), status:'SCHEDULED' }); setScheduleOpen(false); setSaved(true); }
    catch (e) { setSaveError(e instanceof Error ? e.message : 'Unable to schedule this game.'); }
    finally { setSaving(false); }
  }
  return <>
    <PageTitle eyebrow="GAME DAY OPERATIONS" title="Game schedule" subtitle="Create matchups and track scheduled, live, and finalized games." action={<Button variant="primary" onClick={()=>{setScheduleOpen(true);setSaved(false);}}><Plus size={16}/> Schedule a matchup</Button>}/>
    {saved && <div className="success-banner"><CheckCircle2 size={17}/> Matchup saved to the organization schedule.</div>}{saveError && <div className="form-error" role="alert">{saveError}</div>}
    <DataState loading={gamesData.loading || teamsData.loading || venuesData.loading || competitionsData.loading} error={gamesData.error || teamsData.error || venuesData.error || competitionsData.error} onRetry={() => { void gamesData.reload(); void teamsData.reload(); void venuesData.reload(); void competitionsData.reload(); }}/>
    <div className="schedule-toolbar"><div className="schedule-week"><div><b>{matchups.length} games</b><small>Loaded from this organization</small></div></div><div className="schedule-filters"><label>Status<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">All statuses</option><option value="SCHEDULED">Scheduled</option><option value="LIVE">Live</option><option value="FINAL">Final</option><option value="CANCELLED">Cancelled</option></select></label><label>Venue<select value={venueFilter} onChange={e=>setVenueFilter(e.target.value)}><option value="ALL">All venues</option>{venuesData.rows.map(venue=><option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label></div></div>
    <Panel title="Organization schedule" action={<span className="muted tiny">{visibleMatchups.length} shown</span>}>
      <div className="table-wrap"><table><thead><tr><th>DATE & TIP-OFF</th><th>MATCHUP</th><th>VENUE</th><th>SCORE</th><th>STATUS</th></tr></thead><tbody>{visibleMatchups.map(game=><tr key={game.id}><td>{game.scheduled_at ? new Date(game.scheduled_at).toLocaleString() : 'Unscheduled'}</td><td><div className="matchup-cell"><b>{game.home_team?.name ?? 'Home team'}</b><span className="muted">vs</span><b>{game.away_team?.name ?? 'Away team'}</b></div></td><td>{game.venue?.name ?? '—'}</td><td>{game.home_score} – {game.away_score}</td><td><Pill tone={game.status==='LIVE'?'live':game.status==='FINAL'?'soft-green':'neutral'}>{game.status}</Pill></td></tr>)}</tbody></table>{!gamesData.loading && visibleMatchups.length === 0 && <div className="empty-state">No games match these filters.</div>}</div>
    </Panel>
    <div className="schedule-notes"><span><CheckCircle2 size={15}/> Schedule changes are saved in Supabase</span><Link to="/games/review">Open result review <ArrowRight size={14}/></Link></div>
    {scheduleOpen && <div className="modal-scrim" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setScheduleOpen(false);}}><form className="schedule-modal" onSubmit={createMatchup}><div className="modal-heading"><div><span className="eyebrow">GAME SCHEDULING</span><h2>Schedule a matchup</h2><p>Choose a competition, teams, venue, date, and tip-off time.</p></div><button type="button" className="icon-button" onClick={()=>setScheduleOpen(false)}>×</button></div><div className="field-grid"><label className="span-2">Competition<select value={competitionId} onChange={e=>setCompetitionId(e.target.value)}><option value="">No competition</option>{competitionsData.rows.map(competition=><option key={competition.id} value={competition.id}>{competition.name}</option>)}</select></label><label>Home team<select value={home} onChange={e=>setHome(e.target.value)} required>{teamsData.rows.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Away team<select value={away} onChange={e=>setAway(e.target.value)} required>{teamsData.rows.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Date<input name="date" type="date" required/></label><label>Tip-off time<input name="time" type="time" required/></label><label className="span-2">Venue<select name="venue"><option value="">No venue selected</option>{venuesData.rows.map(venue=><option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label></div>{(!teamsData.rows.length || home===away) && <div className="form-error">Add at least two different teams before scheduling.</div>}{saveError && <div className="form-error">{saveError}</div>}<div className="modal-footer"><Button onClick={()=>setScheduleOpen(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={saving || teamsData.rows.length < 2}>{saving ? 'Saving…' : <><CalendarDays size={15}/> Save matchup</>}</Button></div></form></div>}
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
  type LiveDbGame={id:string;status:string;home_score:number;away_score:number;current_period:number;clock_ms:number;home_team_id:string;away_team_id:string;home_team?:{name:string};away_team?:{name:string}};
  type RosterPlayer={id:string;team_id:string;player_id:string;jersey_number:number|null;position:string|null;status:string;players?:{first_name:string;last_name:string}|null};
  type DbEvent={id:string;game_id:string;team_id:string;player_id:string|null;event_type:string;period:number;clock_ms:number;points:number;created_at:string};
  const games=useWorkspaceRows<LiveDbGame>('games','id,status,home_score,away_score,current_period,clock_ms,home_team_id,away_team_id,created_at,home_team:teams!games_home_team_id_fkey(name),away_team:teams!games_away_team_id_fkey(name)');
  const roster=useWorkspaceRows<RosterPlayer>('rosters','id,team_id,player_id,jersey_number,position,status,created_at,players(first_name,last_name)');
  const events=useWorkspaceRows<DbEvent>('game_events','id,game_id,team_id,player_id,event_type,period,clock_ms,points,created_at');
  const [gameId,setGameId]=useState('');const [teamId,setTeamId]=useState('');const [playerId,setPlayerId]=useState('');const [eventType,setEventType]=useState('2PT_MADE');const [period,setPeriod]=useState(1);const [clockText,setClockText]=useState('10:00');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  useEffect(()=>{if(!gameId){const preferred=games.rows.find(row=>row.status==='LIVE')??games.rows.find(row=>row.status==='SCHEDULED');if(preferred)setGameId(preferred.id);}},[gameId,games.rows]);
  const game=games.rows.find(row=>row.id===gameId);const selectedTeam=game&&(teamId===game.away_team_id?game.away_team_id:game.home_team_id);const selectedRoster=roster.rows.filter(row=>row.team_id===selectedTeam&&row.status==='ACTIVE');const gameEvents=events.rows.filter(row=>row.game_id===gameId).slice(0,20);
  useEffect(()=>{if(game&&!teamId)setTeamId(game.home_team_id);if(selectedRoster.length&&!selectedRoster.some(row=>row.player_id===playerId))setPlayerId(selectedRoster[0].player_id);},[game?.id,game?.home_team_id,selectedRoster,playerId,teamId]);
  useEffect(()=>{if(game){setPeriod(game.current_period);setClockText(`${Math.floor(game.clock_ms/60000)}:${String(Math.floor(game.clock_ms/1000)%60).padStart(2,'0')}`);}},[game?.id,game?.current_period,game?.clock_ms]);
  async function startGame(){if(!game)return;setBusy(true);setError('');const {error:updateError}=await supabase.from('games').update({status:'LIVE'}).eq('id',game.id);if(updateError)setError(updateError.message);else{setNotice('Game is live.');await games.reload();}setBusy(false);}
  async function saveClock(){if(!game)return;const match=clockText.match(/^(\d{1,2}):([0-5]\d)$/);if(!match||period<1||period>20){setError('Enter a period from 1 to 20 and clock time in MM:SS.');return;}setBusy(true);setError('');const clock_ms=(Number(match[1])*60+Number(match[2]))*1000;const {error:updateError}=await supabase.from('games').update({current_period:period,clock_ms}).eq('id',game.id);if(updateError)setError(updateError.message);else{setNotice('Period and clock saved.');await games.reload();}setBusy(false);}
  async function recordEvent(){if(!game||!games.workspace||!selectedTeam)return;setBusy(true);setError('');setNotice('');try{await api('/api/game-events',{method:'POST',body:JSON.stringify({game_id:game.id,organization_id:games.workspace.id,team_id:selectedTeam,player_id:playerId||null,event_type:eventType,period:game.current_period,clock_ms:game.clock_ms})});setNotice('Event saved to the game log.');await Promise.all([games.reload(),events.reload()]);}catch(e){setError(e instanceof Error?e.message:'Unable to save game event.');}finally{setBusy(false);}}
  const liveError=games.error||roster.error||events.error;
  return <><PageTitle eyebrow="GAME DAY OPERATIONS" title="Live scoring" subtitle="Game events and score changes are saved through the authenticated sports API." action={<Button onClick={()=>{void games.reload();void events.reload();}}><Activity size={15}/>Refresh</Button>}/><DataState loading={games.loading||roster.loading||events.loading} error={liveError} onRetry={()=>{void games.reload();void roster.reload();void events.reload();}}/>{error&&<div className="form-error" role="alert">{error}</div>}{notice&&<div className="success-banner"><CheckCircle2 size={17}/>{notice}</div>}{games.rows.length>0&&<label className="game-select-label">Game<select value={gameId} onChange={e=>{setGameId(e.target.value);setTeamId('');setPlayerId('');}}>{games.rows.map(row=><option key={row.id} value={row.id}>{row.home_team?.name??'Home'} vs {row.away_team?.name??'Away'} · {row.status}</option>)}</select></label>}{game&&<><div className="review-score"><div><span>{game.home_team?.name??'Home team'}</span><strong>{game.home_score}</strong></div><Pill tone={game.status==='LIVE'?'live':game.status==='FINAL'?'soft-green':'soft-orange'}>{game.status}</Pill><div><span>{game.away_team?.name??'Away team'}</span><strong>{game.away_score}</strong></div></div>{game.status==='SCHEDULED'&&<Button variant="primary" onClick={()=>void startGame()} disabled={busy}><Play size={15}/>Start game</Button>}<div className="form-layout"><div className="form-main"><Panel title="Game clock"><div className="field-grid"><label>Period<input type="number" min="1" max="20" value={period} onChange={e=>setPeriod(Number(e.target.value))}/></label><label>Time remaining<input value={clockText} onChange={e=>setClockText(e.target.value)} placeholder="MM:SS" pattern="[0-9]{1,2}:[0-5][0-9]"/></label></div><div className="form-footer"><span className="muted">Events use the saved period and time.</span><Button onClick={()=>void saveClock()} disabled={busy||game.status==='FINAL'}>Save clock</Button></div></Panel><Panel title="Record event"><div className="field-grid"><label>Team<select value={teamId||game.home_team_id} onChange={e=>{setTeamId(e.target.value);setPlayerId('');}}><option value={game.home_team_id}>{game.home_team?.name??'Home team'}</option><option value={game.away_team_id}>{game.away_team?.name??'Away team'}</option></select></label><label>Player<select value={playerId} onChange={e=>setPlayerId(e.target.value)}><option value="">Team event</option>{selectedRoster.map(row=><option key={row.player_id} value={row.player_id}>{row.players?`${row.players.first_name} ${row.players.last_name}`:'Player'}{row.jersey_number===null?'':` · #${row.jersey_number}`}</option>)}</select></label><label>Event<select value={eventType} onChange={e=>setEventType(e.target.value)}>{[['FT_MADE','Free throw made'],['2PT_MADE','2 point made'],['3PT_MADE','3 point made'],['REBOUND_OFF','Offensive rebound'],['REBOUND_DEF','Defensive rebound'],['ASSIST','Assist'],['STEAL','Steal'],['BLOCK','Block'],['TURNOVER','Turnover'],['FOUL','Foul'],['TIMEOUT','Timeout']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div><div className="form-footer"><span className="muted">Period {game.current_period} · {Math.floor(game.clock_ms/60000)}:{String(Math.floor(game.clock_ms/1000)%60).padStart(2,'0')}</span><Button variant="primary" onClick={()=>void recordEvent()} disabled={busy||game.status!=='LIVE'}>{busy?'Saving…':'Save event'}</Button></div>{game.status!=='LIVE'&&<div className="rule-help">Start the scheduled game before recording events.</div>}</Panel></div><aside className="side-summary"><Panel title="Recent play-by-play"><div className="table-wrap"><table><thead><tr><th>EVENT</th><th>POINTS</th></tr></thead><tbody>{gameEvents.map(row=><tr key={row.id}><td>{row.event_type.replaceAll('_',' ')}</td><td>{row.points}</td></tr>)}</tbody></table>{!gameEvents.length&&<div className="empty-state">No events recorded yet.</div>}</div></Panel></aside></div></>}{!games.loading&&!game&&<div className="empty-state">Schedule a game before opening the live scoring console.</div>}</>;
}

export function GameReview() {
  type ReviewGame={id:string;status:string;home_score:number;away_score:number;home_team?:{name:string};away_team?:{name:string};scheduled_at:string|null};
  type ReviewEvent={id:string;game_id:string;player_id:string|null;event_type:string;points:number;reversed_event_id:string|null};
  const games=useWorkspaceRows<ReviewGame>('games','id,status,home_score,away_score,scheduled_at,created_at,home_team:teams!games_home_team_id_fkey(name),away_team:teams!games_away_team_id_fkey(name)');
  const events=useWorkspaceRows<ReviewEvent>('game_events','id,game_id,player_id,event_type,points,reversed_event_id,created_at');
  const [gameId,setGameId]=useState('');const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  useEffect(()=>{if(!gameId&&games.rows[0])setGameId(games.rows[0].id);},[gameId,games.rows]);
  const game=games.rows.find(row=>row.id===gameId);const gameEvents=events.rows.filter(row=>row.game_id===gameId);const reversed=new Set(gameEvents.map(row=>row.reversed_event_id).filter(Boolean));const activeEvents=gameEvents.filter(row=>row.event_type!=='REVERSAL'&&!reversed.has(row.id));
  async function finalize(){if(!game)return;setSaving(true);setError('');setNotice('');const {error:rpcError}=await supabase.rpc('finalize_game',{p_game_id:game.id});if(rpcError)setError(rpcError.message);else{setNotice('Official result finalized and added to the audit log.');await games.reload();}setSaving(false);}
  const canFinalize=game?.status==='LIVE';
  return <><PageTitle eyebrow="RESULT REVIEW" title="Review & finalize" subtitle="Review a saved game before confirming its official result." action={<Button variant="primary" onClick={()=>void finalize()} disabled={!canFinalize||saving}><ShieldCheck size={16}/>{saving?'Finalizing…':'Finalize result'}</Button>}/><DataState loading={games.loading||events.loading} error={games.error||events.error} onRetry={()=>{void games.reload();void events.reload();}}/>{games.rows.length>0&&<label className="game-select-label">Game<select value={gameId} onChange={e=>setGameId(e.target.value)}>{games.rows.map(row=><option key={row.id} value={row.id}>{row.home_team?.name??'Home'} vs {row.away_team?.name??'Away'} · {row.status} · {row.id.slice(0,8)}</option>)}</select></label>}{error&&<div className="form-error">{error}</div>}{notice&&<div className="success-banner"><CheckCircle2 size={17}/>{notice}</div>}{game&&<><div className="review-score"><div><span>{game.home_team?.name??'Home team'}</span><strong>{game.home_score}</strong></div><Pill tone={game.status==='FINAL'?'soft-green':'soft-orange'}>{game.status}</Pill><div><span>{game.away_team?.name??'Away team'}</span><strong>{game.away_score}</strong></div></div><div className="metrics-grid compact"><Metric label="EVENTS" value={String(activeEvents.length)} note="Saved, non-reversed events" icon={Activity}/><Metric label="GAME STATUS" value={game.status} note="Database status" icon={Wifi}/><Metric label="SCORE CHECK" value={game.home_score>=0&&game.away_score>=0?'Passed':'Review'} note="Non-negative totals" icon={CheckCircle2} tone="green"/><Metric label="SCHEDULED" value={game.scheduled_at?new Date(game.scheduled_at).toLocaleDateString():'—'} note="Organization time" icon={CalendarDays} tone="purple"/></div><Panel title="Scoring events"><div className="table-wrap"><table><thead><tr><th>PLAYER ID</th><th>EVENT</th><th>POINTS</th></tr></thead><tbody>{activeEvents.slice().reverse().map(event=><tr key={event.id}><td>{event.player_id?event.player_id.slice(0,8):'Team event'}</td><td>{event.event_type.replaceAll('_',' ')}</td><td>{event.points}</td></tr>)}</tbody></table>{!activeEvents.length&&<div className="empty-state">No scoring events are recorded for this game.</div>}</div><div className="review-checks"><span><CheckCircle2 size={15}/> Score loaded from database</span><span><CheckCircle2 size={15}/> Reversed events excluded</span><span><CheckCircle2 size={15}/> Finalization is audited</span></div></Panel></>}{!games.loading&&!game&&<div className="empty-state">No games are available for review.</div>}</>;
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
type PublicEvent={id:string;game_id:string;event_type:string;period:number;clock_ms:number;points:number;team_name:string;player_name:string|null;created_at:string};
export function PublicLive() {
  const [games,setGames]=useState<PublicGame[]>([]);const [events,setEvents]=useState<PublicEvent[]>([]);const [gameId,setGameId]=useState('');const [tab,setTab]=useState<'Play-by-play'|'Box score'|'Team stats'>('Play-by-play');const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [updated,setUpdated]=useState<Date|null>(null);
  useEffect(()=>{let active=true;const load=async()=>{try{const [gameResult,eventResult]=await Promise.all([supabase.from('public_live_games').select('*'),supabase.from('public_live_events').select('*').order('created_at',{ascending:false}).limit(100)]);if(gameResult.error)throw gameResult.error;if(eventResult.error)throw eventResult.error;if(!active)return;const found=(gameResult.data??[]) as PublicGame[];setGames(found);setEvents((eventResult.data??[]) as PublicEvent[]);setGameId(current=>found.some(row=>row.id===current)?current:found[0]?.id??'');setUpdated(new Date());setError('');}catch(e){if(active)setError(e instanceof Error?e.message:'Public scoreboard is unavailable.');}finally{if(active)setLoading(false);}};void load();const timer=window.setInterval(()=>void load(),10000);return()=>{active=false;window.clearInterval(timer);};},[]);
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

type StaffRow = { user_id: string; role: string; active: boolean; created_at: string };
type AuditRow = { id: number; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; created_at: string };
export function Access() {
  const [tab,setTab]=useState<'Staff'|'Audit log'>('Staff');
  const staff=useWorkspaceRows<StaffRow>('organization_members','user_id,role,active,created_at');
  const audit=useWorkspaceRows<AuditRow>('audit_log','id,actor_id,action,entity_type,entity_id,created_at');
  const [open,setOpen]=useState(false);const [saving,setSaving]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');
  async function invite(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!staff.workspace)return;const form=new FormData(event.currentTarget);setSaving(true);setError('');setMessage('');try{const result=await api<{email:string;role:string}>('/api/organization-members/invite',{method:'POST',body:JSON.stringify({organization_id:staff.workspace.id,email:String(form.get('email')),role:String(form.get('role'))})});setMessage(`Invitation sent to ${result.email}.`);setOpen(false);void staff.reload();void audit.reload();}catch(e){setError(e instanceof Error?e.message:'Unable to invite staff.');}finally{setSaving(false);}}
  const selected=tab==='Staff'?staff:audit;
  return <><PageTitle title="Staff access & audit" subtitle="Review members and audited actions for this organization." action={tab==='Staff'?<Button variant="primary" onClick={()=>{setOpen(true);setError('');}}><Plus size={16}/>Invite staff</Button>:undefined}/><div className="tab-row">{(['Staff','Audit log'] as const).map(value=><button key={value} className={tab===value?'selected':''} onClick={()=>setTab(value)}>{value}</button>)}</div><DataState loading={selected.loading} error={selected.error} onRetry={()=>void selected.reload()}/>{message&&<div className="success-banner"><CheckCircle2 size={17}/>{message}</div>}{error&&<div className="form-error" role="alert">{error}</div>}{!selected.loading&&!selected.error&&<Panel title={tab==='Staff'?'Organization members':'Recent audit activity'}><div className="table-wrap"><table><thead>{tab==='Staff'?<tr><th>USER ID</th><th>ROLE</th><th>ADDED</th><th>STATUS</th></tr>:<tr><th>TIME</th><th>ACTOR</th><th>ACTION</th><th>RECORD</th></tr>}</thead><tbody>{tab==='Staff'?(staff.rows as StaffRow[]).map(row=><tr key={row.user_id}><td><code>{row.user_id.slice(0,8)}…</code></td><td>{row.role}</td><td>{new Date(row.created_at).toLocaleDateString()}</td><td><Pill tone={row.active?'soft-green':'neutral'}>{row.active?'ACTIVE':'INACTIVE'}</Pill></td></tr>):(audit.rows as AuditRow[]).map(row=><tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}</td><td><code>{row.actor_id?.slice(0,8) ?? 'System'}…</code></td><td>{row.action}</td><td>{row.entity_type}{row.entity_id?` · ${row.entity_id.slice(0,8)}`:''}</td></tr>)}</tbody></table>{tab==='Staff'&&!staff.rows.length&&<div className="empty-state">No staff members found.</div>}{tab==='Audit log'&&!audit.rows.length&&<div className="empty-state">No audit events have been recorded.</div>}</div></Panel>}
    {open&&<div className="modal-scrim"><form className="schedule-modal" onSubmit={invite}><div className="modal-heading"><div><span className="eyebrow">STAFF ACCESS</span><h2>Invite organization member</h2><p>The invitation is scoped to this organization.</p></div><button type="button" className="icon-button" onClick={()=>setOpen(false)}>×</button></div><div className="field-grid"><label className="span-2">Email<input type="email" name="email" required/></label><label>Role<select name="role"><option value="SCORER">Scorer</option><option value="STATISTICIAN">Statistician</option><option value="COACH">Coach</option><option value="VIEWER">Viewer</option><option value="ADMIN">Admin</option></select></label></div>{error&&<div className="form-error">{error}</div>}<div className="modal-footer"><Button onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={saving}>{saving?'Sending…':'Send invitation'}</Button></div></form></div>}
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

export function GenericPage({ name }: { name: string }) {
  const [orgId,setOrgId]=useState('');const [orgName,setOrgName]=useState('');const [timezone,setTimezone]=useState('Asia/Manila');const [privacyContact,setPrivacyContact]=useState('');const [publicPortal,setPublicPortal]=useState(false);const [canCreate,setCanCreate]=useState(false);const [busy,setBusy]=useState(true);const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [saved,setSaved]=useState(false);
  const load=async()=>{setBusy(true);setError('');setCanCreate(false);try{const workspace=await getWorkspace();const {data,error:queryError}=await supabase.from('organizations').select('id,name,timezone,privacy_contact,public_portal_enabled').eq('id',workspace.id).single();if(queryError)throw queryError;setOrgId(data.id);setOrgName(data.name);setTimezone(data.timezone||'Asia/Manila');setPrivacyContact(data.privacy_contact||'');setPublicPortal(Boolean(data.public_portal_enabled));}catch(e){const message=e instanceof Error?e.message:'Unable to load organization settings.';setError(message);setCanCreate(message.includes('not assigned to an active sports organization'));}finally{setBusy(false);}};
  useEffect(()=>{void load();},[]);
  async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();setSaving(true);setError('');setSaved(false);try{if(!orgId){const slug=orgName.trim().toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+crypto.randomUUID().slice(0,8);const {data,error:rpcError}=await supabase.rpc('create_organization',{p_name:orgName.trim(),p_slug:slug});if(rpcError)throw rpcError;setOrgId(data.id);}else{const {error:updateError}=await supabase.from('organizations').update({name:orgName.trim(),timezone,privacy_contact:privacyContact.trim()||null,public_portal_enabled:publicPortal}).eq('id',orgId);if(updateError)throw updateError;}setSaved(true);if(!orgId)await load();}catch(e){setError(e instanceof Error?e.message:'Unable to save organization settings.');}finally{setSaving(false);}}
  return <><PageTitle eyebrow="WORKSPACE" title={name} subtitle="Manage organization details and public portal visibility."/><DataState loading={busy} error={error&&!canCreate?error:''} onRetry={()=>void load()}/>{error&&canCreate&&<div className="callout">No organization is assigned to this account yet. Create one to start your league workspace.</div>}{saved&&<div className="success-banner"><CheckCircle2 size={17}/>{orgId?'Organization settings saved.':'Organization created.'}</div>}{!busy&&<form onSubmit={save}><Panel title={orgId?'Organization profile':'Create your organization'}><div className="field-grid"><label>Organization name<input value={orgName} onChange={e=>setOrgName(e.target.value)} required maxLength={120}/></label>{orgId&&<><label>Timezone<select value={timezone} onChange={e=>setTimezone(e.target.value)}><option>Asia/Manila</option><option>UTC</option><option>Asia/Singapore</option><option>America/Los_Angeles</option></select></label><label>Privacy contact<input type="email" value={privacyContact} onChange={e=>setPrivacyContact(e.target.value)} placeholder="privacy@yourleague.ph"/></label><label>Public portal<select value={String(publicPortal)} onChange={e=>setPublicPortal(e.target.value==='true')}><option value="false">Private until approved</option><option value="true">Public</option></select></label></>}</div><div className="form-footer"><span className="muted">Sports data remains separate from EO2MATE selling data.</span><Button type="submit" variant="primary" disabled={saving}>{saving?'Saving…':orgId?'Save changes':'Create organization'}</Button></div>{error&&!canCreate&&<div className="form-error" role="alert">{error}</div>}</Panel></form>}</>;
}
