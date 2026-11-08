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
import { PageTitle, DirectoryRow, WorkspaceDirectory, MasterBulkImport, PlayerSummary, PlayerDetails, BulkPlayerPhotoUpload } from './shared';

export function Players() {
  const [tab,setTab]=useState<'Summary'|'Player list'>('Summary');const [selectedPlayer,setSelectedPlayer]=useState<DirectoryRow|null>(null);const [refreshKey,setRefreshKey]=useState(0);
  return <><PageTitle eyebrow="PLAYER MANAGEMENT" title="Player" subtitle="Player overview, scoring leaderboard, and player directory."/><div className="tab-row">{(['Summary','Player list'] as const).map(value=><button key={value} className={tab===value?'selected':''} onClick={()=>{setTab(value);setSelectedPlayer(null);}}>{value}</button>)}</div>{tab==='Summary'?<PlayerSummary/>:selectedPlayer?<PlayerDetails key={selectedPlayer.id} player={selectedPlayer} onBack={()=>setSelectedPlayer(null)}/>:<><MasterBulkImport kind="players" onImported={()=>setRefreshKey(value=>value+1)}/><BulkPlayerPhotoUpload onUploaded={()=>setRefreshKey(value=>value+1)}/><WorkspaceDirectory key={refreshKey} kind="players" onPlayerSelect={setSelectedPlayer}/></>}</>;
}
