import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ShieldAlert, Search, Ban, RefreshCw, AlertTriangle, Brain,
  Activity, ChevronRight, X, CheckCircle, XCircle, Globe,
  Monitor, Shield, Clock, ArrowRight,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import {
  fetchUserAnalytics, fetchDeviceTimeline, firewallBlock, fetchQuarantinedIPs, detectMyIP,
} from '../services/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

const RISK_LEVEL = (score) =>
  score >= 70 ? 'CRITICAL' : score >= 40 ? 'ELEVATED' : 'NORMAL';

const RISK_COLOR = (score) =>
  score >= 70 ? '#ef4444' : score >= 40 ? '#f59e0b' : '#10b981';

function RiskBadge({ score }) {
  const level = RISK_LEVEL(score);
  const color  = RISK_COLOR(score);
  const bg     = score >= 70 ? 'rgba(239,68,68,0.1)'  : score >= 40 ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)';
  const border = score >= 70 ? 'rgba(239,68,68,0.4)'  : score >= 40 ? 'rgba(245,158,11,0.4)' : 'rgba(16,185,129,0.4)';
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border"
      style={{ color, background: bg, borderColor: border }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {level}
    </span>
  );
}

function timeAgo(ts) {
  if (!ts) return '—';
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60)   return `${Math.round(diff)}s ago`;
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function isPrivateIP(ip) {
  return /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
}

// ── Firewall Result Banner ────────────────────────────────────────────────────

function FirewallResultBanner({ result, onDismiss }) {
  if (!result) return null;
  const cfg = result.fw_status === 'BLOCKED_AT_FIREWALL'
    ? { color: '#00ff88', bg: 'rgba(0,255,136,0.08)', border: 'rgba(0,255,136,0.3)', Icon: CheckCircle, label: 'BLOCKED — OS firewall rule active' }
    : result.fw_status === 'FIREWALL_ERROR'
    ? { color: '#ff3366', bg: 'rgba(255,51,102,0.08)', border: 'rgba(255,51,102,0.3)', Icon: XCircle, label: 'OS rule failed — restart backend as Administrator' }
    : { color: '#ffb300', bg: 'rgba(255,179,0,0.08)', border: 'rgba(255,179,0,0.3)', Icon: AlertTriangle, label: 'Logged only — no OS enforcement on this platform' };
  const Icon = cfg.Icon;
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl border"
      style={{ background: cfg.bg, borderColor: cfg.border }}>
      <div className="flex items-start gap-3">
        <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: cfg.color }} />
        <div>
          <p className="font-mono font-bold text-sm" style={{ color: cfg.color }}>{cfg.label}</p>
          <p className="font-mono text-[10px] text-slate-500 mt-0.5">
            {result.ip} · {result.reason} · {result.fw_message}
          </p>
        </div>
      </div>
      <button onClick={onDismiss} className="text-slate-600 hover:text-slate-300 flex-shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Device Sidebar ────────────────────────────────────────────────────────────

