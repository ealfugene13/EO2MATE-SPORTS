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
import { PageTitle, Button, Panel } from './shared';
import { League } from './League';

export function Standings() {
  type StandingGame={id:string;home_team_id:string;away_team_id:string;home_score:number;away_score:number;status:string};
  const games=useWorkspaceRows<StandingGame>('games','id,home_team_id,away_team_id,home_score,away_score,status,created_at');
  const teams=useWorkspaceRows<{id:string;name:string;active:boolean}>('teams','id,name,active,created_at');
  const completed=games.rows.filter(game=>game.status==='FINAL');
  const rows=teams.rows.filter(team=>team.active).map(team=>{const stats={gp:0,w:0,l:0,pf:0,pa:0};completed.filter(g=>g.home_team_id===team.id||g.away_team_id===team.id).forEach(g=>{const home=g.home_team_id===team.id;const scored=home?g.home_score:g.away_score;const against=home?g.away_score:g.home_score;stats.gp++;stats.pf+=scored;stats.pa+=against;if(scored>against)stats.w++;else stats.l++;});return {...team,...stats,diff:stats.pf-stats.pa};}).sort((a,b)=>{if(a.w!==b.w)return b.w-a.w;const meetings=completed.filter(game=>(game.home_team_id===a.id&&game.away_team_id===b.id)||(game.home_team_id===b.id&&game.away_team_id===a.id));const aHead=meetings.reduce((sum,game)=>sum+(game.home_team_id===a.id?Number(game.home_score>game.away_score):Number(game.away_score>game.home_score)),0);const bHead=meetings.reduce((sum,game)=>sum+(game.home_team_id===b.id?Number(game.home_score>game.away_score):Number(game.away_score>game.home_score)),0);return bHead-aHead||b.diff-a.diff||b.pf-a.pf;});
  return <><PageTitle title="Standings" subtitle="Calculated from finalized games in your organization." action={<Button><Download size={15}/> Export</Button>}/><DataState loading={games.loading||teams.loading} error={games.error||teams.error} onRetry={()=>{void games.reload();void teams.reload();}}/><div className="callout"><Trophy size={18}/><span>Current organization · all finalized games</span></div><Panel title="League table"><div className="table-wrap"><table><thead><tr><th>RANK</th><th>TEAM</th><th>GP</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>DIFF</th><th>PTS</th></tr></thead><tbody>{rows.map((team,index)=><tr key={team.id}><td><span className={`rank ${index<2?'top':''}`}>{String(index+1).padStart(2,'0')}</span></td><td><span className="table-team">{team.name}</span></td><td>{team.gp}</td><td>{team.w}</td><td>{team.l}</td><td>{team.pf}</td><td>{team.pa}</td><td className={team.diff>=0?'positive':'negative'}>{team.diff>0?'+':''}{team.diff}</td><td><b>{team.w*2}</b></td></tr>)}</tbody></table>{!games.loading&&!rows.length&&<div className="empty-state">Add teams and finalize games to calculate standings.</div>}</div></Panel></>;
}
