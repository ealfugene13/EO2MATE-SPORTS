import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import Shell from './components/Shell';
import PublicShell from './components/PublicShell';
import { SupportAdmin } from './pages/SupportAdmin';
import { configured, supabase } from './lib/supabase';
import { getWorkspace } from './lib/workspaceData';
import ViewerPortal, { type Tab } from './pages/ViewerPortal';
import {
  Access, Announcements, Competition, Dashboard, GameReview, Games, GenericPage, League,
  LeagueWorkflow, LiveGame, Players, PublicLive, Registrations, Reports, Setup, Standings, Teams,
} from './pages/Pages';

export default function App() {
  const [sessionReady,setSessionReady]=useState(!configured);
  const [signedIn,setSignedIn]=useState(false);
  useEffect(()=>{
    if(!configured)return;
    void supabase.auth.getSession().then(({data})=>{setSignedIn(Boolean(data.session));setSessionReady(true);});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{setSignedIn(Boolean(session));setSessionReady(true);});
    return()=>subscription.unsubscribe();
  },[]);
  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/viewer" element={<Navigate to="/" replace/>} />
    <Route path="/viewer/:slug" element={<LegacyViewerRedirect/>} />
    <Route path="/public" element={<PublicShell/>}>
      <Route index element={<Navigate to="/public/organization" replace/>}/>
      <Route path="organization" element={<ViewerPortal section="Organization" embedded/>}/>
      <Route path="league" element={<ViewerPortal section="League" embedded/>}/>
      <Route path="competition" element={<ViewerPortal section="Competition" embedded/>}/>
      <Route path="teams" element={<ViewerPortal section="Team" embedded/>}/>
      <Route path="players" element={<ViewerPortal section="Player" embedded/>}/>
      <Route path="games" element={<ViewerPortal section="Games" embedded/>}/>
      <Route path="stats" element={<ViewerPortal section="Stats" embedded/>}/>
      <Route path="play-by-play" element={<ViewerPortal section="Play-by-play" embedded/>}/>
    </Route>
    <Route path="/support" element={sessionReady ? (configured&&!signedIn ? <Navigate to="/login" replace/> : <SupportRoute />) : <div className="empty-state">Checking sign-in…</div>} />
    <Route path="/public/live" element={sessionReady ? (configured&&!signedIn ? <Navigate to="/login" replace/> : <main className="workspace public-workspace"><div className="page-content"><PublicLive /></div></main>) : <div className="empty-state">Checking sign-in…</div>} />
    <Route path="/" element={sessionReady ? (signedIn?<WorkspaceRoute/>:<PublicShell/>) : <div className="empty-state">Loading EO2MATE Sports…</div>}>
      <Route index element={<PageGate signedIn={signedIn} tab="Organization" staff={<Dashboard/>}/>} />
      <Route path="league" element={<PageGate signedIn={signedIn} tab="League" staff={<League/>}/>} />
      <Route path="setup" element={signedIn?<Setup/>:<Navigate to="/login" replace/>} />
      <Route path="organization" element={<PageGate signedIn={signedIn} tab="Organization" staff={<GenericPage name="Organization setup"/>}/>} />
      <Route path="workflow" element={signedIn?<LeagueWorkflow/>:<Navigate to="/login" replace/>} />
      <Route path="competition" element={<PageGate signedIn={signedIn} tab="Competition" staff={<Competition/>}/>} />
      <Route path="teams" element={<PageGate signedIn={signedIn} tab="Team" staff={<Teams/>}/>} />
      <Route path="players" element={<PageGate signedIn={signedIn} tab="Player" staff={<Players/>}/>} />
      <Route path="registrations" element={signedIn?<Registrations/>:<Navigate to="/login" replace/>} />
      <Route path="games" element={<PageGate signedIn={signedIn} tab="Games" staff={<Games/>}/>} />
      <Route path="games/live" element={signedIn?<LiveGame/>:<Navigate to="/login" replace/>} />
      <Route path="games/review" element={signedIn?<GameReview/>:<Navigate to="/login" replace/>} />
      <Route path="standings" element={<PageGate signedIn={signedIn} tab="Stats" staff={<Standings/>}/>} />
      <Route path="stats" element={<PageGate signedIn={signedIn} tab="Stats" staff={<Standings/>}/>} />
      <Route path="announcements" element={signedIn?<Announcements/>:<Navigate to="/login" replace/>} />
      <Route path="access" element={signedIn?<Access/>:<Navigate to="/login" replace/>} />
      <Route path="reports" element={signedIn?<Reports/>:<Navigate to="/login" replace/>} />
      <Route path="settings" element={signedIn?<GenericPage name="Workspace settings"/>:<Navigate to="/login" replace/>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>;
}

function PageGate({signedIn,tab,staff}:{signedIn:boolean;tab:Tab;staff:ReactNode}) {
  return signedIn ? <>{staff}</> : <ViewerPortal section={tab} embedded/>;
}

function LegacyViewerRedirect(){
  const { pathname } = useLocation();
  const slug = decodeURIComponent(pathname.split('/').filter(Boolean).pop()??'');
  return <Navigate to={`/public/organization?organization=${encodeURIComponent(slug)}`} replace/>;
}

function WorkspaceRoute() {
  const [decision, setDecision] = useState<'checking'|'workspace'|'viewer'>('checking');
  const [organizationId, setOrganizationId] = useState('');
  useEffect(() => {
    let active = true;
    void getWorkspace().then(workspace => {
      if (!active) return;
      setOrganizationId(workspace.id);
      setDecision(workspace.role.toUpperCase() === 'VIEWER' ? 'viewer' : 'workspace');
    }).catch(() => { if (active) setDecision('workspace'); });
    return () => { active = false; };
  }, []);
  if (decision === 'checking') return <div className="empty-state">Checking organization access…</div>;
  if (decision === 'viewer') return <Navigate to={`/public/organization?organization_id=${encodeURIComponent(organizationId)}`} replace />;
  return <Shell />;
}

function SupportRoute() {
  const [viewerOrg, setViewerOrg] = useState('');
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let active = true;
    void getWorkspace().then(workspace => {
      if (active && workspace.role.toUpperCase() === 'VIEWER') setViewerOrg(workspace.id);
    }).catch(() => {}).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);
  if (checking) return <div className="empty-state">Checking access…</div>;
  if (viewerOrg) return <Navigate to={`/public/organization?organization_id=${encodeURIComponent(viewerOrg)}`} replace />;
  return <SupportAdmin />;
}
