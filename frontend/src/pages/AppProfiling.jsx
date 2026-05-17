import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ScatterChart, Scatter, ZAxis, Cell, PieChart, Pie,
} from 'recharts';
import {
  Package, ShieldAlert, CheckCircle, Clock, RefreshCw,
  AlertTriangle, Filter, Download, Search, TrendingUp,
} from 'lucide-react';
import { fetchRecentEvents, fetchAppProfiles, updateAppSanctionStatus, exportEventsCsv } from '../services/api';

// ── Comprehensive SaaS catalog ─────────────────────────────────────────────
const STATIC_CATALOG = {
  // Sanctioned enterprise collaboration
  'Microsoft 365':               { category: 'Collaboration',          status: 'Sanctioned',   tags: ['SOC2', 'GDPR', 'Enterprise'] },
  'Microsoft Teams':             { category: 'Collaboration',          status: 'Sanctioned',   tags: ['SOC2', 'GDPR', 'Enterprise'] },
  'Microsoft Copilot (GenAI)':   { category: 'Generative AI',          status: 'Under Review', tags: ['Code Leakage Risk', 'Enterprise AI'] },
  'Microsoft Dynamics':          { category: 'CRM / ERP',              status: 'Sanctioned',   tags: ['SOC2', 'GDPR', 'Enterprise'] },
  'Microsoft Azure':             { category: 'Cloud Platform',         status: 'Sanctioned',   tags: ['SOC2', 'Enterprise'] },
  'Google Workspace':            { category: 'Collaboration',          status: 'Sanctioned',   tags: ['SOC2', 'GDPR', 'Enterprise'] },
  'Google Cloud':                { category: 'Cloud Platform',         status: 'Sanctioned',   tags: ['SOC2', 'Enterprise'] },
  'Salesforce':                  { category: 'CRM',                    status: 'Sanctioned',   tags: ['SOC2', 'GDPR', 'Enterprise'] },
  'Slack':                       { category: 'Collaboration',          status: 'Sanctioned',   tags: ['SOC2', 'GDPR', 'Enterprise'] },
  'Zoom':                        { category: 'Video Conferencing',     status: 'Sanctioned',   tags: ['SOC2', 'GDPR'] },
  'Webex':                       { category: 'Video Conferencing',     status: 'Sanctioned',   tags: ['SOC2', 'Cisco'] },
  'Cisco / Webex':               { category: 'Video Conferencing',     status: 'Sanctioned',   tags: ['SOC2', 'Cisco'] },
  'Okta':                        { category: 'Identity & Access',      status: 'Sanctioned',   tags: ['SOC2', 'GDPR', 'SSO'] },
  'Auth0':                       { category: 'Identity & Access',      status: 'Under Review', tags: ['SSO', 'Review Required'] },
  'OneLogin':                    { category: 'Identity & Access',      status: 'Under Review', tags: ['SSO'] },
  'Workday':                     { category: 'HR / Finance',           status: 'Sanctioned',   tags: ['SOC2', 'GDPR', 'Enterprise'] },
  'BambooHR':                    { category: 'HR',                     status: 'Under Review', tags: ['Review Required'] },
  'ServiceNow':                  { category: 'ITSM',                   status: 'Sanctioned',   tags: ['SOC2', 'Enterprise'] },
  'Zendesk':                     { category: 'Customer Support',       status: 'Sanctioned',   tags: ['SOC2', 'GDPR'] },
  'HubSpot':                     { category: 'Marketing CRM',          status: 'Sanctioned',   tags: ['GDPR'] },
  'Figma':                       { category: 'Design',                 status: 'Sanctioned',   tags: ['SOC2'] },
  'Canva':                       { category: 'Design',                 status: 'Under Review', tags: ['Review Required'] },
  'Miro':                        { category: 'Collaboration',          status: 'Under Review', tags: ['Review Required'] },
  'Lucidchart':                  { category: 'Collaboration',          status: 'Under Review', tags: ['Review Required'] },
  'GitHub':                      { category: 'Developer Tools',        status: 'Sanctioned',   tags: ['SOC2', 'Code Repository'] },
  'GitLab':                      { category: 'Developer Tools',        status: 'Under Review', tags: ['Code Repository', 'Review Required'] },
  'Bitbucket':                   { category: 'Developer Tools',        status: 'Under Review', tags: ['Code Repository'] },
  'Atlassian':                   { category: 'Developer Tools',        status: 'Sanctioned',   tags: ['SOC2', 'GDPR', 'Enterprise'] },
  'Atlassian / Jira':            { category: 'Project Management',     status: 'Sanctioned',   tags: ['SOC2', 'GDPR'] },
  'Atlassian / Confluence':      { category: 'Knowledge Base',         status: 'Sanctioned',   tags: ['SOC2', 'GDPR'] },
  'AWS':                         { category: 'Cloud Platform',         status: 'Sanctioned',   tags: ['SOC2', 'Enterprise'] },
  'AWS CloudFront':              { category: 'CDN',                    status: 'Sanctioned',   tags: ['Infrastructure'] },
  'Cloudflare CDN':              { category: 'CDN',                    status: 'Sanctioned',   tags: ['Infrastructure'] },
  'Cloudflare DNS':              { category: 'DNS / Infrastructure',   status: 'Sanctioned',   tags: ['Infrastructure'] },
  'Google DNS':                  { category: 'DNS / Infrastructure',   status: 'Sanctioned',   tags: ['Infrastructure'] },
  'Apple iCloud':                { category: 'Cloud Storage',          status: 'Under Review', tags: ['Personal Storage', 'Review Required'] },
  'Notion':                      { category: 'Productivity',           status: 'Under Review', tags: ['Data Sovereignty', 'Review Required'] },
  'Evernote':                    { category: 'Productivity',           status: 'Under Review', tags: ['Review Required'] },
  'Trello':                      { category: 'Project Management',     status: 'Under Review', tags: ['Atlassian'] },
  'Airtable':                    { category: 'Productivity',           status: 'Under Review', tags: ['Review Required'] },
  'Asana':                       { category: 'Project Management',     status: 'Under Review', tags: ['Review Required'] },
  'Monday.com':                  { category: 'Project Management',     status: 'Under Review', tags: ['Review Required'] },
  'ClickUp':                     { category: 'Project Management',     status: 'Under Review', tags: ['Review Required'] },
  'Basecamp':                    { category: 'Project Management',     status: 'Under Review', tags: ['Review Required'] },
  'Box':                         { category: 'Cloud Storage',          status: 'Under Review', tags: ['SOC2', 'Review Required'] },
  'LinkedIn':                    { category: 'Social Network',         status: 'Under Review', tags: ['Limited Use Policy'] },
  // Generative AI — unsanctioned by default
  'ChatGPT (GenAI)':             { category: 'Generative AI',          status: 'Unsanctioned', tags: ['Risk: Data Ownership', 'No BAA', 'Training Risk'] },
  'Claude (GenAI)':              { category: 'Generative AI',          status: 'Unsanctioned', tags: ['Risk: Data Ownership', 'Training Risk'] },
  'Gemini (GenAI)':              { category: 'Generative AI',          status: 'Unsanctioned', tags: ['Risk: Data Ownership', 'Google AI'] },
  'Perplexity (GenAI)':          { category: 'Generative AI',          status: 'Unsanctioned', tags: ['Risk: Data Ownership'] },
  'Character.AI (GenAI)':        { category: 'Generative AI',          status: 'Unsanctioned', tags: ['Risk: Data Ownership', 'High Risk'] },
  'HuggingFace (GenAI)':         { category: 'Generative AI',          status: 'Unsanctioned', tags: ['Model Risk', 'Open Source Risk'] },
  'Midjourney (GenAI)':          { category: 'Generative AI',          status: 'Unsanctioned', tags: ['IP Risk', 'Content Risk'] },
  'Poe (GenAI)':                 { category: 'Generative AI',          status: 'Unsanctioned', tags: ['Risk: Data Ownership'] },
  'Cohere (GenAI)':              { category: 'Generative AI',          status: 'Unsanctioned', tags: ['Risk: Data Ownership'] },
  'Mistral (GenAI)':             { category: 'Generative AI',          status: 'Unsanctioned', tags: ['Risk: Data Ownership'] },
  'Groq (GenAI)':                { category: 'Generative AI',          status: 'Unsanctioned', tags: ['Risk: Data Ownership'] },
  'Stability AI (GenAI)':        { category: 'Generative AI',          status: 'Unsanctioned', tags: ['IP Risk', 'Content Risk'] },
  'Together.ai (GenAI)':         { category: 'Generative AI',          status: 'Unsanctioned', tags: ['Risk: Data Ownership'] },
  'GitHub Copilot':              { category: 'Developer AI',           status: 'Under Review', tags: ['SOC2', 'Code Leakage Risk'] },
  // Shadow storage / file transfer
  'Dropbox (Personal)':          { category: 'Cloud Storage',          status: 'Unsanctioned', tags: ['Data Exfiltration Risk', 'Personal Account'] },
  'AWS S3 (Shadow)':             { category: 'IaaS / Storage',         status: 'High Risk',    tags: ['Public Bucket Risk', 'Data Exfiltration Risk'] },
  'WeTransfer':                  { category: 'File Transfer',          status: 'Unsanctioned', tags: ['Data Exfiltration Risk', 'No DLP'] },
  'SendSpace (Shadow)':          { category: 'File Transfer',          status: 'High Risk',    tags: ['Anonymous Upload', 'Data Exfiltration Risk'] },
  'FileBin (Shadow)':            { category: 'File Transfer',          status: 'High Risk',    tags: ['Anonymous Upload', 'Data Exfiltration Risk'] },
  'File.io (Shadow)':            { category: 'File Transfer',          status: 'High Risk',    tags: ['Anonymous Upload', 'Data Exfiltration Risk'] },
  'GoFile (Shadow)':             { category: 'File Transfer',          status: 'High Risk',    tags: ['Anonymous Upload', 'Unmonitored'] },
  'AnonFiles (High Risk)':       { category: 'File Transfer',          status: 'High Risk',    tags: ['Anonymous Upload', 'CRITICAL Risk'] },
  // Social media — unsanctioned
  'Facebook (Unsanctioned)':     { category: 'Social Media',           status: 'Unsanctioned', tags: ['Policy Violation', 'Productivity Risk'] },
  'Instagram (Unsanctioned)':    { category: 'Social Media',           status: 'Unsanctioned', tags: ['Policy Violation', 'Productivity Risk'] },
  'Twitter/X (Unsanctioned)':    { category: 'Social Media',           status: 'Unsanctioned', tags: ['Policy Violation', 'Data Leakage Risk'] },
  'TikTok (Unsanctioned)':       { category: 'Social Media',           status: 'High Risk',    tags: ['Policy Violation', 'Data Risk', 'Geo Risk'] },
  'Reddit (Unsanctioned)':       { category: 'Social Media',           status: 'Unsanctioned', tags: ['Policy Violation', 'Data Leakage Risk'] },
  'YouTube (Unsanctioned)':      { category: 'Streaming',              status: 'Under Review', tags: ['Productivity Risk', 'Bandwidth'] },
  'Discord (Unsanctioned)':      { category: 'Communication',          status: 'Unsanctioned', tags: ['Policy Violation', 'Shadow Comms'] },
  'WhatsApp (Unsanctioned)':     { category: 'Communication',          status: 'Unsanctioned', tags: ['Policy Violation', 'Shadow Comms', 'E2E Encryption'] },
  'Telegram (Unsanctioned)':     { category: 'Communication',          status: 'High Risk',    tags: ['Policy Violation', 'Encryption Risk', 'Shadow Comms'] },
  // Paste / code share — high risk
  'Pastebin (High Risk)':        { category: 'Code / Data Share',      status: 'High Risk',    tags: ['Data Exfiltration Risk', 'Code Leakage', 'Public'] },
  'Tor Browser (High Risk)':     { category: 'Anonymization',          status: 'High Risk',    tags: ['Policy Violation', 'CRITICAL Risk', 'DLP Bypass'] },
  'AnonFiles (High Risk)':       { category: 'File Transfer',          status: 'High Risk',    tags: ['Anonymous Upload', 'CRITICAL Risk'] },
  // Shadow VPN
  'NordVPN (Shadow IT)':         { category: 'VPN / Proxy',            status: 'High Risk',    tags: ['Policy Violation', 'Traffic Obfuscation', 'DLP Bypass'] },
  'ExpressVPN (Shadow IT)':      { category: 'VPN / Proxy',            status: 'High Risk',    tags: ['Policy Violation', 'DLP Bypass'] },
  'ProtonVPN (Shadow IT)':       { category: 'VPN / Proxy',            status: 'High Risk',    tags: ['Policy Violation', 'Traffic Obfuscation'] },
  'TunnelBear VPN (Shadow IT)':  { category: 'VPN / Proxy',            status: 'High Risk',    tags: ['Policy Violation', 'DLP Bypass'] },
  'CyberGhost VPN (Shadow IT)':  { category: 'VPN / Proxy',            status: 'High Risk',    tags: ['Policy Violation', 'DLP Bypass'] },
  'Surfshark VPN (Shadow IT)':   { category: 'VPN / Proxy',            status: 'High Risk',    tags: ['Policy Violation', 'DLP Bypass'] },
  'Mullvad VPN (Shadow IT)':     { category: 'VPN / Proxy',            status: 'High Risk',    tags: ['Policy Violation', 'Anonymization'] },
  'Google DNS / Exfil Tunnel':   { category: 'DNS Tunneling',          status: 'High Risk',    tags: ['DNS Exfiltration Risk', 'CRITICAL Risk'] },
  'Fastly CDN':                  { category: 'CDN',                    status: 'Sanctioned',   tags: ['Infrastructure'] },
  'Apple':                       { category: 'Cloud / Consumer',       status: 'Under Review', tags: ['Review Required'] },
};

