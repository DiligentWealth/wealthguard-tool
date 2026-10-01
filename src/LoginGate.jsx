import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { clearReportRecovery } from './reportRecovery';

export default function LoginGate({ children }) {
  const [userId, setUserId] = useState(undefined); // undefined = still checking
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const initialUser = (session) => {
      if (!active) return;
      // A delayed startup result must never overwrite a newer auth event.
      setUserId(current => current === undefined ? (session?.user?.id || null) : current);
    };
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'SIGNED_OUT') {
        try { clearReportRecovery(window.sessionStorage); } catch { /* Storage can be blocked. */ }
        setUserId(null);
      } else if (event === 'INITIAL_SESSION') {
        initialUser(session);
      } else if (session?.user?.id) {
        // Tab refocus and token refresh for the same user keep the calculator
        // mounted. Empty non-sign-out notifications are not a logout.
        setUserId(session.user.id);
      }
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        initialUser(null);
        setError(error.message || 'Could not check your sign-in. Please sign in again.');
      } else {
        initialUser(data?.session);
      }
    }).catch(() => {
      if (!active) return;
      initialUser(null);
      setError('Could not check your sign-in. Please sign in again.');
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  // Still checking for an existing session — avoid a flash of the login form.
  if (userId === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-slate-400 text-sm">Loading…</div>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <form onSubmit={handleLogin} className="bg-white rounded-lg shadow-lg p-8 w-full max-w-sm">
          <h1 className="text-2xl font-bold text-slate-800 mb-1">WealthGuard</h1>
          <p className="text-sm text-slate-500 mb-6">Diligent Wealth Management — sign in to continue</p>
          <div className="space-y-3 mb-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md"
              autoComplete="username"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md"
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-md py-2 font-semibold hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    );
  }

  // A different account starts a fresh calculator; a refreshed token does not.
  return <React.Fragment key={userId}>{React.Children.map(children, child =>
    React.isValidElement(child) && typeof child.type !== 'string' ? React.cloneElement(child, {reportUserId: userId}) : child
  )}</React.Fragment>;
}
