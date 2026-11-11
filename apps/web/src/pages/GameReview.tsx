import { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, CheckCircle2, ShieldCheck, Wifi } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DataState, useWorkspaceRows } from '../lib/workspaceData';
import { listQueuedGameEvents } from '../lib/offlineGameEvents';
import { Button, Metric, PageTitle, Panel, Pill, TeamLogo } from './shared';
import { useSearchParams } from 'react-router-dom';

type ReviewGame = { id:string; season_id:string|null; status:string; home_score:number; away_score:number; current_period:number; clock_ms:number; clock_running?:boolean; home_team?:{id:string;name:string;logo_path?:string|null}; away_team?:{id:string;name:string;logo_path?:string|null}; scheduled_at:string|null };
type ReviewEvent = { id:string; game_id:string; team_id:string; player_id:string|null; event_type:string; points:number; reversed_event_id:string|null; created_at:string };
type ReviewRoster = { id:string; team_id:string; player_id:string; season_id:string; jersey_number:number|null; position:string|null; status:string; players?:{first_name:string;last_name:string}|null };
type BoxLine = { player_id:string; name:string; number:string; position:string; pts:number; fgm:number; fga:number; tpm:number; tpa:number; ftm:number; fta:number; reb:number; ast:number; stl:number; blk:number; tov:number; pf:number };
type TeamSummary = { pts:number; fgm:number; fga:number; tpm:number; tpa:number; ftm:number; fta:number; reb:number; ast:number; stl:number; blk:number; tov:number; pf:number };

