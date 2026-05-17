import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import Dashboard     from './pages/Dashboard';
import ThreatIntel   from './pages/ThreatIntel';
import AppProfiling  from './pages/AppProfiling';
import UserAnalytics from './pages/UserAnalytics';
import MLModels      from './pages/MLModels';
import Settings      from './pages/Settings';
import AlertCenter   from './pages/AlertCenter';
import AuditLog      from './pages/AuditLog';
import { useAuthStore } from './store/authStore';
import { ErrorBoundary } from './components/ErrorBoundary';
import { fetchAlerts } from './services/api';
import './App.css';

import {
  LayoutDashboard, Users, ShieldAlert, Package,
  BrainCircuit, Settings as SettingsIcon, LogOut,
  Bell, Shield, ChevronRight, Activity, BellRing, ClipboardList,
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/',        icon: LayoutDashboard, label: 'Dashboard',           sub: 'SOC overview',          color: '#00e5ff' },
  { path: '/users',   icon: Users,           label: 'Insider Threat',      sub: 'Behavioral analytics',  color: '#00ff88' },
  { path: '/alerts',  icon: BellRing,        label: 'Alert Center',        sub: 'Admin response queue',  color: '#ff3366', badge: true },
  { path: '/threats', icon: ShieldAlert,     label: 'Threat Intelligence', sub: 'Event feed & analysis', color: '#ff6633' },
  { path: '/apps',    icon: Package,         label: 'App Governance',      sub: 'Shadow IT & policies',  color: '#ffb300' },
  { path: '/ml',      icon: BrainCircuit,    label: 'AI Detection Engine', sub: 'ML model management',   color: '#b366ff' },
  { path: '/audit',   icon: ClipboardList,   label: 'Audit Log',           sub: 'Immutable admin trail', color: '#ffb300' },
  { path: '/settings',icon: SettingsIcon,    label: 'Configuration',       sub: 'System & response',     color: '#00e5ff' },
];

const ProtectedRoute = ({ children }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-right hidden sm:block">
      <div className="data-mono text-sm font-semibold text-slate-200 tabular-nums">
        {time.toLocaleTimeString('en-US', { hour12: false })}
      </div>
      <div className="data-mono text-[10px] text-slate-600 tracking-wider">
        {time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit' })}
      </div>
    </div>
  );
}

const Sidebar = ({ isOpen, setIsOpen, alertCount }) => {
  const location = useLocation();
  const logout   = useAuthStore((s) => s.logout);
  const user     = useAuthStore((s) => s.user);

  const isActive = (path) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={() => setIsOpen(false)} />
      )}

      <aside className={`
        fixed left-0 top-0 h-screen w-[220px] sidebar-base flex flex-col
        transition-transform duration-300 z-40
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        md:static md:translate-x-0
      `}>

        {/* Brand */}
        <div className="h-16 flex items-center gap-3 px-4" style={{ borderBottom: '1px solid rgba(0,255,136,0.08)' }}>
          <div className="relative flex-shrink-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)' }}>
              <Shield style={{ width: 18, height: 18, color: '#00ff88' }} />
            </div>
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full glow-dot-green" style={{ background: '#00ff88' }} />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-slate-100 text-[15px] tracking-tight leading-none">ShadowSaaS</div>
            <div className="data-mono text-[9px] tracking-widest mt-0.5 uppercase" style={{ color: '#00ff88', opacity: 0.6 }}>CASB · v2.0</div>
          </div>
          <button onClick={() => setIsOpen(false)} className="md:hidden text-slate-500 hover:text-slate-300 ml-auto p-1">✕</button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2.5 space-y-0.5 overflow-y-auto">
          <p className="data-mono text-[9px] text-slate-700 uppercase tracking-[0.15em] px-3 pb-2">
            Security Modules
          </p>

          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path);
            const Icon = item.icon;
            const showBadge = item.badge && alertCount > 0;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsOpen(false)}
                className={`nav-item ${active ? 'active' : ''}`}
                style={active ? { color: item.color } : {}}
              >
                <div className="relative flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                  style={active ? { background: `${item.color}14` } : { background: 'rgba(148,163,184,0.05)' }}>
                  <Icon className="w-3.5 h-3.5" style={active ? { color: item.color } : { color: '#475569' }} />
                  {showBadge && (
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 bg-rose-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                      {alertCount > 99 ? '99+' : alertCount}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium leading-none">{item.label}</div>
                  {active && (
                    <div className="data-mono text-[9px] mt-0.5 opacity-60 truncate" style={{ color: item.color }}>
                      {item.sub}
                    </div>
                  )}
                </div>
                {active && <ChevronRight className="w-3 h-3 opacity-40 flex-shrink-0" style={{ color: item.color }} />}
              </Link>
            );
          })}
        </nav>

        {/* System status strip */}
        <div className="px-3 pb-2">
          <div className="rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.12)' }}>
            <span className="relative flex-shrink-0">
              <span className="block w-1.5 h-1.5 rounded-full glow-dot-green" style={{ background: '#00ff88' }} />
              <span className="absolute inset-0 rounded-full animate-pulse-ring" style={{ background: '#00ff88' }} />
            </span>
            <div>
              <div className="data-mono text-[9px] font-semibold uppercase tracking-wider" style={{ color: '#00ff88' }}>All Systems Nominal</div>
              <div className="data-mono text-[8px] text-slate-600">ML engine · DB · API</div>
            </div>
          </div>
        </div>

        {/* User footer */}
        <div className="p-2.5" style={{ borderTop: '1px solid rgba(0,255,136,0.07)' }}>
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-800/30 transition-colors mb-1">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.25)' }}>
              <span className="data-mono text-xs font-bold" style={{ color: '#00ff88' }}>
                {(user?.username || 'A')[0].toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-200 truncate">{user?.username || 'admin@soc.local'}</p>
              <p className="data-mono text-[9px] text-slate-600">
                {user?.is_admin ? 'SOC Administrator' : 'Security Analyst'}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-slate-600 hover:text-rose-400 hover:bg-rose-500/8 rounded-lg transition-colors data-mono text-[11px] uppercase tracking-wider"
          >
            <LogOut className="w-3 h-3" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
};

