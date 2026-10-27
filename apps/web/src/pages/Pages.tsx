import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, ArrowDownToLine, ArrowRight, Award, CalendarDays, Check, CheckCircle2,
  ChevronDown, CircleHelp, Clock3, Download, Ellipsis, Filter, Flag, Plus, Radio,
  Search, ShieldCheck, Sparkles, Trophy, Undo2, Users, UserRound, Wifi, WifiOff,
} from 'lucide-react';

type Row = { cells: string[]; status?: string };
const initialEvents = [
  { id: 1, time: '06:42', name: 'Alex Cruz', number: '23', action: '2PT made', side: 'Warriors', points: 2 },
  { id: 2, time: '06:51', name: 'Ben Reyes', number: '08', action: 'Steal', side: 'Warriors', points: 0 },
  { id: 3, time: '07:08', name: 'Marco Yu', number: '17', action: 'Defensive rebound', side: 'Falcons', points: 0 },
  { id: 4, time: '07:23', name: 'Alex Cruz', number: '23', action: '2PT made', side: 'Warriors', points: 2 },
];

function PageTitle({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-title"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{subtitle}</p></div>{action && <div className="title-action">{action}</div>}</div>;
}
function Button({ children, variant = 'secondary', onClick, className = '', type = 'button' }: { children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost'; onClick?: () => void; className?: string; type?: 'button' | 'submit' }) {
  return <button type={type} className={`button ${variant} ${className}`} onClick={onClick}>{children}</button>;
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
  return <>
    <PageTitle eyebrow="MONDAY, OCTOBER 27, 2026" title="Good evening, Eugene" subtitle="Here’s what’s happening across your league today." action={<><Button><CalendarDays size={16}/> This week <ChevronDown size={14}/></Button><Link className="button primary" to="/games/live"><Radio size={16}/> Open live console</Link></>} />
    <div className="metrics-grid">
      <Metric label="GAMES TODAY" value="08" note="2 games currently live" icon={CalendarDays} tone="orange"/>
      <Metric label="TEAMS IN SEASON" value="16" note="Senior division · 2026" icon={Users} tone="blue"/>
      <Metric label="PLAYERS REGISTERED" value="248" note="6 registrations need review" icon={UserRound} tone="purple"/>
      <Metric label="GAMES COMPLETED" value="64" note="Across 8 match days" icon={Trophy} tone="green"/>
    </div>
    <div className="dashboard-grid">
      <Panel title="Live now" action={<Link className="text-link" to="/games/live">View all <ArrowRight size={14}/></Link>}>
        <div className="live-card">
          <div className="live-card-top"><Pill tone="live"><span className="pulse-dot"/> LIVE · Q4</Pill><span className="muted tiny">GAME #CC-026</span></div>
          <div className="live-match"><div className="team-mark blue-mark">PW</div><div className="score-side"><span>Pasig Warriors</span><strong>68</strong></div><span className="score-dash">–</span><div className="score-side right"><span>River Falcons</span><strong>65</strong></div><div className="team-mark orange-mark">RF</div></div>
          <div className="live-card-bottom"><span><Clock3 size={14}/> 06:42 remaining</span><span><Wifi size={14}/> Synced just now</span><Link to="/games/live">Open console <ArrowRight size={14}/></Link></div>
        </div>
        <div className="game-row"><div className="game-time">7:30 <small>PM</small></div><div className="game-teams"><b>Pasig Titans <span>vs</span> Makati Bolts</b><small>Pasig Sports Center · Court A</small></div><Pill tone="soft-blue">READY</Pill><Button><Ellipsis size={17}/></Button></div>
        <div className="game-row"><div className="game-time">8:45 <small>PM</small></div><div className="game-teams"><b>QC Falcons <span>vs</span> San Juan Knights</b><small>Pasig Sports Center · Court A</small></div><Pill tone="neutral">SCHEDULED</Pill><Button><Ellipsis size={17}/></Button></div>
      </Panel>
      <Panel title="Needs your attention" action={<Pill tone="soft-orange">6 items</Pill>}>
        <div className="attention-item"><span className="attention-icon orange"><UserRound size={17}/></span><div><b>Player registrations</b><small>6 players are waiting for eligibility review</small></div><Link to="/registrations"><ArrowRight size={16}/></Link></div>
        <div className="attention-item"><span className="attention-icon blue"><ShieldCheck size={17}/></span><div><b>Roster approval</b><small>River Falcons roster has 2 changes</small></div><Link to="/teams"><ArrowRight size={16}/></Link></div>
        <div className="attention-item"><span className="attention-icon purple"><Flag size={17}/></span><div><b>Result review</b><small>Warriors vs Tigers is ready to finalize</small></div><Link to="/games/review"><ArrowRight size={16}/></Link></div>
        <div className="attention-footer"><span className="muted">Last checked 2 minutes ago</span><button className="icon-button" aria-label="Refresh"><Activity size={15}/></button></div>
      </Panel>
    </div>
    <div className="dashboard-grid lower-grid">
      <Panel title="Senior division standings" action={<Link className="text-link" to="/standings">Full standings <ArrowRight size={14}/></Link>}>
        <div className="table-wrap"><table><thead><tr><th>RANK</th><th>TEAM</th><th>GP</th><th>W</th><th>L</th><th>DIFF</th></tr></thead><tbody>
          <tr><td><span className="rank top">01</span></td><td><span className="table-team"><span className="mini-mark blue-mark">PW</span>Pasig Warriors</span></td><td>5</td><td>4</td><td>1</td><td className="positive">+32</td></tr>
          <tr><td><span className="rank top">02</span></td><td><span className="table-team"><span className="mini-mark orange-mark">RF</span>River Falcons</span></td><td>5</td><td>3</td><td>2</td><td className="positive">+16</td></tr>
          <tr><td><span className="rank">03</span></td><td><span className="table-team"><span className="mini-mark purple-mark">CT</span>Community Tigers</span></td><td>5</td><td>3</td><td>2</td><td className="positive">+05</td></tr>
          <tr><td><span className="rank">04</span></td><td><span className="table-team"><span className="mini-mark green-mark">ME</span>Manila Eagles</span></td><td>5</td><td>2</td><td>3</td><td className="negative">−08</td></tr>
        </tbody></table></div>
      </Panel>
      <Panel title="Season leaders" action={<Link className="text-link" to="/reports">View reports <ArrowRight size={14}/></Link>}>
        <div className="leader-list"><div className="leader-row"><span className="leader-badge orange">PTS</span><Avatar initials="AC" color="peach"/><div className="leader-name"><b>Alex Cruz</b><small>Pasig Warriors · #23</small></div><strong>24.8 <small>PPG</small></strong></div><div className="leader-row"><span className="leader-badge blue">REB</span><Avatar initials="JS" color="sky"/><div className="leader-name"><b>Jared Santos</b><small>River Falcons · #11</small></div><strong>11.2 <small>RPG</small></strong></div><div className="leader-row"><span className="leader-badge purple">AST</span><Avatar initials="MR" color="lavender"/><div className="leader-name"><b>Marco Reyes</b><small>Pasig Warriors · #08</small></div><strong>8.7 <small>APG</small></strong></div></div>
      </Panel>
    </div>
  </>;
}

export function Competition() {
  const [saved, setSaved] = useState(false);
  return <><PageTitle eyebrow="LEAGUE SETUP" title="Competition & rules" subtitle="Configure a season and keep a versioned record of the rules used." action={<Button variant="primary" onClick={() => setSaved(true)}><Check size={16}/> Save rule version</Button>} />
    {saved && <div className="success-banner"><CheckCircle2 size={17}/> Rule set saved as Senior-2026-v2. New games will use this version.</div>}
    <div className="form-layout"><div className="form-main"><Panel title="Competition details"><div className="field-grid"><label>Season name<input defaultValue="Community Cup 2026"/></label><label>Division<select defaultValue="senior"><option value="senior">Senior division</option><option>Junior division</option></select></label><label>Competition format<select defaultValue="round"><option value="round">Round robin</option><option>Single elimination</option></select></label><label>Number of teams<input defaultValue="8" type="number"/></label></div></Panel><Panel title="Game rules"><div className="field-grid"><label>Game format<select><option>5 on 5</option></select></label><label>Period length<select><option>4 × 10 minutes</option><option>4 × 12 minutes</option></select></label><label>Overtime length<select><option>5 minutes · repeat if tied</option></select></label><label>Player limit<input defaultValue="12" type="number"/></label><label>Team foul limit<input defaultValue="5" type="number"/></label><label>Timeouts per team<input defaultValue="2" type="number"/></label></div></Panel><Panel title="Standings tie-breakers"><div className="rule-list"><div><span className="drag">⠿</span><b>Wins</b><Pill tone="neutral">1st</Pill></div><div><span className="drag">⠿</span><b>Head-to-head result</b><Pill tone="neutral">2nd</Pill></div><div><span className="drag">⠿</span><b>Point difference</b><Pill tone="neutral">3rd</Pill></div></div><Button><Plus size={15}/> Add tie-breaker</Button></Panel></div><aside className="side-summary"><Panel title="Current version"><div className="version-card"><span className="version-icon"><Sparkles size={17}/></span><b>Senior-2026-v1</b><Pill tone="soft-blue">ACTIVE</Pill><small>Created Oct 02, 2026 by Eugene Alfonso</small></div><div className="note-box"><CircleHelp size={16}/><span>Updates apply to games scheduled from now on. Games already started keep their original rule version.</span></div><button className="text-link full-link">View version history <ArrowRight size={14}/></button></Panel></aside></div>
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

export function Teams() { return <DataPage title="Teams" subtitle="Manage teams, team managers, and submitted rosters." action="Add team" columns={['TEAM','DIVISION','ROSTER','TEAM MANAGER','STATUS']} rows={[
  { cells:['Pasig Warriors','Senior','12 players','Mia Garcia','APPROVED'],status:'APPROVED' },
  { cells:['River Falcons','Senior','11 players','Paolo Dizon','REVIEW'],status:'REVIEW' },
  { cells:['Community Tigers','Senior','10 players','Ana Lim','DRAFT'],status:'DRAFT' },
  { cells:['Manila Eagles','Senior','12 players','Jose Tan','APPROVED'],status:'APPROVED' },
]} />; }
export function Players() { return <DataPage title="Players" subtitle="Sports profiles, team membership, and publication consent." action="Register player" columns={['PLAYER','TEAM','JERSEY','POSITION','PUBLIC PROFILE','STATUS']} rows={[
  { cells:['Alex Cruz','Pasig Warriors','#23','Guard','Not published','APPROVED'],status:'APPROVED' },
  { cells:['Ben Reyes','Pasig Warriors','#08','Guard','Approved name only','APPROVED'],status:'APPROVED' },
  { cells:['Chris Santos','River Falcons','#17','Forward','Private','PENDING'],status:'PENDING' },
  { cells:['Jared Santos','River Falcons','#11','Center','Approved name + photo','APPROVED'],status:'APPROVED' },
]} />; }
export function Registrations() { return <DataPage title="Registration review" subtitle="Review eligibility while keeping private documents away from game staff." action="Invite player" tabs={['All','Pending','Approved','Returned']} columns={['PLAYER','TEAM','REQUIREMENTS','SUBMITTED','STATUS']} rows={[
  { cells:['Chris Santos · #17','River Falcons','Guardian verification pending','Today, 4:12 PM','PENDING'],status:'PENDING' },
  { cells:['Daniel Lee · #04','Community Tigers','Complete · no document required','Today, 3:46 PM','PENDING'],status:'PENDING' },
  { cells:['Alex Cruz · #23','Pasig Warriors','Guardian verified','Oct 26, 2026','READY'],status:'READY' },
  { cells:['Ben Reyes · #08','Pasig Warriors','Approved · eligibility complete','Oct 25, 2026','APPROVED'],status:'APPROVED' },
]} />; }
export function Games() {
  const [scheduleOpen,setScheduleOpen]=useState(false);
  const [saved,setSaved]=useState(false);
  const [matchups,setMatchups]=useState([
    { date:'Today · 6:00 PM', matchup:'Pasig Warriors vs River Falcons', venue:'Community Court A', scorer:'Staff 02', reviewer:'League Admin 01', status:'LIVE' },
    { date:'Today · 7:30 PM', matchup:'Pasig Titans vs Makati Bolts', venue:'Community Court A', scorer:'Staff 03', reviewer:'League Admin 01', status:'READY' },
    { date:'Today · 8:45 PM', matchup:'QC Falcons vs San Juan Knights', venue:'Community Court B', scorer:'Staff 04', reviewer:'League Admin 02', status:'SCHEDULED' },
    { date:'Tomorrow · 6:00 PM', matchup:'Community Tigers vs Manila Eagles', venue:'Arena 2', scorer:'Not assigned', reviewer:'League Admin 02', status:'SCHEDULED' },
  ]);
  const [home,setHome]=useState('Pasig Warriors'); const [away,setAway]=useState('River Falcons');
  function createMatchup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const date = String(form.get('date') || 'Oct 28, 2026');
    const time = String(form.get('time') || '6:00 PM');
    if (home === away) return;
    const displayTime = time.includes(':') ? `${Number(time.slice(0,2)) % 12 || 12}:${time.slice(3)} ${Number(time.slice(0,2)) >= 12 ? 'PM' : 'AM'}` : time;
    setMatchups([{ date:`${date} · ${displayTime}`, matchup:`${home} vs ${away}`, venue:String(form.get('venue')), scorer:String(form.get('scorer')), reviewer:String(form.get('reviewer')), status:'SCHEDULED' }, ...matchups]);
    setScheduleOpen(false); setSaved(true);
  }
  return <>
    <PageTitle eyebrow="GAME DAY OPERATIONS" title="Game schedule" subtitle="Build matchups, assign the court crew, and check schedule conflicts." action={<><Button><CalendarDays size={15}/> Calendar view</Button><Button variant="primary" onClick={()=>{setScheduleOpen(true);setSaved(false);}}><Plus size={16}/> Schedule a matchup</Button></>}/>
    {saved && <div className="success-banner"><CheckCircle2 size={17}/> Matchup scheduled. The assigned scorer and reviewer can now see this game.</div>}
    <div className="schedule-toolbar"><div className="schedule-week"><button className="week-arrow">‹</button><div><b>October 26 – November 1, 2026</b><small>Community Cup · Senior division</small></div><button className="week-arrow">›</button></div><div className="schedule-filters"><Button>All venues <ChevronDown size={14}/></Button><Button>All statuses <ChevronDown size={14}/></Button></div></div>
    <div className="week-strip">{[['MON','26','2'],['TUE','27','4'],['WED','28','3'],['THU','29','2'],['FRI','30','5'],['SAT','31','6'],['SUN','01','1']].map(([day,date,count],i)=><button key={day} className={`week-day ${i===1?'current':''}`}><small>{day}</small><b>{date}</b><span>{count} games</span></button>)}</div>
    <Panel title="Upcoming matchups" action={<span className="muted tiny">{matchups.length} games this week</span>}>
      <div className="table-wrap"><table><thead><tr><th>DATE & TIP-OFF</th><th>MATCHUP</th><th>VENUE</th><th>SCORER</th><th>RESULT REVIEWER</th><th>STATUS</th><th/></tr></thead><tbody>{matchups.map((game,i)=><tr key={`${game.matchup}-${i}`}><td><b>{game.date.split(' · ')[0]}</b><br/><small className="muted">{game.date.split(' · ')[1]}</small></td><td><div className="matchup-cell"><span className="mini-mark blue-mark">{game.matchup.split(' vs ')[0].split(' ').map(x=>x[0]).join('').slice(0,2)}</span><b>{game.matchup.split(' vs ')[0]}</b><span className="muted">vs</span><span className="mini-mark orange-mark">{game.matchup.split(' vs ')[1].split(' ').map(x=>x[0]).join('').slice(0,2)}</span><b>{game.matchup.split(' vs ')[1]}</b></div></td><td>{game.venue}</td><td>{game.scorer}</td><td>{game.reviewer}</td><td><Pill tone={game.status==='LIVE'?'live':game.status==='READY'?'soft-green':'neutral'}>{game.status}</Pill></td><td><button className="icon-button"><Ellipsis size={17}/></button></td></tr>)}</tbody></table></div>
    </Panel>
    <div className="schedule-notes"><span><CheckCircle2 size={15}/> No venue conflicts in this week</span><span><Users size={15}/> Staff assignment is scoped to this game</span><Link to="/games/review">Open result review <ArrowRight size={14}/></Link></div>
    {scheduleOpen && <div className="modal-scrim" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setScheduleOpen(false);}}><form className="schedule-modal" onSubmit={createMatchup}><div className="modal-heading"><div><span className="eyebrow">COMMUNITY CUP · SENIOR DIVISION</span><h2>Schedule a matchup</h2><p>Choose the teams, time, venue, and assigned game staff.</p></div><button type="button" className="icon-button" onClick={()=>setScheduleOpen(false)}>×</button></div><div className="field-grid"><label>Home team<select value={home} onChange={e=>setHome(e.target.value)}><option>Pasig Warriors</option><option>Pasig Titans</option><option>Community Tigers</option><option>Manila Eagles</option><option>QC Falcons</option></select></label><label>Away team<select value={away} onChange={e=>setAway(e.target.value)}><option>River Falcons</option><option>Makati Bolts</option><option>San Juan Knights</option><option>Community Tigers</option><option>Manila Eagles</option></select></label><label>Date<input name="date" type="date" defaultValue="2026-10-28" required/></label><label>Tip-off time<input name="time" type="time" defaultValue="18:00" required/></label><label>Venue<select name="venue"><option>Community Court A</option><option>Community Court B</option><option>Pasig Sports Center</option><option>Arena 2</option></select></label><label>Assigned scorer<select name="scorer"><option>Staff 02</option><option>Staff 03</option><option>Staff 04</option><option>Unassigned</option></select></label><label className="span-2">Result reviewer<select name="reviewer"><option>League Admin 01</option><option>League Admin 02</option><option>Organization Owner</option></select></label></div>{home===away && <div className="form-error">Choose two different teams for this matchup.</div>}<div className="conflict-check"><CheckCircle2 size={16}/><span><b>No scheduling conflicts found</b><small>Teams, venue, and assigned staff are available at this time.</small></span><Pill tone="soft-green">CLEAR</Pill></div><div className="modal-footer"><Button onClick={()=>setScheduleOpen(false)}>Cancel</Button><Button type="submit" variant="primary"><CalendarDays size={15}/> Confirm matchup</Button></div></form></div>}
  </>;
}

