import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getWorkspace } from '../lib/workspaceData';
import { supabase, configured } from '../lib/supabase';
import {
  Activity, Bell, ChevronDown, ClipboardList, Flag, LayoutDashboard, LogOut,
  Menu, Radio, Search, Settings2, ShieldCheck, Trophy, UserRound, Users,
} from 'lucide-react';

const navigation = [
  { section: 'OVERVIEW', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }] },
  { section: 'LEAGUE MANAGEMENT', items: [
    { to: '/competition', label: 'Competition & rules', icon: Trophy },
    { to: '/teams', label: 'Teams & rosters', icon: Users },
    { to: '/players', label: 'Players', icon: UserRound },
    { to: '/registrations', label: 'Registration review', icon: ClipboardList },
    { to: '/games', label: 'Game schedule', icon: Activity },
  ] },
  { section: 'GAME DAY', items: [
    { to: '/games/live', label: 'Live scoring', icon: Radio },
    { to: '/games/review', label: 'Review & finalize', icon: ShieldCheck },
    { to: '/standings', label: 'Standings', icon: Flag },
  ] },
  { section: 'REPORTING', items: [
    { to: '/reports', label: 'Reports', icon: ClipboardList },
    { to: '/public/live', label: 'Public scoreboard', icon: Radio },
  ] },
  { section: 'ADMINISTRATION', items: [
    { to: '/announcements', label: 'Announcements', icon: Bell },
    { to: '/access', label: 'Staff access & audit', icon: ShieldCheck },
    { to: '/organization', label: 'Organization setup', icon: Settings2 },
  ] },
];

export default function Shell() {
  const [collapsed, setCollapsed] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [organization, setOrganization] = useState('Loading organization…');
  const [userLabel, setUserLabel] = useState('Staff account');
  const [connectionStatus,setConnectionStatus]=useState('Checking database…');
  useEffect(() => {
    if (!configured) { setOrganization('Connect Supabase'); setUserLabel('Preview mode'); setConnectionStatus('Database not configured'); return; }
    void getWorkspace().then(value => {setOrganization(value.name);setConnectionStatus('Database connected');}).catch(error => {setOrganization('Organization setup');setConnectionStatus(error instanceof Error&&error.message.includes('not assigned')?'Database connected · setup required':'Database unavailable');});
    void supabase.auth.getUser().then(({data}) => { if (data.user) setUserLabel(data.user.email ?? 'Staff account'); });
  }, []);
  const location = useLocation();
  const navigate = useNavigate();
  const isLive = location.pathname === '/games/live';
  return <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''} ${isLive ? 'live-shell' : ''}`}>
    <aside className="sidebar">
      <div className="brand-row"><div className="brand-symbol"><span className="basketball-seam">◌</span></div><div className="brand-name"><b>EO2MATE</b><span>SPORTS</span></div><button className="collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar"><Menu size={17}/></button></div>
      <button className="org-switch" onClick={() => navigate('/organization')}><span className="org-mark">EO</span><span className="org-copy"><small>YOUR ORGANIZATION</small><b>{organization}</b><em>Organization workspace</em></span><ChevronDown size={15}/></button>
      <div className="sidebar-search"><Search size={15}/><span>Search menu</span><kbd>⌘ K</kbd></div>
      <nav className="side-nav">{navigation.map(group => <div className="nav-group" key={group.section}><div className="nav-caption">{group.section}</div>{group.items.map(item => <NavLink end={item.to === '/'} to={item.to} key={item.to} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}><item.icon size={17}/><span>{item.label}</span>{item.to === '/games/live' && <span className="nav-live-dot"/>}</NavLink>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><span><ShieldCheck size={17}/></span><b>Privacy-first workspace</b><small>League data stays scoped to your organization.</small><button onClick={() => navigate('/access')}>View access guide <span>↗</span></button></div><div className="user-row"><div className="user-avatar">{userLabel.slice(0,2).toUpperCase()}</div><div className="user-copy"><b>{userLabel}</b><small>Organization member</small></div><button className="icon-button" onClick={async () => { await supabase.auth.signOut(); navigate('/login'); }} aria-label="Sign out"><LogOut size={16}/></button></div></div>
    </aside>
    <main className="workspace">
      <header className="topbar"><div className="breadcrumbs"><span>{organization}</span><i>/</i><b>{getCurrentLabel(location.pathname)}</b></div><div className="topbar-actions"><span className="system-status"><span/> {connectionStatus}</span><div className="notice-wrap"><button className="icon-button notification-trigger" onClick={() => setNoticeOpen(!noticeOpen)} aria-label="Announcements"><Bell size={18}/></button>{noticeOpen && <div className="notification-popover"><div className="popover-heading"><b>Announcements</b><button onClick={() => setNoticeOpen(false)}>Close</button></div><div className="notice-item"><span className="notice-badge blue"><Bell size={15}/></span><div><b>Organization updates</b><small>Published announcements are available in this section.</small></div></div><NavLink to="/announcements" onClick={() => setNoticeOpen(false)}>Open announcements <span>→</span></NavLink></div>}</div><button className="header-profile" onClick={() => navigate('/settings')}><span className="user-avatar small">{userLabel.slice(0,2).toUpperCase()}</span><ChevronDown size={14}/></button></div></header>
      {isLive && <div className="game-mode-strip"><span className="pulse-dot"/><b>GAME DAY MODE</b><span>Live game events are saved to the selected game.</span><button onClick={() => navigate('/games')}>Change game <ChevronDown size={13}/></button></div>}
      <div className="page-content"><Outlet/></div>
      <footer className="workspace-footer"><span>EO2MATE SPORTS <b>·</b> Basketball MVP</span><span>Preview workspace <i/> v0.2</span></footer>
    </main>
  </div>;
}

function getCurrentLabel(path: string) {
  if (path === '/') return 'Dashboard';
  if (path.includes('/games/live')) return 'Live scoring';
  if (path.includes('/games/review')) return 'Review & finalize';
  const current = navigation.flatMap(group => group.items).find(item => item.to === path);
  return current?.label ?? 'Workspace';
}
