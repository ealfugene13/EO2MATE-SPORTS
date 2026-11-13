import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Activity, CalendarDays, ChevronRight, MapPin, Trophy, Users, UserRound, Building2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Organization = { id: string; name: string; slug: string; sport?: string; timezone?: string };
type League = { id: string; name: string; status?: string; season?: string };
type Competition = { id: string; league_id?: string; name: string; format?: string; status?: string };
type Team = { id: string; name: string; code?: string; league?: string; competition?: string; competition_ids?: string[] };
type Player = { name: string; team: string; league?: string; competition?: string; competition_ids?: string[]; jersey_number?: number | null; position?: string | null };
type Game = { id: string; competition_id?: string; scheduled_at?: string; status?: string; period?: number; clock_ms?: number; home_score?: number; away_score?: number; home_team_id?: string; away_team_id?: string; home_team?: string; away_team?: string; venue?: string };
type Fixture = { id: string; competition_id: string; round_no: number; slot_no: number; home_team_id?: string | null; away_team_id?: string | null; game_id?: string | null; status?: string; home_team?: string | null; away_team?: string | null; game_status?: string | null; home_score?: number | null; away_score?: number | null; scheduled_at?: string | null };
type TeamStat = { team: string; played: number; wins: number; losses: number; points_for: number; points_against: number };
type PlayerStat = { name: string; team: string; points: number; rebounds: number; assists: number; steals: number; blocks: number };
type PublicEvent = { game_id: string; game: string; at: string; period: number; clock_ms: number; team: string; player?: string; event: string; points: number };
type BoxStats = { fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number; reb: number; ast: number; stl: number; blk: number; tov: number; pf: number };
type BoxPlayer = BoxStats & { player_id: string; team_id: string; name: string; number?: number | null; position?: string | null; pts: number };
type PeriodScore = { period: number; home: number; away: number };
type GameBoxScore = { game_id: string; period_scores: PeriodScore[]; home_stats: BoxStats; away_stats: BoxStats; players: BoxPlayer[] };
type PortalData = { organizations?: Organization[]; organization?: Organization | null; leagues?: League[]; competitions?: Competition[]; teams?: Team[]; players?: Player[]; games?: Game[]; fixtures?: Fixture[]; team_stats?: TeamStat[]; player_stats?: PlayerStat[]; events?: PublicEvent[]; game_box_scores?: GameBoxScore[] };
export type Tab = 'Organization' | 'League' | 'Competition' | 'Team' | 'Player' | 'Games' | 'Stats';