const CATEGORY_COLORS = {
  'Collaboration':        '#22d3ee',
  'CRM':                  '#34d399',
  'Generative AI':        '#c084fc',
  'Developer AI':         '#a78bfa',
  'Developer Tools':      '#60a5fa',
  'Cloud Storage':        '#fbbf24',
  'IaaS / Storage':       '#f97316',
  'File Transfer':        '#fb7185',
  'Social Media':         '#f43f5e',
  'Communication':        '#f59e0b',
  'VPN / Proxy':          '#ef4444',
  'Anonymization':        '#dc2626',
  'Code / Data Share':    '#ef4444',
  'DNS Tunneling':        '#dc2626',
  'Video Conferencing':   '#06b6d4',
  'Cloud Platform':       '#3b82f6',
  'Identity & Access':    '#8b5cf6',
  'Streaming':            '#f97316',
  'Project Management':   '#10b981',
};

const STATUS_CONFIG = {
  'Sanctioned':   { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: CheckCircle },
  'Under Review': { cls: 'bg-amber-500/15  text-amber-400  border-amber-500/30',    icon: Clock       },
  'Unsanctioned': { cls: 'bg-rose-500/15   text-rose-400   border-rose-500/30',     icon: ShieldAlert },
  'High Risk':    { cls: 'bg-rose-700/20   text-rose-300   border-rose-600/40',     icon: AlertTriangle },
};

