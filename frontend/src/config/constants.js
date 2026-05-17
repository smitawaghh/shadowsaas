// frontend/src/config/constants.js
export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  ENDPOINTS: {
    AUTH_TOKEN: '/api/auth/token',
    EVENTS: '/api/events',
    STATS: '/api/events/stats',
    HIGH_RISK: '/api/events/high-risk',
    USERS: '/api/analytics/users',
    ML_TRAIN: '/api/ml/train',
    ML_INFO: '/api/ml/model-info',
  },
  LIMITS: {
    EVENTS_DEFAULT: 50,
    EVENTS_DASHBOARD: 30,
    EVENTS_THREAT_INTEL: 100,
  },
  REFRESH_INTERVALS: {
    DASHBOARD: 3000,
    THREAT_INTEL: 10000,
    ANALYTICS: 30000,
  }
};

export const RISK_LEVELS = {
  CRITICAL: { min: 70, max: 100, color: 'rose', label: 'Critical' },
  ELEVATED: { min: 40, max: 70, color: 'amber', label: 'Elevated' },
  NORMAL: { min: 0, max: 40, color: 'emerald', label: 'Normal' },
};