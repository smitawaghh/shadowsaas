import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Lock, AlertTriangle } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('admin@soc.local');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);
      const response = await fetch('http://localhost:8000/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Invalid credentials');
      }

      const data = await response.json();
      setAuth(data.access_token, { username, is_admin: true });
      navigate('/');
    } catch (err) {
      setError('Invalid SOC Credentials.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 bg-grid-pattern flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="animate-scanline"></div>
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-xl bg-cyan-500/20 border-2 border-cyan-500/50 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.4)]">
            <Lock className="w-8 h-8 text-cyan-400" />
          </div>
        </div>
        <h2 className="text-center text-3xl font-bold font-mono tracking-widest text-slate-100">
          SOC<span className="text-cyan-400">.ACCESS</span>
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400 font-mono">
          Authorized Personnel Only
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="glass-panel py-8 px-4 sm:rounded-lg sm:px-10 border-t-4 border-t-cyan-500">
          
          {error && (
            <div className="mb-4 bg-rose-500/10 border border-rose-500/50 text-rose-400 px-4 py-3 rounded flex items-center font-mono text-sm">
              <AlertTriangle className="w-5 h-5 mr-2" />
              {error}
            </div>
          )}

          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-widest mb-2 font-mono">
                Operator ID
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-3 border border-slate-700 rounded bg-slate-900/50 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
                placeholder="admin@soc.local"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-widest mb-2 font-mono">
                Passkey
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-3 border border-slate-700 rounded bg-slate-900/50 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 border border-cyan-500 rounded text-sm font-bold uppercase tracking-widest text-cyan-400 hover:bg-cyan-500/10 transition-all disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : 'Establish Connection'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}