export function GameReview() {
  const [searchParams] = useSearchParams();
  const requestedGameId = searchParams.get('game');
  const games = useWorkspaceRows<ReviewGame>('games','id,season_id,status,home_score,away_score,current_period,clock_ms,clock_running,scheduled_at,created_at,home_team:teams!games_home_team_id_fkey(id,name,logo_path),away_team:teams!games_away_team_id_fkey(id,name,logo_path)');
  const events = useWorkspaceRows<ReviewEvent>('game_events','id,game_id,team_id,player_id,event_type,points,reversed_event_id,created_at');
  const roster = useWorkspaceRows<ReviewRoster>('rosters','id,team_id,player_id,season_id,jersey_number,position,status,created_at,players(first_name,last_name)');
  const [gameId,setGameId]=useState('');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [pendingSyncCount,setPendingSyncCount]=useState(0);
  const [checkingQueue,setCheckingQueue]=useState(true);
  const reviewableGames=games.rows.filter(row=>row.status!=='DRAFT');
  useEffect(()=>{if(requestedGameId&&reviewableGames.some(row=>row.id===requestedGameId)){setGameId(requestedGameId);return;}if(!gameId&&reviewableGames[0])setGameId(reviewableGames[0].id);},[requestedGameId,gameId,reviewableGames]);
  useEffect(()=>{let active=true;setCheckingQueue(true);if(!gameId){setPendingSyncCount(0);setCheckingQueue(false);return;}const check=()=>void listQueuedGameEvents(gameId).then(rows=>{if(active){setPendingSyncCount(rows.length);setCheckingQueue(false);}}).catch(()=>{if(active){setPendingSyncCount(-1);setCheckingQueue(false);}});check();const timer=window.setInterval(check,5000);return()=>{active=false;window.clearInterval(timer);};},[gameId]);
  const game=reviewableGames.find(row=>row.id===gameId);
  const gameEvents=events.rows.filter(row=>row.game_id===gameId);
  const reversed=new Set(gameEvents.map(row=>row.reversed_event_id).filter((id):id is string=>Boolean(id)));
  const activeEvents=gameEvents.filter(row=>row.event_type!=='REVERSAL'&&!row.reversed_event_id&&!reversed.has(row.id));
  async function finalize(){
    if(!game)return;
    if(checkingQueue||pendingSyncCount!==0){setError(pendingSyncCount<0?'Unable to verify the offline event queue. Reconnect and retry before finalizing.':`Finalization is blocked while ${Math.max(0,pendingSyncCount)} event${pendingSyncCount===1?' is':'s are'} waiting to sync.`);return;}
    if(!window.confirm(`Finalize this game at ${game.home_score}–${game.away_score}? The result will be locked as official.`))return;
    setSaving(true);setError('');setNotice('');
    const {error:rpcError}=await supabase.rpc('finalize_game',{p_game_id:game.id});
    if(rpcError)setError(rpcError.message);else{setNotice('Official result finalized and added to the audit log.');await games.reload();}
    setSaving(false);
  }
  const canFinalize=game?.status==='LIVE'&&game.current_period>=4&&game.clock_ms===0&&!game.clock_running&&game.home_score!==game.away_score&&pendingSyncCount===0&&!checkingQueue;
  const homeId=game?.home_team?.id??'';const awayId=game?.away_team?.id??'';
  const homeBox=useMemo(()=>buildBox(homeId,game?.season_id??null,roster.rows,activeEvents),[homeId,game?.season_id,roster.rows,activeEvents]);
  const awayBox=useMemo(()=>buildBox(awayId,game?.season_id??null,roster.rows,activeEvents),[awayId,game?.season_id,roster.rows,activeEvents]);
  const homeSummary=useMemo(()=>buildTeamSummary(homeId,game?.home_score??0,activeEvents),[homeId,game?.home_score,activeEvents]);
  const awaySummary=useMemo(()=>buildTeamSummary(awayId,game?.away_score??0,activeEvents),[awayId,game?.away_score,activeEvents]);
  return <>
    <PageTitle eyebrow="RESULT REVIEW" title="Review & finalize" subtitle="Review the team summaries and player box scores before confirming the result." action={<Button variant="primary" onClick={()=>void finalize()} disabled={!canFinalize||saving}><ShieldCheck size={16}/>{saving?'Finalizing…':'Finalize result'}</Button>}/>
    <DataState loading={games.loading||events.loading||roster.loading} error={games.error||events.error||roster.error} onRetry={()=>{void games.reload();void events.reload();void roster.reload();}}/>
    {reviewableGames.length>0&&<label className="game-select-label">Game<select value={gameId} onChange={e=>setGameId(e.target.value)}>{reviewableGames.map(row=><option key={row.id} value={row.id}>{row.home_team?.name??'Home'} vs {row.away_team?.name??'Away'} · {row.status} · {row.id.slice(0,8)}</option>)}</select></label>}
    {pendingSyncCount>0&&<div className="form-error" role="status">{pendingSyncCount} local event{pendingSyncCount===1?' is':'s are'} still waiting to sync. Finalize after the scorer reconnects and the queue clears.</div>}
    {pendingSyncCount<0&&<div className="form-error" role="status">Could not verify local sync status. Reconnect and try again.</div>}
    {error&&<div className="form-error" role="alert">{error}</div>}{notice&&<div className="success-banner"><CheckCircle2 size={17}/>{notice}</div>}
    {game&&<>
      <div className="review-score"><div className="review-team-score"><TeamLogo name={game.home_team?.name??'Home team'} logoPath={game.home_team?.logo_path} size={64}/><span><span>{game.home_team?.name??'Home team'}</span><strong>{game.home_score}</strong></span></div><Pill tone={game.status==='FINAL'?'soft-green':'soft-orange'}>{game.status}</Pill><div className="review-team-score"><TeamLogo name={game.away_team?.name??'Away team'} logoPath={game.away_team?.logo_path} size={64}/><span><span>{game.away_team?.name??'Away team'}</span><strong>{game.away_score}</strong></span></div></div>
      <div className="metrics-grid compact"><Metric label="ACTIVE EVENTS" value={String(activeEvents.length)} note="Reversed actions removed" icon={Activity}/><Metric label="GAME STATUS" value={game.status} note="Database status" icon={Wifi}/><Metric label="SCORE CHECK" value={game.home_score>=0&&game.away_score>=0?'Passed':'Review'} note="Non-negative totals" icon={CheckCircle2} tone="green"/><Metric label="SCHEDULED" value={game.scheduled_at?new Date(game.scheduled_at).toLocaleDateString():'—'} note="Organization time" icon={CalendarDays} tone="purple"/></div>
      <Panel title="Team summary"><div className="review-team-summary-grid"><TeamSummaryCard name={game.home_team?.name??'Home'} summary={homeSummary}/><TeamSummaryCard name={game.away_team?.name??'Away'} summary={awaySummary}/></div></Panel>
      <div className="review-boxscore-grid"><BoxScore title={`${game.home_team?.name??'Home'} box score`} rows={homeBox}/><BoxScore title={`${game.away_team?.name??'Away'} box score`} rows={awayBox}/></div>
      <div className="review-checks"><span><CheckCircle2 size={15}/> Score loaded from database</span><span><CheckCircle2 size={15}/> Reversed events excluded from score and stats</span><span><CheckCircle2 size={15}/> Finalization is audited</span></div>
    </>}
    {!games.loading&&!game&&<div className="empty-state">No games are available for review.</div>}
  </>;
}

