import { create } from 'zustand';

const DEFAULT_USER = { username: 'admin@soc.local', is_admin: true, department: 'Security Operations' };

export const useAuthStore = create((set) => ({
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null') || DEFAULT_USER,
  isAuthenticated: true,

  setAuth: (token, user) => {
    localStorage.setItem('token', token);
    if (user) localStorage.setItem('user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },

  login: (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ token: null, user: null, isAuthenticated: false });
  },
}));