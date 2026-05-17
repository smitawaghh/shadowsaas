import React, { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Activity, AlertTriangle, Terminal, TrendingUp, Shield, Zap, WifiOff, Wifi, Copy, CheckCheck } from 'lucide-react';
import { fetchStats, fetchRecentEvents, fetchHighRiskEvents, fetchSnifferStatus } from '../services/api';
import { subscribeToEvents, closeEventSocket } from '../services/wsClient';

const KPI_CONFIGS = [
  { key: 'total',        label: 'Network Events',   icon: Activity,      color: '#00e5ff', border: 'border-t-cyan-400/70'   },
  { key: 'anomalies',    label: 'Detected Threats', icon: AlertTriangle, color: '#ff3366', border: 'border-t-rose-500/70'   },
  { key: 'anomaly_rate', label: 'Detection Rate',   icon: TrendingUp,    color: '#ffb300', border: 'border-t-amber-400/70', fmt: (v) => `${Number(v).toFixed(1)}%`  },
  { key: 'critical',     label: 'Critical Threats', icon: Zap,           color: '#ff3366', border: 'border-t-rose-500/70'   },
  { key: 'elevated',     label: 'Elevated Alerts',  icon: Shield,        color: '#ffb300', border: 'border-t-amber-400/70'  },
  { key: 'avg_risk',     label: 'Avg Threat Score', icon: Activity,      color: '#b366ff', border: 'border-t-purple-400/70', fmt: (v) => `${Number(v).toFixed(1)}` },
];

function KpiCard({ config, value, prev }) {
  const Icon = config.icon;
  const numVal  = parseFloat(value)  || 0;
  const numPrev = parseFloat(prev)   || 0;
  const delta   = numPrev > 0 ? ((numVal - numPrev) / numPrev) * 100 : 0;
  const formatted = config.fmt ? config.fmt(value ?? 0) : Number(value ?? 0).toLocaleString();

  return (
    <div className={`metric-card border-t-2 ${config.border} group`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-widest leading-none">
          {config.label}
        </p>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${config.color}18` }}>
          <Icon className="w-3.5 h-3.5" style={{ color: config.color }} />
        </div>
      </div>
      <p className="stat-number text-3xl mb-1.5" style={{ color: config.color }}>
        {formatted}
      </p>
      {numPrev > 0 && (
        <p className={`data-mono text-[10px] ${delta >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% vs prev window
        </p>
      )}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#030810]/98 border border-cyan-400/25 px-3 py-2 rounded-lg shadow-xl data-mono text-xs backdrop-blur-sm" style={{ boxShadow: '0 0 20px rgba(0,229,255,0.1)' }}>
      <p className="text-slate-600 mb-1 text-[10px] uppercase tracking-wider">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex justify-between gap-4">
          <span className="text-slate-400">{entry.name}</span>
          <span className="font-bold" style={{ color: entry.value > 70 ? '#ff3366' : '#00e5ff' }}>
            {typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function AppTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#030810]/98 border border-green-400/25 px-3 py-2 rounded-lg data-mono text-xs" style={{ boxShadow: '0 0 16px rgba(0,255,136,0.1)' }}>
      <p className="font-bold mb-1 text-[11px]" style={{ color: '#00ff88' }}>{d.name}</p>
      <div className="space-y-0.5">
        <div className="flex justify-between gap-4"><span className="text-slate-500">Events</span><span className="text-slate-200">{d.count}</span></div>
        <div className="flex justify-between gap-4"><span className="text-slate-500">Avg Risk</span>
          <span style={{ color: d.avg_risk > 60 ? '#ff3366' : '#00ff88' }}>{d.avg_risk}</span>
        </div>
      </div>
    </div>
  );
}

const MAX_LIVE_EVENTS = 80;

const CMD_SNIFFER = 'python sniffer/packet_sniffer.py --iface "Wi-Fi"';
const CMD_SNIFFER_ALL = 'python sniffer/packet_sniffer.py --iface "Wi-Fi" --all-devices';
const CMD_BACKEND = 'cd backend && uvicorn app.main:app --reload --port 8000';

function CopyBtn({ text }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} className="ml-2 p-1 rounded hover:bg-white/10 transition-colors flex-shrink-0" title="Copy command">
      {copied ? <CheckCheck className="w-3 h-3" style={{ color: '#00ff88' }} /> : <Copy className="w-3 h-3 text-slate-500" />}
    </button>
  );
}