function emptyStats():TeamSummary{return {pts:0,fgm:0,fga:0,tpm:0,tpa:0,ftm:0,fta:0,reb:0,ast:0,stl:0,blk:0,tov:0,pf:0};}
function countEvent(stats:TeamSummary,event:ReviewEvent){stats.pts+=Number(event.points||0);if(['2PT_MADE','3PT_MADE'].includes(event.event_type))stats.fgm++;if(['2PT_MADE','2PT_MISSED','3PT_MADE','3PT_MISSED'].includes(event.event_type))stats.fga++;if(event.event_type==='3PT_MADE')stats.tpm++;if(['3PT_MADE','3PT_MISSED'].includes(event.event_type))stats.tpa++;if(event.event_type==='FT_MADE')stats.ftm++;if(['FT_MADE','FT_MISSED'].includes(event.event_type))stats.fta++;if(event.event_type.startsWith('REBOUND_'))stats.reb++;if(event.event_type==='ASSIST')stats.ast++;if(event.event_type==='STEAL')stats.stl++;if(event.event_type==='BLOCK')stats.blk++;if(event.event_type==='TURNOVER')stats.tov++;if(['FOUL','FLAGRANT_FOUL','TECHNICAL_FOUL'].includes(event.event_type))stats.pf++;}
function buildTeamSummary(teamId:string,score:number,events:ReviewEvent[]):TeamSummary{const result=emptyStats();result.pts=score;for(const event of events)if(event.team_id===teamId){const counts=emptyStats();countEvent(counts,event);result.fgm+=counts.fgm;result.fga+=counts.fga;result.tpm+=counts.tpm;result.tpa+=counts.tpa;result.ftm+=counts.ftm;result.fta+=counts.fta;result.reb+=counts.reb;result.ast+=counts.ast;result.stl+=counts.stl;result.blk+=counts.blk;result.tov+=counts.tov;result.pf+=counts.pf;}return result;}
function buildBox(teamId:string,seasonId:string|null,roster:ReviewRoster[],events:ReviewEvent[]):BoxLine[]{
  const selected=roster.filter(row=>row.team_id===teamId&&row.status==='ACTIVE'&&(!seasonId||row.season_id===seasonId));
  const unique=new Map<string,ReviewRoster>();for(const row of selected)if(!unique.has(row.player_id))unique.set(row.player_id,row);
  const involved=new Set(events.filter(event=>event.team_id===teamId&&event.player_id).map(event=>event.player_id!));
  for(const playerId of involved)if(!unique.has(playerId))unique.set(playerId,{id:playerId,team_id:teamId,player_id:playerId,season_id:seasonId??'',jersey_number:null,position:null,status:'ACTIVE'});
  return [...unique.values()].map(player=>{
    const line:BoxLine={player_id:player.player_id,name:player.players?`${player.players.first_name} ${player.players.last_name}`:'Player',number:player.jersey_number==null?'—':String(player.jersey_number),position:player.position??'—',pts:0,fgm:0,fga:0,tpm:0,tpa:0,ftm:0,fta:0,reb:0,ast:0,stl:0,blk:0,tov:0,pf:0};
    for(const event of events.filter(item=>item.team_id===teamId&&item.player_id===player.player_id)){line.pts+=Number(event.points||0);if(['2PT_MADE','3PT_MADE'].includes(event.event_type))line.fgm++;if(['2PT_MADE','2PT_MISSED','3PT_MADE','3PT_MISSED'].includes(event.event_type))line.fga++;if(event.event_type==='3PT_MADE')line.tpm++;if(['3PT_MADE','3PT_MISSED'].includes(event.event_type))line.tpa++;if(event.event_type==='FT_MADE')line.ftm++;if(['FT_MADE','FT_MISSED'].includes(event.event_type))line.fta++;if(event.event_type.startsWith('REBOUND_'))line.reb++;if(event.event_type==='ASSIST')line.ast++;if(event.event_type==='STEAL')line.stl++;if(event.event_type==='BLOCK')line.blk++;if(event.event_type==='TURNOVER')line.tov++;if(['FOUL','FLAGRANT_FOUL','TECHNICAL_FOUL'].includes(event.event_type))line.pf++;}
    return line;
  }).sort((a,b)=>Number(a.number==='—'?999:a.number)-Number(b.number==='—'?999:b.number)||a.name.localeCompare(b.name));
}
function TeamSummaryCard({name,summary}:{name:string;summary:TeamSummary}){const items:[string,string][]=[['Score',String(summary.pts)],['FG',`${summary.fgm}/${summary.fga}`],['3PT',`${summary.tpm}/${summary.tpa}`],['FT',`${summary.ftm}/${summary.fta}`],['REB',String(summary.reb)],['AST',String(summary.ast)],['STL',String(summary.stl)],['BLK',String(summary.blk)],['TO',String(summary.tov)],['PF',String(summary.pf)]];return <section className="review-team-summary"><h3>{name}</h3><div>{items.map(([label,value])=><span key={label}><b>{value}</b><small>{label}</small></span>)}</div></section>;}
function BoxScore({title,rows}:{title:string;rows:BoxLine[]}){return <Panel title={title}><div className="table-wrap review-boxscore-table"><table><thead><tr><th>NO.</th><th>PLAYER</th><th>PTS</th><th>FG</th><th>3PT</th><th>FT</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>PF</th></tr></thead><tbody>{rows.map(row=><tr key={row.player_id}><td>{row.number}</td><td><b>{row.name}</b><small>{row.position}</small></td><td>{row.pts}</td><td>{row.fgm}/{row.fga}</td><td>{row.tpm}/{row.tpa}</td><td>{row.ftm}/{row.fta}</td><td>{row.reb}</td><td>{row.ast}</td><td>{row.stl}</td><td>{row.blk}</td><td>{row.tov}</td><td>{row.pf}</td></tr>)}</tbody></table>{!rows.length&&<div className="empty-state">No active roster players found for this team.</div>}</div></Panel>;}
