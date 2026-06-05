import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => (response.data !== undefined ? response.data : response),
  (error) => Promise.reject(error)
);

// Auth
export const login = (username, password) => {
  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('password', password);
  return axios.post(`${API_BASE_URL}/auth/token`, formData, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
};
export const getProfile = () => api.get('/auth/me');

// Sniffer health
export const fetchSnifferStatus = () => api.get('/events/sniffer-status');

// Database management (admin only)
export const clearAllEvents = () => api.delete('/events/clear-all');

// Events
export const fetchEvents = (params = {}) => api.get('/events', { params });
export const fetchRecentEvents = (limit = 30, offset = 0) =>
  api.get('/events', { params: { limit, offset } });
export const fetchStats = (hours = 24) => api.get('/events/stats', { params: { hours } });
export const fetchHighRiskEvents = (limit = 10) =>
  api.get('/events/high-risk', { params: { limit } });
export const ingestEvent = (event) => api.post('/events/ingest', event);

// Analytics
export const fetchUserAnalytics = () => api.get('/analytics/users');
export const fetchThreatIntel = () => api.get('/analytics/threats');

// ML
export const fetchMLModelInfo = () => api.get('/ml/model-info');
export const trainAnomalyDetector = () => api.post('/ml/train');

// Apps
export const fetchAppProfiles = () => api.get('/apps/');
export const updateAppSanctionStatus = (appName, isSanctioned) =>
  api.put(`/apps/${encodeURIComponent(appName)}/sanction`, null, {
    params: { is_sanctioned: isSanctioned },
  });

// Export
export const exportEventsCsv = (days = 7) =>
  api.get('/export/events.csv', { params: { days }, responseType: 'blob' });

// Policies
export const fetchPolicies = () => api.get('/policies');
export const createPolicy = (policy) => api.post('/policies', policy);

// Incident Response (legacy quarantine endpoints — still used by Alert Center / Insider Threat)
export const quarantineIP = (ip) => api.post(`/quarantine/${ip}`);
export const unquarantineIP = (ip) => api.post(`/unquarantine/${ip}`);
export const fetchQuarantinedIPs = () => api.get('/quarantined');
export const fetchPlaybooks = () => api.get('/playbooks');
export const createPlaybook = (playbook) => api.post('/playbooks', playbook);

// My Device — detect own LAN IP via WebRTC (no server needed, works instantly)
// Falls back to backend auto-detect if WebRTC is blocked by browser privacy settings.
export async function detectMyIP() {
  try {
    const ip = await new Promise((resolve, reject) => {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('');
      pc.createOffer().then((o) => pc.setLocalDescription(o));
      pc.onicecandidate = (e) => {
        if (!e || !e.candidate) return;
        const m = /(\d+\.\d+\.\d+\.\d+)/.exec(e.candidate.candidate);
        if (m && !m[1].startsWith('127.')) { pc.close(); resolve(m[1]); }
      };
      setTimeout(() => reject(new Error('timeout')), 2500);
    });
    if (ip) return ip;
  } catch { /* fall through */ }
  // Fallback: ask backend (requires backend restart to have the new endpoint)
  try {
    const r = await api.get('/my-device');
    return r?.ip || null;
  } catch { return null; }
}
export const fetchMyDevice = () => api.get('/my-device');
export const registerMyDevice = (ip, hostname) => api.post('/my-device', { ip, hostname });

// Firewall Control (dedicated page — full lifecycle with history & OS verification)
export const fetchFirewallStatus = () => api.get('/firewall/status');
export const fetchFirewallRules = (verify = false) => api.get('/firewall/rules', { params: { verify } });
export const firewallBlock = (body) => api.post('/firewall/block', body);
export const firewallUnblock = (ip) => api.post(`/firewall/unblock/${encodeURIComponent(ip)}`);

// Alerts (active unacknowledged high-risk events)
export const fetchAlerts = (minRisk = 60, limit = 50) =>
  api.get('/events/alerts', { params: { min_risk: minRisk, limit } });
export const acknowledgeAlert = (eventId) =>
  api.post(`/events/${eventId}/acknowledge`);

// Per-device investigation timeline
export const fetchDeviceTimeline = (sourceIp, limit = 60) =>
  api.get(`/events/timeline/${encodeURIComponent(sourceIp)}`, { params: { limit } });

// Events filtered by source IP
export const fetchEventsByIp = (sourceIp, limit = 50) =>
  api.get('/events', { params: { source_ip: sourceIp, limit } });

// Analytics extras
export const fetchShadowApps = (days = 7) =>
  api.get('/analytics/shadow-apps', { params: { days } });
export const fetchGenAIStats = (hours = 24) =>
  api.get('/analytics/genai', { params: { hours } });

// Health & Monitoring
export const fetchHealth = () => api.get('/health');
export const fetchHealthLogs = (lines = 100) => api.get('/health/logs', { params: { lines } });

// Audit Logs (admin only)
export const fetchAuditLogs = (params = {}) =>
  api.get('/audit-logs', { params });
export const fetchAuditSummary = () =>
  api.get('/audit-logs/summary');

// Compliance Reports (Excel downloads — responseType blob)
export const downloadShadowItReport = (days = 30) =>
  api.get('/export/reports/shadow-it', { params: { days }, responseType: 'blob' });
export const downloadGenAIReport = (days = 30) =>
  api.get('/export/reports/genai', { params: { days }, responseType: 'blob' });
export const downloadQuarantineLog = () =>
  api.get('/export/reports/quarantine-log', { responseType: 'blob' });
export const downloadRiskTrends = (days = 30) =>
  api.get('/export/reports/risk-trends', { params: { days }, responseType: 'blob' });

export default api;
