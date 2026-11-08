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
import { PageTitle, Pill, Metric, Panel, TeamLogo, TeamPageLink, OpenGameLink, GameScheduleList } from './shared';
import { Reports } from './Reports';

export function Games() {
  const [tab,setTab]=useState<'Summary'|'Game list'>('Summary');
  type SummaryGame={id:string;status:string;scheduled_at:string|null;home_score:number;away_score:number;home_team?:{id:string;name:string;logo_path?:string|null};away_team?:{id:string;name:string;logo_path?:string|null}};
  const games=useWorkspaceRows<SummaryGame>('games','id,status,scheduled_at,home_score,away_score,created_at,home_team:teams!games_home_team_id_fkey(id,name,logo_path),away_team:teams!games_away_team_id_fkey(id,name,logo_path)');
  const live=games.rows.filter(game=>game.status==='LIVE');const scheduled=games.rows.filter(game=>game.status==='SCHEDULED');const finals=games.rows.filter(game=>game.status==='FINAL');
  return <><PageTitle eyebrow="GAME DAY" title="Games" subtitle="Game schedule, live matches, and finalized results." action={<Link className="button primary" to="/games/live"><Radio size={16}/>Live scoring</Link>}/><div className="tab-row">{(['Summary','Game list'] as const).map(value=><button key={value} className={tab===value?'selected':''} onClick={()=>setTab(value)}>{value}{value==='Game list'&&<span>{games.rows.length}</span>}</button>)}</div>{tab==='Summary'?<><DataState loading={games.loading} error={games.error} onRetry={()=>void games.reload()}/><div className="metrics-grid"><Metric label="LIVE NOW" value={String(live.length)} note="In progress" icon={Radio} tone="orange"/><Metric label="SCHEDULED" value={String(scheduled.length)} note="Upcoming games" icon={CalendarDays} tone="blue"/><Metric label="FINAL" value={String(finals.length)} note="Officially finalized" icon={CheckCircle2} tone="green"/><Metric label="ALL GAMES" value={String(games.rows.length)} note="Current organization" icon={Activity} tone="purple"/></div><div className="dashboard-grid"><Panel title="Next games" action={<button className="text-link" onClick={()=>setTab('Game list')}>Full game list <ArrowRight size={14}/></button>}><div className="table-wrap"><table><thead><tr><th>DATE</th><th>MATCHUP</th><th>SCORE</th><th>STATUS</th><th></th></tr></thead><tbody>{games.rows.slice().sort((a,b)=>(a.scheduled_at??'').localeCompare(b.scheduled_at??'')).slice(0,8).map(game=><tr key={game.id}><td>{game.scheduled_at?new Date(game.scheduled_at).toLocaleString():'—'}</td><td><div style={{display:'flex',alignItems:'center',gap:8}}><TeamLogo name={game.home_team?.name??'Home'} logoPath={game.home_team?.logo_path} size={30}/><TeamPageLink id={game.home_team?.id} name={game.home_team?.name??'Home'}/><span className="muted">vs</span><TeamLogo name={game.away_team?.name??'Away'} logoPath={game.away_team?.logo_path} size={30}/><TeamPageLink id={game.away_team?.id} name={game.away_team?.name??'Away'}/></div></td><td>{game.home_score} – {game.away_score}</td><td><Pill tone={game.status==='LIVE'?'live':game.status==='FINAL'?'soft-green':'neutral'}>{game.status}</Pill></td><td><OpenGameLink id={game.id}/></td></tr>)}</tbody></table>{!games.loading&&!games.rows.length&&<div className="empty-state">Schedule the first matchup to start the league.</div>}</div></Panel><Panel title="Game actions"><div className="review-checks"><Link to="/games/live">Open live scoring <ArrowRight size={14}/></Link><Link to="/games/review">Review and finalize results <ArrowRight size={14}/></Link><Link to="/standings">View standings <ArrowRight size={14}/></Link><Link to="/reports">Reports & analytics <ArrowRight size={14}/></Link><Link to="/public/live">Public scoreboard <ArrowRight size={14}/></Link></div></Panel></div></>:<GameScheduleList/>}</>;
}
