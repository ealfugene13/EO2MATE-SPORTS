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
import { PageTitle, DirectoryRow, WorkspaceDirectory, MasterBulkImport, TeamSummary, TeamDetails, BulkTeamLogoUpload } from './shared';

export function Teams() {
  const [searchParams,setSearchParams]=useSearchParams();const initialTeamId=searchParams.get('team');
  const [tab,setTab]=useState<'Summary'|'Team list'>(()=>initialTeamId?'Team list':'Summary');const [selectedTeam,setSelectedTeam]=useState<DirectoryRow|null>(null);const [refreshKey,setRefreshKey]=useState(0);
  const openTeam=(team:DirectoryRow|null)=>{setSelectedTeam(team);if(team){setTab('Team list');const next=new URLSearchParams(searchParams);next.delete('team');setSearchParams(next,{replace:true});}};
  return <><PageTitle eyebrow="TEAM MANAGEMENT" title="Team" subtitle="Team overview, standings, and roster details for your organization."/><div className="tab-row">{(['Summary','Team list'] as const).map(value=><button key={value} className={tab===value?'selected':''} onClick={()=>{setTab(value);setSelectedTeam(null);}}>{value}</button>)}</div>{tab==='Summary'?<TeamSummary/>:selectedTeam?<TeamDetails team={selectedTeam} onBack={()=>setSelectedTeam(null)}/>:<><MasterBulkImport kind="teams" onImported={()=>setRefreshKey(value=>value+1)}/><BulkTeamLogoUpload onUploaded={()=>setRefreshKey(value=>value+1)}/><WorkspaceDirectory key={refreshKey} kind="teams" onTeamSelect={openTeam} initialTeamId={initialTeamId}/></>}</>;
}
