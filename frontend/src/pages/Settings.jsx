import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon, Shield, Download, Ban, BookOpen,
  Plus, Trash2, RefreshCw, CheckCircle, AlertTriangle, Unlock, X,
} from 'lucide-react';
import {
  fetchPolicies, createPolicy,
  exportEventsCsv,
  downloadShadowItReport, downloadGenAIReport,
  downloadQuarantineLog, downloadRiskTrends,
  fetchQuarantinedIPs, quarantineIP, unquarantineIP,
  fetchPlaybooks, createPlaybook,
  clearAllEvents,
} from '../services/api';

// ── Shared UI helpers ────────────────────────────────────────────────────────

function TabButton({ active, onClick, icon: Icon, label, badge }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-mono font-medium rounded-lg transition-all
        ${active
          ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
        }`}
    >
      <Icon className="w-4 h-4" />
      {label}
      {badge != null && badge > 0 && (
        <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-rose-500/20 text-rose-400 rounded-full font-bold">
          {badge}
        </span>
      )}
    </button>
  );
}

function SectionCard({ title, subtitle, children, accent = 'cyan' }) {
  const borders = { cyan: 'border-t-cyan-500', rose: 'border-t-rose-500', amber: 'border-t-amber-500', purple: 'border-t-purple-500' };
  return (
    <div className={`glass-panel rounded-xl border-t-4 ${borders[accent] || borders.cyan}`}>
      <div className="px-6 py-4 border-b border-slate-800/80">
        <h2 className="text-sm font-mono font-bold text-slate-200">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 font-mono mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function InputRow({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-mono text-slate-500 uppercase tracking-widest">{label}</label>
      {children}
    </div>
  );
}

const INPUT_CLS = 'w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors';
const BTN_PRIMARY = 'flex items-center gap-2 px-4 py-2 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold uppercase tracking-wider rounded-lg transition-all disabled:opacity-40';
const BTN_DANGER  = 'flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-[11px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all disabled:opacity-40';
const BTN_SUCCESS = 'flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[11px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all disabled:opacity-40';

// ── Policies Tab ─────────────────────────────────────────────────────────────

function ACTION_BADGE(action) {
  const m = {
    alert:      'bg-amber-500/15 text-amber-400 border-amber-500/30',
    block:      'bg-rose-500/15 text-rose-400 border-rose-500/30',
    quarantine: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    log_only:   'bg-slate-700 text-slate-400 border-slate-600',
  };
  return `inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border font-mono uppercase ${m[action] || m.log_only}`;
}

function PoliciesTab() {
  const [policies, setPolicies]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [toast, setToast]         = useState(null);
  const [form, setForm] = useState({
    name: '', description: '', conditions: '{}', action: 'alert',
  });

  const showMsg = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    setLoading(true);
    try { setPolicies(await fetchPolicies() || []); }
    catch { setPolicies([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    let conditions;
    try { conditions = JSON.parse(form.conditions); }
    catch { showMsg('Conditions must be valid JSON', 'error'); return; }
    setSaving(true);
    try {
      await createPolicy({ name: form.name, description: form.description, conditions, action: form.action });
      showMsg('Policy created successfully');
      setShowForm(false);
      setForm({ name: '', description: '', conditions: '{}', action: 'alert' });
      load();
    } catch (err) {
      showMsg(err?.response?.data?.detail || 'Failed to create policy', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      {toast && (
        <div className={`px-4 py-3 rounded-lg border font-mono text-sm
          ${toast.type === 'error' ? 'bg-rose-950/50 border-rose-500/50 text-rose-300' : 'bg-emerald-950/50 border-emerald-500/50 text-emerald-300'}`}>
          {toast.msg}
        </div>
      )}

      <SectionCard
        title="Security Policies"
        subtitle={`${policies.length} active policies`}
        accent="cyan"
      >
        <div className="flex justify-end mb-4">
          <button onClick={() => setShowForm((v) => !v)} className={BTN_PRIMARY}>
            {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showForm ? 'Cancel' : 'New Policy'}
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <form onSubmit={handleCreate} className="mb-6 p-5 bg-slate-900/60 rounded-xl border border-slate-700/50 space-y-4">
            <h3 className="text-xs font-mono text-cyan-400 uppercase tracking-widest mb-1">Create Policy</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputRow label="Policy Name">
                <input required className={INPUT_CLS} placeholder="e.g. Block High Risk" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </InputRow>
              <InputRow label="Action">
                <select className={INPUT_CLS} value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
                  <option value="alert">Alert</option>
                  <option value="block">Block</option>
                  <option value="quarantine">Quarantine</option>
                  <option value="log_only">Log Only</option>
                </select>
              </InputRow>
            </div>
            <InputRow label="Description">
              <input className={INPUT_CLS} placeholder="What this policy does..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </InputRow>
            <InputRow label="Conditions (JSON)">
              <textarea
                rows={3}
                className={`${INPUT_CLS} resize-none`}
                placeholder={'{"risk_score": {"$gte": 70}}'}
                value={form.conditions}
                onChange={(e) => setForm({ ...form, conditions: e.target.value })}
              />
            </InputRow>
            <div className="flex justify-end">
              <button type="submit" disabled={saving} className={BTN_PRIMARY}>
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {saving ? 'Creating...' : 'Create Policy'}
              </button>
            </div>
          </form>
        )}

        {/* Policy list */}
        {loading ? (
          <div className="text-center py-10 text-cyan-500 font-mono text-sm animate-pulse">Loading policies...</div>
        ) : policies.length === 0 ? (
          <div className="text-center py-10 text-slate-600 font-mono text-sm">No policies configured yet.</div>
        ) : (
          <div className="space-y-3">
            {policies.map((p, i) => (
              <div key={p._id || i} className="flex items-start justify-between gap-4 p-4 bg-slate-900/50 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-sm font-mono font-bold text-slate-200">{p.name}</span>
                    <span className={ACTION_BADGE(p.action)}>{p.action}</span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono">{p.description || 'No description'}</p>
                  <p className="text-[10px] text-slate-700 font-mono mt-1">
                    Conditions: {JSON.stringify(p.conditions)}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" title="Active" />
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Export Tab ───────────────────────────────────────────────────────────────

function triggerBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  window.URL.revokeObjectURL(url);
}

function ExportTab() {
  const [days, setDays]           = useState(30);
  const [csvDays, setCsvDays]     = useState(7);
  const [busy, setBusy]           = useState(null);
  const [toast, setToast]         = useState(null);

  const showMsg = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const dl = async (key, fn, filename) => {
    setBusy(key);
    try {
      const blob = await fn();
      triggerBlob(blob, filename);
      showMsg(`${filename} downloaded`);
    } catch {
      showMsg('Export failed — check that the backend is running', 'error');
    } finally { setBusy(null); }
  };

  const REPORTS = [
    {
      key:   'shadow-it',
      label: 'Shadow IT Report',
      desc:  'All unsanctioned / unreviewed SaaS apps with per-device breakdown',
      color: 'amber',
      ext:   'xlsx',
      fn:    () => downloadShadowItReport(days),
      file:  () => `shadow_it_${days}d.xlsx`,
    },
    {
      key:   'genai',
      label: 'GenAI DLP Report',
      desc:  'GenAI application activity, flagged DLP exfiltration events, and per-IP summary',
      color: 'purple',
      ext:   'xlsx',
      fn:    () => downloadGenAIReport(days),
      file:  () => `genai_report_${days}d.xlsx`,
    },
    {
      key:   'quarantine',
      label: 'Quarantine Log',
      desc:  'All quarantined IPs with firewall status and correlated audit trail',
      color: 'rose',
      ext:   'xlsx',
      fn:    () => downloadQuarantineLog(),
      file:  () => `quarantine_log.xlsx`,
    },
    {
      key:   'risk-trends',
      label: 'Risk Trends',
      desc:  'Daily aggregated risk metrics — avg/max score, anomaly count, top app',
      color: 'cyan',
      ext:   'xlsx',
      fn:    () => downloadRiskTrends(days),
      file:  () => `risk_trends_${days}d.xlsx`,
    },
  ];

  const colorMap = {
    amber:  { bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  text: 'text-amber-400',  btn: 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/30 text-amber-400'  },
    purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400', btn: 'bg-purple-500/15 hover:bg-purple-500/25 border-purple-500/30 text-purple-400' },
    rose:   { bg: 'bg-rose-500/10',   border: 'border-rose-500/20',   text: 'text-rose-400',   btn: 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/30 text-rose-400'   },
    cyan:   { bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20',   text: 'text-cyan-400',   btn: 'bg-cyan-500/15 hover:bg-cyan-500/25 border-cyan-500/30 text-cyan-400'   },
  };

  return (
    <div className="space-y-5">
      {toast && (
        <div className={`px-4 py-3 rounded-lg border font-mono text-sm
          ${toast.type === 'error' ? 'bg-rose-950/50 border-rose-500/50 text-rose-300' : 'bg-emerald-950/50 border-emerald-500/50 text-emerald-300'}`}>
          {toast.msg}
        </div>
      )}

      {/* Compliance Reports — Excel */}
      <SectionCard title="Compliance Reports" subtitle="Excel (.xlsx) reports with summary sheets — for audits and management reviews" accent="amber">
        <div className="mb-5">
          <InputRow label="Report Time Range">
            <select className={`${INPUT_CLS} max-w-xs`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </InputRow>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {REPORTS.map((r) => {
            const c = colorMap[r.color];
            const isBusy = busy === r.key;
            return (
              <div key={r.key} className={`rounded-xl p-5 border ${c.bg} ${c.border} flex flex-col gap-3`}>
                <div>
                  <div className={`text-sm font-mono font-bold ${c.text} mb-1`}>{r.label}</div>
                  <p className="text-xs font-mono text-slate-500 leading-relaxed">{r.desc}</p>
                </div>
                <button
                  onClick={() => dl(r.key, r.fn, r.file())}
                  disabled={!!busy}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-mono font-bold uppercase tracking-wider transition-all self-start disabled:opacity-40 ${c.btn}`}
                >
                  {isBusy
                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    : <Download className="w-3.5 h-3.5" />}
                  {isBusy ? 'Generating...' : `Download ${r.ext.toUpperCase()}`}
                </button>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Raw CSV */}
      <SectionCard title="Raw Event Export" subtitle="CSV dump for SIEM ingestion or custom analysis" accent="cyan">
        <div className="max-w-md space-y-5">
          <InputRow label="Time Range">
            <select className={INPUT_CLS} value={csvDays} onChange={(e) => setCsvDays(Number(e.target.value))}>
              <option value={1}>Last 24 hours</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </InputRow>
          <div className="p-4 bg-slate-900/50 border border-slate-700/50 rounded-lg">
            <p className="text-xs font-mono text-slate-500 mb-2">Columns included:</p>
            <ul className="text-xs font-mono text-slate-400 space-y-1">
              {['timestamp','source_ip','device_name','mac_address','app_name','bytes_sent','risk_score','risk_level','is_anomalous','is_genai_exfiltration'].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-cyan-500" />{f}
                </li>
              ))}
            </ul>
          </div>
          <button
            onClick={() => dl('csv', () => exportEventsCsv(csvDays), `shadowsaas_events_${csvDays}d.csv`)}
            disabled={!!busy}
            className={BTN_PRIMARY}
          >
            {busy === 'csv'
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : <Download className="w-4 h-4" />}
            {busy === 'csv' ? 'Preparing...' : `Download CSV (${csvDays}d)`}
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

