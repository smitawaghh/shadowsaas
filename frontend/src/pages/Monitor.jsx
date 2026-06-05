import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity, Database, Brain, Wifi, WifiOff, RefreshCw,
  Terminal, AlertTriangle, CheckCircle, XCircle, Clock,
  BarChart2, ShieldAlert, Zap,
} from 'lucide-react';
import { fetchHealth, fetchHealthLogs, fetchStats, fetchAlerts } from '../services/api';

// ── helpers ────────────────────────────────────────────────────────────────

const STATUS_COLOR = {
  connected: '#00ff88', loaded: '#00ff88', active: '#00ff88', healthy: '#00ff88',
  offline:   '#ffb300',
  error:     '#ff3366', not_loaded: '#ff3366', degraded: '#ff3366',
};

function statusColor(s) { return STATUS_COLOR[s] || '#475569'; }

function ComponentCard({ label, icon: Icon, status, ok }) {
  const color = ok ? '#00ff88' : status === 'offline' ? '#ffb300' : '#ff3366';
  const StatusIcon = ok ? CheckCircle : status === 'offline' ? Clock : XCircle;
  return (
    <div className="glass-panel rounded-xl p-4 flex items-center gap-3"
      style={{ borderTop: `2px solid ${color}40` }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}12`, border: `1px solid ${color}30` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-widest">{label}</p>
        <p className="data-mono text-sm font-semibold capitalize" style={{ color }}>{status}</p>
      </div>
      <StatusIcon className="w-4 h-4 flex-shrink-0" style={{ color }} />
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="metric-card" style={{ borderTop: `2px solid ${color}70` }}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-widest">{label}</p>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `${color}18` }}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
      </div>
      <p className="stat-number text-3xl mb-1" style={{ color }}>{value}</p>
      {sub && <p className="data-mono text-[10px] text-slate-600">{sub}</p>}
    </div>
  );
}

function LogLine({ line }) {
  const isError   = /ERROR|CRITICAL/i.test(line);
  const isWarning = /WARNING|WARN|ALERT/i.test(line);
  const color = isError ? '#ff3366' : isWarning ? '#ffb300' : '#475569';
  return (
    <div className="data-mono text-[11px] leading-relaxed border-b border-slate-800/40 py-0.5 last:border-0"
      style={{ color }}>
      {line}
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────

export default function Monitor() {
  const [health, setHealth]     = useState(null);
  const [logs, setLogs]         = useState([]);
  const [stats, setStats]       = useState(null);
  const [alertCount, setAlertCount] = useState(0);
  const [loading, setLoading]   = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    try {
      const [h, l, s, a] = await Promise.allSettled([
        fetchHealth(),
        fetchHealthLogs(40),
        fetchStats(24),
        fetchAlerts(75, 200),
      ]);
      if (h.status === 'fulfilled') setHealth(h.value);
      if (l.status === 'fulfilled') setLogs(l.value?.lines ?? []);
      if (s.status === 'fulfilled') setStats(s.value);
      if (a.status === 'fulfilled') {
        const raw = Array.isArray(a.value) ? a.value : (a.value?.data ?? []);
        setAlertCount(raw.length);
      }
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load]);

  const components = health?.components ?? {};
  const overallOk  = health?.status === 'healthy';

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Operations Monitor</h1>
          <p className="data-mono text-[11px] text-slate-600 mt-0.5 uppercase tracking-wider">
            System health · log stream · live metrics
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="data-mono text-[10px] text-slate-600">
              refreshed {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
            style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)', color: '#00e5ff' }}
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Overall status banner */}
      {health && (
        <div className="glass-panel rounded-xl px-5 py-3 flex items-center gap-3"
          style={{ borderLeft: `4px solid ${overallOk ? '#00ff88' : '#ff3366'}` }}>
          {overallOk
            ? <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#00ff88' }} />
            : <XCircle    className="w-5 h-5 flex-shrink-0" style={{ color: '#ff3366' }} />}
          <div>
            <span className="text-sm font-semibold" style={{ color: overallOk ? '#00ff88' : '#ff3366' }}>
              {overallOk ? 'All Systems Operational' : 'System Degraded — Check Components'}
            </span>
            <span className="data-mono text-[10px] text-slate-600 ml-3">
              uptime {health.uptime_human}
            </span>
          </div>
        </div>
      )}

      {/* Component health grid */}
      <div>
        <p className="data-mono text-[10px] text-slate-600 uppercase tracking-widest mb-3">
          Component Status
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <ComponentCard label="Database"  icon={Database}  status={components.database?.status  ?? '—'} ok={components.database?.ok  ?? false} />
          <ComponentCard label="ML Engine" icon={Brain}     status={components.ml_engine?.status ?? '—'} ok={components.ml_engine?.ok ?? false} />
          <ComponentCard label="Sniffer"   icon={components.sniffer?.ok ? Wifi : WifiOff}
                                           status={components.sniffer?.status  ?? '—'} ok={components.sniffer?.ok  ?? false} />
          <ComponentCard label="API"       icon={Activity}  status={components.api?.status       ?? '—'} ok={components.api?.ok       ?? true}  />
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Events (24h)"
          value={(stats?.total ?? 0).toLocaleString()}
          icon={BarChart2}
          color="#00e5ff"
          sub="total network events"
        />
        <KpiCard
          label="Active Alerts"
          value={alertCount}
          icon={AlertTriangle}
          color={alertCount > 0 ? '#ff3366' : '#00ff88'}
          sub="unacknowledged ≥75 risk"
        />
        <KpiCard
          label="Critical Events"
          value={(stats?.critical ?? 0).toLocaleString()}
          icon={Zap}
          color="#ff3366"
          sub="risk score ≥ 70"
        />
        <KpiCard
          label="Avg Risk Score"
          value={stats ? stats.avg_risk.toFixed(1) : '—'}
          icon={ShieldAlert}
          color={stats?.avg_risk >= 50 ? '#ffb300' : '#00ff88'}
          sub="across all events today"
        />
      </div>

      {/* Log viewer */}
      <div className="glass-panel rounded-xl">
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid rgba(0,255,136,0.08)' }}>
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4" style={{ color: '#00ff88' }} />
            <span className="text-sm font-semibold text-slate-200">Application Log</span>
            <span className="data-mono text-[10px] text-slate-600">
              backend/logs/shadowsaas.log
            </span>
          </div>
          <span className="data-mono text-[10px] text-slate-600">
            last {logs.length} lines · auto-refresh 30s
          </span>
        </div>

        <div className="px-4 py-3 max-h-80 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.3)', fontFamily: 'monospace' }}>
          {logs.length === 0 ? (
            <p className="data-mono text-[11px] text-slate-700 py-4 text-center">
              No log entries yet — start the backend and run some traffic
            </p>
          ) : (
            [...logs].reverse().map((line, i) => <LogLine key={i} line={line} />)
          )}
        </div>
      </div>

    </div>
  );
}