function DeviceSidebar({ devices, selectedIP, onSelect, loading, search, setSearch, myDeviceIp }) {
  // Pin MY MACHINE to top, then sort rest by risk
  const sorted = [...devices].sort((a, b) => {
    if (a.ip === myDeviceIp) return -1;
    if (b.ip === myDeviceIp) return 1;
    return (b.avgRisk || 0) - (a.avgRisk || 0);
  });
  const filtered = sorted.filter((d) => {
    const q = search.toLowerCase();
    return !search
      || d.ip?.includes(q)
      || d.device_name?.toLowerCase().includes(q)
      || d.mac_address?.toLowerCase().includes(q);
  });

  return (
    <aside className="w-72 flex-shrink-0 flex flex-col glass-panel rounded-xl overflow-hidden">
      {/* Sidebar header */}
      <div className="px-4 py-3 border-b border-slate-800/60">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono font-bold text-[11px] uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <Monitor className="w-3.5 h-3.5 text-cyan-400" />
            Network Devices
          </span>
          <span className="data-mono text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-500 border border-slate-700">
            {devices.length}
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search IP or hostname…"
            className="w-full pl-7 pr-3 py-1.5 text-[11px] font-mono bg-slate-900 border border-slate-700 rounded-lg text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>

      {/* Device list */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
        {loading && devices.length === 0 ? (
          <div className="py-8 text-center font-mono text-xs text-slate-600 animate-pulse">Scanning devices…</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center font-mono text-xs text-slate-600">No devices found</div>
        ) : filtered.map((device) => {
          const isSelected = selectedIP === device.ip;
          const isMe = myDeviceIp && device.ip === myDeviceIp;
          const score = device.avgRisk || 0;
          const color = RISK_COLOR(score);
          return (
            <button
              key={device.ip}
              onClick={() => onSelect(device.ip)}
              className="w-full text-left px-4 py-3 transition-all hover:bg-slate-800/40"
              style={
                isMe
                  ? { background: isSelected ? 'rgba(0,255,136,0.07)' : 'rgba(0,255,136,0.02)', borderLeft: '3px solid #00ff88' }
                  : isSelected
                  ? { background: 'rgba(0,229,255,0.05)', borderLeft: '3px solid #00e5ff' }
                  : { borderLeft: '3px solid transparent' }
              }
            >
              <div className="flex items-center justify-between mb-1">
                <code className="text-[12px] font-bold font-mono" style={{ color: isMe ? '#00ff88' : isSelected ? '#00e5ff' : '#94a3b8' }}>
                  {device.ip}
                </code>
                <span className="font-mono font-bold text-[11px]" style={{ color }}>
                  {score.toFixed(0)}
                </span>
              </div>
              {device.device_name && device.device_name !== device.ip && (
                <div className="text-[10px] font-mono text-slate-600 truncate mb-1">{device.device_name}</div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {isMe && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border font-mono"
                    style={{ color: '#00ff88', background: 'rgba(0,255,136,0.1)', borderColor: 'rgba(0,255,136,0.3)' }}>
                    MY MACHINE
                  </span>
                )}
                <RiskBadge score={score} />
                {(device.anomalies || 0) > 0 && (
                  <span className="text-[9px] font-mono text-rose-400">{device.anomalies} anomaly</span>
                )}
                {(device.genaiEvents || 0) > 0 && (
                  <Brain className="w-2.5 h-2.5 text-purple-400" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="px-4 py-2 border-t border-slate-800/40 space-y-0.5">
        {myDeviceIp && (
          <p className="font-mono text-[9px] uppercase tracking-wider" style={{ color: '#00ff88' }}>
            ● My IP detected: {myDeviceIp}
          </p>
        )}
        <p className="font-mono text-[9px] text-slate-700 uppercase tracking-wider">
          My Machine pinned · sorted by risk
        </p>
      </div>
    </aside>
  );
}

// ── Investigation Panel ───────────────────────────────────────────────────────

function InvestigationPanel({ ip, device, onClose, myDeviceIp }) {
  const isMe = myDeviceIp && ip === myDeviceIp;
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [blocking, setBlocking]   = useState(null);  // ip being blocked
  const [results, setResults]     = useState([]);     // [{ip, fw_status, fw_message, reason}]
  const [blockedIPs, setBlockedIPs] = useState(new Set());
  const [confirm, setConfirm]     = useState(null);   // ip awaiting confirm

  useEffect(() => {
    setLoading(true);
    setData(null);
    setResults([]);
    Promise.all([
      fetchDeviceTimeline(ip, 60),
      fetchQuarantinedIPs(),
    ]).then(([timeline, quarantined]) => {
      setData(timeline);
      const qSet = new Set((quarantined || []).map((q) => q.ip || q));
      setBlockedIPs(qSet);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [ip]);

  const doBlock = async (targetIP, reason) => {
    setBlocking(targetIP);
    setConfirm(null);
    try {
      const res = await firewallBlock({ ip: targetIP, reason, source: 'manual', severity: 'high' });
      setResults((prev) => [{ ip: targetIP, fw_status: res.fw_status, fw_message: res.fw_message, reason }, ...prev]);
      setBlockedIPs((prev) => new Set([...prev, targetIP]));
    } catch (err) {
      setResults((prev) => [{
        ip: targetIP, fw_status: 'FIREWALL_ERROR',
        fw_message: err?.response?.data?.detail || 'Request failed',
        reason,
      }, ...prev]);
    } finally {
      setBlocking(null);
    }
  };

  // Build chart data
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

  const totalEvents  = data?.events?.length || 0;
  const anomalies    = data?.events?.filter((e) => e.is_anomalous).length || 0;
  const genaiEvents  = data?.events?.filter((e) => e.is_genai_exfiltration).length || 0;
  const uploadVolMB  = data?.events?.reduce((s, e) => s + (e.bytes_sent || 0), 0) / (1024 * 1024) || 0;
  const appCount     = new Set(data?.events?.map((e) => e.app_name)).size || 0;
  const avgRisk      = totalEvents > 0 ? data.events.reduce((s, e) => s + (e.risk_score || 0), 0) / totalEvents : 0;

  const isDeviceBlocked = blockedIPs.has(ip);

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-4 overflow-y-auto">
      {/* Results */}
      {results.map((r, i) => (
        <FirewallResultBanner key={i} result={r} onDismiss={() => setResults((prev) => prev.filter((_, j) => j !== i))} />
      ))}

      {/* Device header */}
      <div className="glass-panel rounded-xl p-4 border-l-4"
        style={{ borderLeftColor: isMe ? '#00ff88' : RISK_COLOR(device?.avgRisk || avgRisk) }}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-1">
              {/* MY MACHINE / NETWORK DEVICE label */}
              {isMe ? (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border font-mono animate-pulse"
                  style={{ color: '#00ff88', background: 'rgba(0,255,136,0.08)', borderColor: 'rgba(0,255,136,0.35)' }}>
                  <Monitor className="w-3 h-3" /> MY MACHINE
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border font-mono"
                  style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.3)' }}>
                  <Shield className="w-3 h-3" /> NETWORK DEVICE
                </span>
              )}
              {device?.device_name && device.device_name !== ip && (
                <span className="font-mono font-bold text-sm" style={{ color: isMe ? '#00ff88' : '#67e8f9' }}>{device.device_name}</span>
              )}
              <code className="font-mono font-bold text-sm bg-slate-900 px-2 py-0.5 rounded border border-slate-700"
                style={{ color: isMe ? '#00ff88' : '#22d3ee' }}>{ip}</code>
              {device?.mac_address && (
                <code className="font-mono text-[10px] text-slate-600 bg-slate-900/60 px-2 py-0.5 rounded border border-slate-800">{device.mac_address}</code>
              )}
              <RiskBadge score={device?.avgRisk || avgRisk} />
            </div>
            <p className="font-mono text-[10px] text-slate-600">
              {isMe
                ? 'This is your machine — blocking a destination IP stops it in your browser instantly'
                : 'Network device — block destination to deny access from the gateway host'}
              {' · last '}{totalEvents} flows analysed
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Block device button — disabled for own machine (block destination instead) */}
            {isMe ? (
              <span className="font-mono text-[10px] text-slate-600 italic px-2"
                title="Use 'Block Dest' on specific rows to block websites — blocking your own IP has no effect">
                Use Block Dest ↓ to stop websites
              </span>
            ) : confirm === ip ? (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-rose-400">Block this device?</span>
                <button
                  onClick={() => doBlock(ip, 'Device Investigation Block')}
                  disabled={blocking === ip}
                  className="px-2 py-1 rounded font-mono text-[10px] font-bold bg-rose-500/20 border border-rose-500/40 text-rose-400 hover:bg-rose-500/30 transition-all"
                >
                  {blocking === ip ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Confirm'}
                </button>
                <button onClick={() => setConfirm(null)} className="px-2 py-1 rounded font-mono text-[10px] text-slate-500 hover:text-slate-300">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => isDeviceBlocked ? null : setConfirm(ip)}
                disabled={isDeviceBlocked || blocking === ip}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono font-bold text-[11px] uppercase tracking-wider border transition-all disabled:opacity-50"
                style={isDeviceBlocked
                  ? { color: '#64748b', background: 'rgba(100,116,139,0.1)', borderColor: 'rgba(100,116,139,0.3)' }
                  : { color: '#ff3366', background: 'rgba(255,51,102,0.1)', borderColor: 'rgba(255,51,102,0.3)' }}
              >
                <Ban className="w-3 h-3" />
                {isDeviceBlocked ? '✓ Device Blocked' : blocking === ip ? 'Blocking…' : 'Block Device'}
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-slate-600 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-cyan-500/40 border-t-cyan-400 rounded-full animate-spin mx-auto" />
            <p className="font-mono text-xs text-cyan-400 animate-pulse">LOADING FORENSIC DATA…</p>
          </div>
        </div>
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[
              ['Events',     totalEvents,               '#94a3b8'],
              ['Anomalies',  anomalies,                 '#ef4444'],
              ['Avg Risk',   avgRisk.toFixed(1),        RISK_COLOR(avgRisk)],
              ['Upload MB',  uploadVolMB.toFixed(2),    '#f59e0b'],
              ['Apps Used',  appCount,                  '#00e5ff'],
              ['GenAI Hits', genaiEvents,               '#b366ff'],
            ].map(([label, val, color]) => (
              <div key={label} className="glass-panel rounded-xl p-4 text-center">
                <div className="data-mono font-bold text-base" style={{ color }}>{val}</div>
                <div className="data-mono text-[9px] text-slate-600 uppercase tracking-wider mt-1">{label}</div>
              </div>
            ))}
          </div>

          {/* Risk timeline */}
          {timelinePoints.length > 1 && (
            <div className="glass-panel rounded-xl p-5">
              <h3 className="font-mono text-[10px] uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                <Activity className="w-3 h-3 text-cyan-400" /> Risk Score Timeline (last {timelinePoints.length} flows)
              </h3>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timelinePoints} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                    <defs>
                      <linearGradient id="invGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="1 4" stroke="#1e293b" />
                    <XAxis dataKey="time" stroke="#334155" fontSize={8} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} stroke="#334155" fontSize={8} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'rgba(2,6,23,0.95)', border: '1px solid #22d3ee30', borderRadius: 8, fontFamily: 'monospace', fontSize: 11 }}
                    />
                    <Area type="monotone" dataKey="risk" stroke="#22d3ee" strokeWidth={2} fill="url(#invGrad)" name="Risk Score" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* App breakdown */}
          {data?.top_apps?.length > 0 && (
            <div className="glass-panel rounded-xl p-5">
              <h3 className="font-mono text-[10px] uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                <Globe className="w-3 h-3 text-amber-400" /> Top Applications by Traffic
              </h3>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.top_apps} layout="vertical" margin={{ left: 0, right: 50, top: 2, bottom: 2 }}>
                    <CartesianGrid strokeDasharray="1 4" stroke="#1e293b" horizontal={false} />
                    <XAxis type="number" stroke="#334155" fontSize={8} tickLine={false} axisLine={false} />
                    <YAxis dataKey="name" type="category" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} width={130} tick={{ fontFamily: 'monospace' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'rgba(2,6,23,0.95)', border: '1px solid #33415540', borderRadius: 8, fontFamily: 'monospace', fontSize: 11 }}
                      formatter={(v, n) => [v, n === 'count' ? 'Events' : n]}
                    />
                    <Bar dataKey="count" radius={[0, 3, 3, 0]} barSize={10}>
                      {data.top_apps.map((app, i) => (
                        <Cell key={i} fill={app.avg_risk > 60 ? '#ef4444' : app.avg_risk > 30 ? '#f59e0b' : '#22d3ee'} fillOpacity={0.8} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Events table with Block Destination */}
          {data?.events?.length > 0 && (
            <div className="glass-panel rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-800/60 flex items-center justify-between">
                <h3 className="font-mono text-[10px] uppercase tracking-widest text-slate-500 flex items-center gap-2">
                  <Clock className="w-3 h-3" /> Event Log — {data.events.length} flows captured
                </h3>
                <span className="font-mono text-[9px] text-slate-700 uppercase tracking-wider">
                  Block Destination stops the external service on this machine
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800/50">
                      {['Time', 'App / Destination', 'Dest IP', 'Risk', 'Upload', 'Flags', 'Action'].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-[9px] uppercase tracking-widest text-slate-600 font-bold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.slice(0, 20).map((ev, i) => {
                      const destBlocked = blockedIPs.has(ev.destination_ip);
                      const isPrivate = isPrivateIP(ev.destination_ip || '');
                      return (
                        <tr key={i} className={`border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors group ${ev.is_anomalous ? 'bg-rose-500/3' : ''}`}>
                          <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                            {new Date(ev.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                          </td>
                          <td className="px-4 py-2">
                            <div className="font-bold text-slate-300">{ev.app_name}</div>
                            {ev.destination_ip && (
                              <div className="text-[9px] text-slate-600">{ev.destination_ip}:{ev.destination_port}</div>
                            )}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            {ev.destination_ip
                              ? <code className="text-[10px] text-slate-400">{ev.destination_ip}</code>
                              : <span className="text-slate-700">—</span>}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <span className="font-bold" style={{ color: RISK_COLOR(ev.risk_score || 0) }}>
                              {(ev.risk_score || 0).toFixed(1)}
                            </span>
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-amber-400/80">
                            {((ev.bytes_sent || 0) / 1024).toFixed(1)} KB
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              {ev.is_anomalous && (
                                <span className="text-[9px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded">ANOM</span>
                              )}
                              {ev.is_genai_exfiltration && (
                                <span className="text-[9px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/30 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                  <Brain className="w-2 h-2" />AI
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            {ev.destination_ip && !isPrivate ? (
                              confirm === `dest-${i}` ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] font-mono text-rose-400">Block?</span>
                                  <button
                                    onClick={() => { doBlock(ev.destination_ip, `Block ${ev.app_name} destination`); setConfirm(null); }}
                                    disabled={blocking === ev.destination_ip}
                                    className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 border border-rose-500/40 text-rose-400"
                                  >OK</button>
                                  <button onClick={() => setConfirm(null)} className="text-[9px] text-slate-600 hover:text-slate-300">✕</button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirm(`dest-${i}`)}
                                  disabled={destBlocked || blocking === ev.destination_ip}
                                  className="flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-bold transition-all disabled:opacity-40"
                                  style={destBlocked
                                    ? { color: '#00ff88', background: 'rgba(0,255,136,0.08)', borderColor: 'rgba(0,255,136,0.3)' }
                                    : { color: '#ff3366', background: 'rgba(255,51,102,0.08)', borderColor: 'rgba(255,51,102,0.3)' }}
                                  title={`Block outbound to ${ev.destination_ip} — browser shows ERR_CONNECTION_TIMED_OUT`}
                                >
                                  <Globe className="w-2.5 h-2.5" />
                                  {destBlocked ? '✓ Blocked' : 'Block Dest'}
                                </button>
                              )
                            ) : (
                              <span className="text-[9px] text-slate-700 font-mono">{isPrivate ? 'private IP' : '—'}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ThreatIntel() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [devices, setDevices]       = useState([]);
  const [devLoading, setDevLoading] = useState(true);
  const [selectedIP, setSelectedIP] = useState(searchParams.get('ip') || null);
  const [sideSearch, setSideSearch] = useState('');
  const [myDeviceIp, setMyDeviceIp] = useState(null);

  useEffect(() => {
    detectMyIP().then((ip) => setMyDeviceIp(ip || null));
  }, []);

  const loadDevices = useCallback(async (silent = false) => {
    if (!silent) setDevLoading(true);
    try {
      const data = await fetchUserAnalytics();
      const list = Array.isArray(data) ? data : (data?.users || []);
      // Sort by risk score descending
      list.sort((a, b) => (b.avgRisk || 0) - (a.avgRisk || 0));
      setDevices(list);

      // If URL has ?ip=X and no device selected yet, set it
      const urlIP = searchParams.get('ip');
      if (urlIP && !selectedIP) setSelectedIP(urlIP);
    } catch {}
    finally { if (!silent) setDevLoading(false); }
  }, [searchParams, selectedIP]);

  useEffect(() => {
    loadDevices();
    const iv = setInterval(() => loadDevices(true), 30000);
    return () => clearInterval(iv);
  }, [loadDevices]);

  // Sync URL param → selectedIP when navigating here from Alert Center
  useEffect(() => {
    const urlIP = searchParams.get('ip');
    if (urlIP) setSelectedIP(urlIP);
  }, [searchParams]);

  const selectedDevice = devices.find((d) => d.ip === selectedIP) || null;

  const handleSelect = (ip) => {
    setSelectedIP(ip);
    navigate(`/threats?ip=${ip}`, { replace: true });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Page header */}
      <div className="glass-panel p-5 rounded-xl border-l-4 border-l-orange-500">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(255,102,51,0.1)', border: '1px solid rgba(255,102,51,0.3)' }}>
              <ShieldAlert className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h1 className="font-mono font-bold text-xl text-slate-100">Threat Investigation Workbench</h1>
              <p className="font-mono text-[10px] text-slate-600 mt-0.5">
                Deep forensic analysis · per-flow ETA features · Block Device or Block Destination in real time
                {selectedIP && <span className="text-orange-400 ml-2">· Investigating: {selectedIP}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {selectedIP && (
              <button
                onClick={() => { setSelectedIP(null); navigate('/threats', { replace: true }); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-[11px] font-bold uppercase transition-all"
                style={{ color: '#94a3b8', borderColor: 'rgba(148,163,184,0.2)', background: 'transparent' }}
              >
                <X className="w-3 h-3" /> Clear
              </button>
            )}
            <button
              onClick={() => loadDevices()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-[11px] font-bold uppercase transition-all"
              style={{ color: '#00e5ff', background: 'rgba(0,229,255,0.05)', borderColor: 'rgba(0,229,255,0.2)' }}
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* How-to hint if no device selected */}
      {!selectedIP && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-xl border border-slate-800/60 bg-slate-900/40">
          <AlertTriangle className="w-4 h-4 text-slate-600 flex-shrink-0" />
          <p className="font-mono text-xs text-slate-600">
            Select a device from the directory, or navigate here from{' '}
            <button onClick={() => navigate('/alerts')} className="text-rose-400 hover:text-rose-300 underline">Alert Center</button>
            {' '}for automatic pre-selection. Use <strong className="text-slate-500">Block Destination</strong> on any event row to block the external website at OS level.
          </p>
        </div>
      )}

      {/* MY MACHINE detected but no traffic yet */}
      {myDeviceIp && !devices.some((d) => d.ip === myDeviceIp) && devices.length > 0 && (
        <div className="flex items-start gap-3 px-5 py-4 rounded-xl"
          style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.2)' }}>
          <Monitor className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#00ff88' }} />
          <div>
            <p className="font-mono text-xs font-bold" style={{ color: '#00ff88' }}>
              Your machine detected: {myDeviceIp} — but no events captured from this IP yet.
            </p>
            <p className="font-mono text-[10px] text-slate-500 mt-0.5">
              The devices shown are from old mock data. To see YOUR traffic:
              {' '}(1) Go to <button onClick={() => navigate('/settings')} className="underline text-cyan-400">Settings → System tab</button> → <strong className="text-slate-400">Clear Events Database</strong>
              {' '}(2) Run the real sniffer as Admin: <code className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">python sniffer/packet_sniffer.py --iface "Wi-Fi"</code>
              {' '}(3) Browse any website, then refresh this page.
            </p>
          </div>
        </div>
      )}

      {/* Split panel */}
      <div className="flex gap-5 items-start min-h-[600px]">
        <DeviceSidebar
          devices={devices}
          selectedIP={selectedIP}
          onSelect={handleSelect}
          loading={devLoading}
          search={sideSearch}
          setSearch={setSideSearch}
          myDeviceIp={myDeviceIp}
        />

        {/* Right panel */}
        {selectedIP ? (
          <InvestigationPanel
            key={selectedIP}
            ip={selectedIP}
            device={selectedDevice}
            myDeviceIp={myDeviceIp}
            onClose={() => { setSelectedIP(null); navigate('/threats', { replace: true }); }}
          />
        ) : (
          <div className="flex-1 glass-panel rounded-xl flex flex-col items-center justify-center py-24 text-center">
            <Shield className="w-16 h-16 text-slate-800 mb-4" />
            <p className="font-mono font-bold text-slate-500 text-sm mb-2">No Device Selected</p>
            <p className="font-mono text-xs text-slate-700 max-w-sm leading-relaxed">
              Choose a device from the directory to see its full forensic profile — risk timeline, application breakdown, ETA features, and real-time blocking.
            </p>
            <div className="mt-6 flex items-center gap-2 font-mono text-[10px] text-slate-700">
              <ArrowRight className="w-3 h-3" />
              <span>Or come from Alert Center — it will pre-select the flagged device</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