export function LiveGame() {
  const [events, setEvents] = useState(initialEvents);
  const [score, setScore] = useState({ Warriors: 68, Falcons: 65 });
  const [selected, setSelected] = useState('Alex Cruz');
  const [activeTeam, setActiveTeam] = useState<'Warriors'|'Falcons'>('Warriors');
  const [period, setPeriod] = useState('Q4');
  const [clockRunning, setClockRunning] = useState(false);
  const [seconds, setSeconds] = useState('06:42');
  const [notice, setNotice] = useState('All changes are saved to this demo game.');
  const players = activeTeam === 'Warriors' ? ['Alex Cruz','Ben Reyes','Dan Lim','Eli Lee','Finn Tan'] : ['Marco Yu','Paolo Dizon','Chris Santos','Jared Santos','Nico Ong'];
  function record(action: string, points = 0) {
    const playerData = selected.match(/^(.*?)(?:\s+#(\d+))?$/);
    const playerName = selected.replace(/\s+#\d+$/, '');
    const team = activeTeam;
    const nextScore = { ...score, [team]: score[team] + points };
    setScore(nextScore);
    setEvents([{ id: Date.now(), time: seconds, name: playerName, number: playerData?.[2] ?? (team === 'Warriors' ? '23' : '17'), action, side: team, points }, ...events]);
    setNotice(`${playerName} · ${action} recorded`);
  }
  function undo() {
    const last = events[0];
    if (!last) return;
    if (last.points) setScore(current => ({ ...current, [last.side]: current[last.side as keyof typeof current] - last.points }));
    setEvents(current => current.slice(1));
    setNotice('Last event reversed. The history remains available for review.');
  }
  return <>
    <PageTitle eyebrow="COURTSIDE · GAME CC-026" title="Live game console" subtitle="Pasig Warriors vs River Falcons · Community Court A" action={<><Link className="button" to="/games/review"><CheckCircle2 size={16}/> Review game</Link><Button><Ellipsis size={17}/></Button></>} />
    <div className="console-status"><span><span className="pulse-dot"/> LIVE · {period}</span><span><Wifi size={14}/> Connected · last saved just now</span><span className="console-status-right">Assigned scorer: Staff 02</span></div>
    <div className="score-console">
      <div className="score-team"><span className="team-mark blue-mark large-mark">PW</span><span className="score-team-name">PASIG WARRIORS</span><strong>{score.Warriors}</strong><div className="score-meta"><span>TEAM FOULS <b>3</b></span><span>TIMEOUTS <b>2</b></span></div></div>
      <div className="game-clock"><div className="clock-period"><button onClick={() => setPeriod(period === 'Q4' ? 'OT' : `Q${Number(period.replace('Q','')||0)+1}`)}>{period} <ChevronDown size={13}/></button><Pill tone="live"><span className="pulse-dot"/> IN PROGRESS</Pill></div><strong>{seconds}</strong><div className="clock-buttons"><Button variant="primary" onClick={() => setClockRunning(!clockRunning)}>{clockRunning ? 'Pause clock' : 'Start clock'}</Button><Button onClick={() => setSeconds('10:00')}>Reset</Button></div><small>{clockRunning ? 'Clock running' : 'Clock stopped'}</small></div>
      <div className="score-team"><span className="team-mark orange-mark large-mark">RF</span><span className="score-team-name">RIVER FALCONS</span><strong>{score.Falcons}</strong><div className="score-meta"><span>TEAM FOULS <b>4</b></span><span>TIMEOUTS <b>1</b></span></div></div>
    </div>
    <div className="scoring-layout">
      <section className="panel scoring-panel"><div className="panel-heading"><div><h2>Record game event</h2><p>Select a team and player, then tap a stat.</p></div><div className="team-switch"><button className={activeTeam === 'Warriors' ? 'active' : ''} onClick={() => { setActiveTeam('Warriors'); setSelected('Alex Cruz'); }}>Warriors</button><button className={activeTeam === 'Falcons' ? 'active' : ''} onClick={() => { setActiveTeam('Falcons'); setSelected('Marco Yu'); }}>Falcons</button></div></div><div className="on-court-label">ON COURT <span>5 players</span></div><div className="player-chips">{players.map((player, i) => <button key={player} className={selected === player ? 'selected' : ''} onClick={() => setSelected(player)}><Avatar initials={player.split(' ').map(n=>n[0]).join('')} color={i % 2 ? 'sky' : 'peach'}/><span>{player}<small>#{['23','08','05','11','14'][i]}</small></span></button>)}</div><div className="stat-group"><div className="stat-group-label">SHOT</div><div className="stat-grid shot-grid"><button onClick={() => record('2PT made',2)}><b>+2</b><small>2PT made</small></button><button onClick={() => record('2PT missed')}><b>2PT</b><small>missed</small></button><button onClick={() => record('3PT made',3)}><b>+3</b><small>3PT made</small></button><button onClick={() => record('3PT missed')}><b>3PT</b><small>missed</small></button><button onClick={() => record('Free throw made',1)}><b>+1</b><small>FT made</small></button><button onClick={() => record('Free throw missed')}><b>FT</b><small>missed</small></button></div></div><div className="stat-group"><div className="stat-group-label">GAME STATS</div><div className="stat-grid"><button onClick={() => record('Offensive rebound')}><b>OREB</b><small>Off. rebound</small></button><button onClick={() => record('Defensive rebound')}><b>DREB</b><small>Def. rebound</small></button><button onClick={() => record('Assist')}><b>AST</b><small>Assist</small></button><button onClick={() => record('Steal')}><b>STL</b><small>Steal</small></button><button onClick={() => record('Block')}><b>BLK</b><small>Block</small></button><button onClick={() => record('Turnover')}><b>TO</b><small>Turnover</small></button><button onClick={() => record('Personal foul')}><b>FOUL</b><small>Personal foul</small></button><button onClick={() => setNotice('Substitution panel opened · choose player out and player in.') }><b>SUB</b><small>Substitution</small></button></div></div><div className="scoring-controls"><Button onClick={() => setNotice('Clock adjustment is ready. Select a period and enter a reason before saving.') }><Clock3 size={15}/> Adjust clock</Button><Button onClick={() => setNotice(`${activeTeam} timeout recorded.`)}>Team timeout</Button><Button onClick={() => setNotice(`Quarter control: ${period} is selected.`)}>End period</Button></div></section>
      <section className="panel play-panel"><div className="panel-heading"><div><h2>Play-by-play</h2><p>Event log · newest first</p></div><Button onClick={undo}><Undo2 size={15}/> Undo last</Button></div><div className="sync-note"><CheckCircle2 size={15}/><span>{notice}</span><button className="icon-button"><Ellipsis size={17}/></button></div><div className="timeline">{events.map((event, i) => <div key={event.id} className="timeline-event"><span className={`timeline-marker ${event.points ? 'points' : ''}`}>{event.points ? '+' + event.points : '•'}</span><div className="timeline-copy"><b>{event.name} <span>#{event.number}</span></b><small>{event.action} · {event.side}</small></div><time>{event.time}</time><button className="icon-button" aria-label="Event options"><Ellipsis size={16}/></button>{i === 0 && <span className="new-event">NEW</span>}</div>)}</div><div className="panel-bottom"><Link to="/games/review" className="text-link">Open full box score <ArrowRight size={14}/></Link><span className="muted tiny">Event history is append-only</span></div></section>
    </div>
  </>;
}

export function GameReview() { const [finalized,setFinalized] = useState(false); return <><PageTitle eyebrow="GAME CC-026 · RESULT REVIEW" title="Review & finalize" subtitle="Check the event-derived box score before publishing the official result." action={<Button variant="primary" onClick={() => setFinalized(true)}><ShieldCheck size={16}/> Finalize result</Button>}/>{finalized && <div className="success-banner"><CheckCircle2 size={17}/> Result finalized. Standings and the public scoreboard are ready to update.</div>}<div className="review-score"><div><span>Pasig Warriors</span><strong>82</strong></div><Pill tone={finalized ? 'soft-green' : 'soft-orange'}>{finalized ? 'FINAL' : 'READY FOR REVIEW'}</Pill><div><span>River Falcons</span><strong>78</strong></div></div><div className="metrics-grid compact"><Metric label="EVENTS" value="148" note="All acknowledged" icon={Activity}/><Metric label="PENDING WRITES" value="0" note="Everything is synced" icon={Wifi}/><Metric label="VALIDATION" value="Passed" note="Score reconciles" icon={CheckCircle2} tone="green"/><Metric label="REVIEWER" value="You" note="League Admin" icon={ShieldCheck} tone="purple"/></div><Panel title="Player box score" action={<Button><Download size={15}/> Export box score</Button>}><div className="table-wrap"><table><thead><tr><th>PLAYER</th><th>MIN</th><th>PTS</th><th>FG</th><th>3PT</th><th>FT</th><th>OREB</th><th>DREB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>PF</th></tr></thead><tbody><tr><td>Alex Cruz #23</td><td>28:20</td><td>18</td><td>7/12</td><td>2/5</td><td>2/2</td><td>2</td><td>4</td><td>3</td><td>1</td><td>0</td><td>2</td><td>3</td></tr><tr><td>Ben Reyes #08</td><td>26:10</td><td>12</td><td>5/10</td><td>1/3</td><td>1/2</td><td>0</td><td>3</td><td>5</td><td>0</td><td>1</td><td>1</td><td>2</td></tr><tr><td>Other Warriors</td><td>—</td><td>52</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr><tr className="total-row"><td>Team total</td><td>—</td><td>82</td><td>31/64</td><td>8/24</td><td>12/16</td><td>10</td><td>27</td><td>19</td><td>8</td><td>4</td><td>11</td><td>16</td></tr></tbody></table></div><div className="review-checks"><span><CheckCircle2 size={15}/> Score reconciles</span><span><CheckCircle2 size={15}/> No pending writes</span><span><CheckCircle2 size={15}/> Lineup warnings resolved</span></div></Panel></>; }

export function Standings() { return <><PageTitle title="Standings" subtitle="Official season rankings use finalized games and the saved tie-break rules." action={<><Button><Download size={15}/> Export</Button><Button>Senior division <ChevronDown size={14}/></Button></>}/><div className="callout"><Trophy size={18}/><span>Community Cup 2026 · Senior division</span><Pill tone="soft-blue">Updated after game CC-026</Pill></div><Panel title="League table"><div className="table-wrap"><table><thead><tr><th>RANK</th><th>TEAM</th><th>GP</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>DIFF</th><th>PTS</th></tr></thead><tbody><tr><td><span className="rank top">01</span></td><td><span className="table-team"><span className="mini-mark blue-mark">PW</span>Pasig Warriors</span></td><td>5</td><td>4</td><td>1</td><td>410</td><td>378</td><td className="positive">+32</td><td><b>9</b></td></tr><tr><td><span className="rank top">02</span></td><td><span className="table-team"><span className="mini-mark orange-mark">RF</span>River Falcons</span></td><td>5</td><td>3</td><td>2</td><td>398</td><td>382</td><td className="positive">+16</td><td><b>8</b></td></tr><tr><td><span className="rank">03</span></td><td><span className="table-team"><span className="mini-mark purple-mark">CT</span>Community Tigers</span></td><td>5</td><td>3</td><td>2</td><td>375</td><td>370</td><td className="positive">+5</td><td><b>8</b></td></tr><tr><td><span className="rank">04</span></td><td><span className="table-team"><span className="mini-mark green-mark">ME</span>Manila Eagles</span></td><td>5</td><td>2</td><td>3</td><td>360</td><td>368</td><td className="negative">−8</td><td><b>7</b></td></tr></tbody></table></div></Panel></>; }

export function PublicLive() { return <><PageTitle eyebrow="PUBLIC SCOREBOARD PREVIEW" title="Community Cup · Live game" subtitle="Read-only page · only approved public sports data is shown." action={<Pill tone="soft-green">PUBLIC VIEW</Pill>}/><div className="public-score"><div className="public-score-head"><Pill tone="live"><span className="pulse-dot"/> LIVE</Pill><span>Q4 · 06:42 remaining</span><span className="muted">Updated just now</span></div><div className="public-match"><div><span className="team-mark blue-mark large-mark">PW</span><h2>Pasig Warriors</h2><strong>68</strong></div><span className="versus">—</span><div><span className="team-mark orange-mark large-mark">RF</span><h2>River Falcons</h2><strong>65</strong></div></div><div className="public-tabs"><button className="selected">Play-by-play</button><button>Box score</button><button>Team stats</button></div><div className="public-play"><span>06:42 · Q4</span><b>Alex Cruz</b><span>2PT made</span><span className="positive">+2</span></div><div className="public-play"><span>06:51 · Q4</span><b>Ben Reyes</b><span>Steal</span><span>—</span></div></div><div className="privacy-foot"><ShieldCheck size={16}/> Public view excludes registration details, guardian contacts, and private eligibility records.</div></>; }

export function Announcements() { const [sent,setSent]=useState(false); return <><PageTitle title="Announcements" subtitle="Prepare league updates and notify only the selected audience." action={<Button variant="primary" onClick={() => setSent(true)}>Publish announcement</Button>}/>{sent && <div className="success-banner"><CheckCircle2 size={17}/> Announcement published to the selected audience.</div>}<div className="form-layout"><div className="form-main"><Panel title="Compose update"><div className="field-grid"><label>Audience<select><option>Team managers · Senior division</option><option>All league staff</option><option>Public followers</option></select></label><label>Delivery<select><option>In-app notification</option><option>In-app + opted-in email</option></select></label><label className="span-2">Subject<input defaultValue="Updated game schedule"/></label><label className="span-2">Message<textarea rows={6} defaultValue="Pasig Warriors vs River Falcons is scheduled for 6:00 PM at Community Court A. Please confirm your roster before the game."/></label></div><div className="form-footer"><span className="muted">Preview first; private recipient details stay hidden.</span><Button variant="primary" onClick={() => setSent(true)}>Publish update</Button></div></Panel></div><aside className="side-summary"><Panel title="Message preview"><div className="message-preview"><span className="preview-label">EO2MATE SPORTS · UPDATE</span><b>Updated game schedule</b><p>Pasig Warriors vs River Falcons is scheduled for 6:00 PM at Community Court A. Please confirm your roster before the game.</p><small>For Senior division team managers</small></div></Panel></aside></div></>; }

export function Access() { return <DataPage title="Staff access & audit" subtitle="Keep roles scoped to the work people need, and review sensitive actions." action="Invite staff" tabs={['Staff','Audit log']} columns={['STAFF MEMBER','ROLE','SCOPE','LAST ACTIVE','STATUS']} rows={[
  { cells:['Eugene Alfonso','Organization Owner','All league functions','Just now','ACTIVE'],status:'APPROVED' },
  { cells:['Staff 02','Scorer','Assigned games only','2 min ago','ACTIVE'],status:'APPROVED' },
  { cells:['Mia Garcia','Team Manager','Pasig Warriors roster','Today, 5:11 PM','ACTIVE'],status:'APPROVED' },
  { cells:['League Admin 01','Result Reviewer','Senior division','Today, 4:47 PM','ACTIVE'],status:'APPROVED' },
]} />; }

export function Reports() { const [exported,setExported]=useState(false); return <><PageTitle title="Reports & analytics" subtitle="Explore official results, player performance, and season trends." action={<Button variant="primary" onClick={() => setExported(true)}><Download size={16}/> Export report</Button>}/>{exported && <div className="success-banner"><CheckCircle2 size={17}/> Report export prepared for this demo.</div>}<div className="report-filters"><Button>Community Cup 2026 <ChevronDown size={14}/></Button><Button>Senior division <ChevronDown size={14}/></Button><Button>Final games only <ChevronDown size={14}/></Button><span className="muted">Data through Oct 27, 2026</span></div><div className="metrics-grid"><Metric label="AVG TEAM POINTS" value="81.4" note="Per finalized game" icon={Activity} tone="orange"/><Metric label="AVG REBOUNDS" value="39.2" note="Offensive + defensive" icon={Users} tone="blue"/><Metric label="AVG ASSISTS" value="18.6" note="Per finalized game" icon={Award} tone="purple"/><Metric label="AVG TURNOVERS" value="12.1" note="Per finalized game" icon={Flag} tone="green"/></div><div className="dashboard-grid"><Panel title="Scoring trend" action={<Pill tone="neutral">Last 6 match days</Pill>}><div className="chart-wrap"><div className="chart-y"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div><div className="bar-chart">{[55,68,60,76,69,88,72,95,81,75,92,84].map((v,i)=><div key={i} className="bar-group"><div className="bar" style={{height:`${v}%`}}/><span>{i+1}</span></div>)}</div></div></Panel><Panel title="Report library">{['Game box score','Player game log','Team season statistics','League leaders','Standings & results','Corrections and audit report'].map((name,i)=><div className="report-row" key={name}><span className="report-icon"><Activity size={16}/></span><div><b>{name}</b><small>{['Per-game player and team totals','Event history by player','Season totals, averages, and rank','Top performers by stat category','Final scores and standings history','Changed or reversed game events'][i]}</small></div><button className="icon-button"><Download size={15}/></button></div>)}</Panel></div></>; }

export function GenericPage({ name }: { name: string }) { return <><PageTitle eyebrow="WORKSPACE" title={name} subtitle="Set up this organization space before inviting the rest of your league." action={<Button variant="primary"><Plus size={16}/> Add details</Button>}/><Panel title="Organization profile"><div className="field-grid"><label>Organization name<input defaultValue="Pasig Community League"/></label><label>Timezone<select><option>Asia/Manila (UTC+8)</option></select></label><label>Privacy contact<input defaultValue="privacy@example.invalid"/></label><label>Public portal<select><option>Private until approved</option><option>Public</option></select></label></div><div className="form-footer"><span className="muted">Sports data remains separate from EO2MATE selling data.</span><Button variant="primary">Save changes</Button></div></Panel></>; }
