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
import { PageTitle, Button, Panel, AnnouncementRow } from './shared';

export function Announcements() {
  const data=useWorkspaceRows<AnnouncementRow>('announcements','id,subject,message,audience,published_at,created_at');
  const [subject,setSubject]=useState('');const [message,setMessage]=useState('');const [audience,setAudience]=useState('STAFF');const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  async function publish(){setError('');setNotice('');if(!subject.trim()||!message.trim()){setError('Enter a subject and message.');return;}setSaving(true);try{const {data:userData,error:userError}=await supabase.auth.getUser();if(userError||!userData.user)throw new Error('Sign in before publishing an announcement.');await data.insert({author_id:userData.user.id,audience,subject:subject.trim(),message:message.trim(),published_at:new Date().toISOString()});setSubject('');setMessage('');setNotice('Announcement saved to the organization. No email or push message was sent.');}catch(e){setError(e instanceof Error?e.message:'Unable to save announcement.');}finally{setSaving(false);}}
  return <><PageTitle title="Announcements" subtitle="Publish organization updates and review previously saved announcements." action={<Button variant="primary" onClick={()=>void publish()} disabled={saving}>{saving?'Saving…':'Publish announcement'}</Button>}/><DataState loading={data.loading} error={data.error} onRetry={()=>void data.reload()}/>{error&&<div className="form-error" role="alert">{error}</div>}{notice&&<div className="success-banner"><CheckCircle2 size={17}/>{notice}</div>}<div className="form-layout"><div className="form-main"><Panel title="Compose update"><div className="field-grid"><label>Audience<select value={audience} onChange={e=>setAudience(e.target.value)}><option value="STAFF">All league staff</option><option value="TEAM_MANAGERS">Team managers</option><option value="PUBLIC">Public followers</option></select></label><label className="span-2">Subject<input value={subject} onChange={e=>setSubject(e.target.value)} maxLength={180}/></label><label className="span-2">Message<textarea rows={6} value={message} onChange={e=>setMessage(e.target.value)} maxLength={10000}/></label></div><div className="form-footer"><span className="muted">Publishing stores the update for this organization.</span><Button variant="primary" onClick={()=>void publish()} disabled={saving}>{saving?'Saving…':'Publish update'}</Button></div></Panel></div><aside className="side-summary"><Panel title="Recent announcements">{data.rows.slice(0,5).map(item=><div className="report-row" key={item.id}><div><b>{item.subject}</b><small>{item.audience.replaceAll('_',' ')} · {new Date(item.published_at||item.created_at).toLocaleString()}</small><p>{item.message}</p></div></div>)}{!data.loading&&!data.rows.length&&<div className="empty-state">No announcements yet.</div>}</Panel></aside></div></>;
}
