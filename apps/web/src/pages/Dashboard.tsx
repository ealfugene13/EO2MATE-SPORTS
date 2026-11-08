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
import { PageTitle, Pill, Metric, Panel } from './shared';
import { League } from './League';

export function Dashboard() {
  type SummaryGame = { id: string; scheduled_at: string | null; status: string; home_score: number; away_score: number; home_team?: { name: string }; away_team?: { name: string }; venue?: { name: string } | null };
  const games = useWorkspaceRows<SummaryGame>('games','id,scheduled_at,status,home_score,away_score,created_at,home_team:teams!games_home_team_id_fkey(id,name,logo_path),away_team:teams!games_away_team_id_fkey(id,name,logo_path),venue:venues(name)');
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