function SnifferBanner({ status }) {
  const [expanded, setExpanded] = React.useState(false);
  if (!status) return null;
  if (status.online) return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-lg data-mono text-[11px]"
      style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.15)' }}>
      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#00ff88', boxShadow: '0 0 6px #00ff88' }} />
      <Wifi className="w-3 h-3" style={{ color: '#00ff88' }} />
      <span style={{ color: '#00ff88' }}>SNIFFER ONLINE</span>
      <span className="text-slate-600 ml-1">· last packet {status.last_event_ago}s ago · real network data flowing</span>
    </div>
  );
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,51,102,0.35)', background: 'rgba(255,51,102,0.04)' }}>
      <div className="flex items-center gap-3 px-4 py-3">
        <WifiOff className="w-4 h-4 flex-shrink-0" style={{ color: '#ff3366' }} />
        <div className="flex-1 min-w-0">
          <span className="data-mono text-[12px] font-bold" style={{ color: '#ff3366' }}>SNIFFER OFFLINE — no real network data flowing</span>
          <span className="data-mono text-[10px] text-slate-600 ml-3">
            {status.last_event_ago != null ? `Last packet ${status.last_event_ago}s ago` : 'No events received since startup'}
          </span>
        </div>
        <button onClick={() => setExpanded(v => !v)}
          className="data-mono text-[10px] px-2 py-1 rounded border text-slate-400 hover:text-slate-200 border-slate-700 hover:border-slate-500 transition-colors flex-shrink-0">
          {expanded ? 'Hide' : 'How to start'}
        </button>
      </div>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-rose-500/15 pt-3">
          <p className="data-mono text-[11px] text-slate-500">Run these 3 commands in separate terminals. The sniffer requires <span style={{ color: '#ffb300' }}>Administrator</span> and <span style={{ color: '#00e5ff' }}>Npcap</span> (install from wireshark.org/npcap).</p>
          {[
            { label: '1  Backend (any terminal)', cmd: CMD_BACKEND, color: '#00e5ff' },
            { label: '2  Sniffer (run as Admin)', cmd: CMD_SNIFFER, color: '#ff3366' },
            { label: '3  Or capture ALL devices on Wi-Fi (Admin)', cmd: CMD_SNIFFER_ALL, color: '#ffb300' },
          ].map(({ label, cmd, color }) => (
            <div key={label}>
              <p className="data-mono text-[9px] text-slate-600 uppercase tracking-widest mb-1">{label}</p>
              <div className="flex items-center gap-2 px-3 py-2 rounded" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="data-mono text-[11px] flex-1 truncate" style={{ color }}>{cmd}</span>
                <CopyBtn text={cmd} />
              </div>
            </div>
          ))}
          <p className="data-mono text-[10px] text-slate-600">After starting the sniffer, this banner turns green within 30 seconds.</p>
        </div>
      )}
    </div>
  );
}