const CATEGORY_FILTER_OPTIONS = [
  'All', 'Collaboration', 'Generative AI', 'Developer Tools', 'Cloud Storage',
  'File Transfer', 'Social Media', 'VPN / Proxy', 'High Risk',
];

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['Under Review'];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border font-mono ${cfg.cls}`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
}

function CategoryPill({ category }) {
  const color = CATEGORY_COLORS[category] || '#94a3b8';
  return (
    <span className="text-[10px] font-mono px-2 py-0.5 rounded border"
      style={{ borderColor: `${color}40`, color, background: `${color}10` }}>
      {category}
    </span>
  );
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-slate-950/95 border border-amber-500/30 px-3 py-3 rounded-lg font-mono text-xs shadow-xl backdrop-blur-sm">
      <p className="text-amber-400 font-bold mb-2 border-b border-slate-800 pb-1">{d.name}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4"><span className="text-slate-500">Category</span><span className="text-cyan-400">{d.category}</span></div>
        <div className="flex justify-between gap-4"><span className="text-slate-500">Upload</span><span className="text-amber-400 font-bold">{d.totalUpload?.toFixed(2)} MB</span></div>
        <div className="flex justify-between gap-4"><span className="text-slate-500">Avg Risk</span><span className={d.avgRisk > 60 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>{d.avgRisk?.toFixed(1)}</span></div>
        <div className="flex justify-between gap-4"><span className="text-slate-500">Anomalies</span><span className="text-slate-200">{d.anomalies}</span></div>
        <div className="flex justify-between gap-4"><span className="text-slate-500">Events</span><span className="text-slate-200">{d.totalEvents}</span></div>
      </div>
    </div>
  );
}

// Category distribution pie
function CategoryPie({ data }) {
  const catMap = data.reduce((acc, app) => {
    const cat = app.category || 'Unknown';
    if (!acc[cat]) acc[cat] = 0;
    acc[cat] += app.totalEvents;
    return acc;
  }, {});
  const pieData = Object.entries(catMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <div className="h-[340px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
            paddingAngle={3} dataKey="value" nameKey="name" stroke="none">
            {pieData.map((entry, i) => (
              <Cell key={i} fill={CATEGORY_COLORS[entry.name] || '#475569'} fillOpacity={0.8} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: 'rgba(2,6,23,0.95)', border: '1px solid #334155', borderRadius: 8, fontFamily: 'monospace', fontSize: 11 }}
            formatter={(val, name) => [val + ' events', name]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function AppProfiling() {
  const [appData, setAppData]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [toggling, setToggling]       = useState(null);
  const [toast, setToast]             = useState(null);
  const [search, setSearch]           = useState('');
  const [catFilter, setCatFilter]     = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortBy, setSortBy]           = useState('totalUpload');
  const [selectedApp, setSelectedApp] = useState(null);

  const showMsg = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [eventsResp, profilesResp] = await Promise.allSettled([
        fetchRecentEvents(500),
        fetchAppProfiles(),
      ]);

      const raw = eventsResp.status === 'fulfilled' ? eventsResp.value : null;
      const arr = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];

      const grouped = arr.reduce((acc, e) => {
        const name = e.app_name || 'Unknown';
        if (!acc[name]) acc[name] = { name, totalEvents: 0, totalUpload: 0, riskSum: 0, anomalies: 0, genaiEvents: 0, firstSeen: e.timestamp, lastSeen: e.timestamp };
        acc[name].totalEvents  += 1;
        acc[name].totalUpload  += (e.bytes_sent || 0) / 1048576;
        acc[name].riskSum      += e.risk_score || 0;
        if (e.is_anomalous) acc[name].anomalies += 1;
        if (e.is_genai_exfiltration) acc[name].genaiEvents += 1;
        if (e.timestamp > acc[name].lastSeen) acc[name].lastSeen = e.timestamp;
        if (e.timestamp < acc[name].firstSeen) acc[name].firstSeen = e.timestamp;
        return acc;
      }, {});

      // Build DB profile map — FIXED: use p.category from DB, not p.risk_level
      const profiles = profilesResp.status === 'fulfilled' ? (profilesResp.value || []) : [];
      const dbMap = {};
      profiles.forEach((p) => {
        dbMap[p.name] = {
          status: p.is_sanctioned === true ? 'Sanctioned' : p.is_sanctioned === false ? 'Unsanctioned' : 'Under Review',
          category: p.category || null,   // use DB category if set
          tags: Array.isArray(p.tags) && p.tags.length > 0 ? p.tags : null,
          dbProfile: p,
        };
      });

      const formatted = Object.values(grouped).map((app) => {
        const avg    = app.totalEvents > 0 ? app.riskSum / app.totalEvents : 0;
        const db     = dbMap[app.name] || {};
        const stat   = STATIC_CATALOG[app.name] || { category: 'Unknown SaaS', status: 'Under Review', tags: ['Uncategorized'] };

        return {
          ...app,
          avgRisk:     avg,
          anomalyRate: app.totalEvents > 0 ? (app.anomalies / app.totalEvents) * 100 : 0,
          // Priority: DB category → static catalog → Unknown SaaS
          category:    db.category || stat.category,
          status:      db.status   || stat.status,
          tags:        db.tags     || stat.tags || ['Uncategorized'],
        };
      });

      setAppData(formatted.sort((a, b) => b[sortBy] - a[sortBy]));
    } catch (err) {
      console.error('AppProfiling load error', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleToggleSanction = async (app) => {
    const newStatus = app.status === 'Sanctioned' ? false : true;
    setToggling(app.name);
    try {
      await updateAppSanctionStatus(app.name, newStatus);
      showMsg(`${app.name} → ${newStatus ? 'Sanctioned' : 'Unsanctioned'}`);
      loadData();
    } catch {
      showMsg(`Failed to update ${app.name}`, 'error');
    } finally {
      setToggling(null);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportEventsCsv(30);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'shadow_saas_events.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch { showMsg('Export failed', 'error'); }
  };

  // Filtered view
  const filtered = appData.filter((app) => {
    const matchSearch = !search || app.name.toLowerCase().includes(search.toLowerCase());
    const matchCat    = catFilter === 'All' || app.category?.toLowerCase().includes(catFilter.toLowerCase());
    const matchStatus = statusFilter === 'All' || app.status === statusFilter;
    return matchSearch && matchCat && matchStatus;
  }).sort((a, b) => b[sortBy] - a[sortBy]);

  // Summary stats
  const totalApps   = appData.length;
  const unsanctioned = appData.filter((a) => a.status === 'Unsanctioned' || a.status === 'High Risk').length;
  const genaiApps   = appData.filter((a) => a.category === 'Generative AI' || a.category === 'Developer AI').length;
  const highRisk    = appData.filter((a) => a.avgRisk >= 60).length;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-amber-500/40 border-t-amber-400 rounded-full animate-spin mx-auto" />
          <p className="text-amber-400 font-mono text-sm animate-pulse tracking-widest">COMPILING APP INTELLIGENCE...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-lg border font-mono text-sm shadow-xl
          ${toast.type === 'error' ? 'bg-rose-950 border-rose-500/50 text-rose-300' : 'bg-emerald-950 border-emerald-500/50 text-emerald-300'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="glass-panel p-5 rounded-xl border-l-4 border-l-amber-500">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3 tracking-tight">
              <Package className="w-6 h-6 text-amber-500" />
              Application Governance Console
            </h1>
            <p className="text-slate-500 data-mono text-xs mt-1">
              Shadow IT discovery · risk profiling · policy enforcement · sanctioning control
            </p>
            {appData.length === 0 ? (
              <p className="data-mono text-[11px] mt-2 px-3 py-1.5 rounded" style={{ color: '#ff3366', background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.2)' }}>
                No network events yet — start the packet sniffer to detect apps on your network
              </p>
            ) : (
              <p className="data-mono text-[11px] mt-2" style={{ color: 'rgba(0,255,136,0.6)' }}>
                Showing {appData.length} apps detected in real network traffic (last 500 events from MongoDB)
              </p>
            )}
          </div>
          <div className="flex gap-6 text-center font-mono">
            <div><div className="text-2xl font-bold text-amber-400">{totalApps}</div><div className="text-[10px] text-slate-500 uppercase">Apps</div></div>
            <div><div className="text-2xl font-bold text-rose-400">{unsanctioned}</div><div className="text-[10px] text-slate-500 uppercase">Shadow IT</div></div>
            <div><div className="text-2xl font-bold text-purple-400">{genaiApps}</div><div className="text-[10px] text-slate-500 uppercase">GenAI</div></div>
            <div><div className="text-2xl font-bold text-rose-300">{highRisk}</div><div className="text-[10px] text-slate-500 uppercase">High Risk</div></div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Upload bar chart */}
        <div className="soc-card h-[420px] lg:col-span-2">
          <h2 className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-slate-800/50 pb-3">
            <span className="w-2 h-2 bg-cyan-500 rounded-full" />
            Top Upload Targets by Volume (MB)
          </h2>
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={appData.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 30, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="1 4" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" stroke="#334155" fontSize={9} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} width={130} tick={{ fontFamily: 'monospace' }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1e293b', opacity: 0.5 }} />
                <Bar dataKey="totalUpload" radius={[0, 4, 4, 0]} barSize={14}>
                  {appData.slice(0, 10).map((app, i) => (
                    <Cell key={i} fill={CATEGORY_COLORS[app.category] || (app.avgRisk > 60 ? '#ef4444' : app.avgRisk > 30 ? '#f59e0b' : '#06b6d4')} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category pie */}
        <div className="soc-card h-[420px]">
          <h2 className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-slate-800/50 pb-3">
            <span className="w-2 h-2 bg-purple-500 rounded-full" />
            Category Breakdown
          </h2>
          <CategoryPie data={appData} />
          <div className="mt-2 grid grid-cols-2 gap-1">
            {Object.entries(CATEGORY_COLORS).slice(0, 6).map(([cat, color]) => (
              <div key={cat} className="flex items-center gap-1.5 text-[9px] font-mono text-slate-500">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                {cat.length > 16 ? cat.slice(0, 14) + '…' : cat}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Governance Catalog */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800/80">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400 uppercase tracking-widest">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              Enterprise App Governance Catalog
              <span className="text-slate-600 normal-case tracking-normal">{filtered.length} apps</span>
            </div>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                <input
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search apps..."
                  className="pl-7 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-slate-300 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 w-36"
                />
              </div>
              {/* Category filter */}
              <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
                className="px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-slate-400 focus:outline-none focus:border-amber-500/50">
                {CATEGORY_FILTER_OPTIONS.map((c) => <option key={c}>{c}</option>)}
              </select>
              {/* Status filter */}
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-slate-400 focus:outline-none focus:border-amber-500/50">
                {['All', 'Sanctioned', 'Under Review', 'Unsanctioned', 'High Risk'].map((s) => <option key={s}>{s}</option>)}
              </select>
              {/* Sort */}
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                className="px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-slate-400 focus:outline-none focus:border-amber-500/50">
                <option value="totalUpload">Sort: Upload Vol</option>
                <option value="avgRisk">Sort: Risk Score</option>
                <option value="totalEvents">Sort: Events</option>
                <option value="anomalies">Sort: Anomalies</option>
              </select>
              <button onClick={handleExport} title="Export CSV"
                className="p-1.5 text-slate-500 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition-colors">
                <Download className="w-3.5 h-3.5" />
              </button>
              <button onClick={loadData}
                className="p-1.5 text-slate-500 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm font-mono">
            <thead className="bg-slate-950/60 text-slate-500 text-[10px] uppercase tracking-widest border-b border-slate-800">
              <tr>
                <th className="px-5 py-3">Application</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Policy Status</th>
                <th className="px-5 py-3">Risk Signals</th>
                <th className="px-4 py-3 text-right">Upload</th>
                <th className="px-4 py-3 text-right">Avg Risk</th>
                <th className="px-4 py-3 text-right">Events</th>
                <th className="px-5 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {filtered.map((app, i) => (
                <tr key={i}
                  className={`hover:bg-slate-800/25 transition-colors cursor-pointer ${selectedApp?.name === app.name ? 'bg-slate-800/40' : ''}`}
                  onClick={() => setSelectedApp(selectedApp?.name === app.name ? null : app)}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {app.genaiEvents > 0 && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse flex-shrink-0" />}
                      <span className="font-bold text-slate-200 whitespace-nowrap">{app.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <CategoryPill category={app.category} />
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <StatusBadge status={app.status} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(app.tags || []).slice(0, 3).map((tag, ti) => (
                        <span key={ti}
                          className={`text-[9px] px-2 py-0.5 rounded border
                            ${tag.includes('Risk') || tag.includes('Violation') || tag.includes('Exfil')
                              ? 'border-rose-500/30 text-rose-400/80 bg-rose-500/5'
                              : 'border-slate-700 text-slate-500 bg-slate-800/50'}`}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-amber-400 whitespace-nowrap">
                    {app.totalUpload.toFixed(1)} MB
                  </td>
                  <td className={`px-4 py-3 text-right font-bold whitespace-nowrap
                    ${app.avgRisk > 60 ? 'text-rose-400' : app.avgRisk > 30 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {app.avgRisk.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400 whitespace-nowrap">{app.totalEvents}</td>
                  <td className="px-5 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleToggleSanction(app)}
                      disabled={toggling === app.name}
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase font-mono border transition-all disabled:opacity-40
                        ${app.status === 'Sanctioned'
                          ? 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30 text-rose-400'
                          : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-400'}`}>
                      {toggling === app.name ? '…' : app.status === 'Sanctioned' ? 'Revoke' : 'Approve'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* App detail panel */}
      {selectedApp && (
        <div className="glass-panel rounded-xl p-5 border-l-4 border-l-amber-400 animate-fade-in">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-100 font-mono">{selectedApp.name}</h3>
              <div className="flex items-center gap-3 mt-1">
                <CategoryPill category={selectedApp.category} />
                <StatusBadge status={selectedApp.status} />
              </div>
            </div>
            <button onClick={() => setSelectedApp(null)} className="text-slate-600 hover:text-slate-300 text-sm font-mono">✕</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-xs">
            {[
              ['Total Events',  selectedApp.totalEvents,                'text-slate-200'],
              ['Upload Volume', `${selectedApp.totalUpload.toFixed(2)} MB`, 'text-amber-400'],
              ['Avg Risk',      selectedApp.avgRisk.toFixed(1),         selectedApp.avgRisk > 60 ? 'text-rose-400' : 'text-emerald-400'],
              ['Anomalies',     selectedApp.anomalies,                  'text-rose-400'],
              ['Anomaly Rate',  `${selectedApp.anomalyRate.toFixed(1)}%`, 'text-amber-400'],
              ['GenAI Events',  selectedApp.genaiEvents || 0,           'text-purple-400'],
              ['First Seen',    selectedApp.firstSeen ? new Date(selectedApp.firstSeen).toLocaleDateString() : '—', 'text-slate-400'],
              ['Last Seen',     selectedApp.lastSeen  ? new Date(selectedApp.lastSeen).toLocaleDateString()  : '—', 'text-slate-400'],
            ].map(([label, val, cls]) => (
              <div key={label} className="bg-slate-900/60 rounded-lg px-3 py-2 border border-slate-800/50">
                <div className="text-slate-500 text-[9px] uppercase tracking-wider mb-1">{label}</div>
                <div className={`font-bold text-sm ${cls}`}>{val}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(selectedApp.tags || []).map((tag, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded border border-slate-700 text-slate-400 bg-slate-800/50 font-mono">{tag}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
