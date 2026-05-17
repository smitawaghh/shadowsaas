import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchUserAnalytics, fetchDeviceTimeline, quarantineIP } from '../services/api';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar,
} from 'recharts';
import {
  Users, Brain, TrendingDown, AlertTriangle, X, Ban,
  Activity, Clock, Shield, ChevronRight, Search, Filter,
} from 'lucide-react';

const RISK_COLORS = { CRITICAL: '#ef4444', ELEVATED: '#f59e0b', NORMAL: '#10b981' };
const PIE_COLORS  = ['#10b981', '#f59e0b', '#ef4444'];

function RiskBadge({ level, score }) {
  const bg = level === 'CRITICAL' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
           : level === 'ELEVATED' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
           :                        'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
  return (
    <span className={`text-xs font-bold font-mono px-3 py-1 rounded-full border ${bg}`}>
      {Number(score).toFixed(1)}
    </span>
  );
}

// ── Per-device investigation modal ─────────────────────────────────────────
function InvestigationModal({ user, onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [blocking, setBlocking] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [toast, setToast]     = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetchDeviceTimeline(user.ip, 60);
        setData(resp);
      } catch (err) {
        console.error('Timeline fetch error', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user.ip]);

  const handleBlock = async () => {
    setBlocking(true);
    try {
      await quarantineIP(user.ip);
      setBlocked(true);
      setToast('IP quarantined — network access suspended');
    } catch {
      setToast('Failed to quarantine IP');
    } finally {
      setBlocking(false);
    }
  };

  // Build timeline chart from events (chronological, last 30)
  const timelinePoints = data
    ? [...data.events]
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .slice(-30)
        .map((e) => ({
          time: new Date(e.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
          risk: Math.round(e.risk_score || 0),
          anomaly: e.is_anomalous ? Math.round(e.risk_score || 0) : null,
        }))
    : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-6 px-4">
      <div className="w-full max-w-4xl bg-[#070c18] border border-slate-700/60 rounded-2xl shadow-2xl">
        {/* Modal header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-800/60">
          <div>
            <h2 className="text-lg font-bold text-slate-100 font-mono flex items-center gap-3">
              <Shield className="w-5 h-5 text-cyan-400" />
              Device Investigation
            </h2>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {user.device_name && user.device_name !== user.ip && (
                <span className="text-sm font-bold font-mono text-cyan-200 bg-cyan-900/30 px-2 py-0.5 rounded border border-cyan-700/40">
                  {user.device_name}
                </span>
              )}
              <code className="text-sm text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-700 font-mono">{user.ip}</code>
              {user.mac_address && (
                <code className="text-xs text-slate-600 bg-slate-900/60 px-2 py-0.5 rounded border border-slate-800 font-mono">{user.mac_address}</code>
              )}
              <RiskBadge level={user.riskLevel || 'NORMAL'} score={user.avgRisk || 0} />
              {(user.genaiEvents || 0) > 0 && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 bg-purple-500/15 border border-purple-500/30 text-purple-300 rounded-full font-mono">
                  <Brain className="w-2.5 h-2.5" /> GenAI Activity
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!blocked && (
              <button
                onClick={handleBlock}
                disabled={blocking}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold font-mono uppercase
                  bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 transition-all disabled:opacity-40">
                <Ban className="w-3 h-3" />
                {blocking ? 'Blocking…' : 'Block IP'}
              </button>
            )}
            {blocked && (
              <span className="text-[10px] font-mono text-rose-400 border border-rose-500/30 bg-rose-500/10 px-2 py-1 rounded-lg">
                ✓ IP Quarantined
              </span>
            )}
            <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {toast && (
          <div className="mx-5 mt-3 px-3 py-2 bg-emerald-950 border border-emerald-500/30 text-emerald-300 rounded-lg text-xs font-mono">
            {toast}
          </div>
        )}

        <div className="p-5 space-y-5">
          {/* KPI strip */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[
              ['Total Events',  user.totalEvents,                                    'text-slate-200'],
              ['Anomalies',     user.anomalies,                                      'text-rose-400'],
              ['Apps Used',     user.appCount,                                       'text-cyan-400'],
              ['Upload Vol',    `${Number(user.uploadVol || 0).toFixed(1)} MB`,      'text-amber-400'],
              ['GenAI Events',  user.genaiEvents || 0,                               'text-purple-400'],
              ['Avg Risk',      Number(user.avgRisk || 0).toFixed(1),                user.riskLevel === 'CRITICAL' ? 'text-rose-400' : 'text-emerald-400'],
            ].map(([label, val, cls]) => (
              <div key={label} className="bg-slate-900/60 rounded-lg px-3 py-2 border border-slate-800/50 text-center">
                <div className="text-slate-500 text-[9px] font-mono uppercase tracking-wider mb-1">{label}</div>
                <div className={`font-bold text-sm font-mono ${cls}`}>{val}</div>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="w-7 h-7 border-2 border-cyan-500/40 border-t-cyan-400 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Risk timeline chart */}
              {timelinePoints.length > 1 && (
                <div>
                  <h3 className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Activity className="w-3 h-3" /> Risk Score Timeline (last {timelinePoints.length} flows)
                  </h3>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={timelinePoints} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                        <defs>
                          <linearGradient id="invGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="1 4" stroke="#1e293b" />
                        <XAxis dataKey="time" stroke="#334155" fontSize={8} tickLine={false} axisLine={false} />
                        <YAxis domain={[0, 100]} stroke="#334155" fontSize={8} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'rgba(2,6,23,0.95)', border: '1px solid #22d3ee30', borderRadius: 8, fontFamily: 'monospace', fontSize: 11 }}
                        />
                        <Area type="monotone" dataKey="risk" stroke="#22d3ee" strokeWidth={1.5} fill="url(#invGrad)" name="Risk" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Top apps */}
              {data?.top_apps?.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <ChevronRight className="w-3 h-3" /> Top Applications Used
                  </h3>
                  <div className="h-36">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.top_apps} layout="vertical" margin={{ left: 0, right: 40, top: 2, bottom: 2 }}>
                        <CartesianGrid strokeDasharray="1 4" stroke="#1e293b" horizontal={false} />
                        <XAxis type="number" stroke="#334155" fontSize={8} tickLine={false} axisLine={false} />
                        <YAxis dataKey="name" type="category" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} width={120} tick={{ fontFamily: 'monospace' }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'rgba(2,6,23,0.95)', border: '1px solid #33415540', borderRadius: 8, fontFamily: 'monospace', fontSize: 11 }}
                          formatter={(v, n) => [v, n === 'count' ? 'Events' : n]}
                        />
                        <Bar dataKey="count" fill="#22d3ee" fillOpacity={0.7} radius={[0, 3, 3, 0]} barSize={10}>
                          {data.top_apps.map((app, i) => (
                            <Cell key={i} fill={app.avg_risk > 60 ? '#ef4444' : app.avg_risk > 30 ? '#f59e0b' : '#22d3ee'} fillOpacity={0.7} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Recent events table */}
              {data?.events?.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Clock className="w-3 h-3" /> Recent Events (last {Math.min(data.events.length, 15)})
                  </h3>
                  <div className="overflow-x-auto rounded-lg border border-slate-800/60">
                    <table className="w-full text-xs font-mono">
                      <thead className="bg-slate-950/80 text-slate-500 text-[9px] uppercase tracking-widest border-b border-slate-800">
                        <tr>
                          <th className="px-3 py-2 text-left">Time</th>
                          <th className="px-3 py-2 text-left">App</th>
                          <th className="px-3 py-2 text-right">Risk</th>
                          <th className="px-3 py-2 text-right">Upload</th>
                          <th className="px-3 py-2 text-center">Flags</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {data.events.slice(0, 15).map((e, i) => (
                          <tr key={i} className={`hover:bg-slate-800/25 ${e.is_anomalous ? 'bg-rose-500/3' : ''}`}>
                            <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">
                              {new Date(e.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                            </td>
                            <td className="px-3 py-1.5 text-slate-300 whitespace-nowrap max-w-[160px] truncate">{e.app_name}</td>
                            <td className={`px-3 py-1.5 text-right font-bold whitespace-nowrap
                              ${e.risk_score >= 70 ? 'text-rose-400' : e.risk_score >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {(e.risk_score || 0).toFixed(1)}
                            </td>
                            <td className="px-3 py-1.5 text-right text-amber-400/80 whitespace-nowrap">
                              {((e.bytes_sent || 0) / 1024).toFixed(1)} KB
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {e.is_anomalous && <span className="text-rose-400" title="Anomaly">⚠</span>}
                                {e.is_genai_exfiltration && <span className="text-purple-400" title="GenAI Exfil">🤖</span>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main UserAnalytics page ────────────────────────────────────────────────
export default function UserAnalytics() {
  const location = useLocation();
  const [users, setUsers]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState(null);
  const [search, setSearch]           = useState('');
  const [levelFilter, setLevelFilter] = useState('All');

  const loadData = useCallback(async () => {
    try {
      const data = await fetchUserAnalytics();
      const list = Array.isArray(data) ? data : (data?.users || []);
      setUsers(list);

      // Auto-open investigation if navigated here with investigateIp state
      if (location.state?.investigateIp) {
        const target = list.find((u) => u.ip === location.state.investigateIp);
        if (target) setSelected(target);
      }
    } catch (err) {
      console.error('UserAnalytics load error', err);
    } finally {
      setLoading(false);
    }
  }, [location.state?.investigateIp]);

  useEffect(() => {
    loadData();
    const iv = setInterval(loadData, 15000);
    return () => clearInterval(iv);
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-cyan-500/40 border-t-cyan-400 rounded-full animate-spin mx-auto" />
          <p className="text-cyan-400 font-mono text-sm animate-pulse tracking-widest">SCANNING ENTERPRISE PERSONNEL…</p>
        </div>
      </div>
    );
  }

  const topUser   = users[0];
  const critical  = users.filter((u) => u.riskLevel === 'CRITICAL').length;
  const elevated  = users.filter((u) => u.riskLevel === 'ELEVATED').length;
  const normal    = users.filter((u) => u.riskLevel === 'NORMAL').length;
  const genaiUsers = users.filter((u) => (u.genaiEvents || 0) > 0).length;

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch = !search
      || u.ip?.includes(q)
      || u.device_name?.toLowerCase().includes(q)
      || u.mac_address?.toLowerCase().includes(q);
    const matchLevel = levelFilter === 'All' || u.riskLevel === levelFilter;
    return matchSearch && matchLevel;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {selected && (
        <InvestigationModal user={selected} onClose={() => setSelected(null)} />
      )}

      {/* Page header */}
      <div className="glass-panel p-5 rounded-xl border-l-4 border-l-cyan-500 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3 tracking-tight">
            <Users className="w-6 h-6 text-cyan-400" />
            Insider Threat Analytics
          </h1>
          <p className="text-slate-500 data-mono text-xs mt-1">
            Behavioral profiling · ML risk scoring · exponential decay · click any device to investigate
          </p>
        </div>
        <div className="flex gap-4 text-center font-mono">
          <div><div className="text-2xl font-bold text-slate-100">{users.length}</div><div className="text-[10px] text-slate-500 uppercase">Devices</div></div>
          <div><div className="text-2xl font-bold text-rose-400">{critical}</div><div className="text-[10px] text-slate-500 uppercase">Critical</div></div>
          <div><div className="text-2xl font-bold text-amber-400">{elevated}</div><div className="text-[10px] text-slate-500 uppercase">Elevated</div></div>
          <div><div className="text-2xl font-bold text-purple-400">{genaiUsers}</div><div className="text-[10px] text-slate-500 uppercase">GenAI</div></div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Risk pie */}
        <div className="glass-panel rounded-xl p-5">
          <h2 className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-cyan-500 rounded-full" /> Risk Distribution
          </h2>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[{ name: 'Normal', value: normal }, { name: 'Elevated', value: elevated }, { name: 'Critical', value: critical }]}
                  innerRadius={60} outerRadius={82} paddingAngle={4} dataKey="value" stroke="none">
                  {PIE_COLORS.map((c, i) => <Cell key={i} fill={c} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'rgba(2,6,23,0.95)', border: '1px solid #334155', borderRadius: 8 }} itemStyle={{ color: '#06b6d4', fontWeight: 'bold' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-around text-center font-mono text-xs mt-1">
            {[['NORMAL', '#10b981', normal], ['ELEVATED', '#f59e0b', elevated], ['CRITICAL', '#ef4444', critical]].map(([l, c, v]) => (
              <div key={l}><div className="font-bold text-lg" style={{ color: c }}>{v}</div><div className="text-slate-500 text-[9px]">{l}</div></div>
            ))}
          </div>
        </div>

        {/* Top threat radar */}
        {topUser && (
          <div className="glass-panel rounded-xl p-5 lg:col-span-2 border-t-4 border-t-rose-500">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-mono text-rose-400 uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" /> Highest Risk Device
              </h2>
              <div className="flex items-center gap-2">
                <code className="text-xs text-cyan-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-700 font-mono">{topUser.ip}</code>
                {topUser.genaiEvents > 0 && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 bg-purple-500/15 border border-purple-500/30 text-purple-300 rounded font-mono">
                    <Brain className="w-2.5 h-2.5" /> GenAI Alert
                  </span>
                )}
                <button onClick={() => setSelected(topUser)}
                  className="text-[9px] font-mono font-bold px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded hover:bg-cyan-500/20 transition-all">
                  Investigate →
                </button>
              </div>
            </div>
            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="flex-1 h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={[
                    { subject: 'Upload MB',   A: topUser.uploadVol,   fullMark: Math.max(100, topUser.uploadVol * 1.5) },
                    { subject: 'Anomalies',   A: topUser.anomalies,   fullMark: Math.max(50,  topUser.anomalies * 1.5) },
                    { subject: 'App Variety', A: topUser.appCount,    fullMark: Math.max(20,  topUser.appCount  * 1.5) },
                    { subject: 'Avg Risk',    A: topUser.avgRisk,     fullMark: 100 },
                    { subject: 'Events',      A: topUser.totalEvents, fullMark: Math.max(200, topUser.totalEvents * 1.5) },
                  ]}>
                    <PolarGrid stroke="#334155" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }} />
                    <PolarRadiusAxis angle={30} domain={[0, 'dataMax']} tick={false} axisLine={false} />
                    <Radar name="Threat Vector" dataKey="A" stroke="#ef4444" strokeWidth={2} fill="#ef4444" fillOpacity={0.35} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full md:w-48 space-y-2 font-mono text-xs shrink-0">
                {[
                  ['Avg Risk',     `${Number(topUser.avgRisk).toFixed(1)}`,            'text-rose-400'],
                  ['Dynamic Risk', `${Number(topUser.dynamic_risk_score).toFixed(1)}`,  'text-amber-400'],
                  ['Upload Vol',   `${Number(topUser.uploadVol).toFixed(1)} MB`,        'text-amber-300'],
                  ['Anomalies',    topUser.anomalies,                                   'text-rose-400'],
                  ['GenAI Events', topUser.genaiEvents || 0,                            'text-purple-400'],
                  ['Total Events', topUser.totalEvents,                                 'text-slate-300'],
                ].map(([label, val, cls]) => (
                  <div key={label} className="flex justify-between items-center bg-slate-900/60 rounded px-3 py-1.5 border border-slate-800/50">
                    <span className="text-slate-500">{label}</span>
                    <span className={`font-bold ${cls}`}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Device directory */}
      <div>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="text-sm font-mono text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" /> Enterprise Directory
            <span className="ml-2 text-[10px] bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full">{filtered.length} devices</span>
          </h2>
          <div className="flex items-center gap-2 ml-auto">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="IP, hostname, MAC…"
                className="pl-7 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 w-32" />
            </div>
            <div className="flex items-center gap-1">
              <Filter className="w-3 h-3 text-slate-500" />
              {['All', 'CRITICAL', 'ELEVATED', 'NORMAL'].map((l) => (
                <button key={l} onClick={() => setLevelFilter(l)}
                  className={`px-2 py-1 rounded text-[9px] font-bold font-mono uppercase border transition-all
                    ${levelFilter === l
                      ? l === 'CRITICAL' ? 'bg-rose-500/20 border-rose-500/50 text-rose-400'
                        : l === 'ELEVATED' ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                        : l === 'NORMAL' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                        : 'bg-slate-700/60 border-slate-600 text-slate-200'
                      : 'bg-transparent border-slate-700/50 text-slate-500 hover:border-slate-500'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((user, idx) => {
            const level  = user.riskLevel || 'NORMAL';
            const border = level === 'CRITICAL' ? 'border-t-rose-500' : level === 'ELEVATED' ? 'border-t-amber-500' : 'border-t-emerald-500';
            const decay  = Number(user.dynamic_risk_score ?? user.avgRisk);
            const avg    = Number(user.avgRisk ?? 0);
            const decayPct = avg > 0 ? ((decay - avg) / avg * 100) : 0;

            return (
              <div key={idx}
                onClick={() => setSelected(user)}
                className={`glass-panel rounded-xl p-4 border-t-4 ${border} cursor-pointer
                  transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-opacity-80
                  ${selected?.ip === user.ip ? 'ring-1 ring-cyan-500/40' : ''}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0 flex-1 pr-2">
                    {user.device_name && user.device_name !== user.ip && (
                      <div className="text-[10px] font-bold font-mono text-cyan-300 truncate leading-none mb-0.5">{user.device_name}</div>
                    )}
                    <div className="text-[9px] text-slate-600 font-mono uppercase tracking-wider mb-0.5">
                      {user.device_name && user.device_name !== user.ip ? 'IP Address' : 'Device IP'}
                    </div>
                    <div className="text-slate-100 font-bold font-mono text-sm">{user.ip}</div>
                    {user.mac_address && (
                      <div className="text-[9px] text-slate-600 font-mono mt-0.5">{user.mac_address}</div>
                    )}
                  </div>
                  <RiskBadge level={level} score={avg} />
                </div>

                <div className="mb-3 bg-slate-900/60 rounded-lg px-3 py-2 border border-slate-800/50">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <TrendingDown className="w-2.5 h-2.5" /> Dynamic Risk
                    </span>
                    <span className={`text-sm font-bold font-mono ${decay > 60 ? 'text-rose-400' : decay > 30 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {decay.toFixed(1)}
                    </span>
                  </div>
                  {decayPct < -1 && (
                    <div className="text-[9px] text-emerald-500/70 font-mono mt-0.5">{Math.abs(decayPct).toFixed(0)}% decayed</div>
                  )}
                </div>

                <div className="space-y-1 text-xs font-mono">
                  {[
                    ['Events',     user.totalEvents,                                 user.totalEvents > 50 ? 'text-amber-400' : 'text-slate-200'],
                    ['Anomalies',  user.anomalies,                                   user.anomalies > 0 ? 'text-rose-400' : 'text-emerald-400'],
                    ['Apps Used',  user.appCount,                                    'text-slate-200'],
                    ['Upload Vol', `${Number(user.uploadVol).toFixed(1)} MB`,        'text-amber-400'],
                  ].map(([label, val, cls]) => (
                    <div key={label} className="flex justify-between items-center py-0.5 border-b border-slate-800/40">
                      <span className="text-slate-500">{label}</span>
                      <span className={`font-bold ${cls}`}>{val}</span>
                    </div>
                  ))}
                  {(user.genaiEvents || 0) > 0 && (
                    <div className="flex justify-between items-center pt-1">
                      <span className="text-purple-400 flex items-center gap-1"><Brain className="w-2.5 h-2.5" /> GenAI</span>
                      <span className="text-purple-400 font-bold">{user.genaiEvents}</span>
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800/40 text-[9px] font-mono text-slate-600 flex items-center gap-1">
                  <AlertTriangle className="w-2.5 h-2.5 text-cyan-600" />
                  Click to investigate
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
