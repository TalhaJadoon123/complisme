'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { api, setCompanyId, setToken } from '@/lib/api';

function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [country, setCountry] = useState('NL');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') {
        const result = await api.signup({
          email,
          password,
          companyName: companyName || email.split('@')[0],
          country,
        });
        setToken(result.token);
        if (result.company?.id) setCompanyId(result.company.id);
      } else {
        const result = await api.login({ email, password });
        setToken(result.token);
      }
      router.push(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const demo = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.login({ email: 'demo@complisme.eu', password: 'Demo12345' });
      setToken(result.token);
      const me = await api.me();
      if (me.company?.id) setCompanyId(me.company.id);
      router.push('/dashboard');
    } catch (err) {
      setError(
        `${(err as Error).message} — run "pnpm seed" to create the demo account, or sign up instead.`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="card p-8">
        <h1 className="text-2xl font-black tracking-tight text-ink">
          {mode === 'login' ? 'Sign in' : 'Create your account'}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {mode === 'login'
            ? 'Welcome back. Your assessment is where you left it.'
            : 'Free forever for one framework. No card required.'}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === 'signup' && (
            <>
              <div>
                <label className="label" htmlFor="companyName">Company name</label>
                <input
                  id="companyName"
                  className="input"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Analytics BV"
                />
              </div>
              <div>
                <label className="label" htmlFor="country">Country</label>
                <select id="country" className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
                  {['NL', 'DE', 'FR', 'ES', 'IT', 'IE', 'BE', 'SE', 'DK', 'FI', 'PL', 'PT', 'AT', 'BR', 'US', 'GB'].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div>
            <label className="label" htmlFor="email">Work email</label>
            <input
              id="email"
              type="email"
              className="input"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.eu"
            />
          </div>

          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'At least 8 characters, with a number' : 'Your password'}
            />
            {mode === 'signup' && <p className="hint">Minimum 8 characters, including one number.</p>}
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full py-2.5" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-ink-muted">
          <div className="h-px flex-1 bg-slate-200" />
          or
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <button type="button" className="btn-secondary w-full py-2.5" disabled={busy} onClick={demo}>
          Try the demo company
        </button>
        <p className="mt-2 text-center text-xs text-ink-muted">
          demo@complisme.eu — a seeded Dutch SaaS, mid-assessment
        </p>

        <p className="mt-6 text-center text-sm text-ink-muted">
          {mode === 'login' ? (
            <>
              No account yet?{' '}
              <Link href="/signup" className="font-semibold text-brand-700">Create one</Link>
            </>
          ) : (
            <>
              Already registered?{' '}
              <Link href="/login" className="font-semibold text-brand-700">Sign in</Link>
            </>
          )}
        </p>
      </div>

      <div className="mt-6 text-center">
        <Link href="/" className="text-xs text-ink-muted hover:text-ink">
          ← Back to the marketing site
        </Link>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <main className="mx-auto flex max-w-6xl flex-1 items-center px-4 py-16 sm:px-6">
      <Suspense fallback={<div className="mx-auto max-w-md text-sm text-ink-muted">Loading…</div>}>
        <AuthForm mode="signup" />
      </Suspense>
    </main>
  );
}