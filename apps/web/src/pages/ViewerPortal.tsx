import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams, useParams } from 'react-router-dom';
import { Activity, CalendarDays, ChevronRight, MapPin, ShieldCheck, Trophy, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Organization = { id: string; name: string; slug: string; sport?: string; timezone?: string };
type League = { id: string; name: string; status?: string; season?: string };
type Competition = { id: string; league_id?: string; name: string; format?: string; status?: string };
type Team = { id: string; name: string; code?: string; competition_id?: string };
type Game = { id: string; competition_id?: string; scheduled_at?: string; status?: string; period?: number; clock_ms?: number; home_score?: number; away_score?: number; home_team?: string; away_team?: string; venue?: string };
type TeamStat = { team: string; played: number; wins: number; losses: number; points_for: number; points_against: number };
type PlayerStat = { name: string; team: string; points: number; rebounds: number; assists: number; steals: number; blocks: number };
type PublicEvent = { game: string; at: string; period: number; clock_ms: number; team: string; player?: string; event: string; points: number };
type PortalData = { organizations?: Organization[]; organization?: Organization | null; leagues?: League[]; competitions?: Competition[]; teams?: Team[]; games?: Game[]; team_stats?: TeamStat[]; player_stats?: PlayerStat[]; events?: PublicEvent[] };
type Tab = 'Overview' | 'Games' | 'League stats' | 'Play-by-play';

export default function ViewerPortal() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const memberOrgId = params.get('organization_id');
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('Overview');
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void Promise.resolve(supabase.rpc('get_sports_viewer_portal', { p_slug: slug ?? null, p_organization_id: memberOrgId ?? null }))
      .then(({ data: result, error: rpcError }) => {
        if (!active) return;
        if (rpcError) throw rpcError;
        setData((result ?? {}) as PortalData);
      }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : 'Viewer information is unavailable.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug, memberOrgId]);
  const organization = data?.organization;
  const competitions = data?.competitions ?? [];
  const leagueNames = useMemo(() => Object.fromEntries((data?.leagues ?? []).map(row => [row.id, row.name])), [data?.leagues]);
  const competitionNames = useMemo(() => Object.fromEntries(competitions.map(row => [row.id, row.name])), [competitions]);

  return <main className="viewer-portal">
    <header className="viewer-header"><Link to="/viewer" className="viewer-brand"><span className="viewer-brand-mark">◌</span><span><b>EO2MATE SPORTS</b><small>VIEWER PORTAL</small></span></Link><span className="viewer-readonly"><ShieldCheck size={15}/> Read-only public information</span></header>
    {loading && <div className="viewer-state">Loading public sports information…</div>}
    {!loading && error && <section className="viewer-state viewer-error"><h2>Unable to load this viewer page</h2><p>{error}</p><Link to="/viewer">Browse public organizations</Link></section>}
    {!loading && !error && !organization && <>
      <section className="viewer-hero"><span className="viewer-eyebrow">FOLLOW THE SEASON</span><h1>Games, leagues, and stats</h1><p>Browse public information shared by participating sports organizations.</p></section>
      <section className="viewer-org-grid">{(data?.organizations ?? []).map(org => <Link className="viewer-org-card" key={org.id} to={`/viewer/${encodeURIComponent(org.slug)}`}><span className="viewer-org-icon"><Trophy size={20}/></span><span><small>{org.sport ?? 'SPORTS ORGANIZATION'}</small><b>{org.name}</b><em>View organization, leagues, games, and stats <ChevronRight size={14}/></em></span></Link>)}{!data?.organizations?.length && <div className="viewer-state">No organizations have enabled public viewing yet.</div>}</section>
    </>}
    {!loading && !error && organization && <>
      <section className="viewer-hero viewer-org-hero"><div><span className="viewer-eyebrow">{organization.sport ?? 'SPORTS ORGANIZATION'}</span><h1>{organization.name}</h1><p>Public leagues, competition schedule, results, and approved statistics.</p></div><div className="viewer-hero-badge"><Trophy size={26}/><span>Official<br/>viewer page</span></div></section>
      <nav className="viewer-tabs" aria-label="Viewer sections">{(['Overview','Games','League stats','Play-by-play'] as Tab[]).map(item=><button key={item} className={tab===item?'selected':''} onClick={()=>setTab(item)}>{item==='Games'?<CalendarDays size={15}/>:item==='League stats'?<Activity size={15}/>:item==='Overview'?<Users size={15}/>:<Activity size={15}/>}<span>{item}</span></button>)}</nav>
      {tab==='Overview'&&<div className="viewer-overview-grid"><section className="viewer-panel"><div className="viewer-panel-title"><span><Users size={17}/></span><div><h2>Leagues and competitions</h2><p>Published competition information</p></div></div>{(data?.leagues??[]).map(league=><article className="viewer-list-row" key={league.id}><div><b>{league.name}</b><small>{league.season??league.status??'League'}</small></div><span className="viewer-count">{competitions.filter(c=>c.league_id===league.id).length} competitions</span></article>)}{!data?.leagues?.length&&<p className="viewer-empty">No public leagues are available.</p>}</section><section className="viewer-panel"><div className="viewer-panel-title"><span><Trophy size={17}/></span><div><h2>Competitions</h2><p>Approved and active competitions</p></div></div>{competitions.map(comp=><article className="viewer-list-row" key={comp.id}><div><b>{comp.name}</b><small>{leagueNames[comp.league_id??'']??comp.format??'Competition'}</small></div><span className={`viewer-status ${comp.status?.toLowerCase()??''}`}>{comp.status??'Published'}</span></article>)}{!competitions.length&&<p className="viewer-empty">No public competitions are available.</p>}</section></div>}
      {tab==='Games'&&<section className="viewer-panel"><div className="viewer-panel-title"><span><CalendarDays size={17}/></span><div><h2>Games</h2><p>Schedule and final scores</p></div></div><div className="viewer-game-list">{(data?.games??[]).map(game=><article className="viewer-game-card" key={game.id}><div className="viewer-game-meta"><span>{competitionNames[game.competition_id??'']??'Competition'}</span><span className={`viewer-status ${game.status?.toLowerCase()??''}`}>{game.status??'Scheduled'}</span></div><div className="viewer-game-score"><b>{game.home_team??'Home'}</b><strong>{game.home_score??'—'} <i>:</i> {game.away_score??'—'}</strong><b>{game.away_team??'Away'}</b></div><div className="viewer-game-foot"><span><CalendarDays size={13}/>{game.scheduled_at?new Date(game.scheduled_at).toLocaleString():'Time TBD'}</span>{game.venue&&<span><MapPin size={13}/>{game.venue}</span>}{game.status==='LIVE'&&<span className="viewer-live">Period {game.period??1} · {formatClock(game.clock_ms??0)}</span>}</div></article>)}{!data?.games?.length&&<p className="viewer-empty">No public games are available.</p>}</div></section>}
      {tab==='League stats'&&<div className="viewer-stats-grid"><section className="viewer-panel"><div className="viewer-panel-title"><span><Trophy size={17}/></span><div><h2>Team standings</h2><p>Results from published games</p></div></div><div className="viewer-table-scroll"><table className="viewer-table"><thead><tr><th>Team</th><th>GP</th><th>W</th><th>L</th><th>PF</th><th>PA</th></tr></thead><tbody>{(data?.team_stats??[]).map((row,i)=><tr key={`${row.team}-${i}`}><td>{row.team}</td><td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.points_for}</td><td>{row.points_against}</td></tr>)}</tbody></table></div>{!data?.team_stats?.length&&<p className="viewer-empty">Standings will appear as public game results are finalized.</p>}</section><section className="viewer-panel"><div className="viewer-panel-title"><span><Activity size={17}/></span><div><h2>Player leaders</h2><p>Names shown only with public approval</p></div></div><div className="viewer-table-scroll"><table className="viewer-table"><thead><tr><th>Player</th><th>Team</th><th>PTS</th><th>REB</th><th>AST</th></tr></thead><tbody>{(data?.player_stats??[]).map((row,i)=><tr key={`${row.name}-${i}`}><td>{row.name}</td><td>{row.team}</td><td>{row.points}</td><td>{row.rebounds}</td><td>{row.assists}</td></tr>)}</tbody></table></div>{!data?.player_stats?.length&&<p className="viewer-empty">No consent-approved player stats are available.</p>}</section></div>}
      {tab==='Play-by-play'&&<section className="viewer-panel"><div className="viewer-panel-title"><span><Activity size={17}/></span><div><h2>Recent play-by-play</h2><p>Published game events; private player details are hidden</p></div></div>{(data?.events??[]).map((event,i)=><article className="viewer-event-row" key={`${event.game}-${event.at}-${i}`}><time>Q{event.period} · {formatClock(event.clock_ms)}</time><span><b>{event.player??event.team}</b> {event.event.replaceAll('_',' ').toLowerCase()}</span><small>{event.game}</small>{event.points>0&&<strong>+{event.points}</strong>}</article>)}{!data?.events?.length&&<p className="viewer-empty">No public play-by-play is available.</p>}</section>}
      <div className="viewer-privacy"><ShieldCheck size={15}/> This public page excludes account, contact, guardian, birth-date, payment, and administrative information.</div>
    </>}
    <footer className="viewer-footer"><span>EO2MATE SPORTS</span><span>Public viewer portal · Read only</span></footer>
  </main>;
}

function formatClock(ms:number){const seconds=Math.max(0,Math.floor(ms/1000));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