// ── Response Tab ─────────────────────────────────────────────────────────────

function ResponseTab() {
  const [quarantined, setQuarantined] = useState([]);
  const [playbooks, setPlaybooks]     = useState([]);
  const [loadingQ, setLoadingQ]       = useState(true);
  const [loadingP, setLoadingP]       = useState(true);
  const [ipInput, setIpInput]         = useState('');
  const [blocking, setBlocking]       = useState(null);
  const [toast, setToast]             = useState(null);
  const [pbForm, setPbForm] = useState({
    name: '', condition_metric: 'risk_score', condition_operator: '>',
    condition_value: '70', action: 'QUARANTINE',
  });
  const [savingPb, setSavingPb] = useState(false);
  const [showPbForm, setShowPbForm] = useState(false);

  const showMsg = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadQuarantined = async () => {
    setLoadingQ(true);
    try { setQuarantined(await fetchQuarantinedIPs() || []); }
    catch { setQuarantined([]); }
    finally { setLoadingQ(false); }
  };

  const loadPlaybooks = async () => {
    setLoadingP(true);
    try { setPlaybooks(await fetchPlaybooks() || []); }
    catch { setPlaybooks([]); }
    finally { setLoadingP(false); }
  };

  useEffect(() => { loadQuarantined(); loadPlaybooks(); }, []);

  const handleQuarantine = async () => {
    const ip = ipInput.trim();
    if (!ip) return;
    setBlocking(ip);
    try {
      const res = await quarantineIP(ip);
      if (res?.status === 'already_quarantined') showMsg(`${ip} already quarantined`, 'info');
      else showMsg(`${ip} quarantined successfully`);
      setIpInput('');
      loadQuarantined();
    } catch {
      showMsg(`Failed to quarantine ${ip}`, 'error');
    } finally { setBlocking(null); }
  };

  const handleUnquarantine = async (ip) => {
    setBlocking(ip);
    try {
      await unquarantineIP(ip);
      showMsg(`${ip} unblocked`);
      loadQuarantined();
    } catch {
      showMsg(`Failed to unquarantine ${ip}`, 'error');
    } finally { setBlocking(null); }
  };

  const handleCreatePlaybook = async (e) => {
    e.preventDefault();
    setSavingPb(true);
    try {
      await createPlaybook({
        name: pbForm.name,
        condition_metric: pbForm.condition_metric,
        condition_operator: pbForm.condition_operator,
        condition_value: parseFloat(pbForm.condition_value),
        action: pbForm.action,
      });
      showMsg('Playbook created');
      setShowPbForm(false);
      setPbForm({ name: '', condition_metric: 'risk_score', condition_operator: '>', condition_value: '70', action: 'QUARANTINE' });
      loadPlaybooks();
    } catch {
      showMsg('Failed to create playbook', 'error');
    } finally { setSavingPb(false); }
  };

  return (
    <div className="space-y-5">
      {toast && (
        <div className={`px-4 py-3 rounded-lg border font-mono text-sm
          ${toast.type === 'error' ? 'bg-rose-950/50 border-rose-500/50 text-rose-300' :
            toast.type === 'info'  ? 'bg-slate-900/80 border-slate-700 text-slate-300' :
            'bg-emerald-950/50 border-emerald-500/50 text-emerald-300'}`}>
          {toast.msg}
        </div>
      )}

      {/* Quarantine */}
      <SectionCard
        title="IP Quarantine"
        subtitle="Real Windows Firewall enforcement via netsh advfirewall — blocks outbound traffic at OS level"
        accent="rose"
      >
        {/* Manual quarantine */}
        <div className="flex gap-3 mb-6">
          <input
            type="text"
            value={ipInput}
            onChange={(e) => setIpInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleQuarantine()}
            placeholder="192.168.1.x"
            className={`${INPUT_CLS} flex-1 max-w-xs`}
          />
          <button
            onClick={handleQuarantine}
            disabled={!ipInput.trim() || !!blocking}
            className={BTN_DANGER}
          >
            {blocking === ipInput.trim()
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <Ban className="w-3.5 h-3.5" />}
            Quarantine IP
          </button>
        </div>

        {/* Quarantined list */}
        {loadingQ ? (
          <div className="text-center py-8 text-rose-500 font-mono text-sm animate-pulse">Loading...</div>
        ) : quarantined.length === 0 ? (
          <div className="text-center py-8 text-slate-600 font-mono text-sm">No IPs quarantined</div>
        ) : (
          <div className="space-y-2">
            {quarantined.map((item, i) => (
              <div key={item._id || i} className="flex items-center justify-between p-3 bg-rose-950/20 border border-rose-500/20 rounded-lg">
                <div>
                  <span className="font-mono font-bold text-rose-300 text-sm">{item.ip}</span>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                    {item.reason} · {item.status}
                    {item.timestamp && ` · ${new Date(item.timestamp).toLocaleDateString()}`}
                  </p>
                </div>
                <button
                  onClick={() => handleUnquarantine(item.ip)}
                  disabled={blocking === item.ip}
                  className={BTN_SUCCESS}
                >
                  {blocking === item.ip
                    ? <RefreshCw className="w-3 h-3 animate-spin" />
                    : <Unlock className="w-3 h-3" />}
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Playbooks */}
      <SectionCard
        title="Automated Response Playbooks"
        subtitle="Define rules that trigger automatic actions"
        accent="purple"
      >
        <div className="flex justify-end mb-4">
          <button onClick={() => setShowPbForm((v) => !v)} className={BTN_PRIMARY}>
            {showPbForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showPbForm ? 'Cancel' : 'New Playbook'}
          </button>
        </div>

        {showPbForm && (
          <form onSubmit={handleCreatePlaybook} className="mb-5 p-5 bg-slate-900/60 border border-slate-700/50 rounded-xl space-y-4">
            <h3 className="text-xs font-mono text-purple-400 uppercase tracking-widest">Create Playbook</h3>
            <InputRow label="Playbook Name">
              <input required className={INPUT_CLS} placeholder="Auto-Quarantine Critical" value={pbForm.name} onChange={(e) => setPbForm({ ...pbForm, name: e.target.value })} />
            </InputRow>
            <div className="grid grid-cols-3 gap-3">
              <InputRow label="Metric">
                <select className={INPUT_CLS} value={pbForm.condition_metric} onChange={(e) => setPbForm({ ...pbForm, condition_metric: e.target.value })}>
                  <option value="risk_score">risk_score</option>
                  <option value="bytes_sent">bytes_sent</option>
                  <option value="anomaly_score">anomaly_score</option>
                </select>
              </InputRow>
              <InputRow label="Operator">
                <select className={INPUT_CLS} value={pbForm.condition_operator} onChange={(e) => setPbForm({ ...pbForm, condition_operator: e.target.value })}>
                  <option value=">">&gt;</option>
                  <option value=">=">&gt;=</option>
                  <option value="<">&lt;</option>
                </select>
              </InputRow>
              <InputRow label="Value">
                <input type="number" className={INPUT_CLS} value={pbForm.condition_value} onChange={(e) => setPbForm({ ...pbForm, condition_value: e.target.value })} />
              </InputRow>
            </div>
            <InputRow label="Action">
              <select className={INPUT_CLS} value={pbForm.action} onChange={(e) => setPbForm({ ...pbForm, action: e.target.value })}>
                <option value="QUARANTINE">QUARANTINE</option>
                <option value="ALERT">ALERT</option>
                <option value="LOG">LOG</option>
              </select>
            </InputRow>
            <div className="flex justify-end">
              <button type="submit" disabled={savingPb} className={BTN_PRIMARY}>
                {savingPb ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {savingPb ? 'Saving...' : 'Create Playbook'}
              </button>
            </div>
          </form>
        )}

        {loadingP ? (
          <div className="text-center py-8 text-purple-500 font-mono text-sm animate-pulse">Loading...</div>
        ) : playbooks.length === 0 ? (
          <div className="text-center py-8 text-slate-600 font-mono text-sm">No playbooks defined</div>
        ) : (
          <div className="space-y-2">
            {playbooks.map((pb, i) => (
              <div key={pb._id || i} className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-800 rounded-lg">
                <div>
                  <span className="text-sm font-mono font-bold text-slate-200">{pb.name}</span>
                  <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                    IF <span className="text-cyan-400">{pb.condition_metric}</span>{' '}
                    <span className="text-amber-400">{pb.condition_operator}</span>{' '}
                    <span className="text-cyan-400">{pb.condition_value}</span>{' '}
                    → <span className="text-purple-400 font-bold">{pb.action}</span>
                  </p>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-500" title="Active" />
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── System Tab ───────────────────────────────────────────────────────────────

function ClearDataButton() {
  const [state, setState] = useState('idle'); // idle | confirm | clearing | done
  const [result, setResult] = useState(null);

  const handleClear = async () => {
    setState('clearing');
    try {
      const r = await clearAllEvents();
      setResult(r);
      setState('done');
      setTimeout(() => { setState('idle'); setResult(null); }, 6000);
    } catch {
      setState('idle');
      alert('Clear failed — make sure you are logged in as admin');
    }
  };

  if (state === 'done') return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)' }}>
      <CheckCircle className="w-4 h-4" style={{ color: '#00ff88' }} />
      <span className="data-mono text-sm" style={{ color: '#00ff88' }}>
        Cleared: {result?.deleted_events} events · {result?.deleted_profiles} profiles · {result?.deleted_app_profiles} app profiles
      </span>
    </div>
  );

  if (state === 'confirm') return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)' }}>
      <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
      <span className="data-mono text-xs text-slate-300 flex-1">This deletes ALL events, profiles, and app data from MongoDB. Cannot be undone.</span>
      <button onClick={handleClear} className={BTN_DANGER}>Yes, Clear All</button>
      <button onClick={() => setState('idle')} className="data-mono text-xs text-slate-500 hover:text-slate-300 px-2">Cancel</button>
    </div>
  );

  return (
    <button onClick={() => setState('confirm')} className={BTN_DANGER}>
      <Trash2 className="w-3.5 h-3.5" />
      Clear Events Database
    </button>
  );
}

function SystemTab() {
  const INFO = [
    { label: 'Platform',        value: 'ShadowSaaS CASB — Shadow IT / GenAI DLP' },
    { label: 'Version',         value: 'v2.0 · Enterprise Feature Set' },
    { label: 'ML Engine',       value: 'Isolation Forest + UEBA + GenAI DLP' },
    { label: 'Detection',       value: 'Encrypted Traffic Analysis (ETA) · no TLS decryption' },
    { label: 'Auth',            value: 'OAuth2 password flow · JWT HS256' },
    { label: 'Database',        value: 'MongoDB · Motor async · TTL retention' },
    { label: 'Background Tasks','value': 'Policy engine · UEBA baseline · ML auto-train' },
    { label: 'Notifications',   value: 'SMTP email + Webhook (Slack/Teams)' },
    { label: 'Backend URL',     value: import.meta.env.VITE_API_URL || 'http://localhost:8000/api' },
  ];

  return (
    <div className="space-y-5">
      <SectionCard title="System Information" subtitle="Platform configuration overview" accent="cyan">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {INFO.map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center p-3 bg-slate-900/50 border border-slate-800/50 rounded-lg">
              <span className="text-xs font-mono text-slate-500 uppercase tracking-wider">{label}</span>
              <span className="text-xs font-mono text-slate-300 font-bold text-right max-w-[60%] truncate">{value}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Database Management" subtitle="Flush mock/test data before a live capture session" accent="rose">
        <div className="space-y-3">
          <p className="data-mono text-xs text-slate-500">
            If you ran <span className="text-amber-400">mock_traffic_generator.py</span> or have stale events from a previous session,
            clear them here so pages only show real network traffic from your sniffer.
          </p>
          <ClearDataButton />
        </div>
      </SectionCard>

      <SectionCard title="API Endpoints Reference" subtitle="All available backend routes" accent="amber">
        <div className="space-y-2 font-mono text-xs">
          {[
            ['POST', '/api/auth/token',                    'Login — OAuth2 form'],
            ['GET',  '/api/events',                        'Fetch events (paginated)'],
            ['POST', '/api/events/ingest',                 'Ingest from sniffer (API key auth)'],
            ['GET',  '/api/events/stats',                  'Dashboard statistics'],
            ['GET',  '/api/events/alerts',                 'Unacknowledged high-risk alerts'],
            ['GET',  '/api/analytics/users',               'Per-device behavioral profiles'],
            ['GET',  '/api/ml/model-info',                 'ML model status'],
            ['POST', '/api/ml/train',                      'Manual retrain on live data'],
            ['GET',  '/api/policies',                      'List security policies'],
            ['POST', '/api/policies',                      'Create auto-enforcement policy'],
            ['POST', '/api/quarantine/{ip}',               'Quarantine IP (netsh firewall)'],
            ['POST', '/api/unquarantine/{ip}',             'Remove firewall block'],
            ['GET',  '/api/audit-logs',                    'Admin audit trail (admin only)'],
            ['GET',  '/api/audit-logs/summary',            '30-day audit summary'],
            ['GET',  '/api/export/events.csv',             'Raw events CSV'],
            ['GET',  '/api/export/reports/shadow-it',      'Shadow IT Excel report'],
            ['GET',  '/api/export/reports/genai',          'GenAI DLP Excel report'],
            ['GET',  '/api/export/reports/quarantine-log', 'Quarantine log Excel report'],
            ['GET',  '/api/export/reports/risk-trends',    'Risk trend Excel report'],
          ].map(([method, path, desc]) => (
            <div key={path} className="flex items-center gap-3 p-2 bg-slate-900/40 rounded-lg">
              <span className={`w-12 text-center py-0.5 rounded text-[10px] font-bold
                ${method === 'GET' ? 'bg-emerald-500/15 text-emerald-400' :
                  method === 'POST' ? 'bg-cyan-500/15 text-cyan-400' : 'bg-amber-500/15 text-amber-400'}`}>
                {method}
              </span>
              <span className="text-slate-400 flex-shrink-0">{path}</span>
              <span className="text-slate-600 hidden md:block">{desc}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

// ── Main Settings Page ───────────────────────────────────────────────────────

const TABS = [
  { id: 'system',   label: 'System',   icon: SettingsIcon },
  { id: 'policies', label: 'Policies', icon: Shield       },
  { id: 'export',   label: 'Export',   icon: Download     },
  { id: 'response', label: 'Response', icon: Ban          },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState('system');

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="glass-panel p-5 rounded-xl border-l-4 border-l-slate-500">
        <h1 className="text-2xl font-bold font-mono text-slate-100 flex items-center gap-3">
          <SettingsIcon className="w-6 h-6 text-slate-400" />
          Platform Configuration
        </h1>
        <p className="text-slate-500 font-mono text-xs mt-1">
          System settings · Security policies · Automated response · Data export
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 p-1 bg-slate-900/40 border border-slate-800 rounded-xl w-fit">
        {TABS.map((t) => (
          <TabButton
            key={t.id}
            active={activeTab === t.id}
            onClick={() => setActiveTab(t.id)}
            icon={t.icon}
            label={t.label}
          />
        ))}
      </div>

      {/* Content */}
      <div className="animate-fade-in">
        {activeTab === 'system'   && <SystemTab />}
        {activeTab === 'policies' && <PoliciesTab />}
        {activeTab === 'export'   && <ExportTab />}
        {activeTab === 'response' && <ResponseTab />}
      </div>
    </div>
  );
}