const Header = ({ setSidebarOpen, alertCount, onAlertClick }) => {
  return (
    <header className="h-14 flex items-center justify-between px-5 backdrop-blur-md sticky top-0 z-30" style={{ background: 'rgba(3,5,8,0.95)', borderBottom: '1px solid rgba(0,255,136,0.07)' }}>
      <button
        onClick={() => setSidebarOpen(true)}
        className="md:hidden text-slate-400 hover:text-slate-200 p-1"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="flex items-center gap-4 ml-auto">
        <div className="status-live hidden sm:inline-flex neon-flicker">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse glow-dot-green" style={{ background: '#00ff88' }} />
          SYSTEM ONLINE
        </div>

        <div className="w-px h-5 bg-slate-800" />
        <LiveClock />
        <div className="w-px h-5 bg-slate-800" />

        {/* Live alert bell */}
        <button
          onClick={onAlertClick}
          className="relative p-1.5 hover:bg-slate-800/60 rounded-lg transition-colors"
          title={alertCount > 0 ? `${alertCount} active alerts` : 'No active alerts'}
        >
          {alertCount > 0
            ? <BellRing className="w-4 h-4 text-rose-400 animate-pulse" />
            : <Bell className="w-4 h-4 text-slate-500 hover:text-slate-200" />}
          {alertCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-rose-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 border border-[#070c18]">
              {alertCount > 99 ? '99+' : alertCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [alertCount, setAlertCount]   = useState(0);
  const navigate = useNavigate();

  // Poll active alert count every 30s for the header badge
  useEffect(() => {
    const poll = async () => {
      try {
        const data = await fetchAlerts(60, 100);
        const raw  = Array.isArray(data) ? data : (data?.data || []);
        setAlertCount(raw.length);
      } catch { /* backend may not be ready */ }
    };
    poll();
    const iv = setInterval(poll, 30000);
    return () => clearInterval(iv);
  }, []);

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <div className="flex h-screen overflow-hidden" style={{ background: '#030508' }}>
                <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} alertCount={alertCount} />
                <main className="flex-1 flex flex-col min-w-0">
                  <Header
                    setSidebarOpen={setSidebarOpen}
                    alertCount={alertCount}
                    onAlertClick={() => navigate('/alerts')}
                  />
                  <div className="flex-1 overflow-y-auto bg-grid-pattern">
                    <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-6">
                      <Routes>
                        <Route path="/"         element={<Dashboard />} />
                        <Route path="/users"    element={<UserAnalytics />} />
                        <Route path="/alerts"   element={<AlertCenter />} />
                        <Route path="/threats"  element={<ThreatIntel />} />
                        <Route path="/apps"     element={<AppProfiling />} />
                        <Route path="/ml"       element={<MLModels />} />
                        <Route path="/audit"    element={<AuditLog />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="*"         element={<Navigate to="/" replace />} />
                      </Routes>
                    </div>
                  </div>
                </main>
              </div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
