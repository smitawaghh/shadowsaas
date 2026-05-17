import React, { useState, useEffect, useCallback } from 'react';
import { fetchAuditLogs, fetchAuditSummary } from '../services/api';
import {
  ClipboardList, RefreshCw, ChevronLeft, ChevronRight,
  CheckCircle, XCircle, Filter, Activity,
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function ts(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); }
  catch { return iso; }
}

function ActionBadge({ action = '' }) {
  const upper = action.toUpperCase();
  const cls =
    upper.includes('QUARANTINE') || upper.includes('BLOCK') ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' :
    upper.includes('RETRAIN')    || upper.includes('MODEL')  ? 'bg-purple-500/15 text-purple-400 border-purple-500/30' :
    upper.includes('SANCTION')   || upper.includes('APP')    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
    upper.includes('POLICY')                                  ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' :
    upper.includes('LOGIN')      || upper.includes('AUTH')   ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
    'bg-slate-700/60 text-slate-400 border-slate-600/60';

  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase border ${cls}`}>
      {action}
    </span>
  );
}

function OutcomeBadge({ outcome }) {
  return outcome === 'SUCCESS' ? (
    <span className="flex items-center gap-1 text-emerald-400 font-mono text-[11px] font-semibold">
      <CheckCircle className="w-3 h-3" /> SUCCESS
    </span>
  ) : (
    <span className="flex items-center gap-1 text-rose-400 font-mono text-[11px] font-semibold">
      <XCircle className="w-3 h-3" /> FAILURE
    </span>
  );
}

// ── Summary strip ─────────────────────────────────────────────────────────────

function SummaryStrip({ summary }) {
  if (!summary) return null;
  const { actions = [], failures_30d = 0 } = summary;
  const total = actions.reduce((s, a) => s + a.count, 0);
  const topActions = actions.slice(0, 5);

  return (
    <div className="glass-panel rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-800/60 flex items-center gap-2">
        <Activity className="w-3.5 h-3.5 text-cyan-400" />
        <span className="text-xs font-mono font-semibold text-slate-300 uppercase tracking-widest">
          30-Day Activity Summary
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 divide-x divide-slate-800/60">
        <div className="px-4 py-3 text-center">
          <div className="data-mono text-[9px] text-slate-600 uppercase tracking-widest mb-1">Total Actions</div>
          <div className="data-mono text-sm font-bold text-cyan-400">{total.toLocaleString()}</div>
        </div>
        <div className="px-4 py-3 text-center">
          <div className="data-mono text-[9px] text-slate-600 uppercase tracking-widest mb-1">Failures</div>
          <div className={`data-mono text-sm font-bold ${failures_30d > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {failures_30d}
          </div>
        </div>
        {topActions.map((a) => (
          <div key={a.action} className="px-4 py-3 text-center hidden lg:block">
            <div className="data-mono text-[9px] text-slate-600 uppercase tracking-widest mb-1 truncate">{a.action}</div>
            <div className="data-mono text-sm font-bold text-amber-400">{a.count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export default function AuditLog() {
  const [records, setRecords]   = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(0);
  const [loading, setLoading]   = useState(true);
  const [summary, setSummary]   = useState(null);
  const [expanded, setExpanded] = useState(null);

  // Filters
  const [filters, setFilters] = useState({
    admin: '', action: '', outcome: '', date_from: '', date_to: '',
  });
  const [applied, setApplied]   = useState({});
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async (pg = page, flt = applied) => {
    setLoading(true);
    try {
      const params = {
        limit:  PAGE_SIZE,
        offset: pg * PAGE_SIZE,
        ...Object.fromEntries(Object.entries(flt).filter(([, v]) => v)),
      };
      const data = await fetchAuditLogs(params);
      setRecords(data.records || []);
      setTotal(data.total || 0);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [page, applied]);

  const loadSummary = async () => {
    try { setSummary(await fetchAuditSummary()); } catch { /* admin may not be logged in */ }
  };

  useEffect(() => { load(0, applied); loadSummary(); }, []);

  const applyFilters = () => {
    setApplied({ ...filters });
    setPage(0);
    load(0, filters);
  };

  const clearFilters = () => {
    const empty = { admin: '', action: '', outcome: '', date_from: '', date_to: '' };
    setFilters(empty);
    setApplied({});
    setPage(0);
    load(0, {});
  };

  const goPage = (p) => {
    setPage(p);
    load(p, applied);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasActive = Object.values(applied).some(Boolean);

  const INPUT = 'bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors';

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="glass-panel p-5 rounded-xl border-l-4 border-l-amber-500">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold font-mono text-slate-100 flex items-center gap-3">
              <ClipboardList className="w-6 h-6 text-amber-400" />
              Admin Audit Log
            </h1>
            <p className="text-slate-500 font-mono text-xs mt-1">
              Immutable append-only record of all admin actions &mdash; {total.toLocaleString()} total entries
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono font-bold uppercase tracking-wider transition-all
                ${showFilters || hasActive
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                  : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:text-slate-300'}`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters {hasActive && `(${Object.values(applied).filter(Boolean).length})`}
            </button>
            <button
              onClick={() => { load(page, applied); loadSummary(); }}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 text-xs font-mono rounded-lg transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Summary */}
      <SummaryStrip summary={summary} />

      {/* Filter panel */}
      {showFilters && (
        <div className="glass-panel p-5 rounded-xl border border-amber-500/20 space-y-4">
          <h3 className="text-[10px] font-mono text-amber-400 uppercase tracking-widest">Filter Audit Records</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <input className={INPUT} placeholder="Admin username" value={filters.admin}
              onChange={(e) => setFilters({ ...filters, admin: e.target.value })} />
            <input className={INPUT} placeholder="Action type" value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })} />
            <select className={INPUT} value={filters.outcome}
              onChange={(e) => setFilters({ ...filters, outcome: e.target.value })}>
              <option value="">All outcomes</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="FAILURE">FAILURE</option>
            </select>
            <input type="date" className={INPUT} value={filters.date_from}
              onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
            <input type="date" className={INPUT} value={filters.date_to}
              onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button onClick={applyFilters}
              className="flex items-center gap-2 px-4 py-1.5 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-400 text-[11px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all">
              Apply Filters
            </button>
            <button onClick={clearFilters}
              className="px-3 py-1.5 text-slate-500 hover:text-slate-300 text-[11px] font-mono rounded-lg transition-colors">
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800/60 flex items-center justify-between">
          <span className="text-xs font-mono font-semibold text-slate-300 uppercase tracking-widest">
            Audit Records
          </span>
          <span className="data-mono text-[10px] text-slate-600">
            {loading ? 'Loading…' : `${records.length} of ${total.toLocaleString()} records`}
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <RefreshCw className="w-6 h-6 text-amber-400/40 mx-auto animate-spin" />
            <p className="data-mono text-xs text-slate-600 mt-3">Loading audit records…</p>
          </div>
        ) : records.length === 0 ? (
          <div className="py-16 text-center">
            <ClipboardList className="w-8 h-8 text-slate-700 mx-auto mb-3" />
            <p className="data-mono text-xs text-slate-600">No audit records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="bg-slate-900/60">
                  {['Timestamp', 'Admin', 'Action', 'Resource', 'Outcome', 'Detail'].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] text-slate-600 uppercase tracking-widest font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {records.map((rec) => {
                  const isExp = expanded === rec._id;
                  return (
                    <React.Fragment key={rec._id}>
                      <tr
                        onClick={() => setExpanded(isExp ? null : rec._id)}
                        className="hover:bg-slate-800/30 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">{ts(rec.timestamp)}</td>
                        <td className="px-4 py-2.5 text-cyan-300 font-semibold">{rec.admin}</td>
                        <td className="px-4 py-2.5"><ActionBadge action={rec.action} /></td>
                        <td className="px-4 py-2.5 text-slate-400">
                          <span className="text-slate-600">{rec.resource_type}:</span>{' '}
                          <span className="text-slate-300">{rec.resource_id}</span>
                        </td>
                        <td className="px-4 py-2.5"><OutcomeBadge outcome={rec.outcome} /></td>
                        <td className="px-4 py-2.5 text-slate-500 max-w-[240px] truncate">{rec.detail}</td>
                      </tr>
                      {isExp && (
                        <tr className="bg-slate-900/60">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <div className="text-[10px] text-slate-600 uppercase tracking-widest mb-2">Before State</div>
                                <pre className="text-[11px] text-slate-400 bg-slate-950/60 rounded-lg p-3 overflow-x-auto max-h-32">
                                  {JSON.stringify(rec.before, null, 2) || 'null'}
                                </pre>
                              </div>
                              <div>
                                <div className="text-[10px] text-slate-600 uppercase tracking-widest mb-2">After State</div>
                                <pre className="text-[11px] text-slate-400 bg-slate-950/60 rounded-lg p-3 overflow-x-auto max-h-32">
                                  {JSON.stringify(rec.after, null, 2) || 'null'}
                                </pre>
                              </div>
                            </div>
                            <div className="mt-3 text-[10px] text-slate-600">
                              Admin IP: <span className="text-slate-400">{rec.admin_ip}</span>
                              &nbsp;·&nbsp; Record ID: <span className="text-slate-700">{rec._id}</span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-800/60 flex items-center justify-between">
            <span className="data-mono text-[10px] text-slate-600">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => goPage(page - 1)}
                disabled={page === 0}
                className="p-1.5 rounded-lg border border-slate-700 text-slate-500 hover:text-slate-200 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => goPage(page + 1)}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg border border-slate-700 text-slate-500 hover:text-slate-200 disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