export default function ViewerPortal({section='Organization',embedded=false}:{section?:Tab;embedded?:boolean}) {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const memberOrganizationId = params.get('organization_id');
  const selectedSlug = slug ?? params.get('organization');
  const selectedLeagueId = params.get('league_id');
  const selectedCompetitionId = params.get('competition_id');
  const selectedGameId = params.get('game_id');
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>(section);
  useEffect(()=>setTab(section),[section]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void Promise.resolve(supabase.rpc('get_sports_viewer_portal', { p_slug: selectedSlug ?? null, p_organization_id: memberOrganizationId }))
      .then(({ data: result, error: rpcError }) => {
        if (!active) return;
        if (rpcError) throw rpcError;
        setData((result ?? {}) as PortalData);
      }).catch((e: unknown) => { if (active) setError(viewerErrorMessage(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedSlug, memberOrganizationId]);
  const organization = data?.organization;
  const competitions = data?.competitions ?? [];
  const leagueNames = useMemo(() => Object.fromEntries((data?.leagues ?? []).map(row => [row.id, row.name])), [data?.leagues]);
  const competitionNames = useMemo(() => Object.fromEntries(competitions.map(row => [row.id, row.name])), [competitions]);
  const selectedLeague = data?.leagues?.find(row => row.id === selectedLeagueId);
  const selectedCompetition = competitions.find(row => row.id === selectedCompetitionId);
  const visibleCompetitions = selectedLeagueId ? competitions.filter(row => row.league_id === selectedLeagueId) : competitions;
  const visibleTeams = (data?.teams ?? []).filter(row => !selectedCompetitionId || row.competition_ids?.includes(selectedCompetitionId));
  const visiblePlayers = (data?.players ?? []).filter(row => !selectedCompetitionId || row.competition_ids?.includes(selectedCompetitionId));
  const visibleGames = (data?.games ?? []).filter(row => !selectedCompetitionId || row.competition_id === selectedCompetitionId);
  const selectedGame = visibleGames.find(game => game.id === selectedGameId);
  const selectedGameEvents = (data?.events ?? []).filter(event => event.game_id === selectedGameId);
  const selectedGameBoxScore = (data?.game_box_scores ?? []).find(box => box.game_id === selectedGameId);

  const viewerHref=(orgSlug:string)=>`/public/organization?organization=${encodeURIComponent(orgSlug)}`;
  const navigateWithViewerParams=(path:string,next:URLSearchParams)=>navigate(`${path}?${next.toString()}`);
  return <main className={`viewer-portal ${embedded?'viewer-embedded':''}`}>
    {!embedded&&<header className="viewer-header"><Link to="/" className="viewer-brand"><span className="viewer-brand-mark">◌</span><span><b>EO2MATE SPORTS</b></span></Link></header>}
    {loading && <div className="viewer-state">Loading public sports information…</div>}
    {!loading && error && <section className="viewer-state viewer-error"><h2>Unable to load this viewer page</h2><p>{error}</p><Link to="/">Browse organizations</Link></section>}
    {!loading && !error && !organization && <>
      <section className="viewer-hero"><span className="viewer-eyebrow">EO2MATE SPORTS</span><h1>Organizations</h1><p>View organization, league, competition, team, player, and game information.</p></section>
      <section className="viewer-org-grid">{(data?.organizations ?? []).map(org => <Link className="viewer-org-card" key={org.id} to={viewerHref(org.slug)}><span className="viewer-org-icon"><Trophy size={20}/></span><span><small>{org.sport ?? 'SPORTS ORGANIZATION'}</small><b>{org.name}</b><em>Open organization <ChevronRight size={14}/></em></span></Link>)}{!data?.organizations?.length && <div className="viewer-state">No organizations found.</div>}</section>
    </>}
    {!loading && !error && organization && <>
      <section className="viewer-hero viewer-org-hero"><div><span className="viewer-eyebrow">{organization.sport ?? 'SPORTS ORGANIZATION'}</span><h1>{organization.name}</h1><p>Organization profile and league records.</p></div>{!embedded&&<div className="viewer-hero-badge"><Building2 size={26}/><span>Public<br/>information</span></div>}</section>
      {!embedded&&<nav className="viewer-tabs" aria-label="Public pages">{(['Organization','League','Competition','Team','Player','Games','Stats'] as Tab[]).map(item=><button key={item} className={tab===item?'selected':''} onClick={()=>setTab(item)}>{item==='Organization'?<Building2 size={15}/>:item==='League'?<Trophy size={15}/>:item==='Competition'?<CalendarDays size={15}/>:item==='Team'?<Users size={15}/>:item==='Player'?<UserRound size={15}/>:item==='Games'?<CalendarDays size={15}/>:<Activity size={15}/>}<span>{item}</span></button>)}</nav>}
      {tab==='Organization'&&<OrganizationDashboard organization={organization} leagues={data?.leagues??[]} competitions={competitions} teams={data?.teams??[]} games={data?.games??[]} fixtures={data?.fixtures??[]} onOpenCompetition={id=>{const next=new URLSearchParams(params);next.set('competition_id',id);navigateWithViewerParams('/public/competition',next);}} onOpenTab={path=>navigateWithViewerParams(path,new URLSearchParams(params))}/>}
      {tab==='League'&&<Directory title="Leagues" subtitle="Select a league to view its competitions." rows={(data?.leagues??[]).map(row=>[row.name,row.season||'—',row.status||''])} headers={['League','Season','Status']} onFirstCellClick={index=>{const row=data?.leagues?.[index];if(!row)return;const next=new URLSearchParams(params);next.set('league_id',row.id);next.delete('competition_id');navigateWithViewerParams('/public/competition',next);}}/>}
      {tab==='Competition'&&selectedCompetition&&<CompetitionOverview competition={selectedCompetition} leagueName={leagueNames[selectedCompetition.league_id??'']||'—'} teams={data?.teams??[]} games={visibleGames} fixtures={(data?.fixtures??[]).filter(row=>row.competition_id===selectedCompetition.id)} onBack={()=>{const next=new URLSearchParams(params);next.delete('competition_id');navigateWithViewerParams('/public/competition',next);}}/>}
      {tab==='Competition'&&!selectedCompetition&&<><div className="viewer-filter-notice">{selectedLeague?<>Competitions in <b>{selectedLeague.name}</b> <button type="button" onClick={()=>{const next=new URLSearchParams(params);next.delete('league_id');next.delete('competition_id');navigateWithViewerParams('/public/competition',next);}}>Show all</button></>:null}</div><Directory title="Competitions" subtitle="Select a competition to view its summary, standings or bracket, and game schedule." rows={visibleCompetitions.map(row=>[row.name,leagueNames[row.league_id??'']||'—',row.format?.replaceAll('_',' ')||'—',row.status||''])} headers={['Competition','League','Format','Status']} onFirstCellClick={index=>{const row=visibleCompetitions[index];if(!row)return;const next=new URLSearchParams(params);next.set('competition_id',row.id);navigateWithViewerParams('/public/competition',next);}}/></>}
      {tab==='Team'&&<><div className="viewer-filter-notice">{selectedCompetition?<>Teams in <b>{selectedCompetition.name}</b> <button type="button" onClick={()=>{const next=new URLSearchParams(params);next.delete('competition_id');navigateWithViewerParams('/public/teams',next);}}>Show all</button></>:null}</div><Directory title="Teams" subtitle="Organization teams and their league assignments" rows={visibleTeams.map(row=>[row.name,row.league||'—',row.competition||'—',row.code||'—'])} headers={['Team','League','Competition','Code']}/></>}
      {tab==='Player'&&<><Directory title="Players" subtitle="Roster and competition assignments" rows={visiblePlayers.map(row=>[row.name,row.team,row.league||'—',row.competition||'—',row.jersey_number==null?'—':String(row.jersey_number),row.position||'—'])} headers={['Player','Team','League','Competition','No.','Position']}/>{!visiblePlayers.length&&<p className="viewer-consent-note">No player roster records are available.</p>}</>}
      {tab==='Games'&&selectedGame&&<GameDetails game={selectedGame} competition={competitionNames[selectedGame.competition_id??'']??'Competition'} events={selectedGameEvents} boxScore={selectedGameBoxScore} onBack={()=>{const next=new URLSearchParams(params);next.delete('game_id');navigateWithViewerParams('/public/games',next);}}/>}
      {tab==='Games'&&!selectedGame&&<section className="viewer-panel"><div className="viewer-panel-title"><span><CalendarDays size={17}/></span><div><h2>Games</h2><p>Select a game to view its score, details, and play-by-play.</p></div></div><div className="viewer-game-list">{visibleGames.map(game=><button type="button" className="viewer-game-card viewer-game-open" key={game.id} onClick={()=>{const next=new URLSearchParams(params);next.set('game_id',game.id);navigateWithViewerParams('/public/games',next);}}><div className="viewer-game-meta"><span>{competitionNames[game.competition_id??'']??'Competition'}</span><span className={`viewer-status ${game.status?.toLowerCase()??''}`}>{game.status??'Scheduled'}</span></div><div className="viewer-game-score"><b>{game.home_team??'Home'}</b><strong>{game.home_score??'—'} <i>:</i> {game.away_score??'—'}</strong><b>{game.away_team??'Away'}</b></div><div className="viewer-game-foot"><span><CalendarDays size={13}/>{game.scheduled_at?new Date(game.scheduled_at).toLocaleString():'Time TBD'}</span>{game.venue&&<span><MapPin size={13}/>{game.venue}</span>}{game.status==='LIVE'&&<span className="viewer-live">Period {game.period??1} · {formatClock(game.clock_ms??0)}</span>}<span className="viewer-open-game-hint">View game & play-by-play <ChevronRight size={12}/></span></div></button>)}{!visibleGames.length&&<p className="viewer-empty">No games available.</p>}</div></section>}
      {tab==='Stats'&&<div className="viewer-stats-grid"><section className="viewer-panel"><div className="viewer-panel-title"><span><Trophy size={17}/></span><div><h2>Team standings</h2><p>Based on completed games</p></div></div><div className="viewer-table-scroll"><table className="viewer-table"><thead><tr><th>Team</th><th>GP</th><th>W</th><th>L</th><th>PF</th><th>PA</th></tr></thead><tbody>{(data?.team_stats??[]).map((row,i)=><tr key={`${row.team}-${i}`}><td>{row.team}</td><td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.points_for}</td><td>{row.points_against}</td></tr>)}</tbody></table></div>{!data?.team_stats?.length&&<p className="viewer-empty">No completed game stats available.</p>}</section><section className="viewer-panel"><div className="viewer-panel-title"><span><Activity size={17}/></span><div><h2>Player leaders</h2><p>Basic sports roster details only</p></div></div><div className="viewer-table-scroll"><table className="viewer-table"><thead><tr><th>Player</th><th>Team</th><th>PTS</th><th>REB</th><th>AST</th></tr></thead><tbody>{(data?.player_stats??[]).map((row,i)=><tr key={`${row.name}-${i}`}><td>{row.name}</td><td>{row.team}</td><td>{row.points}</td><td>{row.rebounds}</td><td>{row.assists}</td></tr>)}</tbody></table></div>{!data?.player_stats?.length&&<p className="viewer-empty">No player stats are available yet.</p>}</section></div>}
    </>}
    {!embedded&&<footer className="viewer-footer"><span>EO2MATE SPORTS</span></footer>}
  </main>;
}

function CompetitionOverview({competition,leagueName,teams,games,fixtures,onBack}:{competition:Competition;leagueName:string;teams:Team[];games:Game[];fixtures:Fixture[];onBack:()=>void}){
  const competitionTeams=teams.filter(team=>team.competition_ids?.includes(competition.id));
  const finished=games.filter(game=>['FINAL','COMPLETED'].includes((game.status??'').toUpperCase()));
  const live=games.filter(game=>(game.status??'').toUpperCase()==='LIVE');
  const isBracket=/SINGLE_ELIMINATION|BRACKET/i.test(competition.format??'');
  const standings=buildCompetitionStandings(competitionTeams,finished);
  const fixtureByGame=new Map<string,Fixture>(fixtures.filter(item=>item.game_id).map(item=>[item.game_id!,item] as const));
  const rounds=[...new Set(fixtures.map(item=>item.round_no))].sort((a,b)=>a-b);
  const sortedGames=[...games].sort((a,b)=>(a.scheduled_at??'').localeCompare(b.scheduled_at??''));
  return <>
    <section className="viewer-panel">
      <div className="viewer-panel-title"><span><Trophy size={17}/></span><div><h2>{competition.name}</h2><p>{leagueName} · {competition.format?.replaceAll('_',' ')||'Competition'}</p></div><button type="button" onClick={onBack} style={{marginLeft:'auto',border:'1px solid #e4eaf0',borderRadius:8,padding:'7px 11px',background:'#fff',color:'#536273',fontSize:10,fontWeight:700,cursor:'pointer'}}>All competitions</button></div>
      <div className="viewer-competition-summary">
        <SummaryCard label="STATUS" value={competition.status||'—'}/>
        <SummaryCard label="REGISTERED TEAMS" value={String(competitionTeams.length)}/>
        <SummaryCard label="TOTAL GAMES" value={String(games.length)}/>
        <SummaryCard label="COMPLETED · LIVE" value={`${finished.length} · ${live.length}`}/>
      </div>
    </section>
    <section className="viewer-panel"><div className="viewer-panel-title"><span><Building2 size={17}/></span><div><h2>Competition details</h2><p>Competition information and current status</p></div></div><div className="viewer-profile-grid"><div><small>LEAGUE</small><b>{leagueName}</b></div><div><small>FORMAT</small><b>{competition.format?.replaceAll('_',' ')||'—'}</b></div><div><small>STATUS</small><b>{competition.status||'—'}</b></div><div><small>REGISTERED TEAMS</small><b>{competitionTeams.length}</b></div></div></section>
    {isBracket?<section className="viewer-panel"><div className="viewer-panel-title"><span><Trophy size={17}/></span><div><h2>Competition bracket</h2><p>Matchups grouped by round</p></div></div>{rounds.length?<div style={{display:'flex',gap:14,overflowX:'auto',paddingBottom:8}}>{rounds.map(round=><section key={round} style={{minWidth:230,flex:'1 0 230px'}}><h3 style={{fontSize:11,color:'#657386'}}>ROUND {round}</h3>{fixtures.filter(item=>item.round_no===round).sort((a,b)=>a.slot_no-b.slot_no).map(item=><article className="viewer-game-card" key={item.id} style={{marginBottom:10}}><div className="viewer-game-meta"><span>MATCH {item.slot_no}</span><span className={`viewer-status ${(item.game_status??item.status??'').toLowerCase()}`}>{(item.game_status??item.status??'PENDING').replaceAll('_',' ')}</span></div><div style={{padding:'12px 0',display:'grid',gap:8,fontSize:11}}><div style={{display:'flex',justifyContent:'space-between',gap:8}}><b>{item.home_team||'To be decided'}</b><strong>{item.home_score??'—'}</strong></div><div style={{display:'flex',justifyContent:'space-between',gap:8}}><b>{item.away_team||'To be decided'}</b><strong>{item.away_score??'—'}</strong></div></div></article>)}</section>)}</div>:<p className="viewer-empty">No bracket fixtures are available yet.</p>}</section>:<section className="viewer-panel"><div className="viewer-panel-title"><span><Trophy size={17}/></span><div><h2>Standings</h2><p>Calculated from this competition’s completed games</p></div></div><div className="viewer-table-scroll"><table className="viewer-table"><thead><tr><th>TEAM</th><th>GP</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>DIFF</th></tr></thead><tbody>{standings.map((row,index)=><tr key={row.id}><td>{index+1}. {row.name}</td><td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.pointsFor}</td><td>{row.pointsAgainst}</td><td>{row.pointsFor-row.pointsAgainst}</td></tr>)}</tbody></table></div>{!finished.length&&<p className="viewer-empty">Standings will update after games are completed.</p>}</section>}
    <section className="viewer-panel"><div className="viewer-panel-title"><span><CalendarDays size={17}/></span><div><h2>Game schedule</h2><p>All scheduled, live, and completed games in this competition</p></div></div><div className="viewer-table-scroll"><table className="viewer-table"><thead><tr><th>DATE & TIME</th><th>ROUND</th><th>MATCH</th><th>HOME</th><th>SCORE</th><th>AWAY</th><th>VENUE</th><th>STATUS</th></tr></thead><tbody>{sortedGames.map(game=>{const fixture=fixtureByGame.get(game.id);return <tr key={game.id}><td>{game.scheduled_at?new Date(game.scheduled_at).toLocaleString():'TBD'}</td><td>{fixture?.round_no??'—'}</td><td>{fixture?.slot_no??'—'}</td><td>{game.home_team||'—'}</td><td>{game.home_score??'—'}–{game.away_score??'—'}</td><td>{game.away_team||'—'}</td><td>{game.venue||'—'}</td><td>{game.status||'Scheduled'}</td></tr>;})}</tbody></table></div>{!games.length&&<p className="viewer-empty">No games have been scheduled for this competition yet.</p>}</section>
  </>;
}

function OrganizationDashboard({organization,leagues,competitions,teams,games,fixtures,onOpenCompetition,onOpenTab}:{organization:Organization;leagues:League[];competitions:Competition[];teams:Team[];games:Game[];fixtures:Fixture[];onOpenCompetition:(id:string)=>void;onOpenTab:(path:string)=>void}){
  const liveGames=games.filter(game=>(game.status??'').toUpperCase()==='LIVE');
  const upcomingGames=[...games].filter(game=>['SCHEDULED','DRAFT'].includes((game.status??'').toUpperCase())).sort((a,b)=>(a.scheduled_at??'').localeCompare(b.scheduled_at??'')).slice(0,4);
  const recentResults=[...games].filter(game=>['FINAL','COMPLETED'].includes((game.status??'').toUpperCase())).sort((a,b)=>(b.scheduled_at??'').localeCompare(a.scheduled_at??'')).slice(0,4);
  const activeCompetitions=competitions.filter(item=>!['COMPLETED','CANCELLED'].includes((item.status??'').toUpperCase()));
  const bracketCompetition=activeCompetitions.find(item=>/SINGLE_ELIMINATION|BRACKET/i.test(item.format??'')&&fixtures.some(fixture=>fixture.competition_id===item.id))??competitions.find(item=>/SINGLE_ELIMINATION|BRACKET/i.test(item.format??'')&&fixtures.some(fixture=>fixture.competition_id===item.id));
  const bracketFixtures=bracketCompetition?fixtures.filter(fixture=>fixture.competition_id===bracketCompetition.id).sort((a,b)=>a.round_no-b.round_no||a.slot_no-b.slot_no):[];
  return <section className="viewer-dashboard">
    <div className="viewer-dashboard-heading"><div><span className="viewer-eyebrow">ORGANIZATION DASHBOARD</span><h2>{organization.name}</h2><p>League activity, competition progress, and game schedules in one view.</p></div><button type="button" onClick={()=>onOpenTab('/public/games')}>View game schedule <ChevronRight size={14}/></button></div>
    <div className="viewer-dashboard-kpis">
      <DashboardStat icon={<Trophy size={17}/>} label="LEAGUES" value={leagues.length}/>
      <DashboardStat icon={<CalendarDays size={17}/>} label="ACTIVE COMPETITIONS" value={activeCompetitions.length}/>
      <DashboardStat icon={<Users size={17}/>} label="TEAMS" value={teams.length}/>
      <DashboardStat icon={<Activity size={17}/>} label="GAMES" value={games.length}/>
      <DashboardStat icon={<span className="viewer-live-dot"/>} label="LIVE NOW" value={liveGames.length}/>
    </div>
    <div className="viewer-dashboard-grid">
      <section className="viewer-panel"><div className="viewer-panel-title"><span><Activity size={17}/></span><div><h2>Live games</h2><p>Current games across the organization</p></div><button className="viewer-text-link" type="button" onClick={()=>onOpenTab('/public/games')}>All games</button></div>{liveGames.length?liveGames.slice(0,3).map(game=><GamePreview key={game.id} game={game} competition={competitions.find(item=>item.id===game.competition_id)?.name??'Competition'}/>):<p className="viewer-empty">No games are live right now.</p>}</section>
      <section className="viewer-panel"><div className="viewer-panel-title"><span><CalendarDays size={17}/></span><div><h2>Competitions</h2><p>Open a competition for its standings, bracket, and schedule</p></div></div>{activeCompetitions.slice(0,5).map(item=><button type="button" className="viewer-dashboard-row" key={item.id} onClick={()=>onOpenCompetition(item.id)}><span><b>{item.name}</b><small>{leagues.find(league=>league.id===item.league_id)?.name??'League'} · {(item.format??'Competition').replaceAll('_',' ')}</small></span><em>{item.status??'—'} <ChevronRight size={14}/></em></button>)}{!activeCompetitions.length&&<p className="viewer-empty">No active competitions yet.</p>}</section>
    </div>
    {bracketCompetition&&<section className="viewer-panel viewer-dashboard-bracket"><div className="viewer-panel-title"><span><Trophy size={17}/></span><div><h2>Bracket in progress</h2><p>{bracketCompetition.name} · {bracketFixtures.length} matchups across {[...new Set(bracketFixtures.map(row=>row.round_no))].length} rounds</p></div><button className="viewer-text-link" type="button" onClick={()=>onOpenCompetition(bracketCompetition.id)}>Open bracket</button></div><div className="viewer-bracket-preview">{bracketFixtures.slice(0,4).map(match=><article className="viewer-game-card" key={match.id}><div className="viewer-game-meta"><span>ROUND {match.round_no} · MATCH {match.slot_no}</span><span className={`viewer-status ${(match.game_status??match.status??'').toLowerCase()}`}>{(match.game_status??match.status??'PENDING').replaceAll('_',' ')}</span></div><div className="viewer-bracket-preview-teams"><span>{match.home_team||'To be decided'}</span><b>{match.home_score??'—'}</b></div><div className="viewer-bracket-preview-teams"><span>{match.away_team||'To be decided'}</span><b>{match.away_score??'—'}</b></div></article>)}</div></section>}
    <div className="viewer-dashboard-grid">
      <section className="viewer-panel"><div className="viewer-panel-title"><span><CalendarDays size={17}/></span><div><h2>Upcoming games</h2><p>Next scheduled matchups</p></div></div>{upcomingGames.length?upcomingGames.map(game=><GamePreview key={game.id} game={game} competition={competitions.find(item=>item.id===game.competition_id)?.name??'Competition'}/>):<p className="viewer-empty">No upcoming games are scheduled.</p>}</section>
      <section className="viewer-panel"><div className="viewer-panel-title"><span><Trophy size={17}/></span><div><h2>Recent results</h2><p>Latest completed games</p></div></div>{recentResults.length?recentResults.map(game=><GamePreview key={game.id} game={game} competition={competitions.find(item=>item.id===game.competition_id)?.name??'Competition'}/>):<p className="viewer-empty">Completed results will appear here.</p>}</section>
    </div>
    <section className="viewer-panel"><div className="viewer-panel-title"><span><Building2 size={17}/></span><div><h2>Organization details</h2><p>Public organization information</p></div></div><div className="viewer-profile-grid"><div><small>SPORT</small><b>{organization.sport??'Sports'}</b></div><div><small>TIME ZONE</small><b>{organization.timezone??'—'}</b></div><div><small>LEAGUES</small><b>{leagues.length}</b></div></div></section>
  </section>;
}

function GameDetails({game,competition,events,boxScore,onBack}:{game:Game;competition:string;events:PublicEvent[];boxScore?:GameBoxScore;onBack:()=>void}){
  const quarters=[...new Set(events.map(event=>event.period))].sort((a,b)=>a-b);
  const orderedEvents=[...events].sort((a,b)=>new Date(a.at).getTime()-new Date(b.at).getTime());
  const homeName=game.home_team??'Home';
  const awayName=game.away_team??'Away';
  return <>
    <section className="viewer-panel viewer-game-summary">
      <div className="viewer-panel-title"><span><CalendarDays size={17}/></span><div><h2>Game summary</h2><p>{competition}</p></div><button type="button" className="viewer-text-link" onClick={onBack}>← Back to games</button></div>
      <div className="viewer-game-detail-score"><b>{homeName}</b><strong>{game.home_score??'—'} <i>:</i> {game.away_score??'—'}</strong><b>{awayName}</b></div>
      <div className="viewer-game-detail-meta"><span className={`viewer-status ${(game.status??'').toLowerCase()}`}>{game.status??'Scheduled'}</span>{game.scheduled_at&&<span><CalendarDays size={13}/>{new Date(game.scheduled_at).toLocaleString()}</span>}{game.venue&&<span><MapPin size={13}/>{game.venue}</span>}{game.status==='LIVE'&&<span className="viewer-live">Period {game.period??1} · {formatClock(game.clock_ms??0)}</span>}</div>
      {!!boxScore?.period_scores.length&&<div className="viewer-period-score-scroll"><table className="viewer-period-score"><thead><tr><th>Period</th>{boxScore.period_scores.map(row=><th key={row.period}>{row.period<=4?`Q${row.period}`:`OT${row.period-4}`}</th>)}<th>Total</th></tr></thead><tbody><tr><th>{homeName}</th>{boxScore.period_scores.map(row=><td key={row.period}>{row.home}</td>)}<td><b>{game.home_score??0}</b></td></tr><tr><th>{awayName}</th>{boxScore.period_scores.map(row=><td key={row.period}>{row.away}</td>)}<td><b>{game.away_score??0}</b></td></tr></tbody></table></div>}
      {boxScore&&<div className="viewer-game-team-summary"><GameTeamSummary name={homeName} stats={boxScore.home_stats}/><GameTeamSummary name={awayName} stats={boxScore.away_stats}/></div>}
    </section>
    <section className="viewer-panel"><div className="viewer-panel-title"><span><Users size={17}/></span><div><h2>Box score</h2><p>Player statistics for this game</p></div></div>{boxScore?<GameBoxScoreTable homeName={homeName} awayName={awayName} game={game} boxScore={boxScore}/>:<p className="viewer-empty">Game box score is not available yet.</p>}</section>
    <section className="viewer-panel"><div className="viewer-panel-title"><span><Activity size={17}/></span><div><h2>Play-by-play</h2><p>Game events grouped by quarter</p></div></div>{quarters.map(period=><section className="viewer-quarter-events" key={period}><h3>{period<=4?`Quarter ${period}`:`Overtime ${period-4}`}</h3>{orderedEvents.filter(event=>event.period===period).map((event,index)=><article className="viewer-event-row viewer-game-event" key={`${event.at}-${event.period}-${event.clock_ms}-${index}`}><time>{formatClock(event.clock_ms)}</time><span><b>{event.player??event.team}</b> {event.event.replaceAll('_',' ').toLowerCase()}</span>{event.points>0&&<strong>+{event.points}</strong>}</article>)}</section>)}{!events.length&&<p className="viewer-empty">No play-by-play events are available for this game yet.</p>}</section>
  </>;
}

function GameTeamSummary({name,stats}:{name:string;stats:BoxStats}){const items:[string,string][]=[['FG',`${stats.fgm}/${stats.fga}`],['3PT',`${stats.tpm}/${stats.tpa}`],['FT',`${stats.ftm}/${stats.fta}`],['REB',String(stats.reb)],['AST',String(stats.ast)],['STL',String(stats.stl)],['BLK',String(stats.blk)],['TO',String(stats.tov)],['PF',String(stats.pf)]];return <div className="viewer-game-team-summary-card"><h3>{name}</h3><div>{items.map(([label,value])=><span key={label}><b>{value}</b><small>{label}</small></span>)}</div></div>}

function GameBoxScoreTable({homeName,awayName,game,boxScore}:{homeName:string;awayName:string;game:Game;boxScore:GameBoxScore}){
  const teams=[{id:game.home_team_id,name:homeName},{id:game.away_team_id,name:awayName}];
  return <div className="viewer-game-box-scores">{teams.map(team=>{const rows=boxScore.players.filter(player=>team.id&&player.team_id===team.id);return <div className="viewer-game-box-team" key={team.id??team.name}><h3>{team.name}</h3><div className="viewer-table-scroll"><table className="viewer-table viewer-box-score-table"><thead><tr><th>No.</th><th>Player</th><th>PTS</th><th>FG</th><th>3PT</th><th>FT</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>PF</th></tr></thead><tbody>{rows.map(player=><tr key={player.player_id}><td>{player.number??'—'}</td><td><b>{player.name}</b>{player.position&&<small>{player.position}</small>}</td><td>{player.pts}</td><td>{player.fgm}/{player.fga}</td><td>{player.tpm}/{player.tpa}</td><td>{player.ftm}/{player.fta}</td><td>{player.reb}</td><td>{player.ast}</td><td>{player.stl}</td><td>{player.blk}</td><td>{player.tov}</td><td>{player.pf}</td></tr>)}</tbody></table>{!rows.length&&<p className="viewer-empty">No player box score rows are available.</p>}</div></div>})}</div>
}

function DashboardStat({icon,label,value}:{icon:ReactNode;label:string;value:number}){return <article className="viewer-dashboard-stat"><span>{icon}</span><small>{label}</small><strong>{value}</strong></article>}
function GamePreview({game,competition}:{game:Game;competition:string}){return <article className="viewer-dashboard-game"><div><small>{competition}</small><b>{game.home_team??'Home'} <span>vs</span> {game.away_team??'Away'}</b><em>{game.scheduled_at?new Date(game.scheduled_at).toLocaleString():'Time TBD'}{game.venue?` · ${game.venue}`:''}</em></div><strong>{game.home_score??'—'} : {game.away_score??'—'}</strong></article>}

function SummaryCard({label,value}:{label:string;value:string}){return <div className="viewer-panel" style={{width:'auto',margin:0,padding:14}}><small style={{display:'block',fontSize:8,color:'#8994a1',fontWeight:800,letterSpacing:'.6px'}}>{label}</small><strong style={{display:'block',marginTop:7,fontSize:19,color:'#263442'}}>{value}</strong></div>}

function buildCompetitionStandings(teams:Team[],games:Game[]){
  const rows=new Map<string,{id:string;name:string;played:number;wins:number;losses:number;pointsFor:number;pointsAgainst:number}>();
  for(const team of teams)rows.set(team.id,{id:team.id,name:team.name,played:0,wins:0,losses:0,pointsFor:0,pointsAgainst:0});
  for(const game of games){
    const home=game.home_team_id?rows.get(game.home_team_id):undefined;
    const away=game.away_team_id?rows.get(game.away_team_id):undefined;
    if(!home||!away)continue;
    const homeScore=game.home_score??0,awayScore=game.away_score??0;
    home.played++;away.played++;home.pointsFor+=homeScore;home.pointsAgainst+=awayScore;away.pointsFor+=awayScore;away.pointsAgainst+=homeScore;
    if(homeScore>awayScore){home.wins++;away.losses++;}else if(awayScore>homeScore){away.wins++;home.losses++;}
  }
  return [...rows.values()].sort((a,b)=>b.wins-a.wins||(b.pointsFor-b.pointsAgainst)-(a.pointsFor-a.pointsAgainst)||b.pointsFor-a.pointsFor||a.name.localeCompare(b.name));
}

function Directory({title,subtitle,headers,rows,onFirstCellClick}:{title:string;subtitle:string;headers:string[];rows:string[][];onFirstCellClick?:(index:number)=>void}){return <section className="viewer-panel"><div className="viewer-panel-title"><span><Users size={17}/></span><div><h2>{title}</h2><p>{subtitle}</p></div></div><div className="viewer-table-scroll"><table className="viewer-table"><thead><tr>{headers.map(header=><th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={`${row[0]}-${index}`}>{row.map((cell,i)=><td key={`${i}-${cell}`}>{i===0&&onFirstCellClick?<button type="button" onClick={()=>onFirstCellClick(index)} style={{padding:0,border:0,background:'none',color:'var(--orange)',font:'inherit',fontWeight:700,textDecoration:'underline',cursor:'pointer'}}>{cell||'—'}</button>:cell||'—'}</td>)}</tr>)}</tbody></table></div>{!rows.length&&<p className="viewer-empty">No {title.toLowerCase()} available.</p>}</section>}
function viewerErrorMessage(error:unknown){
  const value=(error&&typeof error==='object'?error:{}) as {message?:string;details?:string;hint?:string;code?:string};
  const message=value.message??String(error??'Viewer request failed.');
  const code=value.code?` (${value.code})`:'';
  if(value.code==='PGRST202'||value.code==='42883'||/function .*get_sports_viewer_portal.*does not exist/i.test(message))return `The public viewer database function is missing. Apply Supabase migrations 0002 and 0003, then refresh. Database error: ${message}${code}`;
  if(value.code==='P0002')return `${message} Check the organization link and apply migration 0003_public_viewer_no_approval.sql if public pages should not require approval.`;
  return [message+code,value.details,value.hint].filter(Boolean).join(' · ');
}
function formatClock(ms:number){const seconds=Math.max(0,Math.floor(ms/1000));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
