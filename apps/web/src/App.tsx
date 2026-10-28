import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import Shell from './components/Shell';
import { configured, supabase } from './lib/supabase';
import {
  Access, Announcements, Competition, Dashboard, GameReview, Games, GenericPage,
  LiveGame, Players, PublicLive, Registrations, Reports, Standings, Teams,
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
    <Route path="/public/live" element={sessionReady ? (configured&&!signedIn ? <Navigate to="/login" replace/> : <main className="workspace public-workspace"><div className="page-content"><PublicLive /></div></main>) : <div className="empty-state">Checking sign-in…</div>} />
    <Route path="/" element={sessionReady ? (configured&&!signedIn?<Navigate to="/login" replace/>:<Shell />) : <div className="empty-state">Checking sign-in…</div>}>
      <Route index element={<Dashboard />} />
      <Route path="organization" element={<GenericPage name="Organization setup" />} />
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