function _toRow(e, i) {
  return {
    time:        e.timestamp
      ? new Date(e.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : `T-${i}`,
    risk_score:  e.risk_score ?? 0,
    app_name:    e.app_name   ?? 'Unknown',
    source_ip:   e.source_ip  ?? '',
    device_name: e.device_name ?? null,
    is_anomalous: e.is_anomalous         ?? false,
    is_genai:     e.is_genai_exfiltration ?? false,
  };
}

export default function Dashboard() {
  const [stats, setStats]                 = useState(null);
  const [prevStats, setPrevStats]         = useState(null);
  const [events, setEvents]               = useState([]);
  const [highRisk, setHighRisk]           = useState([]);
  const [lastUpdate, setLastUpdate]       = useState(null);
  const [wsConnected, setWsConnected]     = useState(false);
  const [snifferStatus, setSnifferStatus] = useState(null);
  const terminalRef = useRef(null);

  // ── WebSocket: push new events straight into the terminal in real-time ──
  useEffect(() => {
    const unsub = subscribeToEvents((raw) => {
      setWsConnected(true);
      setEvents((prev) => {
        const row = _toRow(raw, 0);
        return [row, ...prev].slice(0, MAX_LIVE_EVENTS);
      });
      // Bump high-risk list if this event qualifies
      if ((raw.risk_score ?? 0) >= 70) {
        setHighRisk((prev) => [raw, ...prev].slice(0, 8));
      }
    });
    return () => {
      unsub();
    };
  }, []);

  // ── Polling: KPI stats + initial event backfill every 10s ──────────────
  const loadData = useCallback(async () => {
    try {
      const [statsData, eventsData, hrData] = await Promise.all([
        fetchStats(1),
        fetchRecentEvents(40),
        fetchHighRiskEvents(8),
      ]);
      setPrevStats((p) => p ?? statsData);
      setStats(statsData);
      setLastUpdate(new Date());

      // Only backfill if WebSocket hasn't delivered anything yet
      setEvents((prev) => {
        if (prev.length > 0) return prev;
        const arr = Array.isArray(eventsData?.data) ? eventsData.data
          : Array.isArray(eventsData) ? eventsData : [];
        return arr.slice().reverse().map(_toRow);
      });

      setHighRisk((prev) => prev.length > 0 ? prev : (Array.isArray(hrData) ? hrData : []));
    } catch (err) {
      console.error('Dashboard poll failed', err);
    }
  }, []);

  useEffect(() => {
    loadData();
    const iv = setInterval(loadData, 10_000);
    return () => clearInterval(iv);
  }, [loadData]);

  // Poll sniffer status every 5s — shows green/red banner
  useEffect(() => {
    const poll = async () => {
      try { setSnifferStatus(await fetchSnifferStatus()); } catch { /* backend may not be ready */ }
    };
    poll();
    const iv = setInterval(poll, 5_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = 0;
  }, [events]);

  if (!stats) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin mx-auto" />
          <p className="data-mono text-cyan-400 text-sm animate-pulse tracking-widest">ESTABLISHING SECURE UPLINK...</p>
        </div>
      </div>
    );
  }

  const topApps = (stats.top_apps || []).slice(0, 20).map((a) => ({
    ...a,
    name: a.name?.length > 28 ? a.name.slice(0, 26) + '…' : a.name,
    avg_risk: typeof a.avg_risk === 'number' ? parseFloat(a.avg_risk.toFixed(1)) : 0,
  }));

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">SOC Operations Center</h1>
          <p className="text-slate-500 text-xs mt-0.5 data-mono">
            ML-powered threat monitoring · updated{' '}
            <span className="text-slate-400">{lastUpdate ? lastUpdate.toLocaleTimeString('en-US', { hour12: false }) : '—'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={
          wsConnected
            ? { background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.22)' }
            : { background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.15)' }
        }>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: wsConnected ? '#00ff88' : '#00e5ff', boxShadow: wsConnected ? '0 0 6px #00ff88' : '0 0 6px #00e5ff' }} />
          <span className="data-mono text-[11px] tracking-wider font-semibold" style={{ color: wsConnected ? '#00ff88' : '#00e5ff' }}>
            {wsConnected ? 'WS · LIVE' : 'POLLING · 10s'}
          </span>
        </div>
      </div>

      {/* Sniffer live/offline banner */}
      <SnifferBanner status={snifferStatus} />

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {KPI_CONFIGS.map((cfg) => (
          <KpiCard key={cfg.key} config={cfg} value={stats[cfg.key]} prev={prevStats?.[cfg.key]} />
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Threat Activity Timeline */}
        <div className="lg:col-span-2 glass-panel rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5" style={{ color: '#00e5ff' }} />
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-widest">Threat Activity Timeline</span>
            </div>
            <span className="data-mono text-[10px] text-slate-700">{events.length} flows · 1h window</span>
          </div>
          <div className="h-64 px-3 py-3">
            {events.length === 0 ? (
              <div className="h-full flex items-center justify-center data-mono text-slate-700 text-sm">
                Awaiting event stream...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={events}>
                  <defs>
                    <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#ff3366" stopOpacity={0.35} />
                      <stop offset="60%" stopColor="#00e5ff" stopOpacity={0.08} />
                      <stop offset="95%" stopColor="#00ff88" stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="1 6" stroke="rgba(0,229,255,0.04)" vertical={false} />
                  <XAxis dataKey="time" stroke="transparent" fontSize={9} tickLine={false} axisLine={false}
                    interval="preserveStartEnd" tick={{ fontFamily: 'JetBrains Mono', fill: '#2d4060' }} />
                  <YAxis stroke="transparent" fontSize={9} domain={[0, 100]} tickLine={false} axisLine={false}
                    tick={{ fontFamily: 'JetBrains Mono', fill: '#2d4060' }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="risk_score" name="Risk Score"
                    stroke="#ff3366" strokeWidth={1.5} fill="url(#riskGrad)"
                    dot={false} activeDot={{ r: 3, fill: '#ff3366', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Active Threat Alerts */}
        <div className="glass-panel rounded-xl flex flex-col overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800/60 flex items-center justify-between" style={{ background: 'rgba(255,51,102,0.04)' }}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#ff3366' }} />
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#ff3366', textShadow: '0 0 10px rgba(255,51,102,0.4)' }}>Active Threats</span>
            </div>
            <span className="data-mono text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: '#ff3366', background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.2)' }}>
              {highRisk.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0 max-h-64">
            {highRisk.length === 0 ? (
              <div className="h-full flex items-center justify-center data-mono text-slate-700 text-sm py-8">
                No active critical threats
              </div>
            ) : highRisk.map((ev, i) => {
              const label   = (ev.app_name && !ev.app_name.toLowerCase().includes('unknown')) ? ev.app_name : 'Unclassified Traffic';
              const isGenai = ev.is_genai_exfiltration;
              const level   = ev.risk_level || (ev.risk_score >= 70 ? 'CRITICAL' : 'ELEVATED');
              return (
                <div key={i} className="rounded-lg p-3 transition-all" style={{
                  background: isGenai ? 'rgba(179,102,255,0.06)' : 'rgba(255,51,102,0.05)',
                  border: `1px solid ${isGenai ? 'rgba(179,102,255,0.2)' : 'rgba(255,51,102,0.18)'}`,
                }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-200 truncate pr-2 leading-none">{label}</span>
                    <span className="data-mono text-xs font-bold px-2 py-0.5 rounded flex-shrink-0" style={{ color: '#ff3366', background: 'rgba(255,51,102,0.1)' }}>
                      {Number(ev.risk_score).toFixed(0)}
                    </span>
                  </div>
                  <div className="data-mono text-[10px] space-y-1.5">
                    <div className="flex justify-between text-slate-500">
                      <span style={{ color: 'rgba(0,229,255,0.7)' }}>{ev.source_ip}</span>
                      <span style={{ color: 'rgba(255,179,0,0.7)' }}>{((ev.bytes_sent || 0)/1024).toFixed(1)} KB ↑</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide" style={
                        level === 'CRITICAL'
                          ? { color: '#ff3366', background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.25)' }
                          : { color: '#ffb300', background: 'rgba(255,179,0,0.1)', border: '1px solid rgba(255,179,0,0.25)' }
                      }>{level}</span>
                      {isGenai && (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase" style={{ color: '#b366ff', background: 'rgba(179,102,255,0.1)', border: '1px solid rgba(179,102,255,0.25)' }}>
                          GenAI Exfil
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* App Risk Heatmap */}
        <div className="glass-panel rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5" style={{ color: '#00ff88' }} />
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-widest">Application Risk Heatmap</span>
            </div>
            <span className="data-mono text-[10px] text-slate-600">{topApps.length} apps</span>
          </div>
          <div className="overflow-y-auto" style={{ height: Math.max(224, Math.min(topApps.length * 22 + 16, 420)) }}>
            {topApps.length === 0 ? (
              <div className="h-full flex items-center justify-center data-mono text-slate-700 text-sm">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(220, topApps.length * 22)}>
                <BarChart data={topApps} layout="vertical" margin={{ left: 4, right: 28, top: 6, bottom: 6 }}>
                  <CartesianGrid strokeDasharray="1 6" stroke="rgba(0,229,255,0.04)" horizontal={false} />
                  <XAxis type="number" stroke="transparent" fontSize={9} tickLine={false} axisLine={false}
                    tick={{ fontFamily: 'JetBrains Mono', fill: '#2d4060' }} />
                  <YAxis dataKey="name" type="category" stroke="transparent" fontSize={9} tickLine={false}
                    axisLine={false} width={130} tick={{ fontFamily: 'JetBrains Mono', fill: '#4a6080' }} />
                  <Tooltip content={<AppTooltip />} cursor={{ fill: 'rgba(0,229,255,0.04)' }} />
                  <Bar dataKey="count" radius={[0, 3, 3, 0]} barSize={9}>
                    {topApps.map((app, i) => (
                      <Cell key={i} fill={app.avg_risk > 60 ? '#ff3366' : app.avg_risk > 30 ? '#ffb300' : '#00ff88'} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Network Flow Monitor */}
        <div className="glass-panel rounded-xl overflow-hidden" style={{ borderTop: '2px solid rgba(0,255,136,0.3)' }}>
          <div className="px-5 py-3.5 border-b border-slate-800/60 bg-[#010305]/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5" style={{ color: '#00ff88' }} />
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#00ff88' }}>Network Flow Monitor</span>
            </div>
            <div className="flex items-center gap-2">
              {events.length > 0 ? (
                <span className="data-mono text-[9px] px-2 py-0.5 rounded-full" style={{ color: '#00ff88', background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.2)' }}>
                  {events.filter(e => e.app_name && !e.app_name.toLowerCase().includes('unknown')).length}/{events.length} identified
                </span>
              ) : null}
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-800" />
                <span className="w-2.5 h-2.5 rounded-full bg-slate-800" />
                <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: events.length > 0 ? '#00ff88' : '#1e293b', boxShadow: events.length > 0 ? '0 0 6px #00ff88' : 'none' }} />
              </div>
            </div>
          </div>
          <div ref={terminalRef} className="threat-terminal h-[210px] p-4 overflow-y-auto relative">
            {events.length === 0 ? (
              <div className="data-mono text-xs" style={{ color: 'rgba(0,255,136,0.35)' }}>
                <span>root@soc:~$ awaiting packet stream...</span><br/>
                <span className="text-[10px]" style={{ color: 'rgba(0,229,255,0.2)' }}>Start the sniffer: python sniffer/packet_sniffer.py</span>
              </div>
            ) : (
              events.slice(0, 60).map((ev, i) => {
                const isUnknown = !ev.app_name || ev.app_name.toLowerCase().includes('unknown');
                const app       = isUnknown ? 'unclassified' : ev.app_name;
                const riskColor = ev.risk_score > 70 ? '#ff3366' : ev.risk_score > 40 ? '#ffb300' : '#00e5ff';
                const borderColor = ev.is_anomalous ? 'rgba(255,51,102,0.8)'
                  : ev.risk_score > 40 ? 'rgba(255,179,0,0.5)'
                  : isUnknown ? 'rgba(30,41,59,0.5)'
                  : 'rgba(0,255,136,0.3)';
                const sourceLabel = ev.device_name && ev.device_name !== ev.source_ip
                  ? `${ev.device_name}(${ev.source_ip})`
                  : ev.source_ip || 'x.x.x.x';
                return (
                  <div key={i} className="flex items-baseline gap-1.5 mb-0.5 leading-5 pl-2" style={{ borderLeft: `2px solid ${borderColor}` }}>
                    <span className="flex-shrink-0 text-[10px]" style={{ color: 'rgba(0,229,255,0.3)' }}>[{ev.time}]</span>
                    <span className="flex-shrink-0 text-[10px] max-w-[130px] truncate" style={{ color: 'rgba(0,229,255,0.6)' }}>{sourceLabel}</span>
                    <span className="text-[10px]" style={{ color: 'rgba(0,255,136,0.25)' }}>→</span>
                    <span className="truncate text-[10px] font-medium" style={{
                      color: ev.is_anomalous ? '#e2e8f0'
                        : isUnknown ? 'rgba(100,116,139,0.6)'
                        : '#00ff88',
                      fontStyle: isUnknown ? 'italic' : 'normal',
                    }}>"{app}"</span>
                    <span className="flex-shrink-0 text-[10px] font-bold tabular-nums" style={{ color: riskColor }}>
                      {ev.risk_score.toFixed(0)}
                    </span>
                    {ev.is_anomalous && (
                      <span className="flex-shrink-0 text-white px-1 text-[8px] font-bold rounded tracking-wide" style={{ background: '#ff3366' }}>THREAT</span>
                    )}
                    {ev.is_genai && (
                      <span className="flex-shrink-0 text-white px-1 text-[8px] font-bold rounded" style={{ background: '#b366ff' }}>AI</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
