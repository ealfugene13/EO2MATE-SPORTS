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
import { PageTitle } from './shared';
import { League, Competition, Registrations, Announcements, Access, LeagueWorkflow, GenericPage } from './League';

export function Setup() {
  const [tab,setTab]=useState(()=>new URLSearchParams(window.location.search).get('tab')==='league'?'League & rules':'Organization');const tabs=['Organization','League & rules','Workflow','Registrations','Staff & access','Announcements','Settings'];
  return <><PageTitle eyebrow="ADMINISTRATION" title="Setup" subtitle="Organization, league rules, review, registration, and access controls."/><div className="tab-row">{tabs.map(value=><button key={value} className={tab===value?'selected':''} onClick={()=>setTab(value)}>{value}</button>)}</div>{tab==='Organization'?<GenericPage name="Organization setup"/>:tab==='League & rules'?<Competition/>:tab==='Workflow'?<LeagueWorkflow/>:tab==='Registrations'?<Registrations/>:tab==='Staff & access'?<Access/>:tab==='Announcements'?<Announcements/>:<GenericPage name="Workspace settings"/>}</>;
}
