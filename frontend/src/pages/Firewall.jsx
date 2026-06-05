import React, { useState, useEffect, useCallback } from 'react';
import {
  Flame, ShieldOff, Shield, RefreshCw, Ban, Unlock,
  CheckCircle, XCircle, AlertTriangle, Clock, User,
  Zap, Activity, ChevronDown, ChevronUp, Search, Server,
} from 'lucide-react';
import { fetchFirewallStatus, fetchFirewallRules, firewallBlock, firewallUnblock } from '../services/api';

// ── Config Maps ───────────────────────────────────────────────────────────────

const REASONS = [
  'Suspicious Data Exfiltration',
  'GenAI DLP Violation',
  'Policy Engine Trigger',
  'Insider Threat — High Risk',
  'Repeated Policy Violations',
  'Manual SOC Block',
];

const SEV = {
  low:      { label: 'LOW',      color: '#00e5ff', bg: 'rgba(0,229,255,0.1)',   border: 'rgba(0,229,255,0.3)'  },
  medium:   { label: 'MEDIUM',   color: '#ffb300', bg: 'rgba(255,179,0,0.1)',   border: 'rgba(255,179,0,0.3)'  },
  high:     { label: 'HIGH',     color: '#ff6633', bg: 'rgba(255,102,51,0.1)',  border: 'rgba(255,102,51,0.3)' },
  critical: { label: 'CRITICAL', color: '#ff3366', bg: 'rgba(255,51,102,0.1)', border: 'rgba(255,51,102,0.3)' },
};

const FW_BADGE = {
  BLOCKED_AT_FIREWALL: { label: 'BLOCKED',    color: '#00ff88', bg: 'rgba(0,255,136,0.1)',  border: 'rgba(0,255,136,0.3)',  Icon: CheckCircle  },
  FIREWALL_ERROR:      { label: 'OS ERROR',   color: '#ff3366', bg: 'rgba(255,51,102,0.1)', border: 'rgba(255,51,102,0.3)', Icon: XCircle      },
  LOGGED_ONLY:         { label: 'LOGGED ONLY',color: '#ffb300', bg: 'rgba(255,179,0,0.1)',  border: 'rgba(255,179,0,0.3)',  Icon: AlertTriangle },
  UNBLOCKED:           { label: 'UNBLOCKED',  color: '#64748b', bg: 'rgba(100,116,139,0.1)',border: 'rgba(100,116,139,0.3)',Icon: Unlock       },
};

const SOURCE_BADGE = {
  manual: { label: 'MANUAL', color: '#94a3b8' },
  policy: { label: 'POLICY', color: '#b366ff' },
  auto:   { label: 'AUTO',   color: '#00e5ff' },
};

const MODE_COLOR = {
  ACTIVE:      '#00ff88',
  DEGRADED:    '#ffb300',
  LOGGED_ONLY: '#64748b',
};

// ── Small UI Helpers ──────────────────────────────────────────────────────────

const INPUT_CLS = 'w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors';

function Toast({ toast }) {
  if (!toast) return null;
  const styles = {
    success: 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300',
    error:   'bg-rose-950/60   border-rose-500/40   text-rose-300',
    info:    'bg-slate-900/80  border-slate-700     text-slate-300',
  };
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl border font-mono text-sm shadow-2xl animate-fade-in ${styles[toast.type] || styles.info}`}>
      {toast.msg}
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = FW_BADGE[status] || FW_BADGE.LOGGED_ONLY;
  const Icon = cfg.Icon;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border"
      style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
}

function SevBadge({ severity }) {
  const cfg = SEV[severity] || SEV.medium;
  return (
    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold border"
      style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}>
      {cfg.label}
    </span>
  );
}

function SourceBadge({ source }) {
  const cfg = SOURCE_BADGE[source] || SOURCE_BADGE.manual;
  return (
    <span className="text-[10px] font-mono font-bold uppercase" style={{ color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function timeAgo(ts) {
  if (!ts) return '—';
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60)  return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function duration(start, end) {
  if (!start || !end) return '—';
  const diff = (new Date(end).getTime() - new Date(start).getTime()) / 1000;
  if (diff < 60)  return `${Math.round(diff)}s`;
  if (diff < 3600) return `${Math.round(diff / 60)}m`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h`;
  return `${Math.round(diff / 86400)}d`;
}

function isValidIP(ip) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip.trim()) ||
         /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/.test(ip.trim());
}

