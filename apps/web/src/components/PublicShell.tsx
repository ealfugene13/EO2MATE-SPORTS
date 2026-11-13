import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { Activity, CalendarDays, LogIn, Menu, Trophy, UserRound, Users, Building2 } from 'lucide-react';

const publicNavigation = [
  { to: '/public/organization', label: 'Organization', icon: Building2 },
  { to: '/public/league', label: 'League', icon: Trophy },
  { to: '/public/competition', label: 'Competition', icon: CalendarDays },
  { to: '/public/teams', label: 'Team', icon: Users },
  { to: '/public/players', label: 'Player', icon: UserRound },
  { to: '/public/games', label: 'Games', icon: CalendarDays },
  { to: '/public/stats', label: 'Stats', icon: Activity },
];

export default function PublicShell() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const carried = new URLSearchParams();
  const organization = searchParams.get('organization');
  const organizationId = searchParams.get('organization_id');
  const leagueId = searchParams.get('league_id');
  const competitionId = searchParams.get('competition_id');
  const gameId = searchParams.get('game_id');
  if (organization) carried.set('organization', organization);
  if (organizationId) carried.set('organization_id', organizationId);
  if (leagueId) carried.set('league_id', leagueId);
  if (competitionId) carried.set('competition_id', competitionId);
  if (gameId) carried.set('game_id', gameId);
  const suffix = carried.toString() ? `?${carried.toString()}` : '';
  const organizationHome = organization
    ? `/public/organization?organization=${encodeURIComponent(organization)}`
    : organizationId ? `/public/organization?organization_id=${encodeURIComponent(organizationId)}` : '/public/organization';
  const current = publicNavigation.find(item => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`));
  return <div className="app-shell public-app-shell">
    <aside className="sidebar">
      <div className="brand-row"><div className="brand-symbol"><span className="basketball-seam">◌</span></div><div className="brand-name"><b>EO2MATE</b><span>SPORTS</span></div><span className="collapse-button"><Menu size={17}/></span></div>
      <Link className="org-switch public-org-switch" to={organizationHome}><span className="org-mark">EO</span><span className="org-copy"><small>SPORTS DIRECTORY</small><b>EO2MATE SPORTS</b><em>Organization information</em></span></Link>
      <nav className="side-nav" aria-label="Public pages"><div className="nav-group">{publicNavigation.map(item=><NavLink to={`${item.to}${suffix}`} key={item.to} className={({isActive})=>`nav-link ${isActive?'active':''}`}><item.icon size={17}/><span>{item.label}</span></NavLink>)}</div></nav>
    </aside>
    <main className="workspace">
      <header className="topbar public-topbar"><div className="breadcrumbs"><span>EO2MATE SPORTS</span><i>/</i><b>{current?.label??'Organizations'}</b></div><div className="topbar-actions"><Link className="button primary public-login-button" to="/login"><LogIn size={15}/> Login</Link></div></header>
      <div className="page-content public-page-content"><Outlet/></div>
      <footer className="workspace-footer"><span>EO2MATE SPORTS <b>·</b> Public pages</span><span>Organization, league, and game information</span></footer>
    </main>
  </div>;
}
