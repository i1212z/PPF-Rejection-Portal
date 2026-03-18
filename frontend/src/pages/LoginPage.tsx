import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-[#321b8f] via-[#6b23d9] to-[#a036ff]">
      <div className="w-full max-w-md bg-white/95 border border-white/40 rounded-2xl px-6 py-8 shadow-2xl shadow-violet-900/40">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 rounded-xl bg-primary-100 flex items-center justify-center text-xs font-semibold text-primary-600 border border-primary-200">
            CLS
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 mb-0.5">
              Complaint Log System
            </h1>
            <p className="text-xs text-slate-500">
              Daily B2B / B2C complaint and rejection tracking.
            </p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              type="email"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-primary-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Password
            </label>
            <input
              type="password"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-primary-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded px-3 py-2">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary-600 hover:bg-primary-500 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium text-white py-2.5 mt-2"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="mt-4 text-[11px] text-slate-500">
          Use <span className="font-mono">b2b@ppf.local</span>,{' '}
          <span className="font-mono">b2c@ppf.local</span>,{' '}
          <span className="font-mono">manager@ppf.local</span>, or{' '}
          <span className="font-mono">admin@ppf.local</span> in dev mode.
        </div>
      </div>
    </div>
  );
}

