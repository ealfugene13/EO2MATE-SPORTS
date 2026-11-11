import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import Shell from './components/Shell';
import { SupportAdmin } from './pages/SupportAdmin';
import { configured, supabase } from './lib/supabase';
import { getWorkspace } from './lib/workspaceData';
import ViewerPortal from './pages/ViewerPortal';
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
    <Route path="/viewer" element={<ViewerPortal />} />
    <Route path="/viewer/:slug" element={<ViewerPortal />} />
    <Route path="/support" element={sessionReady ? (configured&&!signedIn ? <Navigate to="/login" replace/> : <SupportRoute />) : <div className="empty-state">Checking sign-in…</div>} />
    <Route path="/public/live" element={sessionReady ? (configured&&!signedIn ? <Navigate to="/login" replace/> : <main className="workspace public-workspace"><div className="page-content"><PublicLive /></div></main>) : <div className="empty-state">Checking sign-in…</div>} />
    <Route path="/" element={sessionReady ? (configured&&!signedIn?<Navigate to="/login" replace/>:<WorkspaceRoute />) : <div className="empty-state">Checking sign-in…</div>}>
      <Route index element={<Dashboard />} />
      <Route path="league" element={<League />} />
      <Route path="setup" element={<Setup />} />
      <Route path="organization" element={<GenericPage name="Organization setup" />} />
      <Route path="workflow" element={<LeagueWorkflow />} />
      <Route path="competition" element={<Competition />} />
      <Route path="teams" element={<Teams />} />
      <Route path="players" element={<Players />} />
      <Route path="registrations" element={<Registrations />} />
      <Route path="games" element={<Games />} />
      <Route path="games/live" element={<LiveGame />} />
      <Route path="games/review" element={<GameReview />} />
      <Route path="standings" element={<Standings />} />
      <Route path="announcements" element={<Announcements />} />
      <Route path="access" element={<Access />} />
      <Route path="reports" element={<Reports />} />
      <Route path="settings" element={<GenericPage name="Workspace settings" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>;
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
  if (decision === 'viewer') return <Navigate to={`/viewer?organization_id=${encodeURIComponent(organizationId)}`} replace />;
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
  if (viewerOrg) return <Navigate to={`/viewer?organization_id=${encodeURIComponent(viewerOrg)}`} replace />;
  return <SupportAdmin />;
}