// ── Status Banner ─────────────────────────────────────────────────────────────

function StatusBanner({ status, loading }) {
  if (loading || !status) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="glass-panel rounded-xl p-5 animate-pulse">
            <div className="h-3 w-16 bg-slate-800 rounded mb-3" />
            <div className="h-6 w-24 bg-slate-800 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const modeColor = MODE_COLOR[status.enforcement_mode] || '#64748b';

  const cards = [
    {
      label: 'OS Platform',
      value: status.platform_label,
      sub: status.os.toUpperCase(),
      icon: Server,
      color: '#00e5ff',
    },
    {
      label: 'Enforcement Mode',
      value: status.enforcement_mode,
      sub: status.enforcement_mode === 'ACTIVE'      ? 'All rules OS-enforced'
         : status.enforcement_mode === 'DEGRADED'    ? 'No admin — rules logged only'
         : 'Unsupported OS',
      icon: Shield,
      color: modeColor,
    },
    {
      label: 'Admin Privileges',
      value: status.is_admin ? 'GRANTED' : 'MISSING',
      sub: status.is_admin ? 'Backend running as admin' : 'Restart as Administrator',
      icon: User,
      color: status.is_admin ? '#00ff88' : '#ff3366',
    },
    {
      label: 'Active Blocks',
      value: status.active_rules,
      sub: `${status.enforced_rules} enforced · ${status.logged_only_rules} logged`,
      icon: Ban,
      color: status.active_rules > 0 ? '#ff3366' : '#64748b',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map(({ label, value, sub, icon: Icon, color }) => (
        <div key={label} className="glass-panel rounded-xl p-5"
          style={{ borderTop: `2px solid ${color}33` }}>
          <div className="flex items-center justify-between mb-3">
            <span className="data-mono text-[9px] uppercase tracking-widest text-slate-600">{label}</span>
            <Icon className="w-3.5 h-3.5" style={{ color, opacity: 0.7 }} />
          </div>
          <div className="data-mono font-bold text-base truncate" style={{ color }}>{value}</div>
          <div className="data-mono text-[10px] text-slate-600 mt-1 leading-tight">{sub}</div>
        </div>
      ))}
    </div>
  );
}

// ── Quick Block Form ──────────────────────────────────────────────────────────

