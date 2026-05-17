import React, { useState, useEffect, useCallback } from 'react';
import { fetchEvents, quarantineIP } from '../services/api';
import { ShieldAlert, ChevronLeft, ChevronRight, Ban, ArrowUpDown, Search, RefreshCw, Brain, AlertTriangle } from 'lucide-react';

const PAGE_SIZE = 20;

const RISK_BADGE = (score) => {
  if (score >= 70) return 'bg-rose-500/20 text-rose-400 border border-rose-500/40';
  if (score >= 40) return 'bg-amber-500/20 text-amber-400 border border-amber-500/40';
  return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
};

const STATUS_DOT = (anomalous) =>
  anomalous
    ? 'bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]'
    : 'bg-emerald-500';

export default function ThreatIntel() {
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const [riskMin, setRiskMin] = useState(0);
  const [sortKey, setSortKey] = useState('timestamp');
  const [sortDir, setSortDir] = useState('desc');
  const [search, setSearch] = useState('');
  const [quarantining, setQuarantining] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadEvents = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const params = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        risk_min: riskMin,
      };
      if (search) params.app_name = search;

      const data = await fetchEvents(params);
      setEvents(Array.isArray(data?.data) ? data.data : []);
      setTotal(data?.total ?? 0);
    } catch (err) {
      console.error('ThreatIntel load error', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, riskMin, search]);

  useEffect(() => {
    loadEvents();
    // Auto-refresh every 15s so live sniffer data appears without manual reload
    const iv = setInterval(() => loadEvents(true), 15_000);
    return () => clearInterval(iv);
  }, [loadEvents]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sortedEvents = [...events].sort((a, b) => {
    let va = a[sortKey], vb = b[sortKey];
    if (sortKey === 'timestamp') {
      va = new Date(va).getTime(); vb = new Date(vb).getTime();
    }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const handleQuarantine = async (ip) => {
    if (!ip) return;
    setQuarantining(ip);
    try {
      const res = await quarantineIP(ip);
      if (res?.status === 'already_quarantined') showToast(`${ip} already quarantined`, 'info');
      else showToast(`${ip} quarantined successfully`);
    } catch {
      showToast(`Failed to quarantine ${ip}`, 'error');
    } finally {
      setQuarantining(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const SortIcon = ({ col }) => (
    <ArrowUpDown
      className={`w-3 h-3 ml-1 inline ${sortKey === col ? 'text-cyan-400' : 'text-slate-600'}`}
    />
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-lg border font-mono text-sm shadow-xl
          ${toast.type === 'error' ? 'bg-rose-950 border-rose-500/50 text-rose-300' :
            toast.type === 'info'  ? 'bg-slate-900 border-slate-700 text-slate-300' :
            'bg-emerald-950 border-emerald-500/50 text-emerald-300'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="glass-panel p-5 rounded-xl border-l-4 border-l-rose-500">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3 tracking-tight">
              <ShieldAlert className="w-6 h-6 text-rose-500" />
              Threat Intelligence Feed
            </h1>
            <p className="text-slate-500 data-mono text-xs mt-1">
              Isolation Forest · ETA analysis · GenAI DLP · {total.toLocaleString()} flows indexed
            </p>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Filter app..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 w-36"
              />
            </div>

            {/* Risk filter */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Min Risk</label>
              <input
                type="range" min="0" max="90" step="10"
                value={riskMin}
                onChange={(e) => { setRiskMin(Number(e.target.value)); setPage(0); }}
                className="w-28 h-1.5 bg-slate-800 rounded-full appearance-none accent-rose-500 cursor-pointer"
              />
              <span className="w-8 text-center font-mono text-rose-400 text-xs font-bold">{riskMin}</span>
            </div>

            {/* Refresh */}
            <button
              onClick={() => loadEvents(true)}
              disabled={refreshing}
              className="p-1.5 text-slate-500 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm font-mono">
            <thead className="bg-slate-950/80 text-slate-500 border-b border-slate-800">
              <tr>
                <th className="px-5 py-3 text-[10px] uppercase tracking-widest font-semibold cursor-pointer hover:text-slate-300" onClick={() => handleSort('timestamp')}>
                  Timestamp <SortIcon col="timestamp" />
                </th>
                <th className="px-5 py-3 text-[10px] uppercase tracking-widest font-semibold">Source IP</th>
                <th className="px-5 py-3 text-[10px] uppercase tracking-widest font-semibold cursor-pointer hover:text-slate-300" onClick={() => handleSort('app_name')}>
                  Target App <SortIcon col="app_name" />
                </th>
                <th className="px-5 py-3 text-[10px] uppercase tracking-widest font-semibold cursor-pointer hover:text-slate-300" onClick={() => handleSort('upload_download_ratio')}>
                  Up/Down <SortIcon col="upload_download_ratio" />
                </th>
                <th className="px-5 py-3 text-[10px] uppercase tracking-widest font-semibold cursor-pointer hover:text-slate-300" onClick={() => handleSort('risk_score')}>
                  Risk <SortIcon col="risk_score" />
                </th>
                <th className="px-5 py-3 text-[10px] uppercase tracking-widest font-semibold">Status / Flags</th>
                <th className="px-5 py-3 text-[10px] uppercase tracking-widest font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-cyan-500 font-mono text-sm animate-pulse">
                    DECRYPTING THREAT LOGS...
                  </td>
                </tr>
              ) : sortedEvents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-slate-600 font-mono text-sm">
                    No events at this threshold
                  </td>
                </tr>
              ) : (
                sortedEvents.map((ev, i) => (
                  <tr key={ev._id || i} className="hover:bg-slate-800/40 transition-colors group">
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap text-[11px]">
                      {ev.timestamp
                        ? new Date(ev.timestamp).toLocaleString('en-US', { hour12: false })
                        : '—'}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className="text-cyan-400 font-bold text-[12px]">{ev.source_ip}</span>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-slate-200">{ev.app_name}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-amber-400">
                      {Number(ev.upload_download_ratio ?? 0).toFixed(2)}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${RISK_BADGE(ev.risk_score)}`}>
                        {Number(ev.risk_score ?? 0).toFixed(1)}
                      </span>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT(ev.is_anomalous)}`} />
                          <span className={`text-[11px] font-bold tracking-wider ${ev.is_anomalous ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {ev.risk_level || (ev.is_anomalous ? 'ANOMALY' : 'CLEAN')}
                          </span>
                        </div>
                        {ev.is_genai_exfiltration && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[9px] font-bold rounded uppercase tracking-wider w-fit">
                            <Brain className="w-2.5 h-2.5" /> GenAI Exfil
                          </span>
                        )}
                        {ev.risk_reasons?.length > 0 && (
                          <span className="text-[9px] text-slate-500 truncate max-w-[140px]" title={ev.risk_reasons.join(' | ')}>
                            {ev.risk_reasons[0]}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => handleQuarantine(ev.source_ip)}
                        disabled={quarantining === ev.source_ip}
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 text-[10px] font-bold rounded uppercase tracking-wider transition-all disabled:opacity-50"
                        title={`Quarantine ${ev.source_ip}`}
                      >
                        <Ban className="w-3 h-3" />
                        {quarantining === ev.source_ip ? 'Blocking...' : 'Quarantine'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-5 py-3 border-t border-slate-800/80 bg-slate-950/40 flex items-center justify-between">
          <span className="text-[11px] font-mono text-slate-500">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()} events
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 text-slate-500 hover:text-slate-200 disabled:opacity-30 hover:bg-slate-800 rounded transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono text-slate-400 px-2">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 text-slate-500 hover:text-slate-200 disabled:opacity-30 hover:bg-slate-800 rounded transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
