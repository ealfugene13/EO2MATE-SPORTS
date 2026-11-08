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
import { PageTitle, Button, Pill, Metric, Panel } from './shared';

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
