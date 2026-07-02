import React, { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Bell, ShieldAlert, Brain, Check, Search,
  RefreshCw, AlertTriangle, Zap, Activity, Filter,
  ChevronRight, Clock, ExternalLink, Unlock,
} from 'lucide-react';
import { fetchAlerts, acknowledgeAlert, fetchQuarantinedIPs, detectMyIP, unquarantineIP } from '../services/api';
import { subscribeToEvents } from '../services/wsClient';
import { useNavigate } from 'react-router-dom';

const RISK_COLOR = (score) =>
  score >= 70 ? '#ef4444' : score >= 40 ? '#f59e0b' : '#10b981';

const LEVEL_CONFIG = {
  CRITICAL: { cls: 'bg-rose-500/15 text-rose-400 border-rose-500/40', dot: 'bg-rose-400' },
  ELEVATED: { cls: 'bg-amber-500/15 text-amber-400 border-amber-500/40', dot: 'bg-amber-400' },
  NORMAL:   { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40', dot: 'bg-emerald-400' },
};

function LevelBadge({ level }) {
  const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG.NORMAL;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border font-mono ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${level === 'CRITICAL' ? 'animate-pulse' : ''}`} />
      {level}
    </span>
  );
}

function AlertCard({ alert, onAck, onInvestigate, quarantined, myDeviceIp, onUnblock }) {
  const isMe = myDeviceIp && alert.source_ip === myDeviceIp;
  const [acking, setAcking] = useState(false);
  const [unblocking, setUnblocking] = useState(false);

  const ts = new Date(alert.timestamp);
  const ageMs = Date.now() - ts.getTime();
  const ageStr = ageMs < 60000 ? 'Just now'
    : ageMs < 3600000 ? `${Math.floor(ageMs / 60000)}m ago`
    : `${Math.floor(ageMs / 3600000)}h ago`;

  const isBlocked = quarantined.includes(alert.source_ip);

  const handleAck = async () => {
    setAcking(true);
    try { await onAck(alert._id); } finally { setAcking(false); }
  };

  const handleUnblock = async () => {
    setUnblocking(true);
    try { await onUnblock(alert.source_ip); } finally { setUnblocking(false); }
  };

  return (
    <div className={`glass-panel rounded-xl p-4 border-l-4 transition-all hover:-translate-y-0.5
      ${alert.risk_level === 'CRITICAL' ? 'border-l-rose-500' : 'border-l-amber-500'}`}>
      <div className="flex items-start gap-3">
        {/* Risk score ring */}
        <div className="flex-shrink-0 w-12 h-12 rounded-full border-2 flex items-center justify-center font-mono font-bold text-sm"
          style={{ borderColor: RISK_COLOR(alert.risk_score), color: RISK_COLOR(alert.risk_score), background: `${RISK_COLOR(alert.risk_score)}12` }}>
          {Math.round(alert.risk_score)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <LevelBadge level={alert.risk_level || 'ELEVATED'} />
              {alert.is_genai_exfiltration ? (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 bg-purple-500/20 border border-purple-500/50 text-purple-300 rounded-full font-mono animate-pulse">
                  <Brain className="w-2.5 h-2.5" /> GenAI Exfil
                </span>
              ) : alert.is_genai_access && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 bg-violet-500/15 border border-violet-500/30 text-violet-400 rounded-full font-mono">
                  <Brain className="w-2.5 h-2.5" /> GenAI Access
                </span>
              )}
              {isBlocked && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 bg-rose-900/30 border border-rose-700/40 text-rose-400 rounded-full font-mono animate-pulse">
                  🔒 AUTO-BLOCKED
                </span>
              )}
            </div>
            <span className="text-[10px] font-mono text-slate-500 flex-shrink-0 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />{ageStr}
            </span>
          </div>

          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <code className="text-xs text-cyan-400 bg-slate-900/60 px-2 py-0.5 rounded border border-slate-700/50 font-mono">
              {alert.source_ip}
            </code>
            {isMe ? (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border font-mono"
                style={{ color: '#00ff88', background: 'rgba(0,255,136,0.08)', borderColor: 'rgba(0,255,136,0.3)' }}>
                MY MACHINE
              </span>
            ) : (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border font-mono"
                style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.25)' }}>
                NETWORK DEVICE
              </span>
            )}
            <ChevronRight className="w-3 h-3 text-slate-600" />
            <span className="text-sm font-bold text-slate-200 font-mono truncate">{alert.app_name}</span>
          </div>

          {/* ML-driven risk reasons */}
          {alert.risk_reasons?.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {alert.risk_reasons.map((r, i) => {
                const low = r.toLowerCase();
                const isUeba   = low.includes('off-hour') || low.includes('baseline') || low.includes('ueba') || low.includes('deviation');
                const isGenaiR = low.includes('genai') || low.includes('bulk paste') || low.includes('ai');
                const isML     = low.includes('anomal') || low.includes('pattern') || low.includes('isolation');
                const isExfil  = low.includes('transfer') || low.includes('upload') || low.includes('large');
                const col = isUeba   ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30'
                           : isGenaiR ? 'text-purple-400 bg-purple-500/10 border-purple-500/30'
                           : isML     ? 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/30'
                           : isExfil  ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                           :            'text-rose-400 bg-rose-500/10 border-rose-500/30';
                const icon = isUeba ? '⏰' : isGenaiR ? '🤖' : isML ? '🧠' : isExfil ? '📤' : '⚠️';
                return (
                  <span key={i} className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border font-mono ${col}`}>
                    <span>{icon}</span>{r}
                  </span>
                );
              })}
            </div>
          )}

          {/* UEBA flags */}
          {alert.ueba_flags?.length > 0 && (
            <div className="mb-3 rounded-lg px-3 py-2" style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)' }}>
              <p className="text-[9px] font-mono text-cyan-500 uppercase tracking-widest mb-1.5">UEBA Behavioural Flags</p>
              <div className="flex flex-wrap gap-1">
                {alert.ueba_flags.map((f, i) => (
                  <span key={i} className="text-[9px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/25 px-1.5 py-0.5 rounded">
                    ⏰ {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ML Evidence panel */}
          {alert.is_anomalous && (
            <div className="mb-3 rounded-lg px-3 py-2" style={{ background: 'rgba(232,121,249,0.04)', border: '1px solid rgba(232,121,249,0.15)' }}>
              <p className="text-[9px] font-mono text-fuchsia-400 uppercase tracking-widest mb-2">🧠 Isolation Forest — Feature Evidence</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Upload Ratio', value: alert.upload_download_ratio ?? 0, threshold: 5, unit: 'x', fmt: v => v.toFixed(1) },
                  { label: 'Pkt Size Var', value: alert.packet_size_variance ?? 0,  threshold: 0.7, unit: '', fmt: v => v.toFixed(3) },
                  { label: 'Inter-Arrival', value: alert.inter_arrival_time ?? 0,   threshold: null, unit: 's', fmt: v => v.toFixed(4) },
                ].map(({ label, value, threshold, unit, fmt }) => {
                  const flagged = threshold !== null && value > threshold;
                  return (
                    <div key={label} className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wide">{label}</span>
                        <span className="text-[9px] font-mono font-bold" style={{ color: flagged ? '#f0abfc' : '#64748b' }}>
                          {fmt(Number(value))}{unit}
                          {flagged && <span className="ml-1 text-[7px] text-fuchsia-400">▲HIGH</span>}
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, threshold ? (value / (threshold * 3)) * 100 : (value * 200))}%`,
                            background: flagged ? '#e879f9' : '#334155',
                          }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Traffic stats */}
          <div className="flex items-center gap-4 mb-3 text-[10px] font-mono text-slate-500">
            <span>↑ {((alert.bytes_sent || 0) / 1024).toFixed(1)} KB</span>
            <span>↓ {((alert.bytes_received || 0) / 1024).toFixed(1)} KB</span>
            <span>ratio {(alert.upload_download_ratio || 0).toFixed(1)}x</span>
            <span className="text-[9px] text-slate-600">{alert.protocol} :{alert.destination_port}</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleAck}
              disabled={acking}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold font-mono uppercase
                bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 transition-all disabled:opacity-40">
              <Check className="w-3 h-3" />
              {acking ? '…' : 'Acknowledge'}
            </button>
            {isBlocked ? (
              <button
                onClick={handleUnblock}
                disabled={unblocking}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold font-mono uppercase
                  bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 transition-all disabled:opacity-40">
                <Unlock className="w-3 h-3" />
                {unblocking ? 'Removing…' : 'Unblock IP'}
              </button>
            ) : (
              <button
                onClick={() => onInvestigate(alert.source_ip)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold font-mono uppercase
                  bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-400 transition-all">
                <ExternalLink className="w-3 h-3" /> Investigate &amp; Block →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AlertCenter() {
  const navigate = useNavigate();

  const [alerts, setAlerts]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [levelFilter, setLevelFilter] = useState('All');
  const [quarantined, setQuarantined] = useState([]);
  const [ackHistory, setAckHistory]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('ack_alerts') || '[]'); } catch { return []; }
  });
  const [minRisk, setMinRisk]         = useState(60);
  const [myDeviceIp, setMyDeviceIp]   = useState(null);
  const [toast, setToast]             = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    detectMyIP().then((ip) => setMyDeviceIp(ip || null));
  }, []);

  const showMsg = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadAlerts = useCallback(async () => {
    try {
      const [alertResp, qResp] = await Promise.allSettled([
        fetchAlerts(minRisk, 100),
        fetchQuarantinedIPs(),
      ]);
      if (alertResp.status === 'fulfilled') {
        const raw = Array.isArray(alertResp.value) ? alertResp.value : (alertResp.value?.data || []);
        setAlerts(raw);
        setLastUpdated(new Date());
      }
      if (qResp.status === 'fulfilled') {
        const qRaw = qResp.value;
        setQuarantined(Array.isArray(qRaw) ? qRaw.map((q) => q.ip || q) : []);
      }
    } catch (err) {
      console.error('AlertCenter load error', err);
    } finally {
      setLoading(false);
    }
  }, [minRisk]);

  useEffect(() => {
    loadAlerts();
    const iv = setInterval(loadAlerts, 10000); // refresh every 10s
    return () => clearInterval(iv);
  }, [loadAlerts]);

  const handleAcknowledge = async (eventId) => {
    try {
      await acknowledgeAlert(eventId);
      const updatedAck = [...ackHistory, eventId];
      setAckHistory(updatedAck);
      localStorage.setItem('ack_alerts', JSON.stringify(updatedAck));
      setAlerts((prev) => prev.filter((a) => a._id !== eventId));
      showMsg('Alert acknowledged');
    } catch {
      showMsg('Failed to acknowledge', 'error');
    }
  };

  const handleInvestigate = (ip) => {
    navigate(`/threats?ip=${ip}`);
  };

  const handleUnblock = async (ip) => {
    try {
      await unquarantineIP(ip);
      setQuarantined((prev) => prev.filter((q) => q !== ip));
      showMsg(`IP ${ip} unblocked`);
    } catch {
      showMsg(`Failed to unblock ${ip}`, 'error');
    }
  };

  // WebSocket: listen for real-time auto_block events and surface a toast
  useEffect(() => {
    const unsub = subscribeToEvents((msg) => {
      if (msg.type === 'auto_block') {
        const d = msg.data || {};
        showMsg(`🔒 Auto-blocked ${d.source_ip} → ${d.app_name} (risk ${d.risk_score})`, 'error');
        setQuarantined((prev) => prev.includes(d.source_ip) ? prev : [...prev, d.source_ip]);
      }
    });
    return unsub;
  }, []);

  // Build timeline data from alerts (last 20, chronological)
  const timelineData = [...alerts]
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-20)
    .map((a) => ({
      time: new Date(a.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      risk: Math.round(a.risk_score || 0),
    }));

  const filtered = alerts.filter((a) => {
    const matchSearch = !search
      || a.source_ip?.includes(search)
      || a.app_name?.toLowerCase().includes(search.toLowerCase());
    const matchLevel = levelFilter === 'All' || a.risk_level === levelFilter;
    return matchSearch && matchLevel;
  });

  const critical = alerts.filter((a) => a.risk_level === 'CRITICAL').length;
  const elevated = alerts.filter((a) => a.risk_level === 'ELEVATED').length;
  const genaiAlerts = alerts.filter((a) => a.is_genai_exfiltration || a.is_genai_access).length;

  return (
    <div className="space-y-5 animate-fade-in">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-lg border font-mono text-sm shadow-xl
          ${toast.type === 'error' ? 'bg-rose-950 border-rose-500/50 text-rose-300' : 'bg-emerald-950 border-emerald-500/50 text-emerald-300'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="glass-panel p-5 rounded-xl border-l-4 border-l-rose-500">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3 tracking-tight">
              <Bell className="w-6 h-6 text-rose-400" />
              Alert Management Center
            </h1>
            <p className="text-slate-500 data-mono text-xs mt-1">
              Real-time shadow activity queue · admin response console · {lastUpdated ? `updated ${lastUpdated.toLocaleTimeString()}` : 'loading…'}
            </p>
          </div>
          <div className="flex gap-5 text-center font-mono">
            <div>
              <div className="text-2xl font-bold text-rose-400">{critical}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Critical</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-400">{elevated}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Elevated</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-400">{genaiAlerts}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">GenAI</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-300">{alerts.length}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Total Active</div>
            </div>
          </div>
        </div>
      </div>

      {/* Risk Timeline */}
      {timelineData.length > 2 && (
        <div className="glass-panel rounded-xl p-5">
          <h2 className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-rose-400" />
            Active Alert Risk Timeline
          </h2>
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="1 4" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#334155" fontSize={8} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} stroke="#334155" fontSize={8} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(2,6,23,0.95)', border: '1px solid #ef444440', borderRadius: 8, fontFamily: 'monospace', fontSize: 11 }}
                  formatter={(v) => [v, 'Risk']}
                />
                <Area type="monotone" dataKey="risk" stroke="#ef4444" strokeWidth={2} fill="url(#riskGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by IP address or app name…"
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-slate-300 placeholder-slate-600 focus:outline-none focus:border-rose-500/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          {['All', 'CRITICAL', 'ELEVATED'].map((l) => (
            <button key={l} onClick={() => setLevelFilter(l)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold font-mono uppercase border transition-all
                ${levelFilter === l
                  ? l === 'CRITICAL' ? 'bg-rose-500/20 border-rose-500/50 text-rose-400'
                    : l === 'ELEVATED' ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                    : 'bg-slate-700/60 border-slate-600 text-slate-200'
                  : 'bg-transparent border-slate-700 text-slate-500 hover:border-slate-500'}`}>
              {l}
            </button>
          ))}
          <button onClick={loadAlerts} className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-5 bg-slate-800" />
          <button
            onClick={() => setMinRisk((prev) => (prev === 60 ? 30 : 60))}
            title={minRisk === 60 ? 'Show events with risk ≥ 30 (catches real traffic)' : 'Show critical/elevated only (risk ≥ 60)'}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold font-mono uppercase border transition-all ${
              minRisk === 30
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                : 'bg-transparent border-slate-700 text-slate-500 hover:border-slate-500'
            }`}>
            {minRisk === 30 ? 'All Activity ×' : 'Show All'}
          </button>
        </div>
      </div>

      {/* Alert queue */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-rose-500/40 border-t-rose-400 rounded-full animate-spin mx-auto" />
            <p className="text-rose-400 font-mono text-sm animate-pulse tracking-widest">SCANNING THREAT QUEUE…</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel rounded-xl p-12 text-center">
          <ShieldAlert className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 font-mono text-sm">
            {alerts.length === 0 ? 'No active alerts — all clear' : 'No alerts match the current filter'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 uppercase tracking-widest">
            <Zap className="w-3 h-3 text-rose-400" />
            Active Alerts ({filtered.length})
            <span className="ml-auto">{ackHistory.length} acknowledged this session</span>
          </div>
          {filtered.map((alert) => (
            <AlertCard
              key={alert._id}
              alert={alert}
              onAck={handleAcknowledge}
              onInvestigate={handleInvestigate}
              onUnblock={handleUnblock}
              quarantined={quarantined}
              myDeviceIp={myDeviceIp}
            />
          ))}
        </div>
      )}

      {/* Quarantine status */}
      {quarantined.length > 0 && (
        <div className="glass-panel rounded-xl p-4 border border-rose-500/20">
          <h3 className="text-xs font-mono text-rose-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <ShieldAlert className="w-3.5 h-3.5" /> Quarantined IPs ({quarantined.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {quarantined.map((ip, i) => (
              <code key={i} className="text-xs bg-rose-900/20 border border-rose-700/30 text-rose-400 px-3 py-1 rounded-lg font-mono">
                {ip}
              </code>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