function QuickBlock({ onBlocked }) {
  const [ip, setIp]             = useState('');
  const [reason, setReason]     = useState(REASONS[0]);
  const [severity, setSeverity] = useState('high');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');

  const handleBlock = async () => {
    const trimmed = ip.trim();
    if (!trimmed) { setError('Enter an IP address'); return; }
    if (!isValidIP(trimmed)) { setError('Invalid IP address format'); return; }
    setError('');
    setBusy(true);
    try {
      const res = await firewallBlock({ ip: trimmed, reason, source: 'manual', severity });
      if (res?.status === 'already_blocked') {
        setError(`${trimmed} is already blocked (${res.fw_status})`);
      } else {
        setIp('');
        onBlocked({ ...res, reason, severity, source: 'manual' });
      }
    } catch (err) {
      setError(err?.response?.data?.detail || 'Block request failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="glass-panel rounded-xl border-l-4 border-l-rose-500 p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.3)' }}>
          <Ban className="w-4 h-4 text-rose-400" />
        </div>
        <div>
          <h2 className="font-mono font-bold text-slate-200 text-sm">Block IP Address</h2>
          <p className="font-mono text-[10px] text-slate-600">Adds OS firewall rule + writes audit log</p>
        </div>
      </div>

      {/* IP input */}
      <div className="space-y-1.5">
        <label className="data-mono text-[10px] uppercase tracking-widest text-slate-500">Target IP</label>
        <input
          type="text"
          value={ip}
          onChange={(e) => { setIp(e.target.value); setError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && handleBlock()}
          placeholder="192.168.1.x"
          className={INPUT_CLS}
          style={error ? { borderColor: 'rgba(255,51,102,0.6)' } : {}}
        />
        {error && <p className="data-mono text-[10px] text-rose-400">{error}</p>}
      </div>

      {/* Reason */}
      <div className="space-y-1.5">
        <label className="data-mono text-[10px] uppercase tracking-widest text-slate-500">Reason</label>
        <select className={INPUT_CLS} value={reason} onChange={(e) => setReason(e.target.value)}>
          {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* Severity selector */}
      <div className="space-y-1.5">
        <label className="data-mono text-[10px] uppercase tracking-widest text-slate-500">Severity</label>
        <div className="flex gap-2">
          {Object.entries(SEV).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setSeverity(key)}
              className="flex-1 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider border transition-all"
              style={severity === key
                ? { color: cfg.color, background: cfg.bg, borderColor: cfg.border }
                : { color: '#475569', background: 'transparent', borderColor: 'rgba(71,85,105,0.3)' }}
            >
              {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={handleBlock}
        disabled={busy || !ip.trim()}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-mono font-bold text-sm uppercase tracking-wider transition-all disabled:opacity-40"
        style={{ background: 'rgba(255,51,102,0.15)', border: '1px solid rgba(255,51,102,0.4)', color: '#ff3366' }}
      >
        {busy
          ? <><RefreshCw className="w-4 h-4 animate-spin" /> Blocking...</>
          : <><Ban className="w-4 h-4" /> Block IP</>}
      </button>
    </div>
  );
}

// ── Active Rules Table ────────────────────────────────────────────────────────

function ActiveRules({ rules, onUnblock, unblocking, onVerify, verifying, search, setSearch, sourceFilter, setSourceFilter }) {
  const active = rules.filter((r) => r.status !== 'UNBLOCKED');

  const filtered = active.filter((r) => {
    if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;
    if (search && !r.ip.includes(search) && !(r.reason || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="glass-panel rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <Flame className="w-4 h-4 text-rose-400" />
          <h2 className="font-mono font-bold text-slate-200 text-sm">Active Firewall Rules</h2>
          <span className="data-mono text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400">
            {active.length}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search IP or reason..."
              className="pl-7 pr-3 py-1.5 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-slate-300 placeholder-slate-600 focus:outline-none focus:border-slate-500 w-48"
            />
          </div>
          {/* Source filter */}
          {['all', 'manual', 'policy', 'auto'].map((s) => (
            <button key={s}
              onClick={() => setSourceFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition-all
                ${sourceFilter === s
                  ? 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-400'
                  : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}>
              {s}
            </button>
          ))}
          {/* Verify button */}
          <button
            onClick={onVerify}
            disabled={verifying}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider border transition-all"
            style={{ color: '#00ff88', background: 'rgba(0,255,136,0.05)', borderColor: 'rgba(0,255,136,0.2)' }}
            title="Check if each OS rule is still active in the actual firewall"
          >
            {verifying
              ? <RefreshCw className="w-3 h-3 animate-spin" />
              : <Activity className="w-3 h-3" />}
            Verify OS
          </button>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-600">
          <Shield className="w-10 h-10 mb-3 opacity-20" />
          <p className="font-mono text-sm">No active firewall rules</p>
          <p className="font-mono text-xs mt-1 opacity-60">Block an IP above to see it here</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800/60">
                {['IP Address', 'Reason', 'Severity', 'Source', 'Blocked By', 'When', 'OS Status', 'OS Verified', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[9px] uppercase tracking-widest text-slate-600 font-bold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((rule, i) => (
                <tr key={rule._id || i}
                  className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
                  <td className="px-4 py-3">
                    <span className="data-mono font-bold text-slate-200">{rule.ip}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-slate-400 max-w-[180px] truncate block">{rule.reason || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <SevBadge severity={rule.severity || 'medium'} />
                  </td>
                  <td className="px-4 py-3">
                    <SourceBadge source={rule.source || 'manual'} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {rule.quarantined_by || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {timeAgo(rule.timestamp)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={rule.status} />
                  </td>
                  <td className="px-4 py-3">
                    {rule.os_verified === null || rule.os_verified === undefined ? (
                      <span className="text-slate-700 text-[10px]">not checked</span>
                    ) : rule.os_verified ? (
                      <span className="text-[10px] font-bold" style={{ color: '#00ff88' }}>✓ active</span>
                    ) : (
                      <span className="text-[10px] font-bold text-rose-400">✗ missing</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onUnblock(rule.ip)}
                      disabled={unblocking === rule.ip}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold uppercase tracking-wider transition-all"
                      style={{ color: '#00ff88', background: 'rgba(0,255,136,0.05)', borderColor: 'rgba(0,255,136,0.2)' }}
                    >
                      {unblocking === rule.ip
                        ? <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                        : <Unlock className="w-2.5 h-2.5" />}
                      Unblock
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Block History ─────────────────────────────────────────────────────────────

function BlockHistory({ rules }) {
  const [expanded, setExpanded] = useState(false);
  const history = rules.filter((r) => r.status === 'UNBLOCKED');

  if (history.length === 0) return null;

  return (
    <div className="glass-panel rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-800/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Clock className="w-4 h-4 text-slate-500" />
          <span className="font-mono font-bold text-slate-400 text-sm">Block History</span>
          <span className="data-mono text-[10px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-500">
            {history.length} unblocked
          </span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-600" /> : <ChevronDown className="w-4 h-4 text-slate-600" />}
      </button>

      {expanded && (
        <div className="overflow-x-auto border-t border-slate-800/60">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800/60">
                {['IP Address', 'Reason', 'Severity', 'Blocked By', 'Blocked At', 'Unblocked At', 'Duration', 'Unblocked By'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[9px] uppercase tracking-widest text-slate-700 font-bold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((rule, i) => (
                <tr key={rule._id || i} className="border-b border-slate-800/30 opacity-60 hover:opacity-80 transition-opacity">
                  <td className="px-4 py-3 text-slate-400 font-bold">{rule.ip}</td>
                  <td className="px-4 py-3 text-slate-500 max-w-[160px] truncate">{rule.reason || '—'}</td>
                  <td className="px-4 py-3"><SevBadge severity={rule.severity || 'medium'} /></td>
                  <td className="px-4 py-3 text-slate-600">{rule.quarantined_by || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{rule.timestamp ? new Date(rule.timestamp).toLocaleString() : '—'}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{rule.unblocked_at ? new Date(rule.unblocked_at).toLocaleString() : '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{duration(rule.timestamp, rule.unblocked_at)}</td>
                  <td className="px-4 py-3 text-slate-600">{rule.unblocked_by || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Stat Strip ────────────────────────────────────────────────────────────────

function StatStrip({ rules }) {
  const active   = rules.filter((r) => r.status !== 'UNBLOCKED');
  const enforced = rules.filter((r) => r.status === 'BLOCKED_AT_FIREWALL');
  const errors   = rules.filter((r) => r.status === 'FIREWALL_ERROR');
  const logged   = rules.filter((r) => r.status === 'LOGGED_ONLY');
  const manual   = active.filter((r) => r.source === 'manual');
  const policy   = active.filter((r) => r.source === 'policy');
  const auto     = active.filter((r) => r.source === 'auto');
  const critical = active.filter((r) => r.severity === 'critical');

  const stats = [
    { label: 'Total Active',   value: active.length,    color: '#ff3366' },
    { label: 'OS Enforced',    value: enforced.length,  color: '#00ff88' },
    { label: 'Logged Only',    value: logged.length,    color: '#ffb300' },
    { label: 'OS Errors',      value: errors.length,    color: '#ff6633' },
    { label: 'Manual Blocks',  value: manual.length,    color: '#94a3b8' },
    { label: 'Policy Blocks',  value: policy.length,    color: '#b366ff' },
    { label: 'Auto Blocks',    value: auto.length,      color: '#00e5ff' },
    { label: 'Critical Sev',   value: critical.length,  color: '#ff3366' },
  ];

  return (
    <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
      {stats.map(({ label, value, color }) => (
        <div key={label} className="glass-panel rounded-xl p-4 text-center">
          <div className="data-mono text-lg font-bold" style={{ color }}>{value}</div>
          <div className="data-mono text-[9px] text-slate-600 uppercase tracking-wider mt-1 leading-tight">{label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Degraded Warning Banner ───────────────────────────────────────────────────

function DegradedWarning({ status }) {
  if (!status || status.enforcement_mode === 'ACTIVE') return null;

  const isLogged = status.enforcement_mode === 'LOGGED_ONLY';
  const color    = isLogged ? '#64748b' : '#ffb300';
  const bg       = isLogged ? 'rgba(100,116,139,0.08)' : 'rgba(255,179,0,0.08)';
  const border   = isLogged ? 'rgba(100,116,139,0.25)' : 'rgba(255,179,0,0.3)';
  const Icon     = isLogged ? ShieldOff : AlertTriangle;

  return (
    <div className="flex items-start gap-3 px-5 py-4 rounded-xl border"
      style={{ background: bg, borderColor: border }}>
      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color }} />
      <div>
        <p className="font-mono font-bold text-sm" style={{ color }}>
          {isLogged ? 'Unsupported OS — rules logged but not enforced' : 'Degraded mode — backend lacks admin privileges'}
        </p>
        <p className="font-mono text-xs text-slate-500 mt-0.5">
          {isLogged
            ? `Platform "${status.os}" has no firewall integration. IP blocks are recorded in the database only.`
            : `On Windows: restart backend as Administrator. On Linux: run backend as root or with CAP_NET_ADMIN. Until then, blocks are logged but no OS rule is created.`}
        </p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Firewall() {
  const [status, setStatus]         = useState(null);
  const [rules, setRules]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [verifying, setVerifying]   = useState(false);
  const [unblocking, setUnblocking] = useState(null);
  const [toast, setToast]           = useState(null);
  const [search, setSearch]         = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadAll = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const [statusData, rulesData] = await Promise.all([
        fetchFirewallStatus(),
        fetchFirewallRules(false),
      ]);
      setStatus(statusData);
      setRules(Array.isArray(rulesData) ? rulesData : []);
    } catch {
      /* backend may not be ready */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll(true);
    const iv = setInterval(() => loadAll(false), 30000);
    return () => clearInterval(iv);
  }, [loadAll]);

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const data = await fetchFirewallRules(true);
      setRules(Array.isArray(data) ? data : []);
      showToast('OS rule verification complete');
    } catch {
      showToast('Verification failed — backend may not have admin rights', 'error');
    } finally {
      setVerifying(false);
    }
  };

  const handleUnblock = async (ip) => {
    setUnblocking(ip);
    try {
      await firewallUnblock(ip);
      showToast(`${ip} unblocked — OS firewall rule removed`);
      loadAll(false);
    } catch (err) {
      showToast(err?.response?.data?.detail || `Failed to unblock ${ip}`, 'error');
    } finally {
      setUnblocking(null);
    }
  };

  const handleBlocked = (res) => {
    const fw = res?.fw_status;

    // Optimistic update — add row instantly so the user sees it immediately
    const optimisticRule = {
      _id: `pending-${Date.now()}`,
      ip: res.ip,
      timestamp: new Date().toISOString(),
      reason: res.reason || 'Manual SOC Block',
      source: res.source || 'manual',
      severity: res.severity || 'high',
      quarantined_by: 'you',
      status: fw,
      fw_message: res.fw_message,
      os_verified: null,
    };
    setRules((prev) => [optimisticRule, ...prev.filter((r) => r.ip !== res.ip)]);

    if (fw === 'BLOCKED_AT_FIREWALL') showToast(`${res.ip} blocked — OS firewall rule active`);
    else if (fw === 'FIREWALL_ERROR')  showToast(`${res.ip} logged — OS rule failed: run backend as Administrator`, 'error');
    else                               showToast(`${res.ip} logged — no OS enforcement on this platform`, 'info');

    // Background refresh to get the real DB record
    loadAll(false);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <Toast toast={toast} />

      {/* Page header */}
      <div className="glass-panel p-5 rounded-xl border-l-4 border-l-rose-500">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.3)' }}>
              <Flame className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h1 className="font-mono font-bold text-xl text-slate-100">Firewall Control</h1>
              <p className="font-mono text-[10px] text-slate-600 mt-0.5">
                Real-time IP blocking · OS-level enforcement · {status?.platform_label || 'Detecting platform...'}
              </p>
            </div>
          </div>
          <button
            onClick={() => loadAll(false)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-xs font-bold uppercase tracking-wider transition-all"
            style={{ color: '#00e5ff', background: 'rgba(0,229,255,0.05)', borderColor: 'rgba(0,229,255,0.2)' }}
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
      </div>

      {/* Degraded warning */}
      <DegradedWarning status={status} />

      {/* Status banner */}
      <StatusBanner status={status} loading={loading} />

      {/* Stat strip */}
      <StatStrip rules={rules} />

      {/* Main content: quick block + active rules */}
      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5">
        <QuickBlock onBlocked={handleBlocked} />
        <ActiveRules
          rules={rules}
          onUnblock={handleUnblock}
          unblocking={unblocking}
          onVerify={handleVerify}
          verifying={verifying}
          search={search}
          setSearch={setSearch}
          sourceFilter={sourceFilter}
          setSourceFilter={setSourceFilter}
        />
      </div>

      {/* History (collapsed by default) */}
      <BlockHistory rules={rules} />
    </div>
  );
}
